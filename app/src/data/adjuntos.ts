import { supabase } from '@/lib/supabase'
import { locale } from '@/lib/utils'

export interface Adjunto {
  id: string; tienda_id: string; entidad: string; entidad_id: string; url: string
  tipo: string | null; nombre: string | null; tamano: number | null; subido_por: string | null; fecha: string
}
export const MAX_ADJUNTO_MB = 15
const BUCKET = 'adjuntos'

export async function listarAdjuntos(entidad: string, entidadId: string): Promise<Adjunto[]> {
  const { data, error } = await supabase.from('adjunto').select('*').eq('entidad', entidad).eq('entidad_id', entidadId).order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as Adjunto[]
}

/** Reduce una foto grande (máx. 2000 px, JPEG 0,85) antes de subirla. El resto de ficheros va tal cual. */
async function preparar(f: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 1.5e6) return f
  let img: ImageBitmap
  try { img = await createImageBitmap(f) } catch { return f }   // si no se puede reducir, se sube tal cual
  const k = Math.min(1, 2000 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? f), 'image/jpeg', 0.85))
}

export async function subirAdjunto(tiendaId: string, entidad: string, entidadId: string, f: File): Promise<void> {
  if (f.size > MAX_ADJUNTO_MB * 1e6) throw new Error(`El fichero pasa de ${MAX_ADJUNTO_MB} MB`)
  const blob = await preparar(f)
  const ext = (f.name.match(/\.[a-z0-9]{1,6}$/i)?.[0] ?? '').toLowerCase()
  const esFotoReducida = blob !== f
  const ruta = `${tiendaId}/${entidadId}/${crypto.randomUUID()}${esFotoReducida ? '.jpg' : ext}`
  const up = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: esFotoReducida ? 'image/jpeg' : f.type || 'application/octet-stream' })
  if (up.error) throw up.error
  const { error } = await supabase.from('adjunto').insert({
    tienda_id: tiendaId, entidad, entidad_id: entidadId, url: ruta,
    tipo: esFotoReducida ? 'image/jpeg' : f.type || null, nombre: f.name, tamano: blob.size,
  })
  if (error) { await supabase.storage.from(BUCKET).remove([ruta]); throw error }
}

export async function borrarAdjunto(a: Adjunto) {
  const r = await supabase.storage.from(BUCKET).remove([a.url])
  if (r.error) throw r.error
  // Si el almacenamiento no lo ha borrado (sin permiso), no se quita la ficha: no quedan archivos huérfanos
  if (!r.data?.length) throw new Error('permission denied: no se pudo borrar el archivo')
  const { error } = await supabase.from('adjunto').delete().eq('id', a.id)
  if (error) throw error
}

/** Enlaces firmados (caducan en 1 h): el bucket es privado. */
export async function enlacesAdjuntos(as: Adjunto[]): Promise<Record<string, string>> {
  if (as.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(as.map((a) => a.url), 3600)
  if (error) throw error
  const out: Record<string, string> = {}
  data?.forEach((d, i) => { if (d.signedUrl) out[as[i].id] = d.signedUrl })
  return out
}

export const tamanoLegible = (b: number | null) =>
  b == null ? '' : b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`

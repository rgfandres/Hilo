import { supabase } from '@/lib/supabase'

export type Canal = 'WHATSAPP' | 'EMAIL' | 'AMBOS'
export interface PlantillaMensaje {
  id: string; tienda_id: string; etapa_id: string | null; clave: string; nombre: string; texto: string; canal: Canal; orden: number
}
export interface MensajeEnviado {
  id: string; encargo_id: string; plantilla_id: string | null; canal: Canal; fecha: string; texto: string | null; destino: string | null; nombre: string | null
}

function ok<T>(r: { data: T; error: unknown }): T { if (r.error) throw r.error; return r.data }

export async function listarPlantillas(tiendaId: string) {
  return ok(await supabase.from('plantilla_mensaje').select('*').eq('tienda_id', tiendaId).order('orden')) as PlantillaMensaje[]
}
export async function crearPlantilla(p: Omit<PlantillaMensaje, 'id'>) {
  ok(await supabase.from('plantilla_mensaje').insert(p))
}
export async function actualizarPlantilla(id: string, patch: Partial<Omit<PlantillaMensaje, 'id' | 'tienda_id'>>) {
  ok(await supabase.from('plantilla_mensaje').update(patch).eq('id', id))
}
export async function borrarPlantilla(id: string) {
  ok(await supabase.from('plantilla_mensaje').delete().eq('id', id))
}
export async function listarEnvios(encargoId: string) {
  return ok(await supabase.from('mensaje_enviado').select('*').eq('encargo_id', encargoId).order('fecha', { ascending: false })) as MensajeEnviado[]
}
export async function registrarEnvio(m: { encargo_id: string; plantilla_id: string | null; canal: 'WHATSAPP' | 'EMAIL'; texto: string; destino: string; nombre: string }) {
  ok(await supabase.from('mensaje_enviado').insert(m))
}

/** Marcadores fijos que entiende cualquier plantilla (además de las claves de los campos). */
export const MARCADORES: { k: string; ayuda: string }[] = [
  { k: 'nombre', ayuda: 'Nombre del cliente' },
  { k: 'nombre_pila', ayuda: 'Solo el primer nombre' },
  { k: 'numero', ayuda: 'Número del encargo' },
  { k: 'tu_producto', ayuda: 'Palabra del catálogo + nombre entre comillas: «tu producto "Nombre"». Concuerda siempre' },
  { k: 'el_producto', ayuda: 'Con artículo: «el producto "Nombre"» (concuerda con la palabra del catálogo)' },
  { k: 'o', ayuda: 'Final que concuerda con la palabra del catálogo: list{o} → «lista» o «listo»' },
  { k: 'producto', ayuda: 'Solo el nombre del producto (sin artículo delante: no se sabe su género)' },
  { k: 'proveedor', ayuda: 'Proveedor asignado' },
  { k: 'etapa', ayuda: 'Etapa actual' },
  { k: 'tienda', ayuda: 'Nombre de la tienda' },
  { k: 'enlace_resena', ayuda: 'Enlace de reseña (Ajustes → Datos de la tienda)' },
  { k: 'importe', ayuda: 'Importe del encargo' },
  { k: 'a_cuenta', ayuda: 'Lo entregado a cuenta' },
  { k: 'pendiente', ayuda: 'Lo que falta por cobrar' },
]

/**
 * Marcadores que dependen del género de la palabra del catálogo (no del nombre del producto,
 * cuyo género no se conoce): «tu pieza "Solitario clásico" ya está lista».
 */
export function marcadoresConcordancia(palabra: string, genero: 'm' | 'f', nombre: string | null | undefined) {
  const p = palabra.charAt(0).toLowerCase() + palabra.slice(1)
  return {
    tu_producto: nombre ? `tu ${p} «${nombre}»` : `tu ${p}`,
    el_producto: `${genero === 'f' ? 'la' : 'el'} ${p}${nombre ? ` «${nombre}»` : ''}`,
    o: genero === 'f' ? 'a' : 'o',
  }
}

/** Sustituye {marcador} por su valor. Lo que no se conoce se deja tal cual para que se vea. */
export function rellenar(texto: string, ctx: Record<string, unknown>): string {
  return texto.replace(/\{([a-z0-9_]+)\}/gi, (m, k: string) => {
    const v = ctx[k]
    return v == null || v === '' ? m : String(v)
  })
}
/** Marcadores que se han quedado sin valor (para avisar antes de enviar). */
export function sinRellenar(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([a-z0-9_]+)\}/gi)].map((x) => x[1]))]
}

/** Teléfono para wa.me: solo dígitos, sin 00, con prefijo de país si parece nacional. */
export function telefonoWhatsApp(tel: string | null | undefined, prefijo: string): string | null {
  if (!tel) return null
  let d = tel.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.length <= 10) d = prefijo.replace(/\D/g, '') + d.replace(/^0/, '')
  d = d.replace(/\D/g, '')
  return d.length >= 8 ? d : null
}
export const enlaceWhatsApp = (tel: string, texto: string) => `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
export const enlaceCorreo = (email: string, asunto: string, texto: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`

/** Ayuda de un marcador con el vocabulario de la tienda (cliente, encargo, proveedor, producto) */
export function ayudaMarcador(texto: string, v: { cliente: string; encargo: string; proveedor: string; producto: string }) {
  const m = (x: string) => x.charAt(0).toLowerCase() + x.slice(1)
  return texto.replace(/\bcliente\b/g, m(v.cliente)).replace(/\bencargo\b/g, m(v.encargo)).replace(/\bproveedor\b/gi, (w) => (w[0] === 'P' ? v.proveedor : m(v.proveedor))).replace(/\bproducto\b/g, m(v.producto))
}

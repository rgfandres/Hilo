import { supabase } from '@/lib/supabase'

export type Canal = 'WHATSAPP' | 'EMAIL' | 'AMBOS'
export interface PlantillaMensaje {
  id: string; tienda_id: string; etapa_id: string | null; clave: string; nombre: string; texto: string; canal: Canal; orden: number
  /** Asunto del correo (con marcadores); vacío = «Tienda · Encargo Nº» */
  asunto?: string | null
  /** Se sugiere también al abrir una incidencia (un retraso) */
  al_incidencia?: boolean
}
export interface MensajeEnviado {
  id: string; encargo_id: string; plantilla_id: string | null; canal: Canal; fecha: string; texto: string | null; destino: string | null; nombre: string | null
  /** true = el correo lo envió la app (Resend); false = se abrió WhatsApp o el correo de la persona */
  por_hilo?: boolean
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
/**
 * Enviar el aviso por correo desde la app (función enviar-correo → Resend). Lo pide siempre una persona.
 * El destino es el correo de la ficha del cliente. Si la tienda aún no lo ha configurado devuelve
 * 'sin_configurar' y la pantalla ofrece abrirlo en el correo de la persona.
 */
export async function enviarCorreo(m: { encargo_id: string; plantilla_id: string | null; asunto: string; texto: string; nombre: string }): Promise<'ok' | 'sin_configurar'> {
  const { data, error } = await supabase.functions.invoke('enviar-correo', { body: m })
  if (error) {
    if ((error as Error).name === 'SoloLectura') throw error
    const ctx = (error as { context?: Response }).context
    let msg = ''
    try { msg = String(((await ctx?.json()) as { error?: string } | undefined)?.error ?? '') } catch { /* sin cuerpo */ }
    // Sin función desplegada (404 o sin respuesta) o sin clave: se ofrece abrirlo en el correo de la persona
    if (msg === 'sin_configurar' || !ctx?.status || ctx.status === 404) return 'sin_configurar'
    throw new Error(msg || 'No se ha podido enviar el correo. Prueba otra vez.')
  }
  if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error('No se ha podido enviar el correo. Prueba otra vez.')
  return 'ok'
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
  { k: 'estado', ayuda: 'Cómo se dice la etapa actual en un mensaje («en preparación»…). Se escribe en Ajustes → Mensajes al cliente' },
  { k: 'complementos', ayuda: 'Los complementos apuntados en el encargo' },
  { k: 'usuario', ayuda: 'Nombre de quien envía el mensaje' },
  { k: 'tienda', ayuda: 'Nombre de la tienda' },
  { k: 'enlace_resena', ayuda: 'Enlace de reseña (Ajustes → Tu tienda)' },
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

const MARCA = /\{([a-z0-9_]+)(?:\|([^{}]*))?\}/gi
/**
 * Sustituye {marcador} por su valor.
 * - {marcador|texto}: si no hay valor, pone «texto» ({proveedor|el proveedor}).
 * - [[ … ]]: el trozo solo sale si todo lo que lleva dentro tiene valor (el párrafo de la reseña).
 * Lo que no se conoce se deja tal cual para que se vea.
 */
export function rellenar(texto: string, ctx: Record<string, unknown>): string {
  const uno = (t: string) => t.replace(MARCA, (m, k: string, def?: string) => {
    const v = ctx[k]
    return v == null || v === '' ? (def != null ? def : m) : String(v)
  })
  return uno(texto.replace(/\[\[([\s\S]*?)\]\]/g, (_m, dentro: string) => {
    const r = uno(dentro)
    return sinRellenar(r).length ? '' : r
  }))
}
/** Marcadores que se han quedado sin valor (para avisar antes de enviar). */
export function sinRellenar(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCA)].map((x) => x[1]))]
}
/** Cómo se dice una etapa en los mensajes: la frase de la tienda o el nombre de la etapa en minúscula */
export function fraseEtapa(aj: Record<string, unknown> | null | undefined, etapa: string | null | undefined): string | null {
  if (!etapa) return null
  const f = ((aj?.frases_etapa ?? {}) as Record<string, string>)[etapa]
  return f?.trim() || etapa.charAt(0).toLowerCase() + etapa.slice(1)
}
/** Nombre de quien usa la app para {usuario}: el de su perfil, o lo de delante del @ del correo */
export function nombreUsuario(u: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): string | null {
  const n = (u?.user_metadata?.name as string | undefined)?.trim()
  if (n) return n.split(/\s+/)[0]
  const e = u?.email?.split('@')[0]
  return e ? e.charAt(0).toUpperCase() + e.slice(1) : null
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
/** Redactor de Gmail en el navegador (sin vincular cuentas: usa la sesión de Gmail que ya esté abierta) */
export const enlaceGmail = (email: string, asunto: string, texto: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`

/** Ayuda de un marcador con el vocabulario de la tienda (cliente, encargo, proveedor, producto) */
export function ayudaMarcador(texto: string, v: { cliente: string; encargo: string; proveedor: string; producto: string }) {
  const m = (x: string) => x.charAt(0).toLowerCase() + x.slice(1)
  return texto.replace(/\bcliente\b/g, m(v.cliente)).replace(/\bencargo\b/g, m(v.encargo)).replace(/\bproveedor\b/gi, (w) => (w[0] === 'P' ? v.proveedor : m(v.proveedor))).replace(/\bproducto\b/g, m(v.producto))
}

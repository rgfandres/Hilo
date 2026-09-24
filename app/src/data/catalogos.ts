import { filtroCliente } from '@/data/encargos'
import { supabase } from '@/lib/supabase'
import type { EncargoEstado } from '@/lib/types'

function ok<T>(r: { data: T; error: unknown }): T { if (r.error) throw r.error; return r.data }

// ---------- Productos
export interface ProductoFila {
  id: string; tienda_id: string; nombre: string; foto_url: string | null; precio_base: number | null
  activo: boolean; datos: Record<string, unknown>; encargos: number
  /** Ficha técnica */
  material_tipo: string | null; consumo: number | null; construccion: string | null; receta: string | null
}
export function ajustesFicha(aj: Record<string, unknown> | null | undefined) {
  const etiqueta = String(aj?.etiqueta_complementos ?? 'Complementos')
  return {
    etiqueta, construcciones: (aj?.tipos_construccion as string[] | undefined) ?? [],
    /** Si la tienda usa complementos (interruptor en Ajustes → Tienda; antes, si les había puesto nombre propio) */
    usaComplementos: aj?.usar_complementos === undefined ? etiqueta !== 'Complementos' : aj.usar_complementos === true,
  }
}
export type FichaTecnica = Pick<ProductoFila, 'material_tipo' | 'consumo' | 'construccion' | 'receta'>
export const tieneFicha = (p: Partial<FichaTecnica> | null | undefined) => !!p && (p.consumo != null || !!p.construccion || !!p.receta || !!p.material_tipo)
export async function fichaProducto(id: string): Promise<(FichaTecnica & { nombre: string }) | null> {
  return ok(await supabase.from('producto').select('nombre,material_tipo,consumo,construccion,receta').eq('id', id).maybeSingle()) as (FichaTecnica & { nombre: string }) | null
}
export async function listarProductosCat(tiendaId: string) {
  return ok(await supabase.from('v_productos').select('*').eq('tienda_id', tiendaId).order('nombre')) as ProductoFila[]
}
export async function guardarProducto(tiendaId: string, id: string | null, p: { nombre: string; precio_base: number | null; foto_url: string | null; activo: boolean; datos: Record<string, unknown> } & Partial<FichaTecnica>) {
  const fila = { ...p, nombre: p.nombre.trim() }
  if (id) ok(await supabase.from('producto').update(fila).eq('id', id))
  else ok(await supabase.from('producto').insert({ tienda_id: tiendaId, ...fila }))
}

/**
 * Sube una foto reducida (máx. 1200 px, JPEG) al almacén de la tienda y devuelve su URL.
 * Las fotos de móvil pesan varios MB: así ocupan ~150 KB y cargan rápido.
 */
export async function subirFoto(tiendaId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen')
  const blob = await reducir(file, 1200, 0.82)
  const ruta = `${tiendaId}/${crypto.randomUUID()}.jpg`
  ok(await supabase.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', upsert: false }))
  return supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl
}
async function reducir(file: File, max: number, calidad: number): Promise<Blob> {
  let img: ImageBitmap
  try { img = await createImageBitmap(file) } catch { throw new Error('No se puede leer esa imagen. Usa una foto JPG o PNG (las HEIC del iPhone: compártela como JPG).') }
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen'))), 'image/jpeg', calidad))
}

// ---------- Clientes
export interface ClienteFila {
  id: string; tienda_id: string; nombre: string; telefono: string | null; email: string | null
  datos: Record<string, unknown>; notas: string | null; creado_en: string
  encargos: number; en_curso: number; ultimo_encargo: string | null
}
export async function listarClientesCat(tiendaId: string, q: string, pagina: number, porPagina: number) {
  let consulta = supabase.from('v_clientes').select('*', { count: 'exact' }).eq('tienda_id', tiendaId)
  const t = q.trim().replace(/[%,()]/g, ' ')
  if (t) consulta = consulta.or(filtroCliente(t, true))
  const { data, error, count } = await consulta.order('nombre').range(pagina * porPagina, pagina * porPagina + porPagina - 1)
  if (error) throw error
  return { filas: (data ?? []) as ClienteFila[], total: count ?? 0 }
}
export async function obtenerCliente(id: string) {
  return ok(await supabase.from('v_clientes').select('*').eq('id', id).maybeSingle()) as ClienteFila | null
}
export async function crearCliente(tiendaId: string, c: { nombre: string; telefono: string | null; email: string | null; datos: Record<string, unknown>; notas: string | null }) {
  return ok(await supabase.from('cliente').insert({ tienda_id: tiendaId, ...c, nombre: c.nombre.trim() }).select('id').single()) as { id: string }
}
export async function actualizarClienteCat(id: string, c: { nombre: string; telefono: string | null; email: string | null; datos: Record<string, unknown>; notas: string | null }) {
  ok(await supabase.from('cliente').update({ ...c, nombre: c.nombre.trim() }).eq('id', id))
}
/** Todos los encargos del cliente (cualquier periodo), activos y anulados. */
export async function encargosDeCliente(clienteId: string) {
  return ok(await supabase.from('v_encargo_estado').select('*').eq('cliente_id', clienteId).order('creado_en', { ascending: false })) as EncargoEstado[]
}

// ---------- Proveedores
export interface ProveedorFila {
  id: string; tienda_id: string; nombre: string; activo: boolean; notas: string | null
  telefono: string | null; email_contacto: string | null; accesos: number; en_su_mano: number; asignados: number; atascados?: number
  /** TALLER = hace encargos · MATERIAL = vende material · AMBOS */
  tipo?: TipoProveedor; unidad_pedido?: number | null
}
export type TipoProveedor = 'ENCARGOS' | 'MATERIAL' | 'AMBOS'
/** ¿Se le pueden asignar encargos? */
export const haceEncargos = (p: { tipo?: TipoProveedor }) => p.tipo !== 'MATERIAL'
/** ¿Vende material? */
export const vendeMaterial = (p: { tipo?: TipoProveedor }) => p.tipo === 'MATERIAL' || p.tipo === 'AMBOS'
export async function listarProveedoresCat(tiendaId: string) {
  return ok(await supabase.from('v_proveedores').select('*').eq('tienda_id', tiendaId).order('nombre')) as ProveedorFila[]
}
export async function obtenerProveedor(id: string) {
  return ok(await supabase.from('v_proveedores').select('*').eq('id', id).maybeSingle()) as ProveedorFila | null
}
export async function guardarProveedor(tiendaId: string, id: string | null, p: { nombre: string; telefono: string | null; email_contacto: string | null; notas: string | null; activo: boolean; tipo?: TipoProveedor }) {
  const fila = { ...p, nombre: p.nombre.trim() }
  if (id) { ok(await supabase.from('proveedor').update(fila).eq('id', id)); return id }
  return (ok(await supabase.from('proveedor').insert({ tienda_id: tiendaId, ...fila }).select('id').single()) as { id: string }).id
}
export async function encargosDeProveedor(proveedorId: string) {
  return ok(await supabase.from('v_encargo_estado').select('*').eq('proveedor_id', proveedorId).eq('estado', 'ACTIVO')
    .order('actualizado_en', { ascending: false })) as EncargoEstado[]
}

/** «duplicate key» → mensaje legible */
export function errorNombre(m: string, que: string) {
  return /duplicate|unique|_nombre/i.test(m) ? `Ya existe ${que} con ese nombre` : m
}

/**
 * Alta rápida desde un formulario: si ya existe (sin distinguir mayúsculas) se usa esa;
 * si no, se crea activa. Nunca crea dos iguales.
 */
async function altaRapida(tabla: 'producto' | 'proveedor', tiendaId: string, nombre: string): Promise<string> {
  const n = nombre.trim()
  const buscar = async () => (await supabase.from(tabla).select('id,activo').eq('tienda_id', tiendaId).ilike('nombre', n.replace(/[%_\\]/g, (c) => '\\' + c)).limit(1)).data?.[0]?.id as string | undefined
  const ya = await buscar()
  // Si existía dado de baja, se vuelve a activar (si no, se elegiría algo que no sale en las listas)
  if (ya) { await supabase.from(tabla).update({ activo: true }).eq('id', ya).eq('activo', false); return ya }
  const r = await supabase.from(tabla).insert({ tienda_id: tiendaId, nombre: n }).select('id').single()
  if (r.error) { const otra = await buscar(); if (otra) return otra; throw r.error }
  return (r.data as { id: string }).id
}
export const altaRapidaProducto = (tiendaId: string, nombre: string) => altaRapida('producto', tiendaId, nombre)
export const altaRapidaProveedor = (tiendaId: string, nombre: string) => altaRapida('proveedor', tiendaId, nombre)

/** Une dos clientes: el segundo pasa sus encargos, medidas y datos que falten al primero, y se borra */
export async function fusionarClientes(queda: string, sobra: string): Promise<number> {
  const { data, error } = await supabase.rpc('fusionar_clientes', { p_queda: queda, p_sobra: sobra })
  if (error) throw error
  return Number(data ?? 0)
}
/** Borra un cliente sin encargos */
export async function borrarCliente(id: string) {
  const { error } = await supabase.rpc('borrar_cliente', { p_cliente: id })
  if (error) throw error
}

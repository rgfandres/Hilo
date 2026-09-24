import { supabase } from '@/lib/supabase'

/** Módulo de materiales: catálogo, libro de movimientos, pedidos a proveedor y restos. */
export interface MaterialEstado {
  id: string; tienda_id: string; tipo: string; variante: string; proveedor_id: string | null; proveedor_nombre: string | null
  stock: number; umbral: number | null; unidad_pedido: number | null; ubicacion: string | null; notas: string | null; activo: boolean
  unidad_efectiva: number | null; umbral_efectivo: number
  demanda: number; encargos_pendientes: number; demanda_sin_pedir: number; en_camino: number; restos: number
}
export interface LineaMaterial {
  id: string; encargo_id: string; material_id: string; cantidad: number; estado: 'PENDIENTE' | 'PEDIDO' | 'RECIBIDO'; creado_en: string
  /** Solo en lineasDeTienda */
  encargo?: { numero: number; serie: string | null; estado: string; cliente: { nombre: string } | null } | null
}
export interface Movimiento {
  id: string; material_id: string; tipo: 'PEDIDO' | 'RECEPCION' | 'CONSUMO' | 'AJUSTE' | 'RESTO' | 'REVERSO'
  cantidad: number; delta: number; encargo_id: string | null; pedido_linea_id: string | null; revertido: boolean
  usuario_id: string | null; notas: string | null; fecha: string
}
export interface LineaPedido {
  id: string; pedido_id: string; material_id: string; cantidad: number; fecha: string; proveedor_id: string | null; proveedor_nombre: string | null
  pedido_notas: string | null; tipo: string; variante: string; recibido: number; pendiente: number; estado: 'PENDIENTE' | 'PARCIAL' | 'RECIBIDO' | 'CERRADA'
  encargos: { id: string; numero: number; serie: string | null; cliente: string | null; cantidad: number; activo?: boolean }[]
  cerrada_en?: string | null; cerrada_motivo?: string | null
}
export interface Resto { id: string; material_id: string; cantidad: number; origen: string | null; encargo_id: string | null; notas: string | null; fecha: string }

const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }

export const nombreMaterial = (m: { tipo: string; variante: string } | null | undefined) =>
  !m ? '—' : m.variante ? `${m.tipo} / ${m.variante}` : m.tipo

export async function listarMateriales(tiendaId: string): Promise<MaterialEstado[]> {
  return ok(await supabase.from('v_material_estado').select('*').eq('tienda_id', tiendaId).order('tipo').order('variante')) as MaterialEstado[]
}
export async function guardarMaterial(tiendaId: string, id: string | null, m: {
  tipo: string; variante: string; proveedor_id: string | null; umbral: number | null; unidad_pedido: number | null; ubicacion: string | null; notas: string | null; activo: boolean
}): Promise<string> {
  const fila = { ...m, tipo: m.tipo.trim(), variante: m.variante.trim() }
  if (id) { ok(await supabase.from('material').update(fila).eq('id', id)); return id }
  const r = ok(await supabase.from('material').insert({ ...fila, tienda_id: tiendaId }).select('id').single()) as { id: string }
  return r.id
}
export async function ajustarStock(materialId: string, nuevo: number, motivo: string) {
  ok(await supabase.rpc('ajustar_stock', { p_material: materialId, p_nuevo: nuevo, p_motivo: motivo }))
}

export async function lineasDeEncargo(encargoId: string): Promise<LineaMaterial[]> {
  return ok(await supabase.from('encargo_material').select('*').eq('encargo_id', encargoId).order('creado_en')) as LineaMaterial[]
}
/** Líneas de todos los encargos activos de la tienda (para las bandejas) */
export async function lineasDeTienda(tiendaId: string): Promise<LineaMaterial[]> {
  // Solo encargos en curso (ni anulados ni terminados)
  const l = ok(await supabase.from('v_linea_material').select('*').eq('tienda_id', tiendaId).order('creado_en')) as unknown as
    (LineaMaterial & { numero: number; serie: string | null; cliente_nombre: string | null })[]
  return l.map((x) => ({ ...x, encargo: { numero: x.numero, serie: x.serie, estado: 'ACTIVO', cliente: x.cliente_nombre ? { nombre: x.cliente_nombre } : null } }))
}
export async function anadirLinea(tiendaId: string, encargoId: string, materialId: string, cantidad: number) {
  ok(await supabase.from('encargo_material').insert({ tienda_id: tiendaId, encargo_id: encargoId, material_id: materialId, cantidad }))
}
export async function cambiarLinea(id: string, patch: { material_id?: string; cantidad?: number }) {
  ok(await supabase.from('encargo_material').update(patch).eq('id', id))
}
export async function quitarLinea(id: string) { ok(await supabase.from('encargo_material').delete().eq('id', id)) }
/** Recibir / asignar: consume del stock. Devuelve el stock que queda. */
export async function asignarMaterial(lineaId: string): Promise<number> {
  return Number(ok(await supabase.rpc('asignar_material', { p_linea: lineaId })))
}
export async function desasignarMaterial(lineaId: string) { ok(await supabase.rpc('desasignar_material', { p_linea: lineaId })) }

export async function listarMovimientos(tiendaId: string, materialId?: string): Promise<Movimiento[]> {
  let q = supabase.from('movimiento_material').select('*').eq('tienda_id', tiendaId).order('fecha', { ascending: false }).limit(300)
  if (materialId) q = q.eq('material_id', materialId)
  return ok(await q) as Movimiento[]
}
export async function revertirMovimiento(id: string, motivo?: string) {
  ok(await supabase.rpc('revertir_movimiento', { p_mov: id, p_motivo: motivo ?? null }))
}

export async function listarPedidos(tiendaId: string): Promise<LineaPedido[]> {
  return ok(await supabase.from('v_pedido_linea').select('*').eq('tienda_id', tiendaId).order('fecha', { ascending: false })) as LineaPedido[]
}
export async function crearPedido(tiendaId: string, proveedorId: string | null, lineas: { material_id: string; cantidad: number; encargos: { id: string; cantidad: number }[] }[], notas?: string) {
  return ok(await supabase.rpc('crear_pedido', { p_tienda: tiendaId, p_proveedor: proveedorId, p_lineas: lineas, p_notas: notas ?? null })) as string
}
export async function cerrarLineaPedido(lineaId: string, motivo?: string) {
  ok(await supabase.rpc('cerrar_linea_pedido', { p_linea: lineaId, p_motivo: motivo ?? null }))
}
export async function recibirLinea(lineaId: string, cantidad: number, asignar: boolean): Promise<{ stock: number; asignados: number }> {
  return ok(await supabase.rpc('recibir_linea', { p_linea: lineaId, p_cantidad: cantidad, p_asignar: asignar })) as { stock: number; asignados: number }
}

export async function listarRestos(tiendaId: string): Promise<Resto[]> {
  return ok(await supabase.from('resto_material').select('*').eq('tienda_id', tiendaId).order('fecha', { ascending: false })) as Resto[]
}
export async function guardarResto(materialId: string, cantidad: number, origen?: string, encargoId?: string) {
  ok(await supabase.rpc('guardar_resto', { p_material: materialId, p_cantidad: cantidad, p_origen: origen ?? null, p_encargo: encargoId ?? null }))
}
export async function cambiarResto(id: string, cantidad: number, notas?: string) {
  ok(await supabase.rpc('cambiar_resto', { p_resto: id, p_cantidad: cantidad, p_notas: notas ?? null }))
}
export async function liberarMaterial(encargoId: string, devolver: boolean) {
  return Number(ok(await supabase.rpc('liberar_material_encargo', { p_encargo: encargoId, p_devolver: devolver })))
}

/** Ajustes del módulo en la tienda */
export function ajustesMaterial(aj: Record<string, unknown> | null | undefined) {
  return {
    activo: ((aj?.modulos as Record<string, boolean> | undefined)?.materiales) === true,
    unidad: String(aj?.material_unidad ?? 'm'),
    porEncargoMax: Number(aj?.unidad_por_encargo_max ?? 10),
    umbralResto: Number(aj?.umbral_resto ?? 5),
  }
}

/** Número con la unidad del módulo: «12,5 m» */
export const cant = (n: number | null | undefined, unidad: string) =>
  n == null ? '—' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${unidad}`

/**
 * ¿Queda un resto que conviene apartar? Solo si lo que queda ya no llega a una unidad de pedido
 * (con una unidad entera o más se conserva todo) y no pasa del umbral de restos.
 */
export function restoCandidato(stock: number, unidad: number | null | undefined, umbral: number): number {
  if (!unidad || unidad <= 0) return 0
  if (stock >= unidad) return 0
  return stock > 0.001 && stock <= umbral ? Math.round(stock * 100) / 100 : 0
}

/** Aviso de stock para un encargo: con lo pedido por todos los pendientes, ¿alcanza? */
export function avisoStock(m: MaterialEstado | undefined, extra = 0): { nivel: 'falta' | 'limite' | null; texto: string } {
  if (!m) return { nivel: null, texto: '' }
  const demanda = Number(m.demanda) + extra
  const queda = Number(m.stock) + Number(m.en_camino) - demanda
  if (queda < 0) return { nivel: 'falta', texto: `faltarían ${Math.abs(queda).toLocaleString('es-ES', { maximumFractionDigits: 2 })}` }
  if (queda < Number(m.umbral_efectivo)) return { nivel: 'limite', texto: `quedarían ${queda.toLocaleString('es-ES', { maximumFractionDigits: 2 })}, por debajo del umbral de ${Number(m.umbral_efectivo).toLocaleString('es-ES')}` }
  return { nivel: null, texto: '' }
}

/** Unidad de pedido por proveedor (lo que vende de una vez: un rollo de 50 m…) */
export async function unidadesProveedor(tiendaId: string): Promise<Record<string, number | null>> {
  const r = ok(await supabase.from('proveedor').select('id,unidad_pedido').eq('tienda_id', tiendaId)) as { id: string; unidad_pedido: number | null }[]
  return Object.fromEntries(r.map((x) => [x.id, x.unidad_pedido]))
}
export async function guardarUnidadProveedor(id: string, unidad: number | null) {
  ok(await supabase.from('proveedor').update({ unidad_pedido: unidad }).eq('id', id))
}

/** Cuánto habría que pedir: lo que falta para cubrir lo pedido por los encargos y dejar el umbral, redondeado a la unidad de pedido. */
export function propuestaPedido(m: MaterialEstado): { falta: number; pedir: number } {
  const falta = Number(m.demanda) + Number(m.umbral_efectivo) - Number(m.stock) - Number(m.en_camino)
  if (falta <= 0.001) return { falta: 0, pedir: 0 }
  const u = Number(m.unidad_efectiva || 0)
  const pedir = u > 0 ? Math.ceil(falta / u - 1e-9) * u : Math.ceil(falta * 100) / 100
  return { falta: Math.round(falta * 100) / 100, pedir }
}
export const numEncargo = (e: { numero: number; serie?: string | null } | null | undefined) =>
  !e ? '—' : `${e.serie ?? ''}${String(e.numero).padStart(3, '0')}`

/** Una sola regla de «bajo umbral» para todas las pantallas: stock por debajo del umbral o no alcanza para lo pedido */
export const bajoUmbral = (m: MaterialEstado) => Number(m.stock) < Number(m.umbral_efectivo) || avisoStock(m).nivel !== null

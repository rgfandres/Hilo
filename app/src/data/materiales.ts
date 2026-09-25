import { supabase } from '@/lib/supabase'

/** Módulo de materiales: catálogo, libro de movimientos, pedidos a proveedor y restos. */
export interface MaterialEstado {
  id: string; tienda_id: string; tipo: string; variante: string; proveedor_id: string | null; proveedor_nombre: string | null
  stock: number; umbral: number | null; unidad_pedido: number | null; ubicacion: string | null; notas: string | null; activo: boolean
  /** Cómo se cuenta ESTE material (m, uds, g…) */
  unidad: string
  /** Se pide uno por encargo y se gasta entero al recibirlo */
  por_encargo: boolean
  /** Si sobra esto o menos (y no llega a una unidad de pedido), se ofrece guardarlo como resto. Vacío = no se ofrece */
  resto_hasta: number | null
  unidad_efectiva: number | null; umbral_efectivo: number
  demanda: number; encargos_pendientes: number; demanda_sin_pedir: number; en_camino: number; restos: number
}
export interface LineaMaterial {
  id: string; encargo_id: string; material_id: string; cantidad: number; estado: 'PENDIENTE' | 'PEDIDO' | 'RECIBIDO'; creado_en: string
  /** Solo en lineasDeEncargo: cuándo se recibió (el consumo del stock) */
  consumo?: { fecha: string } | null
  /** Solo en lineasDeEncargo: el material, para enseñar su nombre */
  material?: { tipo: string; variante: string } | null
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
  pedido_notas: string | null; tipo: string; variante: string; unidad: string; recibido: number; pendiente: number; estado: 'PENDIENTE' | 'PARCIAL' | 'RECIBIDO' | 'CERRADA'
  encargos: { id: string; numero: number; serie: string | null; cliente: string | null; cantidad: number; activo?: boolean }[]
  cerrada_en?: string | null; cerrada_motivo?: string | null
}
export interface Resto { id: string; material_id: string; cantidad: number; origen: string | null; encargo_id: string | null; notas: string | null; fecha: string }

const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }

export const nombreMaterial = (m: { tipo: string; variante: string } | null | undefined) =>
  !m ? '—' : m.variante ? `${m.tipo} / ${m.variante}` : m.tipo

/** Unidad de cada tipo de material (la del primero), para resúmenes que no cargan el catálogo */
export const unidadPorTipo = new Map<string, string>()
export async function listarMateriales(tiendaId: string): Promise<MaterialEstado[]> {
  const r = ok(await supabase.from('v_material_estado').select('*').eq('tienda_id', tiendaId).order('tipo').order('variante')) as MaterialEstado[]
  unidadPorTipo.clear()
  for (const m of r) if (!unidadPorTipo.has(m.tipo)) unidadPorTipo.set(m.tipo, m.unidad)
  return r
}
export async function guardarMaterial(tiendaId: string, id: string | null, m: {
  tipo: string; variante: string; proveedor_id: string | null; umbral: number | null; unidad_pedido: number | null; ubicacion: string | null; notas: string | null; activo: boolean
  unidad: string; por_encargo: boolean; resto_hasta: number | null
}): Promise<string> {
  if (!m.unidad.trim()) throw new Error('Indica la unidad (m, uds, g…)')
  const fila = { ...m, tipo: m.tipo.trim(), variante: m.variante.trim(), unidad: m.unidad.trim() }
  if (id) { ok(await supabase.from('material').update(fila).eq('id', id)); return id }
  const r = ok(await supabase.from('material').insert({ ...fila, tienda_id: tiendaId }).select('id').single()) as { id: string }
  return r.id
}
/** Cambia a la vez umbral, unidad de pedido, restos o «por encargo» de varios materiales (el stock no se toca) */
export async function cambiarMaterialesEnBloque(ids: string[], patch: { umbral?: number | null; unidad_pedido?: number | null; resto_hasta?: number | null; por_encargo?: boolean }) {
  if (!ids.length || !Object.keys(patch).length) return
  ok(await supabase.from('material').update(patch).in('id', ids))
}
export async function ajustarStock(materialId: string, nuevo: number, motivo: string) {
  ok(await supabase.rpc('ajustar_stock', { p_material: materialId, p_nuevo: nuevo, p_motivo: motivo }))
}

export async function lineasDeEncargo(encargoId: string): Promise<LineaMaterial[]> {
  return ok(await supabase.from('encargo_material').select('*, consumo:consumo_id(fecha), material:material_id(tipo,variante)').eq('encargo_id', encargoId).order('creado_en')) as LineaMaterial[]
}
/** Nombre del material de cada encargo (todas sus líneas, también las recibidas), para columnas de la lista */
export async function nombresMaterialPorEncargo(tiendaId: string, encargoIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string[]> = {}
  for (let i = 0; i < encargoIds.length; i += 150) {
    const { data, error } = await supabase.from('encargo_material').select('encargo_id, material:material_id(tipo,variante)')
      .eq('tienda_id', tiendaId).in('encargo_id', encargoIds.slice(i, i + 150)).order('creado_en')
    if (error) throw error
    for (const l of (data ?? []) as unknown as { encargo_id: string; material: { tipo: string; variante: string } | null }[]) {
      if (l.material) (out[l.encargo_id] ??= []).push(nombreMaterial(l.material))
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...new Set(v)].join(', ')]))
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
export async function recibirLinea(lineaId: string, cantidad: number, asignar: boolean): Promise<{ stock: number; asignados: number; sin_asignar?: number }> {
  return ok(await supabase.rpc('recibir_linea', { p_linea: lineaId, p_cantidad: cantidad, p_asignar: asignar })) as { stock: number; asignados: number; sin_asignar?: number }
}

export async function listarRestos(tiendaId: string): Promise<Resto[]> {
  return ok(await supabase.from('resto_material').select('*').eq('tienda_id', tiendaId).order('fecha', { ascending: false })) as Resto[]
}
/** deStock=false: un resto que ya estaba (al empezar con Hilo): se apunta sin descontarlo del stock */
export async function guardarResto(materialId: string, cantidad: number, origen?: string, encargoId?: string, deStock = true) {
  ok(await supabase.rpc('guardar_resto', { p_material: materialId, p_cantidad: cantidad, p_origen: origen ?? null, p_encargo: encargoId ?? null, p_de_stock: deStock }))
}
export async function cambiarResto(id: string, cantidad: number, notas?: string) {
  ok(await supabase.rpc('cambiar_resto', { p_resto: id, p_cantidad: cantidad, p_notas: notas ?? null }))
}
/**
 * Tras recibir material ya asignado: los encargos cuyo paso siguiente solo esperaba el material
 * (condición «tener el material recibido») y ya no tienen nada pendiente, pasan a ese paso.
 * Devuelve cuántos han avanzado.
 */
export async function avanzarPorMaterial(encargoIds: string[]): Promise<number> {
  if (!encargoIds.length) return 0
  const { data } = await supabase.from('v_encargo_estado').select('id,etapa_siguiente_id,etapa_siguiente_clave,puertas_pendientes,estado,es_final').in('id', encargoIds)
  const es = ((data ?? []) as { id: string; etapa_siguiente_id: string | null; etapa_siguiente_clave: string | null; puertas_pendientes: { dura: boolean }[]; estado: string; es_final: boolean | null }[])
    .filter((e) => e.estado === 'ACTIVO' && !e.es_final && e.etapa_siguiente_id && !(e.puertas_pendientes ?? []).some((p) => p.dura))
  if (!es.length) return 0
  const { data: pu } = await supabase.from('puerta').select('etapa_destino_id').eq('tipo', 'MATERIAL').in('etapa_destino_id', [...new Set(es.map((e) => e.etapa_siguiente_id!))])
  const conMat = new Set(((pu ?? []) as { etapa_destino_id: string }[]).map((p) => p.etapa_destino_id))
  let n = 0
  for (const e of es.filter((x) => conMat.has(x.etapa_siguiente_id!))) {
    const { error } = await supabase.rpc('crear_hito', { p_encargo: e.id, p_etapa_clave: e.etapa_siguiente_clave, p_tipo: 'NORMAL', p_nota: null, p_origen: 'APP', p_forzar_blandas: true })
    if (!error) n++
  }
  return n
}
export async function liberarMaterial(encargoId: string, devolver: boolean) {
  return Number(ok(await supabase.rpc('liberar_material_encargo', { p_encargo: encargoId, p_devolver: devolver })))
}

/** Ajustes del módulo en la tienda */
export function ajustesMaterial(aj: Record<string, unknown> | null | undefined) {
  return {
    activo: ((aj?.modulos as Record<string, boolean> | undefined)?.materiales) === true,
    /** Unidad que se propone al crear un material nuevo (cada material tiene la suya) */
    unidad: String(aj?.material_unidad ?? 'uds'),
    /** «Pedidos» como entrada propia del menú (para recibir lo que llega) */
    menuPedidos: aj?.material_menu_pedidos === true,
    /** Qué cuenta el número del menú de materiales */
    contador: ((['pedir', 'restos', 'ninguno'] as const).find((x) => x === aj?.material_contador) ?? 'pedir') as 'pedir' | 'restos' | 'ninguno',
  }
}

/** Materiales con un resto por apartar (lo que queda ya no llega a una unidad de pedido): se avisa hasta que se guarda */
export function restosPendientes(mats: MaterialEstado[]): { m: MaterialEstado; cantidad: number }[] {
  return mats.filter((m) => m.activo).map((m) => ({ m, cantidad: restoCandidato(Number(m.stock), m.unidad_efectiva, Number(m.resto_hasta ?? 0)) })).filter((x) => x.cantidad > 0)
}
/** Pedidos abiertos: sin recibir nada o a medias */
export const pedidoAbierto = (p: { estado: string }) => p.estado === 'PENDIENTE' || p.estado === 'PARCIAL'
/** Unidad de un material; si aún no se sabe, la habitual de la tienda */
export const unidadDe = (m: { unidad?: string | null } | null | undefined, porDefecto: string) => m?.unidad || porDefecto

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

/**
 * Qué se propone pedir (Ajustes → Materiales):
 * - «umbral» (por defecto): lo que falta para cubrir lo pedido por los encargos y además dejar el umbral;
 * - «falta»: solo lo que falta para los encargos; si solo queda por debajo del umbral, una unidad de pedido.
 * En los dos casos se redondea a la unidad de pedido del proveedor.
 */
let MODO_PEDIDO: 'umbral' | 'falta' = 'umbral'
export const setModoPedido = (v: unknown) => { MODO_PEDIDO = v === 'falta' ? 'falta' : 'umbral' }
export function propuestaPedido(m: MaterialEstado): { falta: number; pedir: number } {
  const u = Number(m.unidad_efectiva || 0)
  const redondeo = (x: number) => (u > 0 ? Math.ceil(x / u - 1e-9) * u : Math.ceil(x * 100) / 100)
  const queda = Number(m.stock) + Number(m.en_camino) - Number(m.demanda)
  if (MODO_PEDIDO === 'falta') {
    // Solo se pide para encargos: lo que está bajo el umbral sin que nadie lo espere se ve en el catálogo, no se propone
    if (Number(m.demanda) <= 0.001) return { falta: 0, pedir: 0 }
    if (queda < -0.001) return { falta: Math.round(-queda * 100) / 100, pedir: redondeo(-queda) }
    if (queda < Number(m.umbral_efectivo) - 0.001) return { falta: 0, pedir: u > 0 ? u : Math.ceil((Number(m.umbral_efectivo) - queda) * 100) / 100 }
    return { falta: 0, pedir: 0 }
  }
  const falta = Number(m.umbral_efectivo) - queda
  if (falta <= 0.001) return { falta: 0, pedir: 0 }
  return { falta: Math.round(falta * 100) / 100, pedir: redondeo(falta) }
}
export const numEncargo = (e: { numero: number; serie?: string | null } | null | undefined) =>
  !e ? '—' : `${e.serie ?? ''}${String(e.numero).padStart(3, '0')}`

/** Una sola regla de «bajo umbral» para todas las pantallas: stock por debajo del umbral o no alcanza para lo pedido */
export const bajoUmbral = (m: MaterialEstado) => (Number(m.umbral_efectivo) > 0 && Number(m.stock) <= Number(m.umbral_efectivo)) || avisoStock(m).nivel !== null

/**
 * Encargo que dejó el sobrante: el del último consumo de ese material, si no ha habido otro movimiento
 * de stock después. Así el resto queda ligado a él y vuelve al stock si ese encargo se anula.
 */
export async function encargoDelSobrante(materialId: string): Promise<string | null> {
  const { data } = await supabase.from('movimiento_material').select('tipo,delta,encargo_id,revertido')
    .eq('material_id', materialId).neq('delta', 0).order('fecha', { ascending: false }).limit(1)
  const m = (data ?? [])[0] as { tipo: string; encargo_id: string | null; revertido: boolean } | undefined
  return m && m.tipo === 'CONSUMO' && !m.revertido ? m.encargo_id : null
}

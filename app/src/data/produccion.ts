import { supabase } from '@/lib/supabase'

/** Hoja de producción: una por producto, con los encargos enviados a producción. */
export type Coherencia = 'ENVIADO' | 'NO_ENVIADO' | 'REVISAR' | 'ANULADO'
export interface LineaHoja {
  id: string; tienda_id: string; encargo_id: string; producto_id: string | null
  enviado_en: string; imprimir: boolean; bloqueada: boolean; impreso_en: string | null; impreso_por: string | null; impresion_id: string | null
  numero: number; serie: string | null; encargo_estado: string; complementos: string | null; datos: Record<string, unknown>
  cliente_nombre: string | null; producto_nombre: string | null; proveedor_nombre: string | null; etapa_actual_nombre: string | null
  motivos: string[]; coherencia: Coherencia
  /** Anulado después de imprimir: ya se ha avisado al taller */
  aviso_anulado_visto?: boolean
}
export interface Impresion { id: string; producto_id: string | null; fecha: string; usuario_id: string | null; n_lineas: number; contenido: ContenidoImpresion }
export interface ContenidoImpresion {
  titulo: string; producto: string; tienda: string; fecha: string
  columnas: string[]; curva: string[]; filas: { celdas: string[]; valor: string }[]
  /** Marca de la rejilla (● por defecto; X como en una orden de corte) */
  marca?: string
  /** Cabecera «PRODUCTO X» en grande con el nombre de la hoja debajo */
  cabecera?: 'producto'
}

const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }

export function ajustesHoja(aj: Record<string, unknown> | null | undefined) {
  return {
    activo: ((aj?.modulos as Record<string, boolean> | undefined)?.produccion) === true,
    nombre: String(aj?.hoja_nombre ?? 'Hoja de producción'),
    campoCol: (aj?.hoja_campo_col as string | null | undefined) ?? null,
    etiquetaCol: String(aj?.hoja_col_etiqueta ?? aj?.hoja_campo_col ?? ''),
    curva: (aj?.hoja_curva as string[] | undefined) ?? [],
    /** Qué sale en la hoja impresa */
    impCliente: aj?.hoja_imp_cliente !== false,
    impCantidad: aj?.hoja_imp_cantidad !== false,
    impNota: aj?.hoja_imp_nota !== false,
    marca: String(aj?.hoja_imp_marca ?? '●'),
    cabecera: aj?.hoja_imp_cabecera === 'producto' ? 'producto' as const : undefined,
  }
}

export async function listarLineas(tiendaId: string): Promise<LineaHoja[]> {
  return ok(await supabase.from('v_linea_produccion').select('*').eq('tienda_id', tiendaId).order('enviado_en')) as LineaHoja[]
}
export async function marcarAvisoVisto(id: string) {
  ok(await supabase.from('linea_produccion').update({ aviso_anulado_visto: true }).eq('id', id))
}
export async function marcarImprimir(ids: string[], v: boolean) {
  ok(await supabase.from('linea_produccion').update({ imprimir: v }).in('id', ids))
}
export async function registrarImpresion(tiendaId: string, productoId: string | null, lineas: string[], contenido: ContenidoImpresion): Promise<string> {
  return ok(await supabase.rpc('registrar_impresion', { p_tienda: tiendaId, p_producto: productoId, p_lineas: lineas, p_contenido: contenido })) as string
}
export async function listarImpresiones(tiendaId: string, productoId: string | null): Promise<Impresion[]> {
  let q = supabase.from('impresion_produccion').select('*').eq('tienda_id', tiendaId).order('fecha', { ascending: false }).limit(30)
  q = productoId ? q.eq('producto_id', productoId) : q.is('producto_id', null)
  return ok(await q) as Impresion[]
}

/** Abre la hoja en una ventana A4 apaisada y lanza la impresión (o «Guardar como PDF»). */
export function imprimirHoja(c: ContenidoImpresion): boolean {
  const esc = (s: string) => s.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]!))
  const cab = c.columnas.map((x) => `<th>${esc(x)}</th>`).join('') + (c.curva.length ? c.curva.map((t) => `<th class="t">${esc(t)}</th>`).join('') : '')
  const filas = c.filas.map((f) => `<tr>${f.celdas.map((x) => `<td>${esc(x)}</td>`).join('')}${c.curva.map((t) => `<td class="t">${f.valor === t ? esc(c.marca ?? '●') : ''}</td>`).join('')}</tr>`).join('')
  const cabecera = c.cabecera === 'producto'
    ? `<h1>${esc(c.producto.toUpperCase())}</h1><div class="sub"><b>${esc(c.titulo.toUpperCase())}</b> · Fecha de impresión: ${esc(c.fecha)} · ${c.filas.length} ${c.filas.length === 1 ? 'línea' : 'líneas'}</div>`
    : `<h1>${esc(c.producto)}</h1><div class="sub">${esc(c.titulo)} · ${esc(c.tienda)} · ${esc(c.fecha)} · ${c.filas.length} ${c.filas.length === 1 ? 'línea' : 'líneas'}</div>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.titulo)} · ${esc(c.producto)}</title>
<style>@page{size:A4 landscape;margin:10mm}body{font:11px/1.35 system-ui,sans-serif;color:#111;margin:0}
h1{font-size:18px;margin:0 0 2px}.sub{color:#555;margin-bottom:10px}table{width:100%;border-collapse:collapse}
th,td{border:1px solid #999;padding:4px 5px;text-align:left;vertical-align:top}th{background:#eee;font-weight:600}
.t{text-align:center;width:22px;font-weight:700}tr{page-break-inside:avoid}tbody tr:nth-child(even){background:#f6f6f6}</style></head><body>
${cabecera}
<table><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table>
<script>window.onload=()=>{window.print()}</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}

/** Material de cada encargo de la hoja: «Tipo / Variante 2 m (Recibido)» */
export async function materialDeEncargos(ids: string[]): Promise<Record<string, { nombre: string; cantidad: number; estado: string }[]>> {
  if (!ids.length) return {}
  const r = ok(await supabase.from('encargo_material').select('encargo_id,cantidad,estado,material(tipo,variante)').in('encargo_id', ids)) as unknown as
    { encargo_id: string; cantidad: number; estado: string; material: { tipo: string; variante: string } | null }[]
  const out: Record<string, { nombre: string; cantidad: number; estado: string }[]> = {}
  for (const x of r) (out[x.encargo_id] ??= []).push({ nombre: x.material ? (x.material.variante ? `${x.material.tipo} / ${x.material.variante}` : x.material.tipo) : '—', cantidad: Number(x.cantidad), estado: x.estado })
  return out
}
/** Notas de producción de varios encargos (nota por campo «produccion») */
export async function notasProduccion(ids: string[]) {
  if (!ids.length) return {} as Record<string, { encargo_id: string; campo: string; texto: string; usuario_id: string | null; actualizado_en: string }>
  const r = ok(await supabase.from('nota_campo').select('*').in('encargo_id', ids).eq('campo', 'produccion')) as { encargo_id: string; campo: string; texto: string; usuario_id: string | null; actualizado_en: string }[]
  return Object.fromEntries(r.map((n) => [n.encargo_id, n]))
}

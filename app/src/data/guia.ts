import { supabase } from '@/lib/supabase'

/**
 * Guía de medidas de la tienda: una fila por valor (p. ej. 38, 40… o S, M, L) con la medida de
 * referencia de cada campo. Sugiere el valor a partir de las medidas del cliente:
 * la medida principal manda y las de validación comprueban (según las tolerancias).
 */
export interface FilaGuia { etiqueta: string; valores: Record<string, number | null> }
export interface Guia {
  activa: boolean
  /** Campo del encargo donde se guarda el valor elegido */
  destino: string | null
  /** Valor especial para «hay que revisarlo» */
  especial: string
  principal: string | null
  validan: string[]
  /** [igual, en medio, revisar]: diferencia (en filas) hasta la que se aplica cada regla */
  tolerancias: [number, number, number]
  responsable: string
  filas: FilaGuia[]
}
export const GUIA_VACIA: Guia = { activa: false, destino: null, especial: 'Revisar', principal: null, validan: [], tolerancias: [1, 2, 3], responsable: '', filas: [] }

/** La guía que rige: la propia del periodo si la tiene; si no, la de la tienda */
export function guiaDe(aj: Record<string, unknown> | null | undefined, periodoAj?: Record<string, unknown> | null): Guia {
  const g = (periodoAj?.guia_medidas ?? aj?.guia_medidas ?? {}) as Partial<Guia>
  return { ...GUIA_VACIA, ...g, validan: g.validan ?? [], filas: g.filas ?? [], tolerancias: (g.tolerancias ?? [1, 2, 3]) as [number, number, number] }
}
/** Opciones del campo destino: los valores de la guía más el especial */
export const opcionesGuia = (g: Guia) => [...g.filas.map((f) => f.etiqueta), ...(g.especial ? [g.especial] : [])]

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
/** Índice de la primera fila cuya referencia alcanza la medida (si pasa de todas, la última y fuera de tabla) */
function indice(g: Guia, campo: string, medida: number): { i: number; fuera: boolean } | null {
  const filas = g.filas.map((f, i) => ({ i, v: f.valores[campo] })).filter((x) => x.v != null) as { i: number; v: number }[]
  if (!filas.length) return null
  const f = filas.find((x) => medida <= x.v)
  return f ? { i: f.i, fuera: false } : { i: filas[filas.length - 1].i, fuera: true }
}

export interface Sugerencia { valor: string; nivel: 'ok' | 'aviso' | 'revisar'; motivo: string; revisar: boolean }
/**
 * Sugerencia en vivo. etiquetas: nombre visible de cada campo (para los mensajes).
 * Sin la medida principal no se calcula.
 */
export function sugerir(g: Guia, datos: Record<string, unknown>, etiquetas: Record<string, string>): Sugerencia | null {
  if (!g.activa || !g.principal || !g.filas.length) return null
  const mp = num(datos[g.principal]); if (mp == null) return null
  const p = indice(g, g.principal, mp); if (!p) return null
  const et = (c: string) => etiquetas[c] ?? c
  let peor: { c: string; i: number; d: number } | null = null
  for (const c of g.validan) {
    const m = num(datos[c]); if (m == null) continue
    const x = indice(g, c, m); if (!x) continue
    const d = Math.abs(x.i - p.i)
    if (!peor || d > peor.d) peor = { c, i: x.i, d }
  }
  const fueraTxt = p.fuera ? ` (${et(g.principal)} por encima de la tabla)` : ''
  const [t1, t2] = g.tolerancias
  if (!peor || peor.d <= t1) return { valor: g.filas[p.i].etiqueta, nivel: p.fuera ? 'aviso' : 'ok', motivo: `Por ${et(g.principal)}${fueraTxt}`, revisar: false }
  if (peor.d <= t2) {
    const i = Math.round((p.i + peor.i) / 2)
    return { valor: g.filas[i].etiqueta, nivel: 'aviso', motivo: `${et(g.principal)} y ${et(peor.c)} difieren ${peor.d}: se toma la de en medio`, revisar: false }
  }
  const i = Math.max(p.i, peor.i)
  return { valor: g.filas[i].etiqueta, nivel: 'revisar', revisar: true,
    motivo: `${et(g.principal)} (${g.filas[p.i].etiqueta}) y ${et(peor.c)} (${g.filas[peor.i].etiqueta}) difieren ${peor.d}: se toma la mayor${g.responsable ? `; consultar con ${g.responsable}` : ''}` }
}

/** Importar desde una hoja de cálculo (texto pegado). Acepta filas = valores o transpuesto. */
export function importarGuia(texto: string, campos: { clave: string; etiqueta: string }[]): { filas: FilaGuia[]; columnas: string[] } | string {
  const lineas = texto.trim().split(/\r?\n/).map((l) => l.split(/\t|;/).map((x) => x.trim()))
  if (lineas.length < 2) return 'Pega al menos una fila de cabecera y una de datos'
  const buscar = (s: string) => campos.find((c) => c.etiqueta.toLowerCase() === s.toLowerCase() || c.clave.toLowerCase() === s.toLowerCase())
  const cab = lineas[0].slice(1)
  const porColumnas = cab.filter((h) => buscar(h)).length
  const porFilas = lineas.slice(1).filter((l) => buscar(l[0])).length
  const n = (s: string) => { const v = Number(s.replace(',', '.')); return s === '' || !Number.isFinite(v) ? null : v }
  if (porColumnas >= porFilas && porColumnas > 0) {
    const cols = cab.map((h) => buscar(h)?.clave ?? null)
    return { columnas: cols.filter(Boolean) as string[], filas: lineas.slice(1).filter((l) => l[0]).map((l) => ({ etiqueta: l[0], valores: Object.fromEntries(cols.map((c, j) => [c, n(l[j + 1] ?? '')]).filter(([c]) => c)) })) }
  }
  if (porFilas > 0) {
    const filas: FilaGuia[] = cab.map((etq) => ({ etiqueta: etq, valores: {} }))
    const columnas: string[] = []
    for (const l of lineas.slice(1)) {
      const c = buscar(l[0]); if (!c) continue
      columnas.push(c.clave)
      filas.forEach((f, j) => { f.valores[c.clave] = n(l[j + 1] ?? '') })
    }
    return { filas: filas.filter((f) => f.etiqueta), columnas }
  }
  return 'No reconozco los nombres de las medidas: usa los mismos que en Ajustes → Datos que guardáis'
}

export interface Historial { id: string; cliente_id: string; encargo_id: string | null; datos: Record<string, unknown>; fecha: string; usuario_id: string | null }
export async function historialCliente(clienteId: string): Promise<Historial[]> {
  const { data, error } = await supabase.from('medida_historial').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as Historial[]
}
export async function historialEncargo(encargoId: string): Promise<Historial | null> {
  const { data, error } = await supabase.from('medida_historial').select('*').eq('encargo_id', encargoId).order('fecha').limit(1).maybeSingle()
  if (error) throw error
  return data as Historial | null
}

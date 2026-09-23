import { supabase } from '@/lib/supabase'

export interface HitoInforme {
  id: string; encargo_id: string; fecha: string; tipo: 'NORMAL' | 'INCIDENCIA' | 'REENTRADA'
  tienda_id: string; periodo_id: string | null; tipo_encargo_id: string; numero: number; creado_en: string
  producto_id: string | null; proveedor_id: string | null; datos: Record<string, unknown>
  etapa_id: string; etapa_nombre: string; etapa_orden: number; es_final: boolean; etapa_proveedor: boolean; es_espera: boolean
}

export async function hitosInforme(tiendaId: string, desde: Date | null, periodoId: string | null): Promise<HitoInforme[]> {
  const out: HitoInforme[] = []
  // Por páginas de 1000 (límite del servidor)
  for (let pag = 0; pag < 50; pag++) {
    let q = supabase.from('v_informe_hitos').select('*').eq('tienda_id', tiendaId)
    if (desde) q = q.gte('fecha', desde.toISOString())
    if (periodoId) q = q.eq('periodo_id', periodoId)
    const { data, error } = await q.order('fecha').range(pag * 1000, pag * 1000 + 999)
    if (error) throw error
    out.push(...((data ?? []) as HitoInforme[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Intervalos
// ---------------------------------------------------------------------------
export type TipoIntervalo = 'semana' | 'quincena' | 'mes' | 'trimestre' | 'año' | 'periodo'
export interface Intervalo { tipo: TipoIntervalo; ini: Date; fin: Date; titulo: string }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const d0 = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0)
const corta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`

/** Intervalo que contiene `f`: semana lunes-domingo, quincena 1–15 / 16–fin, mes, trimestre o año. */
export function intervaloDe(tipo: Exclude<TipoIntervalo, 'periodo'>, f: Date): Intervalo {
  const y = f.getFullYear(), m = f.getMonth()
  let ini: Date, fin: Date, titulo: string
  switch (tipo) {
    case 'semana': {
      const dia = (f.getDay() + 6) % 7
      ini = d0(y, m, f.getDate() - dia); fin = d0(y, m, f.getDate() - dia + 7)
      const ult = new Date(fin.getTime() - 864e5)
      titulo = `Semana del ${corta(ini)} al ${corta(ult)}${ult.getFullYear() !== new Date().getFullYear() ? ` de ${ult.getFullYear()}` : ''}`
      break
    }
    case 'quincena': {
      const primera = f.getDate() <= 15
      ini = d0(y, m, primera ? 1 : 16); fin = primera ? d0(y, m, 16) : d0(y, m + 1, 1)
      titulo = `${primera ? '1ª' : '2ª'} quincena de ${MESES[m]} ${y}`
      break
    }
    case 'mes': ini = d0(y, m, 1); fin = d0(y, m + 1, 1); titulo = `${MESES[m].charAt(0).toUpperCase()}${MESES[m].slice(1)} ${y}`; break
    case 'trimestre': { const t = Math.floor(m / 3); ini = d0(y, t * 3, 1); fin = d0(y, t * 3 + 3, 1); titulo = `${t + 1}º trimestre de ${y}`; break }
    case 'año': ini = d0(y, 0, 1); fin = d0(y + 1, 0, 1); titulo = String(y); break
  }
  return { tipo, ini, fin, titulo }
}
/** Anterior (-1) o siguiente (+1). El siguiente nunca pasa de hoy. */
export function mover(i: Intervalo, paso: -1 | 1): Intervalo | null {
  if (i.tipo === 'periodo') return null
  const ref = paso === -1 ? new Date(i.ini.getTime() - 864e5) : i.fin
  if (paso === 1 && ref > new Date()) return null
  return intervaloDe(i.tipo, ref)
}
export function ultimos(i: Intervalo, n: number): Intervalo[] {
  const out = [i]
  while (out.length < n) { const p = mover(out[0], -1); if (!p) break; out.unshift(p) }
  return out
}
const dentro = (f: string, i: Intervalo) => { const t = new Date(f).getTime(); return t >= i.ini.getTime() && t < i.fin.getTime() }

// ---------------------------------------------------------------------------
// Cálculos (un único sitio; la pantalla solo pinta)
// ---------------------------------------------------------------------------
const avance = (h: HitoInforme) => h.tipo !== 'INCIDENCIA'

/** Encargos distintos que alcanzan cada etapa dentro del intervalo (por la fecha del hito). */
export function alcanzanEtapa(hs: HitoInforme[], i: Intervalo): Map<string, number> {
  const m = new Map<string, Set<string>>()
  for (const h of hs) if (avance(h) && dentro(h.fecha, i)) {
    if (!m.has(h.etapa_nombre)) m.set(h.etapa_nombre, new Set())
    m.get(h.etapa_nombre)!.add(h.encargo_id)
  }
  return new Map([...m].map(([k, v]) => [k, v.size]))
}

/** Encargos creados en el intervalo (primer hito cuenta como alta). */
export function nuevos(hs: HitoInforme[], i: Intervalo): number {
  const s = new Set<string>()
  for (const h of hs) if (dentro(h.creado_en, i)) s.add(h.encargo_id)
  return s.size
}
export function terminados(hs: HitoInforme[], i: Intervalo): Set<string> {
  // Solo la primera vez que un encargo llega a una etapa final
  const primero = new Map<string, string>()
  for (const h of hs) if (avance(h) && h.es_final && !primero.has(h.encargo_id)) primero.set(h.encargo_id, h.fecha)
  return new Set([...primero].filter(([, f]) => dentro(f, i)).map(([id]) => id))
}
export function enviadosProveedor(hs: HitoInforme[], i: Intervalo): Set<string> {
  const s = new Set<string>()
  for (const h of hs) if (avance(h) && h.etapa_proveedor && dentro(h.fecha, i)) s.add(h.encargo_id)
  return s
}

const dias = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 864e5

export interface Plazo { tramo: string; media: number | null; n: number; descartados: number }
/**
 * Días medios entre una etapa y la siguiente (primer paso por cada una), para los
 * encargos que llegan a la segunda dentro del intervalo. Se descartan los negativos.
 */
export function plazos(hs: HitoInforme[], i: Intervalo): Plazo[] {
  const porEnc = new Map<string, HitoInforme[]>()
  for (const h of hs) if (avance(h)) porEnc.set(h.encargo_id, [...(porEnc.get(h.encargo_id) ?? []), h])
  const acc = new Map<string, { suma: number; n: number; malos: number; orden: number }>()
  const sumar = (k: string, orden: number, v: number) => {
    const a = acc.get(k) ?? { suma: 0, n: 0, malos: 0, orden }
    if (v < 0) a.malos++; else { a.suma += v; a.n++ }
    acc.set(k, a)
  }
  for (const lista of porEnc.values()) {
    // Primer paso por cada etapa, en el orden del flujo
    const primera = new Map<string, HitoInforme>()
    for (const h of lista) if (!primera.has(h.etapa_id)) primera.set(h.etapa_id, h)
    const pasos = [...primera.values()].sort((a, b) => a.etapa_orden - b.etapa_orden)
    for (let k = 1; k < pasos.length; k++) {
      const a = pasos[k - 1], b = pasos[k]
      if (dentro(b.fecha, i)) sumar(`${a.etapa_nombre} → ${b.etapa_nombre}`, b.etapa_orden, dias(a.fecha, b.fecha))
    }
    const fin = pasos.find((p) => p.es_final)
    if (fin && dentro(fin.fecha, i)) {
      sumar('Total: de la primera etapa al final', 1e6, dias(pasos[0].fecha, fin.fecha))
      sumar('Espera del cliente: del alta a la entrega', 1e6 + 1, dias(fin.creado_en, fin.fecha))
    }
  }
  return [...acc].sort(([, a], [, b]) => a.orden - b.orden)
    .map(([tramo, a]) => ({ tramo, media: a.n ? a.suma / a.n : null, n: a.n, descartados: a.malos }))
}

export interface PorProveedor { proveedor_id: string; enviados: number; recibidos: number; diasMedios: number | null }
/**
 * Por proveedor: enviados = entran en una etapa que ve el proveedor dentro del intervalo;
 * recibidos = vuelven (primer paso posterior a una etapa que no ve); días medios entre ambos.
 */
export function porProveedor(hs: HitoInforme[], i: Intervalo): PorProveedor[] {
  const porEnc = new Map<string, HitoInforme[]>()
  for (const h of hs) if (avance(h) && h.proveedor_id) porEnc.set(h.encargo_id, [...(porEnc.get(h.encargo_id) ?? []), h])
  const acc = new Map<string, { env: number; rec: number; suma: number; n: number }>()
  for (const lista of porEnc.values()) {
    const ord = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const entra = ord.find((h) => h.etapa_proveedor)
    if (!entra) continue
    const sale = ord.find((h) => h.fecha > entra.fecha && !h.etapa_proveedor && h.etapa_orden > entra.etapa_orden)
    const a = acc.get(entra.proveedor_id!) ?? { env: 0, rec: 0, suma: 0, n: 0 }
    if (dentro(entra.fecha, i)) a.env++
    if (sale && dentro(sale.fecha, i)) {
      a.rec++
      const d = dias(entra.fecha, sale.fecha)
      if (d >= 0) { a.suma += d; a.n++ }
    }
    acc.set(entra.proveedor_id!, a)
  }
  return [...acc].map(([proveedor_id, a]) => ({ proveedor_id, enviados: a.env, recibidos: a.rec, diasMedios: a.n ? a.suma / a.n : null }))
}

/** Cuenta por un valor (producto o campo) de los encargos terminados en el intervalo. */
export function rankingTerminados(hs: HitoInforme[], i: Intervalo, valor: (h: HitoInforme) => string | null): [string, number][] {
  const ids = terminados(hs, i)
  const visto = new Set<string>()
  const m = new Map<string, number>()
  for (const h of hs) if (ids.has(h.encargo_id) && !visto.has(h.encargo_id)) {
    visto.add(h.encargo_id)
    const v = valor(h) ?? ''
    m.set(v, (m.get(v) ?? 0) + 1)
  }
  return [...m].sort((a, b) => b[1] - a[1])
}

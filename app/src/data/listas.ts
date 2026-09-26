import * as React from 'react'
import { supabase } from '@/lib/supabase'

/** Lista que mantiene la propia tienda (Adornos, Metales, Piedras…): valores para desplegables y recetas */
export interface ValorLista { v: string; activo: boolean }
export interface ListaTienda { id: string; tienda_id: string; nombre: string; valores: ValorLista[]; orden: number }

const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }

// Caché por tienda: los desplegables de muchos campos leen las mismas listas
const cache = new Map<string, Promise<ListaTienda[]>>()
const oyentes = new Set<() => void>()
export function invalidarListas(tiendaId: string) { cache.delete(tiendaId); oyentes.forEach((f) => f()) }
export function listasCache(tiendaId: string) {
  let p = cache.get(tiendaId)
  if (!p) { p = listarListas(tiendaId).catch((e) => { cache.delete(tiendaId); throw e }); cache.set(tiendaId, p) }
  return p
}
/** Listas de la tienda (con caché); [] mientras cargan */
export function useListas(tiendaId: string | null | undefined): ListaTienda[] {
  const [ls, setLs] = React.useState<ListaTienda[]>([])
  const [v, setV] = React.useState(0)
  React.useEffect(() => { const f = () => setV((x) => x + 1); oyentes.add(f); return () => { oyentes.delete(f) } }, [])
  React.useEffect(() => { let vivo = true; if (tiendaId) listasCache(tiendaId).then((x) => vivo && setLs(x)).catch(() => {}); return () => { vivo = false } }, [tiendaId, v])
  return ls
}

export async function listarListas(tiendaId: string): Promise<ListaTienda[]> {
  return ok(await supabase.from('lista_tienda').select('id,tienda_id,nombre,valores,orden').eq('tienda_id', tiendaId).order('orden').order('nombre')) as ListaTienda[]
}
export async function guardarLista(tiendaId: string, id: string | null, l: { nombre: string; valores: ValorLista[] }): Promise<string> {
  const fila = { nombre: l.nombre.trim(), valores: limpiarValores(l.valores) }
  let r = id
  if (id) ok(await supabase.from('lista_tienda').update(fila).eq('id', id))
  else r = (ok(await supabase.from('lista_tienda').insert({ tienda_id: tiendaId, ...fila }).select('id').single()) as { id: string }).id
  invalidarListas(tiendaId); return r as string
}
export async function borrarLista(tiendaId: string, id: string) {
  ok(await supabase.from('lista_tienda').delete().eq('id', id)); invalidarListas(tiendaId)
}
/** Sin vacíos ni repetidos (sin distinguir mayúsculas) */
export function limpiarValores(vs: ValorLista[]): ValorLista[] {
  const vistos = new Set<string>()
  return vs.map((x) => ({ v: x.v.trim(), activo: x.activo !== false })).filter((x) => {
    const k = x.v.toLowerCase(); if (!x.v || vistos.has(k)) return false
    vistos.add(k); return true
  })
}
export const valoresActivos = (l: ListaTienda | undefined, actual?: string) =>
  (l?.valores ?? []).filter((x) => x.activo || x.v === actual).map((x) => x.v)

/**
 * Componente de la receta de un producto: qué lleva, de dónde sale y quién lo decide.
 * - lista_id: la lista de la tienda de la que sale (null: texto libre).
 * - decide: 'cliente' (se elige al tomar el encargo) o 'fijo' (lo marca el producto).
 * - valor: el valor fijo; segun_variante: el valor según la variante del material elegido (p. ej. el color del material).
 * - campo: dato del encargo donde se guarda; sin campo, va a los complementos.
 */
export interface Componente {
  id: string; nombre: string
  lista_id: string | null
  decide: 'cliente' | 'fijo'
  valor?: string
  cantidad?: string
  segun_variante?: { variante: string; valor: string }[]
  campo?: string | null
}
export const nuevoComponente = (): Componente => ({ id: Math.random().toString(36).slice(2, 10), nombre: '', lista_id: null, decide: 'cliente', valor: '', cantidad: '', segun_variante: [] })

/** Valor que propone la receta para un componente, dada la variante del material elegido */
export function valorPropuesto(c: Componente, variante: string | null | undefined): string {
  const v = (variante ?? '').trim().toLowerCase()
  const regla = v ? (c.segun_variante ?? []).find((r) => r.variante.trim().toLowerCase() === v && r.valor.trim()) : undefined
  if (regla) return regla.valor.trim()
  return c.decide === 'fijo' ? (c.valor ?? '').trim() : ''
}
/** Texto de complementos a partir de lo elegido (los componentes sin campo propio) */
export function textoComplementos(cs: Componente[], elegidos: Record<string, string>): string {
  const xs = cs.filter((c) => !c.campo).map((c) => ({ c, v: (elegidos[c.id] ?? '').trim() })).filter((x) => x.v)
  if (xs.length === 1) return [xs[0].v, xs[0].c.cantidad?.trim()].filter(Boolean).join(' · ')
  return xs.map((x) => `${x.c.nombre}: ${x.v}${x.c.cantidad?.trim() ? ` (${x.c.cantidad.trim()})` : ''}`).join(' · ')
}

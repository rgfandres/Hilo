import type { EncargoEstado, Etapa } from '@/lib/types'

/**
 * Bandejas de la lista de encargos configuradas por la tienda (Ajustes → Bandejas de la lista).
 * Sin configurar, la lista usa las automáticas (una por etapa). Configuradas, salen estas y en este
 * orden, siempre visibles, con su nombre, y una bandeja puede juntar varias etapas o filtrar por
 * si ya tiene proveedor (p. ej. «Asignar proveedor» = en esa etapa y aún sin proveedor).
 */
export type TipoBandeja = 'todos' | 'etapas' | 'mio' | 'pedir' | 'espera_material' | 'revisar' | 'bloqueados' | 'terminados' | 'anulados'

export interface EtapaEnBandeja {
  /** Nombre de la etapa (se unen las de igual nombre de todos los tipos) */
  etapa: string
  /** Solo los que ya tienen proveedor, o solo los que no */
  proveedor?: 'con' | 'sin'
}

export interface BandejaLista {
  /** Clave estable (va en la URL) */
  key: string
  nombre: string
  tipo: TipoBandeja
  /** Para tipo «etapas»: qué etapas (y con qué filtro) entran */
  etapas?: EtapaEnBandeja[]
  /** Para «todos»: incluir los terminados */
  con_terminados?: boolean
  /** Para «pedir»: solo si el material falta o queda por debajo del umbral */
  solo_falta?: boolean
  /** Se marca en rojo si tiene algo (y cuenta para el número del menú) */
  accionable?: boolean
  /** Rótulo que agrupa pestañas: «Tela», «Corte»… */
  grupo?: string
  /** Texto de ayuda al pasar el ratón */
  ayuda?: string
  /** Desplegable de proveedor en cada fila (se guarda al momento) */
  elegir_proveedor?: boolean
  /** Arriba, el material pedido que está en camino, con «He recibido…» */
  llegadas?: boolean
  /** Arriba, un botón por producto para mandarlos a la hoja de producción e imprimirla */
  lote_hoja?: boolean
}

export const TIPOS_BANDEJA: { v: TipoBandeja; l: string; key?: string }[] = [
  { v: 'todos', l: 'Todos', key: 'todos' },
  { v: 'etapas', l: 'Una o varias etapas' },
  { v: 'mio', l: 'Mi trabajo', key: 'mio' },
  { v: 'pedir', l: 'Material por pedir', key: 'mat-pedir' },
  { v: 'espera_material', l: 'Esperando material pedido', key: 'mat-espera' },
  { v: 'revisar', l: 'Revisar', key: 'revisar' },
  { v: 'bloqueados', l: 'Bloqueados', key: 'bloqueados' },
  { v: 'terminados', l: 'Terminados', key: 'entregados' },
  { v: 'anulados', l: 'Anulados', key: 'anulados' },
]

/**
 * Bandejas configuradas (o null si se usan las automáticas). Sin tipo: las de la lista principal;
 * con tipo: las de ese tipo de encargo cuando tiene menú propio.
 */
export function bandejasLista(aj: Record<string, unknown> | null | undefined, tipoId?: string | null): BandejaLista[] | null {
  const b = tipoId ? ((aj?.lista_bandejas_tipo ?? {}) as Record<string, unknown>)[tipoId] : aj?.lista_bandejas
  return Array.isArray(b) && b.length ? (b as BandejaLista[]) : null
}

/** Tipos de encargo con menú propio: salen aparte y no se mezclan con la lista principal */
export function tiposAparte(aj: Record<string, unknown> | null | undefined): string[] {
  const t = aj?.tipos_aparte
  return Array.isArray(t) ? (t as string[]) : []
}

/** Clave para la URL: los tipos fijos usan la de siempre; las de etapas, una propia */
export function claveBandeja(b: Pick<BandejaLista, 'tipo' | 'nombre'>, usadas: string[]): string {
  const fija = TIPOS_BANDEJA.find((t) => t.v === b.tipo)?.key
  if (fija && !usadas.includes(fija)) return fija
  const base = 'x-' + (b.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bandeja')
  let k = base, i = 2
  while (usadas.includes(k)) k = `${base}-${i++}`
  return k
}

/** ¿El encargo está en esta bandeja de etapas? */
export function enEtapas(b: BandejaLista, e: EncargoEstado): boolean {
  if (e.estado !== 'ACTIVO' || e.es_final) return false
  return (b.etapas ?? []).some((x) => x.etapa === e.etapa_actual_nombre
    && (!x.proveedor || (x.proveedor === 'con' ? !!e.proveedor_id : !e.proveedor_id)))
}

/** Propuesta de partida: las bandejas automáticas de hoy, ya escritas para poder cambiarlas */
export function bandejasPorDefecto(etapas: Etapa[], nombres: { todos: string; terminados: string; anulados: string; pedir: string; espera: string }): BandejaLista[] {
  const out: BandejaLista[] = []
  const add = (b: Omit<BandejaLista, 'key'>) => out.push({ ...b, key: claveBandeja(b, out.map((x) => x.key)) })
  add({ nombre: nombres.todos, tipo: 'todos' })
  for (const e of [...new Map([...etapas].sort((a, b) => a.orden - b.orden).filter((x) => !x.es_final).map((x) => [x.nombre, x])).values()]) {
    add({ nombre: e.nombre, tipo: 'etapas', etapas: [{ etapa: e.nombre }], grupo: e.grupo ?? undefined, accionable: !e.es_espera })
  }
  add({ nombre: nombres.pedir, tipo: 'pedir', accionable: true })
  add({ nombre: nombres.espera, tipo: 'espera_material' })
  add({ nombre: 'Revisar', tipo: 'revisar', accionable: true })
  add({ nombre: nombres.terminados, tipo: 'terminados' })
  add({ nombre: nombres.anulados, tipo: 'anulados' })
  return out
}

/**
 * Número del menú con bandejas configuradas: la suma de las marcadas «en rojo»
 * (las de material se cuentan en su pantalla; aquí no se leen las líneas de material).
 */
export function pendientesConf(conf: BandejaLista[], rows: EncargoEstado[], extra: { miTrabajo: (e: EncargoEstado) => boolean; revisar: (e: EncargoEstado) => boolean; bloqueado: (e: EncargoEstado) => boolean }): number {
  let n = 0
  for (const b of conf) {
    if (!b.accionable) continue
    if (b.tipo === 'etapas') n += rows.filter((r) => enEtapas(b, r)).length
    else if (b.tipo === 'revisar') n += rows.filter(extra.revisar).length
    else if (b.tipo === 'mio') n += rows.filter(extra.miTrabajo).length
    else if (b.tipo === 'bloqueados') n += rows.filter((r) => r.estado === 'ACTIVO' && !r.es_final && extra.bloqueado(r)).length
  }
  return n
}

/**
 * Tarjetas de «Para hoy» elegidas por la tienda (Ajustes → Tarjetas de Para hoy). Cada una cuenta
 * una bandeja de la lista, unas etapas o las incidencias abiertas, y al pulsarla abre la lista así.
 */
export interface TarjetaInicio {
  nombre: string
  que: 'bandeja' | 'etapas' | 'incidencias'
  bandeja?: string
  etapas?: string[]
  tono?: 'ok' | 'warn' | 'danger'
}
export function tarjetasInicio(aj: Record<string, unknown> | null | undefined): TarjetaInicio[] | null {
  const t = aj?.inicio_tarjetas
  return Array.isArray(t) && t.length ? (t as TarjetaInicio[]) : null
}

/** Cuántos hay en una bandeja configurada (null en las de material y anulados, que no se leen aquí) */
export function cuentaBandeja(b: BandejaLista, rows: EncargoEstado[], extra: { miTrabajo: (e: EncargoEstado) => boolean; revisar: (e: EncargoEstado) => boolean; bloqueado: (e: EncargoEstado) => boolean }): number | null {
  const vivo = (e: EncargoEstado) => e.estado === 'ACTIVO' && !e.es_final
  switch (b.tipo) {
    case 'todos': return rows.filter((e) => e.estado === 'ACTIVO' && (b.con_terminados || !e.es_final)).length
    case 'etapas': return rows.filter((e) => enEtapas(b, e)).length
    case 'mio': return rows.filter(extra.miTrabajo).length
    case 'revisar': return rows.filter(extra.revisar).length
    case 'bloqueados': return rows.filter((e) => vivo(e) && extra.bloqueado(e)).length
    case 'terminados': return rows.filter((e) => e.estado === 'ACTIVO' && e.es_final).length
    default: return null
  }
}

import { supabase } from '@/lib/supabase'
import { locale, zona } from '@/lib/utils'

export interface Campo {
  clave: string; etiqueta: string; tipo: 'texto' | 'numero' | 'fecha' | 'opcion' | 'lista'
  opciones?: string[]; obligatorio?: boolean; orden?: number; en_tabla?: boolean
  visible_proveedor?: boolean
  /** Texto de ayuda bajo el campo */
  ayuda?: string
  /** Secundario: va plegado en «Más datos» */
  secundario?: boolean
  /** Destacado: se ve arriba y en grande (p. ej. la medida principal) */
  destacado?: boolean
  /** Es una medida (de la persona o de la pieza): la puede usar la guía de medidas */
  medida?: boolean
  /** Unidad de la medida (cm, mm…) */
  unidad?: string
  /** Si está vacío, se enseña el material asignado al encargo (para no escribirlo dos veces) */
  desde_material?: boolean
}
export interface PlantillaCampos { entidad: 'CLIENTE' | 'ENCARGO' | 'PRODUCTO'; tipo_encargo_id: string | null; campos: Campo[] }
export interface CheckDef { clave: string; etiqueta: string; dura: boolean; etapa_destino_id: string }

export async function plantillas(tiendaId: string): Promise<PlantillaCampos[]> {
  const { data, error } = await supabase.from('plantilla_campos').select('entidad,tipo_encargo_id,campos').eq('tienda_id', tiendaId)
  if (error) throw error
  return (data ?? []) as PlantillaCampos[]
}

/** Campos de una entidad para un tipo de encargo (los específicos del tipo + los generales). */
export function camposDe(ps: PlantillaCampos[], entidad: PlantillaCampos['entidad'], tipoEncargoId?: string | null): Campo[] {
  // Primero los generales (en su orden) y después los propios del tipo (en el suyo)
  const grupo = (p: PlantillaCampos) => (p.tipo_encargo_id === null ? 0 : 1)
  const out = ps
    .filter((p) => p.entidad === entidad && (p.tipo_encargo_id === null || p.tipo_encargo_id === tipoEncargoId))
    .sort((a, b) => grupo(a) - grupo(b))
    .flatMap((p) => [...p.campos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)))
  const vistos = new Set<string>()
  return out.filter((c) => (vistos.has(c.clave) ? false : (vistos.add(c.clave), true)))
}

/**
 * Columnas de tabla: campos de ENCARGO marcados en_tabla. Si se pasan los tipos
 * que hay en pantalla, solo salen los generales y los de esos tipos.
 */
export function columnasTabla(ps: PlantillaCampos[], tipos?: string[]): Campo[] {
  const vistos = new Set<string>()
  const grupo = (p: PlantillaCampos) => (p.tipo_encargo_id === null ? 0 : 1)
  return ps.filter((p) => p.entidad === 'ENCARGO' && (!tipos || p.tipo_encargo_id === null || tipos.includes(p.tipo_encargo_id)))
    .sort((a, b) => grupo(a) - grupo(b))
    .flatMap((p) => [...p.campos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)))
    .filter((c) => c.en_tabla && !vistos.has(c.clave) && (vistos.add(c.clave), true))
}

/** Comprobaciones = puertas de tipo CHECK del flujo del encargo. */
export async function checksDelFlujo(tipoEncargoId: string): Promise<CheckDef[]> {
  const { data, error } = await supabase
    .from('puerta')
    .select('referencia, etiqueta, mensaje, dura, etapa_destino_id, etapa:etapa_destino_id!inner(tipo_encargo_id, orden)')
    .eq('tipo', 'CHECK')
    .eq('etapa.tipo_encargo_id', tipoEncargoId)
  if (error) throw error
  type Row = { referencia: string; etiqueta: string | null; mensaje: string; dura: boolean; etapa_destino_id: string; etapa: { orden: number } }
  return ((data ?? []) as unknown as Row[])
    .sort((a, b) => a.etapa.orden - b.etapa.orden)
    .map((r) => ({ clave: r.referencia, etiqueta: r.etiqueta ?? r.mensaje, dura: r.dura, etapa_destino_id: r.etapa_destino_id }))
}

export function formatearValor(c: Campo | undefined, v: unknown): string {
  if (v == null || v === '') return '—'
  if (c?.tipo === 'fecha') {
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(locale(), { timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'UTC' : zona(), day: 'numeric', month: 'short' })
  }
  if (c?.tipo === 'numero') {
    const n = typeof v === 'number' ? v : leerNumero(String(v))
    return n == null ? String(v) : n.toLocaleString(locale(), { maximumFractionDigits: 4 })
  }
  return String(v)
}

/**
 * Número escrito a la española o a la inglesa: «19,96», «1.234,5», «1234.5», «1 234».
 * Devuelve null si no es un número.
 */
export function leerNumero(s: string, o: { dinero?: boolean } = {}): number | null {
  let t = String(s ?? '').trim().replace(/\s/g, '').replace(/€/g, '')
  if (!t) return null
  // En dinero, «1.200» es mil doscientos (a la española), no uno coma dos
  if (o.dinero && /^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.')
  if (coma > -1 && punto > -1) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (coma > -1) t = t.replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Marcador por el nombre visible del campo: «Color elegido» → {color_elegido}. Sirve además de la clave
 * interna ({color}), para que al renombrar un campo también funcione lo que se escribe con el nombre nuevo.
 */
export const marcadorEtiqueta = (c: Pick<Campo, 'etiqueta'>) =>
  c.etiqueta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

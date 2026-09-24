import { supabase } from '@/lib/supabase'
import type { Etapa } from '@/lib/types'
import type { PuertaDef } from '@/data/ajustes'

/** Cómo se ve y se comporta cada bandeja (todo opcional: sin nada, textos por defecto) */
export interface ConfigBandeja {
  /** Nombre de la pestaña (con emoji si se quiere): «📥 Recoger del cortador» */
  nombre?: string
  /** Texto del botón de la tarjeta: «✓ Recogido» */
  boton?: string
  /** Frase de arriba: qué hay en esta bandeja */
  subtitulo?: string
  /** Frase de los días; {n} = número de días: «{n} días en el coche» */
  dias?: string
  /** Texto si está vacía */
  vacio?: string
  /** Botón «Marcar todos (N)»; texto propio opcional */
  todos?: boolean
  todos_texto?: string
  /** Desplegable de proveedor en cada tarjeta (se guarda al momento) */
  proveedor?: boolean
  /** Carpetas por proveedor y filtro por producto: auto / siempre / nunca */
  carpetas?: 'auto' | 'siempre' | 'nunca'
  filtro?: 'auto' | 'siempre' | 'nunca'
}
export interface ConfigLogistica {
  bandejas: Record<string, ConfigBandeja>
  /** Histórico de todo el periodo (sin límite de días) */
  historico_periodo?: boolean
  /** Al entrar, abrir siempre la primera bandeja (si no, la primera con algo) */
  abrir_primera?: boolean
  /** Doble toque también en el ordenador (no solo en pantallas táctiles) */
  doble_siempre?: boolean
  /** Campos del encargo que salen en la tarjeta (si vacío: el de la hoja y la primera fecha) */
  campos_tarjeta?: string[]
  /** En la línea de pasos, no enseñar los que aún no han llegado */
  ocultar_futuros?: boolean
  /** Ocultar «Materiales en camino» */
  ocultar_llegadas?: boolean
}

/** Pantalla de logística: bandejas derivadas del flujo para el rol que lleva y trae. */
export function ajustesLogistica(aj: Record<string, unknown> | null | undefined) {
  const cfg = (aj?.logistica ?? {}) as Partial<ConfigLogistica>
  return {
    activo: ((aj?.modulos as Record<string, boolean> | undefined)?.logistica) === true,
    diasHistorico: Number(aj?.logistica_dias_historico ?? 30),
    cfg: { ...cfg, bandejas: cfg.bandejas ?? {} } as ConfigLogistica,
  }
}

export interface BandejaLogistica {
  key: string; tipo: 'etapa' | 'check' | 'historico'; etapas: Etapa[]; ref?: string
  /** Nombre y textos por defecto (sin la configuración de la tienda) */
  nombreDefecto: string; subtituloDefecto: string; botonDefecto?: string
}
/**
 * Bandejas en el orden del flujo (por nombre, uniendo tipos): antes de cada paso que marca
 * logística, una por cada comprobación obligatoria que hace falta para él; al final, el histórico.
 */
export function bandejasLogistica(etapas: Etapa[], puertas: PuertaDef[], diasHistorico: number, periodo: boolean): BandejaLogistica[] {
  const out: BandejaLogistica[] = []
  const logis = etapas.filter((x) => x.rol_ejecuta === 'LOGISTICA').sort((a, b) => a.orden - b.orden)
  for (const et of logis) {
    for (const p of puertas.filter((x) => x.etapa_destino_id === et.id && x.tipo === 'CHECK' && x.dura)) {
      const key = 'c:' + p.referencia
      const ya = out.find((b) => b.key === key)
      if (ya) { ya.etapas.push(et); continue }
      const n = p.etiqueta || p.mensaje
      out.push({ key, tipo: 'check', etapas: [et], ref: p.referencia, nombreDefecto: n, botonDefecto: n,
        subtituloDefecto: `Marca «${n}» cuando esté: después pasan a la bandeja «${et.nombre}» para marcarla.` })
    }
    const key = 'e:' + et.nombre
    const ya = out.find((b) => b.key === key)
    if (ya) { ya.etapas.push(et); continue }
    const prev = etapas.filter((x) => x.tipo_encargo_id === et.tipo_encargo_id && x.orden < et.orden).sort((a, b) => b.orden - a.orden)[0]
    out.push({ key, tipo: 'etapa', etapas: [et], nombreDefecto: et.nombre, botonDefecto: `✓ ${et.nombre}`,
      subtituloDefecto: `Toca «${et.nombre}» cuando esté hecho${prev ? `. Vienen de «${prev.nombre}»` : ''}.` })
  }
  out.push({ key: 'h', tipo: 'historico', etapas: [], nombreDefecto: 'Histórico',
    subtituloDefecto: periodo ? 'Lo que ha pasado por tus pasos en este periodo. Solo lectura.' : `Lo que ha pasado por tus pasos en los últimos ${diasHistorico} días. Solo lectura.` })
  return out
}

export interface HitoMini { encargo_id: string; etapa_id: string; fecha: string; tipo: string }
/** Hitos vigentes de varios encargos (para la línea temporal de cada tarjeta) */
export async function hitosDe(ids: string[]): Promise<Record<string, HitoMini[]>> {
  if (!ids.length) return {}
  const out: Record<string, HitoMini[]> = {}
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('hito').select('encargo_id,etapa_id,fecha,tipo').in('encargo_id', ids.slice(i, i + 150))
      .is('deshecho_en', null).eq('tipo', 'NORMAL').order('fecha')
    if (error) throw error
    for (const h of (data ?? []) as HitoMini[]) (out[h.encargo_id] ??= []).push(h)
  }
  return out
}

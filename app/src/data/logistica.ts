import { supabase } from '@/lib/supabase'

/** Pantalla de logística: bandejas derivadas del flujo para el rol que lleva y trae. */
export function ajustesLogistica(aj: Record<string, unknown> | null | undefined) {
  return {
    activo: ((aj?.modulos as Record<string, boolean> | undefined)?.logistica) === true,
    diasHistorico: Number(aj?.logistica_dias_historico ?? 30),
  }
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

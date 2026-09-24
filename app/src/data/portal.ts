import { supabase } from '@/lib/supabase'

export interface EncargoPortal {
  id: string; numero: number; serie?: string | null; proveedor_id: string; proveedor_nombre: string
  cliente_nombre: string | null; producto_nombre: string | null; producto_foto_url: string | null
  tipo_encargo_id: string; datos: Record<string, unknown>; cliente_datos: Record<string, unknown>
  etapa_actual_nombre: string | null; carpeta: 'EN_CURSO' | 'ENTREGADOS'
  siguiente_clave: string | null; siguiente_nombre: string | null
  /** Lo que impide marcar el siguiente paso (condiciones obligatorias pendientes) */
  bloqueo?: string | null
  hitos: { nombre: string; fecha: string }[]; actualizado_en: string
}

/** Encargos del portal. proveedorId solo para «ver como» (administración). */
export async function portalEncargos(tiendaId: string, proveedorId?: string | null) {
  const { data, error } = await supabase.rpc('portal_encargos', { p_tienda: tiendaId, p_proveedor: proveedorId ?? null })
  if (error) throw error
  return (data ?? []) as EncargoPortal[]
}

import * as React from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Tiempo real: cuando alguien del equipo cambia algo (un paso, un encargo, un comentario),
 * se vuelve a leer la pantalla. Con la pestaña oculta no se lee; al volver, sí.
 * Devuelve cuándo se leyó por última vez (para «actualizado hace…»).
 */
export function useTiempoReal(tiendaId: string | undefined, recargar: () => Promise<unknown> | void, filtro?: (fila: Record<string, unknown>) => boolean) {
  const filtroRef = React.useRef(filtro)
  filtroRef.current = filtro
  const ref = React.useRef(recargar)
  ref.current = recargar
  const [ultima, setUltima] = React.useState<Date>(new Date())
  const pendiente = React.useRef(false)

  React.useEffect(() => {
    if (!tiendaId) return
    let t: ReturnType<typeof setTimeout> | null = null
    const leer = (p?: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const fila = { ...(p?.old ?? {}), ...(p?.new ?? {}) }
      if (p && filtroRef.current && !filtroRef.current(fila)) return
      if (document.hidden) { pendiente.current = true; return }
      if (t) clearTimeout(t)
      // Agrupa ráfagas de cambios en una sola lectura
      t = setTimeout(async () => { await ref.current(); setUltima(new Date()) }, 400)
    }
    const canal = supabase.channel(`tienda-${tiendaId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encargo', filter: `tienda_id=eq.${tiendaId}` }, leer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hito' }, leer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comentario' }, leer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nota_campo', filter: `tienda_id=eq.${tiendaId}` }, leer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encargo_material', filter: `tienda_id=eq.${tiendaId}` }, leer)
      .subscribe()
    const vis = () => { if (!document.hidden && pendiente.current) { pendiente.current = false; leer() } }
    document.addEventListener('visibilitychange', vis)
    return () => { if (t) clearTimeout(t); document.removeEventListener('visibilitychange', vis); supabase.removeChannel(canal) }
  }, [tiendaId])

  const marcar = React.useCallback(() => setUltima(new Date()), [])
  return { ultima, marcar }
}

/** «hace 5 s», «hace 3 min» */
export function haceCuanto(d: Date, ahora = new Date()) {
  const s = Math.max(0, Math.round((ahora.getTime() - d.getTime()) / 1000))
  if (s < 10) return 'ahora mismo'
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`
}

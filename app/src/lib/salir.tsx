import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '@/ui'

/**
 * Aviso al salir con cambios sin guardar. Cada pantalla con «Guardar» se apunta con
 * useCambiosSinGuardar(sucio); GuardaSalida (una vez, en el marco de la app) intercepta los
 * enlaces internos y el cierre de la pestaña mientras haya algo pendiente.
 */
const sucios = new Set<symbol>()
export function useCambiosSinGuardar(sucio: boolean) {
  const id = React.useRef(Symbol('cambios'))
  React.useEffect(() => {
    const k = id.current
    if (sucio) sucios.add(k); else sucios.delete(k)
    return () => { sucios.delete(k) }
  }, [sucio])
}

/** Para acciones que no son enlaces (cambiar de tienda, Salir): pregunta si hay cambios sin guardar */
let pedir: ((fn: () => void) => void) | null = null
export function confirmarSalida(fn: () => void) {
  if (sucios.size && pedir) pedir(fn); else fn()
}

export function GuardaSalida() {
  const nav = useNavigate()
  const [destino, setDestino] = React.useState<string | null>(null)
  const [accion, setAccion] = React.useState<(() => void) | null>(null)
  React.useEffect(() => { pedir = (fn) => setAccion(() => fn); return () => { pedir = null } }, [])
  React.useEffect(() => {
    const antesDeCerrar = (e: BeforeUnloadEvent) => { if (sucios.size) { e.preventDefault(); e.returnValue = '' } }
    const clic = (e: MouseEvent) => {
      if (!sucios.size || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return
      const ruta = a.pathname + a.search + a.hash
      if (ruta === window.location.pathname + window.location.search + window.location.hash) return
      e.preventDefault(); e.stopPropagation()
      setDestino(ruta)
    }
    window.addEventListener('beforeunload', antesDeCerrar)
    document.addEventListener('click', clic, true)
    return () => { window.removeEventListener('beforeunload', antesDeCerrar); document.removeEventListener('click', clic, true) }
  }, [])
  return (
    <Dialog open={!!destino || !!accion} onOpenChange={(o) => { if (!o) { setDestino(null); setAccion(null) } }} title="Hay cambios sin guardar"
      description="Si sales ahora, se pierden. Vuelve y pulsa «Guardar» para conservarlos."
      actions={[{ label: 'Salir sin guardar', variant: 'danger', onClick: () => {
        const d = destino, a = accion; sucios.clear(); setDestino(null); setAccion(null)
        if (d) nav(d); if (a) a()
      } }]} />
  )
}

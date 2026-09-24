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

export function GuardaSalida() {
  const nav = useNavigate()
  const [destino, setDestino] = React.useState<string | null>(null)
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
    <Dialog open={!!destino} onOpenChange={(o) => !o && setDestino(null)} title="Hay cambios sin guardar"
      description="Si sales ahora, se pierden. Vuelve y pulsa «Guardar» para conservarlos."
      actions={[{ label: 'Salir sin guardar', variant: 'danger', onClick: () => { const d = destino; sucios.clear(); setDestino(null); if (d) nav(d) } }]} />
  )
}

import { IconRefresh } from '@tabler/icons-react'
import { Button } from './Button'

/** Error al cargar una lista o pantalla, con «Reintentar». */
export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-md bg-danger-bg px-3 py-2.5 text-danger-fg">
      <span className="min-w-0 flex-1">{mensaje}</span>
      <Button size="sm" onClick={onReintentar}><IconRefresh size={14} />Reintentar</Button>
    </div>
  )
}

/** Cargando…: una línea discreta mientras llegan los datos. */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div role="status" className="px-4 py-6 text-fg-3">{texto}</div>
}

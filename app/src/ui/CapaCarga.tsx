import { createPortal } from 'react-dom'

/** Capa de carga para operaciones largas: tapa la pantalla y dice qué está pasando. */
export function CapaCarga({ texto }: { texto: string | null | false | undefined }) {
  if (!texto) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25" role="alert" aria-busy="true">
      <div className="flex items-center gap-3 rounded-md bg-bg px-5 py-4 shadow-strong">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-fg" />
        <span className="font-medium">{texto}</span>
      </div>
    </div>,
    document.body,
  )
}

import * as React from 'react'
import * as RDialog from '@radix-ui/react-dialog'
import { Button, type ButtonProps } from './Button'
import { cn } from '@/lib/utils'
import { useCerrarConAtras } from '@/lib/movil'

export interface DialogAction {
  label: string
  variant?: ButtonProps['variant']
  onClick: () => void | Promise<void>
  disabled?: boolean
}

/**
 * Diálogo propio (sustituye a confirm/prompt del navegador).
 * Cerrar con Esc o fuera = cancelar. La acción principal va a la derecha.
 */
export function Dialog({ open, onOpenChange, title, description, children, actions, error, className, sinCancelar }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  actions: DialogAction[]
  error?: string | null
  className?: string
  /** Sin botón «Cancelar» (p. ej. cuando ya está hecho y solo queda «Cerrar») */
  sinCancelar?: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  const [enCurso, setEnCurso] = React.useState<string | null>(null)
  useCerrarConAtras(open, () => { if (!busy) onOpenChange(false) })
  async function run(a: DialogAction) {
    setBusy(true); setEnCurso(a.label)
    try { await a.onClick() } finally { setBusy(false); setEnCurso(null) }
  }
  /** Ctrl/Cmd+Enter = la acción principal (la última) */
  function teclas(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const a = actions[actions.length - 1]
      if (a && !a.disabled && !busy) { e.preventDefault(); run(a) }
    }
  }
  return (
    <RDialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <RDialog.Content onKeyDown={teclas}
          className={cn(
            'fixed left-1/2 top-[18vh] z-50 flex w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-3 rounded-md border border-border bg-bg p-5 shadow-strong focus:outline-none',
            // Móvil: pantalla completa, con las zonas seguras de iOS
            'max-md:inset-0 max-md:top-0 max-md:left-0 max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:overflow-y-auto max-md:rounded-none max-md:border-0 max-md:pt-[calc(20px+env(safe-area-inset-top))] max-md:pb-[calc(20px+env(safe-area-inset-bottom))]',
            className,
          )}
        >
          <RDialog.Title className="text-md font-semibold">{title}</RDialog.Title>
          {description
            ? <RDialog.Description className="text-fg-2">{description}</RDialog.Description>
            : <RDialog.Description className="sr-only">{title}</RDialog.Description>}
          {children}
          {error && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{error}</div>}
          <div className="mt-1 flex justify-end gap-1.5">
            {!sinCancelar && <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>}
            {actions.map((a) => (
              <Button key={a.label} variant={a.variant ?? 'primary'} disabled={busy || a.disabled} cargando={enCurso === a.label} onClick={() => run(a)}>
                {a.label}
              </Button>
            ))}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

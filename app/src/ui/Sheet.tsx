import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { useCerrarConAtras } from '@/lib/movil'

/** Hoja inferior (móvil) / panel lateral (escritorio). */
export function Sheet({ open, onOpenChange, side = 'bottom', title, children, className }: {
  open: boolean; onOpenChange: (o: boolean) => void; side?: 'bottom' | 'right'; title: string
  children: React.ReactNode; className?: string
}) {
  useCerrarConAtras(open, () => onOpenChange(false))
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter guarda: pulsa el botón principal del panel
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              const b = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-variant="primary"]:not(:disabled)')].pop()
              if (b) { e.preventDefault(); b.click() }
            }
          }}
          className={cn(
            'fixed z-50 overflow-y-auto bg-bg shadow-strong focus:outline-none',
            side === 'bottom'
              ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg p-5 pb-[calc(20px+env(safe-area-inset-bottom))]'
              : 'inset-y-0 right-0 w-[420px] max-w-full border-l border-border p-5 max-md:w-full max-md:border-0 max-md:pt-[calc(20px+env(safe-area-inset-top))] max-md:pb-[calc(20px+env(safe-area-inset-bottom))]',
            className,
          )}
        >
          {side === 'bottom' && <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong" />}
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

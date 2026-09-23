import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Menú flotante anclado a su botón. Se cierra al pulsar fuera o con Esc.
 * Sin dependencias: posición absoluta bajo el disparador.
 */
export function Popover({ trigger, children, open, onOpenChange, align = 'start', className }: {
  trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode
  children: React.ReactNode
  open: boolean
  onOpenChange: (o: boolean) => void
  align?: 'start' | 'end'
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [open, onOpenChange])
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open && (
        <div className={cn('absolute top-full z-30 mt-1 max-w-[calc(100vw-24px)] rounded-md border border-border bg-bg p-1 shadow-light',
          align === 'end' ? 'right-0' : 'left-0', className)}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Opción de menú con casilla. */
export function OpcionCheck({ checked, onChange, children, extra }: { checked: boolean; onChange: () => void; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <label className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 hover:bg-bg-4">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[var(--color-gray-12)]" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {extra != null && <span className="text-xs text-fg-3 tabular">{extra}</span>}
    </label>
  )
}

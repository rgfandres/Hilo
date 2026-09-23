import * as React from 'react'
import { cn } from '@/lib/utils'

/** Fila etiqueta/valor de la página de registro (estilo Twenty). */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-7 items-center gap-2 py-0.5', className)}>
      <span className="w-[120px] shrink-0 text-sm leading-tight text-fg-3">{label}</span>
      <span className="min-w-0 break-words text-fg">{children}</span>
    </div>
  )
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-xs font-medium uppercase tracking-wide text-fg-3', className)}>{children}</div>
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn('h-8 w-full rounded-sm border border-border bg-bg px-2.5 text-base max-md:h-10 placeholder:text-fg-3 focus:border-border-strong', className)}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn('min-h-[72px] w-full resize-y rounded-sm border border-border bg-bg px-2.5 py-1.5 text-base placeholder:text-fg-3 focus:border-border-strong', className)}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn('h-7 w-full rounded-sm border border-border bg-bg px-2 text-base focus:border-border-strong max-md:h-10', className)}
      {...props}
    />
  ),
)
Select.displayName = 'Select'

/** Fila etiqueta/control para formularios (misma rejilla que Field). */
export function FormRow({ label, children, className, ayuda }: { label: string; children: React.ReactNode; className?: string; ayuda?: string }) {
  return (
    <label className={cn('flex min-h-8 items-center gap-2 max-md:flex-col max-md:items-stretch max-md:gap-1', ayuda && 'items-start', className)}>
      <span className={cn('w-[120px] shrink-0 text-sm leading-tight text-fg-3 max-md:w-auto', ayuda && 'pt-2 max-md:pt-0')}>{label}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {children}
        {ayuda && <span className="text-xs text-fg-3">{ayuda}</span>}
      </span>
    </label>
  )
}

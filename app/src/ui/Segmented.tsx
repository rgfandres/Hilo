import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegItem { key: string; label: string; count?: number }

/** Segmentos del móvil: fondo gris, activo negro. */
export function Segmented({ items, value, onChange, className }: {
  items: SegItem[]; value: string; onChange: (k: string) => void; className?: string
}) {
  return (
    <div className={cn('flex gap-1.5 overflow-x-auto', className)}>
      {items.map((s) => {
        const on = s.key === value
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-md font-medium transition-colors',
              on ? 'bg-inverted text-inverted-fg' : 'bg-bg-4 text-fg-2',
            )}
          >
            {s.label}
            {s.count != null && <span className={cn('text-sm tabular', on ? 'opacity-70' : 'text-fg-3')}>{s.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

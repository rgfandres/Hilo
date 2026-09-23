import * as React from 'react'
import { IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/** "Feria es Sevilla ×" */
export function FilterChip({ field, op = 'es', value, onRemove, className }: {
  field: string; op?: string; value: string; onRemove?: () => void; className?: string
}) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-sm border border-border bg-bg px-2 text-sm', className)}>
      <span className="text-fg-2">{field}</span>
      <span className="text-fg-2">{op}</span>
      <span className="font-medium">{value}</span>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Quitar filtro ${field}`} className="ml-0.5 text-fg-3 hover:text-fg">
          <IconX size={12} stroke={2.5} />
        </button>
      )}
    </span>
  )
}

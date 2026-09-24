import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  key: string; label: string; count?: number; tone?: 'default' | 'danger'
  /** Punto de aviso: hay trabajo pendiente aquí (no se muestra en la pestaña activa) */
  aviso?: boolean
  /** Explicación del criterio al pasar el ratón */
  title?: string
  /** Grupo de fase: se pinta un separador con el nombre al empezar un grupo nuevo */
  grupo?: string | null
}

/** Pestañas de bandeja: subrayado fino, contador gris. */
export function Tabs({ items, value, onChange, className }: {
  items: TabItem[]; value: string; onChange: (k: string) => void; className?: string
}) {
  let grupoAnterior: string | null | undefined
  return (
    <div role="tablist" className={cn('flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border px-3', className)}>
      {items.map((t, i) => {
        const on = t.key === value
        const cambioGrupo = i > 0 && (t.grupo ?? null) !== (grupoAnterior ?? null)
        grupoAnterior = t.grupo
        return (
          <React.Fragment key={t.key}>
            {cambioGrupo && <span className="mx-1 mb-2 h-4 w-px shrink-0 bg-border" aria-hidden />}
            {cambioGrupo && t.grupo && <span className="mb-2.5 shrink-0 text-xxs font-medium uppercase tracking-wide text-fg-3">{t.grupo}</span>}
            <button
              role="tab"
              aria-selected={on}
              title={t.title}
              onClick={() => onChange(t.key)}
              className={cn(
                'relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-base font-medium text-fg-2 transition-colors',
                on ? 'text-fg shadow-[inset_0_-2px_0_var(--color-gray-12)]' : 'hover:text-fg rounded-sm hover:bg-bg-3',
                t.tone === 'danger' && !on && (t.count ?? 1) > 0 && 'text-danger-fg',
              )}
            >
              {t.label}
              {t.count != null && (
                <span className={cn('text-xs tabular', t.aviso && !on ? cn('font-semibold', t.tone === 'danger' ? 'text-danger-fg' : 'text-[var(--accent)]') : 'text-fg-3')}>{t.count}</span>
              )}
              {t.aviso && !on && (
                <span className="relative flex h-1.5 w-1.5" aria-label="Pendiente">
                  <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', t.tone === 'danger' ? 'bg-danger' : 'bg-[var(--accent)]')} />
                  <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', t.tone === 'danger' ? 'bg-danger' : 'bg-[var(--accent)]')} />
                </span>
              )}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

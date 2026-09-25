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

/** Botón de una bandeja (con su número y el punto de aviso) */
function Pestana({ t, on, onClick, pill }: { t: TabItem; on: boolean; onClick: () => void; pill?: boolean }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      title={t.title}
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-base font-medium transition-colors',
        pill
          ? cn('h-7 rounded-sm', on ? 'bg-gray-12 text-bg' : 'text-fg-2 hover:bg-bg-4 hover:text-fg')
          : cn('h-8 text-fg-2', on ? 'text-fg shadow-[inset_0_-2px_0_var(--color-gray-12)]' : 'hover:text-fg rounded-sm hover:bg-bg-3'),
        t.tone === 'danger' && !on && (t.count ?? 1) > 0 && 'text-danger-fg',
      )}
    >
      {t.label}
      {t.count != null && (
        <span className={cn('text-xs tabular', on && pill ? 'text-bg/70' : t.aviso && !on ? cn('font-semibold', t.tone === 'danger' ? 'text-danger-fg' : 'text-[var(--accent)]') : 'text-fg-3')}>{t.count}</span>
      )}
      {t.aviso && !on && (
        <span className="relative flex h-1.5 w-1.5" aria-label="Pendiente">
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', t.tone === 'danger' ? 'bg-danger' : 'bg-[var(--accent)]')} />
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', t.tone === 'danger' ? 'bg-danger' : 'bg-[var(--accent)]')} />
        </span>
      )}
    </button>
  )
}

/**
 * Pestañas de bandeja. Sin grupos: una fila con subrayado fino. Con grupos (fases del flujo):
 * cada fase es una caja con su nombre y las cajas van unidas por flechas, para que se lea el recorrido
 * de izquierda a derecha; ocupan varias líneas si hace falta (sin barra lateral). En el móvil, un desplegable.
 */
export function Tabs({ items, value, onChange, className }: {
  items: TabItem[]; value: string; onChange: (k: string) => void; className?: string
}) {
  const conGrupos = items.some((t) => t.grupo)
  if (!conGrupos) return <TabsLinea items={items} value={value} onChange={onChange} className={className} />
  // Tramos seguidos con el mismo grupo
  const tramos: { grupo: string | null; items: TabItem[] }[] = []
  for (const t of items) {
    const g = t.grupo ?? null
    const ult = tramos[tramos.length - 1]
    if (ult && ult.grupo === g) ult.items.push(t); else tramos.push({ grupo: g, items: [t] })
  }
  const actual = items.find((t) => t.key === value)
  return (
    <>
      <div role="tablist" className={cn('flex shrink-0 flex-wrap items-stretch gap-x-1.5 gap-y-2 border-b border-border px-3 py-2 max-md:hidden', className)}>
        {tramos.map((tr, i) => {
          const flecha = i > 0 && tr.grupo && tramos[i - 1].grupo
          return (
            <React.Fragment key={i}>
              {flecha && <span className="self-center text-fg-3" aria-hidden>→</span>}
              {tr.grupo
                ? (
                  <div className="flex flex-col gap-0.5 rounded-md border border-border px-1 pb-1 pt-0.5">
                    <span className="px-1 text-xxs font-medium uppercase tracking-wide text-fg-3">{tr.grupo}</span>
                    <div className="flex flex-wrap gap-0.5">{tr.items.map((t) => <Pestana key={t.key} t={t} on={t.key === value} onClick={() => onChange(t.key)} pill />)}</div>
                  </div>
                )
                : (
                  <div className="flex flex-col gap-0.5 rounded-md border border-transparent px-1 pb-1 pt-0.5">
                    <span className="px-1 text-xxs" aria-hidden>&nbsp;</span>
                    <div className="flex flex-wrap gap-0.5">{tr.items.map((t) => <Pestana key={t.key} t={t} on={t.key === value} onClick={() => onChange(t.key)} pill />)}</div>
                  </div>
                )}
            </React.Fragment>
          )
        })}
      </div>
      <div className={cn('shrink-0 border-b border-border px-3 py-2 md:hidden', className)}>
        <select aria-label="Bandeja" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-sm border border-border bg-bg px-2 text-base font-medium">
          {tramos.map((tr, i) => tr.grupo
            ? <optgroup key={i} label={tr.grupo}>{tr.items.map((t) => <option key={t.key} value={t.key}>{t.label}{t.count != null ? ` (${t.count})` : ''}</option>)}</optgroup>
            : tr.items.map((t) => <option key={t.key} value={t.key}>{t.label}{t.count != null ? ` (${t.count})` : ''}</option>))}
        </select>
        {actual?.title && <p className="m-0 mt-1 text-sm text-fg-3">{actual.title}</p>}
      </div>
    </>
  )
}

/** Pestañas en fila (sin grupos). Si no caben, bajan a otra línea: nada de barra de desplazamiento encima del texto */
function TabsLinea({ items, value, onChange, className }: {
  items: TabItem[]; value: string; onChange: (k: string) => void; className?: string
}) {
  return (
    <div role="tablist" className={cn('flex min-h-9 shrink-0 flex-wrap items-end gap-x-0.5 border-b border-border px-3', className)}>
      {items.map((t) => <Pestana key={t.key} t={t} on={t.key === value} onClick={() => onChange(t.key)} />)}
    </div>
  )
}

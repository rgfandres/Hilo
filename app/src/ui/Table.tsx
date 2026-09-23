import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tabla densa. En móvil (≤ 767 px) cada fila se pinta como tarjeta: cada celda lleva
 * como etiqueta el título de su columna (se copia solo desde la cabecera).
 */
export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  const ref = React.useRef<HTMLTableElement>(null)
  React.useLayoutEffect(() => {
    const t = ref.current
    if (!t) return
    const titulos = [...t.querySelectorAll('thead th')].map((th) => (th.textContent ?? '').trim())
    for (const tr of t.querySelectorAll('tbody tr')) {
      const tds = [...tr.children] as HTMLElement[]
      if (tds.length !== titulos.length) continue
      tds.forEach((td, i) => {
        if (td.dataset.label !== titulos[i]) td.dataset.label = titulos[i]
        // En tarjeta no se enseñan los campos vacíos
        const vacia = (td.textContent ?? '').trim() === '—'
        if (vacia) td.dataset.vacia = ''; else delete td.dataset.vacia
      })
    }
  })
  return <table ref={ref} className={cn('tabla-tarjetas w-full border-collapse text-base', className)} {...p} />
}
export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-8 whitespace-nowrap border-b border-r border-border-light border-b-border px-2 text-left text-sm font-medium text-fg-2 last:border-r-0', className)}
      {...p}
    />
  )
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('h-8 whitespace-nowrap border-b border-r border-border-light px-2 last:border-r-0', className)} {...p} />
  )
}
export function Tr({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-bg-2', className)} {...p} />
}
/** Cabecera de grupo ("BRENES · 5") */
export function GroupRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-8 border-b border-border-light bg-bg-2 px-2 text-sm font-medium text-fg-2">
        {children}
      </td>
    </tr>
  )
}

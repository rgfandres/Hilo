import * as React from 'react'
import { IconChevronLeft, IconFilter } from '@tabler/icons-react'
import type { EncargoEstado } from '@/lib/types'
import type { Campo } from '@/data/config'
import { etiquetaValor, ordenar, type Dimension, type Filtros } from '@/data/lista'
import { normalizar } from '@/lib/texto'
import { Button, Input, OpcionCheck, Popover } from '@/ui'

/**
 * Botón «Filtro»: primero se elige el campo, luego sus valores (con buscador y recuento).
 * Los valores salen de todo el conjunto de la bandeja; el vacío va al final.
 */
export function FiltroMenu({ dims, campos, base, filtros, onChange, abrirEn, onAbierto }: {
  dims: Dimension[]; campos: Campo[]; base: EncargoEstado[]
  filtros: Filtros; onChange: (f: Filtros) => void
  /** Abrir directamente en una dimensión (al pulsar un chip) */
  abrirEn: string | null; onAbierto: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [dim, setDim] = React.useState<Dimension | null>(null)
  const [q, setQ] = React.useState('')

  React.useEffect(() => {
    if (!abrirEn) return
    setDim(dims.find((d) => d.clave === abrirEn) ?? null); setQ(''); setOpen(true); onAbierto()
  }, [abrirEn, dims, onAbierto])

  const cambiar = (o: boolean) => { setOpen(o); if (!o) { setDim(null); setQ('') } }
  const nActivos = Object.values(filtros).filter((v) => v.length).length

  const valores = React.useMemo(() => {
    if (!dim) return []
    const n = new Map<string, number>()
    for (const e of base) { const v = dim.valor(e); n.set(v, (n.get(v) ?? 0) + 1) }
    for (const v of filtros[dim.clave] ?? []) if (!n.has(v)) n.set(v, 0)
    return ordenar(dim, [...n.keys()]).map((v) => ({ v, n: n.get(v) ?? 0, label: etiquetaValor(dim, v, campos) }))
      .filter((x) => !q || normalizar(x.label).includes(normalizar(q)))
  }, [dim, base, filtros, q, campos])

  function toggle(v: string) {
    if (!dim) return
    const act = filtros[dim.clave] ?? []
    const sig = act.includes(v) ? act.filter((x) => x !== v) : [...act, v]
    onChange({ ...filtros, [dim.clave]: sig })
  }

  return (
    <Popover open={open} onOpenChange={cambiar} align="end" className="w-[260px]"
      trigger={({ toggle: t }) => (
        <Button variant="ghost" onClick={t}><IconFilter size={14} /><span className="hidden xl:inline">Filtro</span>{nActivos > 0 && <span className="text-fg-3">· {nActivos}</span>}</Button>
      )}>
      {!dim ? (
        <div className="flex flex-col">
          <div className="px-2 py-1 text-xs text-fg-3">Filtrar por</div>
          {dims.map((d) => (
            <button key={d.clave} onClick={() => setDim(d)} className="flex h-7 items-center justify-between rounded-sm px-2 text-left hover:bg-bg-4">
              <span className="truncate">{d.etiqueta}</span>
              {(filtros[d.clave]?.length ?? 0) > 0 && <span className="text-xs text-fg-3">{filtros[d.clave].length}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <button onClick={() => { setDim(null); setQ('') }} className="flex h-7 w-7 items-center justify-center rounded-sm text-fg-3 hover:bg-bg-4" aria-label="Volver"><IconChevronLeft size={14} /></button>
            <span className="flex-1 truncate font-medium">{dim.etiqueta}</span>
            {(filtros[dim.clave]?.length ?? 0) > 0 && (
              <button onClick={() => onChange({ ...filtros, [dim.clave]: [] })} className="px-1 text-sm text-fg-3 hover:text-fg">Limpiar</button>
            )}
          </div>
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar valor" className="h-7" />
          <div className="max-h-[280px] overflow-y-auto">
            {valores.map((x) => (
              <OpcionCheck key={x.v} checked={(filtros[dim.clave] ?? []).includes(x.v)} onChange={() => toggle(x.v)} extra={x.n}>
                <span className={x.v === '' ? 'text-warn-fg' : undefined}>{x.label}</span>
              </OpcionCheck>
            ))}
            {valores.length === 0 && <div className="px-2 py-2 text-sm text-fg-3">Sin valores</div>}
          </div>
        </div>
      )}
    </Popover>
  )
}

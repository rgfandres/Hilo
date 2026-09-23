import * as React from 'react'
import { IconCheck, IconChevronDown, IconPlus } from '@tabler/icons-react'
import { normalizar } from '@/lib/texto'
import { cn } from '@/lib/utils'

export interface OpcionCombo { id: string; nombre: string; nota?: string }

/**
 * Desplegable con buscador («contiene», sin tildes) y, si se permite, alta al vuelo:
 * «+ Crear "X"». Teclado: flechas, Enter, Esc. Idempotente: si ya existe con otras
 * mayúsculas o tildes, se usa la existente en lugar de crear otra.
 */
export function Combobox({ opciones, value, onChange, crear, vacio = '—', placeholder = 'Buscar…', etiquetaCrear = 'Crear', className, ariaLabel }: {
  opciones: OpcionCombo[]; value: string; onChange: (id: string) => void
  /** Crea el elemento y devuelve su id; si no se pasa, no se ofrece crear */
  crear?: (nombre: string) => Promise<string>
  vacio?: string; placeholder?: string; etiquetaCrear?: string; className?: string; ariaLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [sel, setSel] = React.useState(0)
  const [creando, setCreando] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const caja = React.useRef<HTMLDivElement>(null)
  const actual = opciones.find((o) => o.id === value)

  React.useEffect(() => {
    if (!open) return
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [open])

  const filtradas = React.useMemo(() => {
    const n = normalizar(q)
    return opciones.filter((o) => !n || normalizar(o.nombre).includes(n))
  }, [opciones, q])
  const exacta = opciones.find((o) => normalizar(o.nombre) === normalizar(q))
  const puedeCrear = !!crear && q.trim().length > 0 && !exacta
  // Filas: [vacío] + opciones + [crear]
  const filas: ({ t: 'vacio' } | { t: 'op'; o: OpcionCombo } | { t: 'crear' })[] = [
    ...(q ? [] : [{ t: 'vacio' as const }]), ...filtradas.map((o) => ({ t: 'op' as const, o })), ...(puedeCrear ? [{ t: 'crear' as const }] : []),
  ]
  React.useEffect(() => { setSel(0) }, [q, open])

  async function elegir(i: number) {
    const f = filas[i]
    if (!f) return
    if (f.t === 'vacio') { onChange(''); setOpen(false); return }
    if (f.t === 'op') { onChange(f.o.id); setOpen(false); setQ(''); return }
    if (!crear) return
    const nombre = q.trim()
    setCreando(nombre); setErr(null)
    try { const id = await crear(nombre); onChange(id); setOpen(false); setQ('') }
    catch (x) { setErr(x instanceof Error ? x.message : (x as { message?: string })?.message ?? 'No se pudo crear') }
    finally { setCreando(null) }
  }
  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setSel((s) => Math.min(s + 1, filas.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); elegir(sel) }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false) } }
  }

  return (
    <div ref={caja} className={cn('relative w-full', className)}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)} onKeyDown={teclas}
        className="flex h-7 w-full items-center gap-1 rounded-sm border border-border bg-bg px-2 text-left text-base focus:border-border-strong max-md:h-10">
        <span className={cn('min-w-0 flex-1 truncate', !actual && 'text-fg-3')}>{actual?.nombre ?? vacio}</span>
        <IconChevronDown size={14} className="shrink-0 text-fg-3" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-border bg-bg p-1 shadow-light">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas} placeholder={placeholder}
            className="mb-1 h-7 w-full rounded-sm border border-border bg-bg px-2 text-base outline-none focus:border-border-strong" />
          <ul role="listbox" className="max-h-[240px] overflow-y-auto">
            {filas.map((f, i) => (
              <li key={f.t === 'op' ? f.o.id : f.t} role="option" aria-selected={i === sel}
                onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); elegir(i) }}
                className={cn('flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2', i === sel && 'bg-bg-4')}>
                {f.t === 'vacio' && <span className="text-fg-3">{vacio}</span>}
                {f.t === 'op' && <>
                  <span className="min-w-0 flex-1 truncate">{f.o.nombre}</span>
                  {f.o.nota && <span className="text-xs text-fg-3">{f.o.nota}</span>}
                  {f.o.id === value && <IconCheck size={14} className="text-fg-2" />}
                </>}
                {f.t === 'crear' && <span className="flex items-center gap-1 text-fg-2"><IconPlus size={14} />{creando ? `Creando «${creando}»…` : `${etiquetaCrear} «${q.trim()}»`}</span>}
              </li>
            ))}
            {filas.length === 0 && <li className="px-2 py-1.5 text-sm text-fg-3">Sin resultados</li>}
          </ul>
          {err && <div className="mt-1 rounded-sm bg-danger-bg px-2 py-1 text-sm text-danger-fg">{err}</div>}
        </div>
      )}
    </div>
  )
}

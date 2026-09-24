import * as React from 'react'
import * as RDialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { IconSearch } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { buscarClientes, listarEncargos, listarProductos, listarProveedores } from '@/data/encargos'
import type { EncargoEstado } from '@/lib/types'
import { coincide } from '@/lib/texto'
import { cn, num3 } from '@/lib/utils'
import { useCerrarConAtras } from '@/lib/movil'

interface Resultado { grupo: string; id: string; titulo: string; detalle?: string; ir: string }

/**
 * Buscador de toda la tienda (⌘K / Ctrl+K): encargos de cualquier periodo, clientes,
 * productos y proveedores. Flechas para moverse, Enter para abrir, Esc para cerrar.
 */
export function BuscadorGlobal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tienda, vocab, gr } = useAuth()
  const nav = useNavigate()
  const [q, setQ] = React.useState('')
  const [sel, setSel] = React.useState(0)
  const [base, setBase] = React.useState<{ enc: EncargoEstado[]; prod: { id: string; nombre: string; activo: boolean }[]; prov: { id: string; nombre: string; activo: boolean }[] } | null>(null)
  const [clientes, setClientes] = React.useState<Resultado[]>([])
  useCerrarConAtras(open, () => onOpenChange(false))

  React.useEffect(() => {
    if (!open || !tienda) return
    setQ(''); setSel(0)
    Promise.all([listarEncargos(tienda.id), listarEncargos(tienda.id, { estado: 'ANULADO' }), listarProductos(tienda.id), listarProveedores(tienda.id)])
      .then(([enc, anul, prod, prov]) => setBase({ enc: [...enc, ...anul], prod, prov })).catch(() => setBase({ enc: [], prod: [], prov: [] }))
  }, [open, tienda])

  // Clientes: en el servidor (pueden ser muchos), con una pequeña espera al teclear
  React.useEffect(() => {
    if (!open || !tienda || q.trim().length < 2) { setClientes([]); return }
    const t = setTimeout(() => {
      buscarClientes(tienda.id, q.trim()).then((cs) => setClientes(cs.map((c) => ({
        grupo: vocab.clientes, id: 'c' + c.id, titulo: c.nombre, detalle: c.telefono ?? c.email ?? undefined, ir: `/clientes/${c.id}`,
      })))).catch(() => setClientes([]))
    }, 180)
    return () => clearTimeout(t)
  }, [q, open, tienda, vocab.clientes])

  const resultados = React.useMemo((): Resultado[] => {
    if (!base || !q.trim()) return []
    const enc = base.enc.filter((e) => coincide(q, [num3(e), e.numero, e.cliente_nombre, e.cliente_telefono, e.producto_nombre, e.proveedor_nombre]))
      .slice(0, 6).map((e) => ({
        grupo: vocab.encargos, id: 'e' + e.id, titulo: `${num3(e)} · ${e.cliente_nombre ?? ''}`,
        detalle: [e.producto_nombre, e.estado === 'ANULADO' ? `anulad${gr.o('encargo')}` : e.etapa_actual_nombre].filter(Boolean).join(' · '), ir: `/encargos/${e.id}`,
      }))
    const prod = base.prod.filter((p) => coincide(q, [p.nombre])).slice(0, 4)
      .map((p) => ({ grupo: vocab.productos, id: 'p' + p.id, titulo: p.nombre, detalle: p.activo ? undefined : `inactiv${gr.o('producto')}`, ir: `/productos?q=${encodeURIComponent(p.nombre)}` }))
    const prov = base.prov.filter((p) => coincide(q, [p.nombre])).slice(0, 4)
      .map((p) => ({ grupo: vocab.proveedores, id: 'v' + p.id, titulo: p.nombre, detalle: p.activo ? undefined : `inactiv${gr.o('proveedor')}`, ir: `/proveedores/${p.id}` }))
    return [...enc, ...clientes.slice(0, 6), ...prod, ...prov]
  }, [base, q, clientes, vocab, gr])

  React.useEffect(() => { setSel(0) }, [q])

  function abrir(r: Resultado) { onOpenChange(false); nav(r.ir) }
  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && resultados[sel]) { e.preventDefault(); abrir(resultados[sel]) }
  }

  let grupoAnterior = ''
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <RDialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[560px] max-w-[calc(100vw-24px)] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-bg shadow-strong focus:outline-none max-md:inset-0 max-md:top-0 max-md:left-0 max-md:max-h-full max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)]">
          <RDialog.Title className="sr-only">Buscar</RDialog.Title>
          <div className="flex h-11 items-center gap-2 border-b border-border px-3">
            <IconSearch size={16} className="text-fg-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas}
              placeholder={`Buscar ${vocab.encargos.toLowerCase()}, ${vocab.clientes.toLowerCase()}, ${vocab.productos.toLowerCase()}…`}
              className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-fg-3" />
            <kbd className="rounded-sm border border-border px-1 text-xs text-fg-3 max-md:hidden">Esc</kbd>
            <button onClick={() => onOpenChange(false)} className="px-1 text-fg-2 md:hidden">Cerrar</button>
          </div>
          <div className="overflow-y-auto p-1">
            {!q.trim() && <div className="px-3 py-6 text-center text-fg-3">Escribe un nombre, un Nº o un teléfono.</div>}
            {q.trim() && base && resultados.length === 0 && <div className="px-3 py-6 text-center text-fg-3">Sin resultados para «{q}».</div>}
            {resultados.map((r, i) => {
              const cab = r.grupo !== grupoAnterior ? r.grupo : null
              grupoAnterior = r.grupo
              return (
                <React.Fragment key={r.id}>
                  {cab && <div className="px-2 pb-1 pt-2 text-xs text-fg-3">{cab}</div>}
                  <button onMouseEnter={() => setSel(i)} onClick={() => abrir(r)}
                    className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left', i === sel && 'bg-bg-4')}>
                    <span className="truncate font-medium">{r.titulo}</span>
                    {r.detalle && <span className="truncate text-fg-3">{r.detalle}</span>}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

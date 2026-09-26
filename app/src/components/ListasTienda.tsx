import * as React from 'react'
import { IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { borrarLista, guardarLista, listarListas, type ListaTienda, type ValorLista } from '@/data/listas'
import { mensajeError } from '@/data/encargos'
import { Button, Dialog, Input } from '@/ui'
import { cn } from '@/lib/utils'
import { min } from '@/lib/vocab'

/**
 * Listas que mantiene la propia tienda (colores, acabados, piezas…).
 * Alimentan los desplegables de los datos y las recetas de cada producto.
 * Un valor retirado deja de ofrecerse, pero lo ya guardado se conserva.
 */
export function ListasTienda({ soloLectura }: { soloLectura: boolean }) {
  const { tienda, vocab } = useAuth()
  const [ls, setLs] = React.useState<ListaTienda[] | null>(null)
  const [sel, setSel] = React.useState<string | 'nueva' | null>(null)
  const [nombre, setNombre] = React.useState('')
  const [vals, setVals] = React.useState<ValorLista[]>([])
  const [nuevo, setNuevo] = React.useState('')
  const [inicial, setInicial] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [borrar, setBorrar] = React.useState(false)

  const cargar = React.useCallback(async () => { if (tienda) setLs(await listarListas(tienda.id)) }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  function abrir(id: string | 'nueva') {
    const l = id === 'nueva' ? null : ls?.find((x) => x.id === id)
    const n = l?.nombre ?? '', v = l?.valores ?? []
    setSel(id); setNombre(n); setVals(v); setNuevo(''); setErr(null); setInicial(JSON.stringify([n, v]))
  }
  React.useEffect(() => { if (ls && sel === null && ls.length) abrir(ls[0].id) }, [ls]) // eslint-disable-line react-hooks/exhaustive-deps

  const sucio = JSON.stringify([nombre, vals]) !== inicial || !!nuevo.trim()
  function anadir() {
    const v = nuevo.trim(); if (!v) return
    if (vals.some((x) => x.v.toLowerCase() === v.toLowerCase())) { setErr(`«${v}» ya está en la lista`); return }
    setVals([...vals, { v, activo: true }]); setNuevo(''); setErr(null)
  }
  async function guardar() {
    if (!tienda || !sel) return
    const n = nombre.trim()
    if (!n) { setErr('Ponle un nombre a la lista'); return }
    if (ls?.some((x) => x.id !== sel && x.nombre.toLowerCase() === n.toLowerCase())) { setErr('Ya hay una lista con ese nombre'); return }
    const vs = nuevo.trim() && !vals.some((x) => x.v.toLowerCase() === nuevo.trim().toLowerCase()) ? [...vals, { v: nuevo.trim(), activo: true }] : vals
    setBusy(true); setErr(null)
    try {
      const id = await guardarLista(tienda.id, sel === 'nueva' ? null : sel, { nombre: n, valores: vs })
      const l = await listarListas(tienda.id); setLs(l)
      const g = l.find((x) => x.id === id); setSel(id); setNombre(g?.nombre ?? n); setVals(g?.valores ?? vs); setNuevo('')
      setInicial(JSON.stringify([g?.nombre ?? n, g?.valores ?? vs]))
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }
  async function quitar() {
    if (!tienda || !sel || sel === 'nueva') return
    setBorrar(false); setBusy(true)
    try { await borrarLista(tienda.id, sel); setSel(null); const l = await listarListas(tienda.id); setLs(l); if (l.length) abrir(l[0].id) }
    catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  if (ls === null) return <p className="p-4 text-fg-3">{err ?? 'Cargando…'}</p>
  const activa = sel && sel !== 'nueva' ? ls.find((x) => x.id === sel) : null
  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col">
      <div className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-border-light p-3 max-md:w-full max-md:border-b max-md:border-r-0">
        {ls.map((l) => (
          <button key={l.id} onClick={() => abrir(l.id)} className={cn('rounded-sm px-2 py-1.5 text-left hover:bg-bg-3', sel === l.id && 'bg-bg-3 font-medium')}>
            {l.nombre} <span className="text-fg-3">· {l.valores.filter((v) => v.activo).length}</span>
          </button>
        ))}
        {!soloLectura && <button onClick={() => abrir('nueva')} className={cn('rounded-sm px-2 py-1.5 text-left font-medium text-fg-2 hover:bg-bg-3', sel === 'nueva' && 'bg-bg-3')}>+ Nueva lista</button>}
        <p className="px-2 pt-2 text-xs text-fg-3">Listas propias para los desplegables y las recetas de {min(vocab.productos)}: p. ej. colores, acabados o piezas.</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {!sel ? <p className="text-fg-3">{soloLectura ? 'Todavía no hay listas.' : 'Crea la primera lista con «+ Nueva lista».'}</p> : <>
          <Input className="h-8 max-w-[360px] text-md font-medium" disabled={soloLectura} placeholder="Nombre de la lista (p. ej. Acabados)" value={nombre}
            onChange={(e) => setNombre(e.target.value)} autoFocus={sel === 'nueva'} aria-label="Nombre de la lista" />
          <div className="flex flex-col gap-1">
            {vals.length === 0 && <span className="text-sm text-fg-3">Sin valores todavía.</span>}
            {vals.map((x, i) => (
              <div key={x.v + i} className={cn('flex max-w-[480px] items-center gap-2 rounded-sm border border-border-light px-2 py-1', !x.activo && 'opacity-55')}>
                <Input className="h-7 flex-1 border-0 shadow-none" disabled={soloLectura} value={x.v} aria-label="Valor"
                  onChange={(e) => setVals(vals.map((y, j) => j === i ? { ...y, v: e.target.value } : y))} />
                {!soloLectura && <button className="shrink-0 text-sm text-fg-2 underline" onClick={() => setVals(vals.map((y, j) => j === i ? { ...y, activo: !y.activo } : y))}>
                  {x.activo ? 'Retirar' : 'Recuperar'}</button>}
                {!soloLectura && !activa?.valores.some((y) => y.v === x.v) && <button aria-label="Quitar" className="text-fg-3 hover:text-danger-fg" onClick={() => setVals(vals.filter((_, j) => j !== i))}><IconTrash size={14} /></button>}
              </div>
            ))}
            {!soloLectura && (
              <form className="flex max-w-[480px] gap-2" onSubmit={(e) => { e.preventDefault(); anadir() }}>
                <Input className="h-7" placeholder="Añadir valor y Enter" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
                <Button size="sm" type="submit" disabled={!nuevo.trim()}>Añadir</Button>
              </form>
            )}
            <p className="text-xs text-fg-3">«Retirar» deja de ofrecerlo, pero lo ya guardado lo conserva.</p>
          </div>
          {!soloLectura && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={guardar} disabled={busy || !sucio}>{busy ? 'Guardando…' : 'Guardar'}</Button>
              {sel !== 'nueva' && <Button variant="ghost" onClick={() => setBorrar(true)} disabled={busy}>Borrar lista</Button>}
              {err && <span role="alert" className="rounded-sm bg-danger-bg px-2 py-0.5 text-sm text-danger-fg">{err}</span>}
            </div>
          )}
        </>}
      </div>
      <Dialog open={borrar} onOpenChange={setBorrar} title={`Borrar la lista «${activa?.nombre ?? ''}»`}
        description="Los desplegables y recetas que la usen se quedan sin opciones; lo ya guardado en cada ficha no se pierde."
        actions={[{ label: 'Borrar', onClick: quitar }]} />
    </div>
  )
}

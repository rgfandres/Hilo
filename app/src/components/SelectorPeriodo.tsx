import * as React from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { activarPeriodo, crearPeriodo, listarPeriodos, type PeriodoFila } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { Button, Input } from '@/ui'
import { min } from '@/lib/vocab'

/**
 * Temporada (periodo) en el menú, bajo la tienda.
 * - Cualquiera puede mirar otra solo para sí (no cambia la de los demás).
 * - Administración puede activarla para toda la tienda y crear una nueva.
 */
export function SelectorPeriodo() {
  const { tienda, rol, vocab, gr, periodo, periodoActivo, verPeriodo, recargarPeriodo } = useAuth()
  const [abierto, setAbierto] = React.useState(false)
  const [lista, setLista] = React.useState<PeriodoFila[] | null>(null)
  const [archivados, setArchivados] = React.useState(false)
  const [confirmar, setConfirmar] = React.useState<PeriodoFila | null>(null)
  const [nuevo, setNuevo] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const caja = React.useRef<HTMLDivElement>(null)
  const admin = rol === 'ADMIN'
  const P = vocab.periodo, p = min(vocab.periodo)

  const cargar = React.useCallback(async () => { if (tienda) setLista(await listarPeriodos(tienda.id)) }, [tienda])
  React.useEffect(() => { if (abierto) { setErr(null); setConfirmar(null); setNuevo(null); cargar().catch((x) => setErr(mensajeError(x))) } }, [abierto, cargar])
  React.useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  if (!tienda || (!periodoActivo && !admin && !periodo)) return null
  const mirando = !!periodo && periodo.id !== periodoActivo?.id
  const vis = (lista ?? []).filter((x) => archivados || !x.archivado)
  const nArch = (lista ?? []).filter((x) => x.archivado).length

  async function hacer(fn: () => Promise<void>) {
    setBusy(true); setErr(null)
    try { await fn() } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => setAbierto((a) => !a)} aria-haspopup="menu" aria-expanded={abierto}
        className="flex h-6 w-full items-center gap-1 rounded-sm px-2 text-left text-sm text-fg-3 hover:bg-bg-4 hover:text-fg"
        title={mirando ? `Estás mirando ${periodo!.nombre}. ${P} activ${gr.o('periodo')}: ${periodoActivo?.nombre ?? '—'}` : `${P} activ${gr.o('periodo')}`}>
        <span className={mirando ? 'truncate font-medium text-warn-fg' : 'truncate'}>{periodo?.nombre ?? `Sin ${p}`}</span>
        {mirando && <span className="shrink-0 text-xs text-warn-fg">(mirando)</span>}
        <IconChevronDown size={11} className="shrink-0" />
      </button>
      {abierto && (
        <div className="absolute left-0 right-0 top-7 z-20 flex flex-col rounded-md border border-border bg-bg p-1 shadow-light" role="menu">
          <div className="px-2 py-1 text-xs text-fg-3">{vocab.periodos}: pulsa una para mirarla (solo tú)</div>
          {lista === null && !err && <div className="px-2 py-1 text-sm text-fg-3">Cargando…</div>}
          {vis.map((x) => {
            const activa = x.id === periodoActivo?.id, viendo = x.id === periodo?.id
            return (
              <div key={x.id} className="flex items-center gap-1">
                <button onClick={() => { verPeriodo(activa ? null : x); setAbierto(false) }}
                  className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-2 text-left hover:bg-bg-4">
                  <span className={viendo ? 'truncate font-medium' : 'truncate'}>{x.nombre}</span>
                  {activa && <span className="shrink-0 rounded-sm bg-bg-4 px-1 text-xs text-fg-2">activ{gr.o('periodo')}</span>}
                  {x.archivado && <span className="shrink-0 text-xs text-fg-3">archivad{gr.o('periodo')}</span>}
                </button>
                {admin && !activa && !x.archivado && (
                  <button className="shrink-0 rounded-sm px-1.5 text-xs text-fg-3 hover:bg-bg-4 hover:text-fg" onClick={() => setConfirmar(x)} title={`Activarla para toda la tienda`}>Activar</button>
                )}
              </div>
            )
          })}
          {nArch > 0 && (
            <button className="h-6 rounded-sm px-2 text-left text-xs text-fg-3 hover:text-fg" onClick={() => setArchivados((a) => !a)}>
              {archivados ? 'Ocultar archivad' + gr.o('periodo', true) : `Ver archivad${gr.o('periodo', true)} (${nArch})`}
            </button>
          )}
          {confirmar && (
            <div className="m-1 flex flex-col gap-1.5 rounded-sm bg-warn-bg px-2 py-1.5 text-sm text-warn-fg">
              <span>¿Activar {confirmar.nombre} para toda la tienda? Todos pasarán a trabajar en {gr.con('periodo', 'este')}. Lo que está sin terminar se sigue viendo.</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => hacer(async () => { await activarPeriodo(confirmar.id); verPeriodo(null); await recargarPeriodo(); setConfirmar(null); await cargar() })}>Activar</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
              </div>
            </div>
          )}
          {admin && (nuevo === null
            ? <button className="mt-1 h-7 rounded-sm border-t border-border px-2 text-left text-fg-2 hover:bg-bg-4" onClick={() => setNuevo('')}>+ {gr.Con('periodo', 'nuevo')}</button>
            : (
              <form className="m-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (nuevo.trim()) hacer(async () => { await crearPeriodo(tienda.id, nuevo, null, null); setNuevo(null); await cargar() }) }}>
                <Input className="h-7" autoFocus placeholder={`Nombre (p. ej. 2728)`} value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
                <Button size="sm" type="submit" disabled={busy || !nuevo.trim()}>Crear</Button>
              </form>
            ))}
          {admin && nuevo !== null && <span className="px-2 pb-1 text-xs text-fg-3">Se crea sin activar. Actívala cuando empiece.</span>}
          {err && <span className="m-1 rounded-sm bg-danger-bg px-2 py-1 text-sm text-danger-fg">{err}</span>}
        </div>
      )}
    </div>
  )
}

/** Aviso fijo cuando alguien mira un periodo que no es el activo */
export function AvisoPeriodo() {
  const { periodo, periodoActivo, verPeriodo, vocab, gr } = useAuth()
  if (!periodo || periodo.id === periodoActivo?.id) return null
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-warn-bg bg-warn-bg/60 px-4 py-1.5 text-sm text-warn-fg">
      <span className="flex-1">Estás mirando <b>{periodo.nombre}</b>. {vocab.periodo} activ{gr.o('periodo')} de la tienda: {periodoActivo?.nombre ?? '—'}. Solo lo ves tú.</span>
      <button className="font-medium underline" onClick={() => verPeriodo(null)}>Volver a {periodoActivo?.nombre ?? `l${gr.o('periodo')} activ${gr.o('periodo')}`}</button>
    </div>
  )
}

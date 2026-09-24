import * as React from 'react'
import { copiarTexto, compartir } from '@/lib/copiar'
import { Link, useSearchParams } from 'react-router-dom'
import { IconChevronDown, IconChevronRight, IconSearch } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { portalEncargos, type EncargoPortal } from '@/data/portal'
import { crearHito, deshacerUltimoHito, mensajeError } from '@/data/encargos'
import { camposDe, formatearValor, plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { cn, fechaCorta, num3, relativo } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { Button, Input, UndoBar } from '@/ui'

type CampoV = Campo & { visible_proveedor?: boolean }

/**
 * Portal del proveedor: lo que tiene en su mano y lo que ya entregó.
 * Pensado para el móvil: una lista, un botón por encargo, doble toque y deshacer.
 * Con ?proveedor=<id> lo usa administración para «ver como» ese proveedor (sin poder marcar).
 */
export function Portal() {
  const { tienda, vocab, session, signOut, rol, gr } = useAuth()
  const [params] = useSearchParams()
  const verComo = rol === 'ADMIN' ? params.get('proveedor') : null
  const [lista, setLista] = React.useState<EncargoPortal[] | null>(null)
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [carpeta, setCarpeta] = React.useState<'EN_CURSO' | 'ENTREGADOS'>('EN_CURSO')
  const [q, setQ] = React.useState('')
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [armado, setArmado] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [undo, setUndo] = React.useState<{ id: string; msg: string } | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [l, p] = await Promise.all([portalEncargos(tienda.id, verComo), plantillas(tienda.id)])
    setLista(l); setPs(p)
  }, [tienda, verComo])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])
  // El armado de la doble pulsación se desarma solo a los 3,5 s
  React.useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(null), 3500); return () => clearTimeout(t) }, [armado])

  const nombreProv = lista?.[0]?.proveedor_nombre
  const filtro = q.trim().toLowerCase()
  const visibles = (lista ?? []).filter((e) => e.carpeta === carpeta).filter((e) => !filtro
    || num3(e).toLowerCase().includes(filtro) || (e.cliente_nombre ?? '').toLowerCase().includes(filtro) || (e.producto_nombre ?? '').toLowerCase().includes(filtro))
  const n = (c: string) => (lista ?? []).filter((e) => e.carpeta === c).length

  async function marcar(e: EncargoPortal) {
    if (verComo || !e.siguiente_clave) return
    if (armado !== e.id) { setArmado(e.id); return }
    setArmado(null); setBusy(e.id); setErr(null)
    try {
      await crearHito(e.id, e.siguiente_clave)
      setUndo({ id: e.id, msg: `${num3(e)} · ${e.siguiente_nombre}` })
      await cargar()
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(null) }
  }
  async function deshacer() {
    if (!undo) return
    try { await deshacerUltimoHito(undo.id); setUndo(null); await cargar() } catch (x) { setErr(mensajeError(x)); setUndo(null) }
  }

  function campos(e: EncargoPortal) {
    const ver = (c: CampoV) => !!c.visible_proveedor
    return {
      enc: (camposDe(ps, 'ENCARGO', e.tipo_encargo_id) as CampoV[]).filter(ver).filter((c) => e.datos?.[c.clave] != null && e.datos[c.clave] !== ''),
      cli: (camposDe(ps, 'CLIENTE') as CampoV[]).filter(ver).filter((c) => e.cliente_datos?.[c.clave] != null && e.cliente_datos[c.clave] !== ''),
    }
  }
  function textoFicha(e: EncargoPortal) {
    const { enc, cli } = campos(e)
    return [
      `${vocab.encargo} ${num3(e)}${e.cliente_nombre ? ` · ${e.cliente_nombre}` : ''}`,
      e.producto_nombre ? `${vocab.producto}: ${e.producto_nombre}` : null,
      ...enc.map((c) => `${c.etiqueta}: ${formatearValor(c, e.datos[c.clave])}`),
      cli.length ? '' : null,
      ...cli.map((c) => `${c.etiqueta}: ${formatearValor(c, e.cliente_datos[c.clave])}`),
    ].filter((x) => x !== null).join('\n')
  }
  async function copiar(e: EncargoPortal) {
    const t = textoFicha(e); if (await copiarTexto(t)) setOk('Ficha copiada'); else if ((await compartir('Ficha', t)) !== 'no') setOk(''); else setErr('Tu navegador no deja copiar solo')
  }
  function imprimir(e: EncargoPortal) {
    const w = window.open('', '_blank', 'width=720,height=900')
    if (!w) { setErr('El navegador ha bloqueado la ventana de impresión'); return }
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    const filas = textoFicha(e).split('\n').slice(1).map((l) => {
      if (!l) return '<tr><td colspan="2" style="height:12px"></td></tr>'
      const i = l.indexOf(': ')
      return `<tr><td style="color:#666;padding:4px 16px 4px 0">${esc(l.slice(0, i))}</td><td style="padding:4px 0;font-weight:500">${esc(l.slice(i + 2))}</td></tr>`
    }).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(vocab.encargo)} ${num3(e)}</title></head>
      <body style="font-family:Inter,system-ui,sans-serif;font-size:14px;color:#333;padding:32px">
      <div style="color:#999;font-size:12px">${esc(tienda?.nombre ?? '')}</div>
      <h1 style="font-size:22px;margin:4px 0 16px">${esc(vocab.encargo)} ${num3(e)}${e.cliente_nombre ? ' · ' + esc(e.cliente_nombre) : ''}</h1>
      <table style="border-collapse:collapse">${filas}</table></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  const correo = session?.user.email ?? ''
  return (
    <div className="flex h-full flex-col bg-bg">
      {verComo && (
        <div className="flex items-center gap-3 bg-gray-12 px-4 py-2 text-sm text-white">
          <span className="flex-1">Estás viendo el portal como <b>{nombreProv ?? gr.con('proveedor', 'este')}</b>. Solo lectura.</span>
          <Link to="/ajustes/proveedores" className="font-medium underline underline-offset-2">Salir</Link>
        </div>
      )}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: 'var(--accent)' }} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-semibold">{tienda?.nombre}</span>
          {nombreProv && <span className="truncate text-sm text-fg-3">{nombreProv}</span>}
        </div>
        {!verComo && <Button variant="ghost" size="sm" onClick={signOut} title={correo}>Salir</Button>}
      </header>

      <div className="flex shrink-0 gap-1 border-b border-border px-4 pt-2">
        {(['EN_CURSO', 'ENTREGADOS'] as const).map((c) => (
          <button key={c} onClick={() => { setCarpeta(c); setAbierto(null) }}
            className={cn('-mb-px flex h-9 items-center gap-1.5 border-b px-2 font-medium', carpeta === c ? 'border-gray-12 text-fg' : 'border-transparent text-fg-3')}>
            {c === 'EN_CURSO' ? 'En curso' : `Terminad${gr.o('encargo', true)} por mí`} <span className="text-fg-3">{n(c)}</span>
          </button>
        ))}
      </div>
      <div className="shrink-0 px-4 py-2">
        <div className="relative">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <Input className="pl-8" placeholder="Buscar por número o nombre" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {(err || ok) && (
        <div className={cn('mx-4 mb-2 rounded-sm px-3 py-2 text-sm', err ? 'bg-danger-bg text-danger-fg' : 'bg-ok-bg text-ok-fg')} onClick={() => { setErr(null); setOk(null) }}>{err ?? ok}</div>
      )}

      <div className="min-h-0 flex-1 overflow-auto pb-24">
        {lista === null && <p className="px-4 py-6 text-fg-3">Cargando…</p>}
        {lista !== null && visibles.length === 0 && (
          <p className="px-4 py-10 text-center text-fg-3">
            {q ? 'Nada coincide con la búsqueda.' : carpeta === 'EN_CURSO' ? `No tienes ${min(vocab.encargos)} en curso.` : 'Todavía no has entregado nada.'}
            {!q && lista.length === 0 && <span className="mt-2 block text-sm">Si esperabas ver algo, pide a la tienda que compruebe que tu correo ({session?.user.email}) está en tu ficha.</span>}
          </p>
        )}
        <div className="flex flex-col divide-y divide-border-light border-y border-border-light">
          {visibles.map((e) => {
            const { enc, cli } = campos(e)
            const abiertoAqui = abierto === e.id
            return (
              <div key={e.id} className="flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setAbierto(abiertoAqui ? null : e.id)} aria-expanded={abiertoAqui}>
                    {abiertoAqui ? <IconChevronDown size={14} className="shrink-0 text-fg-3" /> : <IconChevronRight size={14} className="shrink-0 text-fg-3" />}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium"><span className="text-fg-3 tabular">{num3(e)}</span> · {e.cliente_nombre ?? `${vocab.encargo} ${num3(e)}`}</span>
                      <span className="truncate text-sm text-fg-3">{[e.producto_nombre, e.etapa_actual_nombre ?? (e.carpeta === 'ENTREGADOS' ? `Devuelt${gr.o('encargo')}` : null), relativo(e.actualizado_en)].filter(Boolean).join(' · ')}</span>
                    </div>
                  </button>
                  {e.siguiente_clave && e.carpeta === 'EN_CURSO' && (
                    <Button variant={armado === e.id ? 'armed' : 'default'} disabled={!!verComo || busy === e.id} onClick={() => marcar(e)} className="h-9 shrink-0 px-3">
                      {armado === e.id ? '¿Confirmar?' : e.siguiente_nombre}
                    </Button>
                  )}
                </div>
                {abiertoAqui && (
                  <div className="flex flex-col gap-3 bg-bg-2 px-4 pb-4 pl-10 pt-1">
                    {e.producto_foto_url && <img src={e.producto_foto_url} alt="" className="h-40 w-40 rounded-md object-cover" />}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                      {e.producto_nombre && <><dt className="text-fg-3">{vocab.producto}</dt><dd>{e.producto_nombre}</dd></>}
                      {enc.map((c) => <React.Fragment key={c.clave}><dt className="text-fg-3">{c.etiqueta}</dt><dd>{formatearValor(c, e.datos[c.clave])}</dd></React.Fragment>)}
                    </dl>
                    {cli.length > 0 && (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border-light pt-2">
                        {cli.map((c) => <React.Fragment key={c.clave}><dt className="text-fg-3">{c.etiqueta}</dt><dd className="tabular">{formatearValor(c, e.cliente_datos[c.clave])}</dd></React.Fragment>)}
                      </dl>
                    )}
                    {e.hitos.length > 0 && (
                      <div className="flex flex-col gap-0.5 text-sm text-fg-3">
                        {e.hitos.map((h, i) => <span key={i}>{h.nombre} · {fechaCorta(h.fecha)}</span>)}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => copiar(e)}>Copiar ficha</Button>
                      <Button size="sm" onClick={() => imprimir(e)}>Imprimir</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {undo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4">
          <UndoBar className="pointer-events-auto w-full max-w-[420px]" message={undo.msg} onUndo={deshacer} onExpire={() => setUndo(null)} />
        </div>
      )}
    </div>
  )
}

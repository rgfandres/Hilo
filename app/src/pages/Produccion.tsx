import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { IconPencil, IconPrinter } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import {
  ajustesHoja, imprimirHoja, listarImpresiones, listarLineas, marcarImprimir, materialDeEncargos, notasProduccion, registrarImpresion,
  type ContenidoImpresion, type Impresion, type LineaHoja,
} from '@/data/produccion'
import { actualizarEncargo, crearHito, listarEncargos, listarEtapas, mensajeError, ponerNotaCampo } from '@/data/encargos'
import { ajustesFicha } from '@/data/catalogos'
import { ajustesMaterial, cant } from '@/data/materiales'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { NotaCampo } from '@/components/NotaCampo'
import { ArregloPuerta } from '@/components/ArregloPuerta'
import { Button, Dialog, Input, Segmented, Table, Tabs, Tag, Td, Th, Tr, useAvisos, type TagColor } from '@/ui'
import { useTiempoReal } from '@/lib/tiempoReal'
import { cn, fechaCorta, num3 } from '@/lib/utils'
import { min } from '@/lib/vocab'

const COH: Record<LineaHoja['coherencia'], { txt: string; color: TagColor }> = {
  ENVIADO: { txt: 'Enviado', color: 'green' }, NO_ENVIADO: { txt: 'No enviado', color: 'amber' },
  REVISAR: { txt: 'Revisar', color: 'red' }, ANULADO: { txt: 'Anulado', color: 'gray' },
}
const SIN = '_'

/**
 * Hoja de producción: una por producto. Las líneas nacen al marcar una etapa «de producción»;
 * solo se imprime lo enviado y coherente, y cada impresión queda registrada y se puede repetir igual.
 */
export function Produccion() {
  const { tienda, vocab, rol, gr } = useAuth()
  const avisar = useAvisos()
  const aj = tienda?.ajustes as Record<string, unknown>
  const hoja = ajustesHoja(aj)
  const fic = ajustesFicha(aj)
  const mat = ajustesMaterial(aj)
  const gestion = rol === 'ADMIN' || rol === 'OPERATIVO'
  const [sp, setSp] = useSearchParams()
  const [lineas, setLineas] = React.useState<LineaHoja[] | null>(null)
  const [encs, setEncs] = React.useState<EncargoEstado[]>([])
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [mats, setMats] = React.useState<Record<string, { nombre: string; cantidad: number; estado: string }[]>>({})
  const [notas, setNotas] = React.useState<Awaited<ReturnType<typeof notasProduccion>>>({})
  const [imps, setImps] = React.useState<Impresion[]>([])
  const [ver, setVer] = React.useState<'pendientes' | 'todas'>('todas')
  const [selListos, setSelListos] = React.useState<Set<string>>(new Set())
  const [bloqueo, setBloqueo] = React.useState<string[] | null>(null)
  const [comp, setComp] = React.useState<{ l: LineaHoja; v: string } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [l, e, et] = await Promise.all([listarLineas(tienda.id), listarEncargos(tienda.id), listarEtapas(tienda.id)])
    setLineas(l); setEncs(e); setEtapas(et)
    const ids = l.map((x) => x.encargo_id)
    const [m, n] = await Promise.all([materialDeEncargos(ids), notasProduccion(ids)])
    setMats(m); setNotas(n)
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])
  useTiempoReal(tienda?.id, () => cargar().catch(() => {}))

  const etProd = React.useMemo(() => new Set(etapas.filter((x) => x.es_produccion).map((x) => x.id)), [etapas])
  const todas = lineas ?? []
  // Productos con líneas o con encargos listos para enviar
  const listosTodos = encs.filter((e) => e.estado === 'ACTIVO' && !e.es_final && e.etapa_siguiente_id && etProd.has(e.etapa_siguiente_id)
    && !todas.some((l) => l.encargo_id === e.id && l.coherencia === 'ENVIADO'))
  const productos = new Map<string, { nombre: string; n: number; pend: number }>()
  for (const l of todas) {
    if (l.coherencia === 'ANULADO' && l.impreso_en) continue
    const k = l.producto_id ?? SIN
    const x = productos.get(k) ?? { nombre: l.producto_nombre ?? `Sin ${min(vocab.producto)}`, n: 0, pend: 0 }
    x.n++; if (!l.impreso_en) x.pend++
    productos.set(k, x)
  }
  for (const e of listosTodos) {
    const k = e.producto_id ?? SIN
    if (!productos.has(k)) productos.set(k, { nombre: e.producto_nombre ?? `Sin ${min(vocab.producto)}`, n: 0, pend: 0 })
  }
  const orden = [...productos.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))
  const prod = sp.get('p') ?? orden[0]?.[0] ?? ''
  const prodId = prod === SIN ? null : prod
  React.useEffect(() => { if (tienda && prod) listarImpresiones(tienda.id, prodId).then(setImps).catch(() => {}) }, [tienda, prod, prodId, lineas])
  React.useEffect(() => { setSelListos(new Set()) }, [prod])

  const delProd = todas.filter((l) => (l.producto_id ?? SIN) === prod && !(l.coherencia === 'ANULADO' && l.impreso_en))
  const vis = delProd.filter((l) => ver === 'todas' || !l.impreso_en)
  const listos = listosTodos.filter((e) => (e.producto_id ?? SIN) === prod)
  const nEnv = delProd.filter((l) => l.coherencia === 'ENVIADO').length
  const nombreProd = productos.get(prod)?.nombre ?? ''
  const etiquetaCol = hoja.etiquetaCol
  const valor = (l: LineaHoja) => (hoja.campoCol ? String((l.datos ?? {})[hoja.campoCol] ?? '') : '')
  const txtMat = (id: string) => (mats[id] ?? []).map((m) => `${m.nombre}${m.cantidad ? ` ${mat.activo ? cant(m.cantidad, mat.unidad) : m.cantidad}` : ''}${m.estado !== 'RECIBIDO' ? ` (${m.estado === 'PEDIDO' ? 'pedido' : 'pendiente'})` : ''}`).join(' · ')

  async function toggleImprimir(l: LineaHoja) {
    try { await marcarImprimir([l.id], !l.imprimir); await cargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
  }
  async function enviarListos() {
    const xs = listos.filter((e) => selListos.has(e.id))
    setBusy('enviar')
    const mal: string[] = []
    let bien = 0
    for (const e of xs) {
      try { await crearHito(e.id, e.etapa_siguiente_clave!); bien++ } catch (x) { mal.push(`${num3(e)}: ${mensajeError(x)}`) }
    }
    setBusy(null); setSelListos(new Set())
    await cargar()
    if (bien) avisar({ tipo: 'ok', texto: `${bien} enviad${bien === 1 ? 'o' : 'os'} a producción` })
    if (mal.length) avisar({ tipo: 'error', persistente: true, texto: `No se enviaron ${mal.length}: ${mal.join(' · ')}` })
  }
  function contenido(ls: LineaHoja[]): ContenidoImpresion {
    const cols = ['Nº', vocab.cliente, ...(mat.activo ? [vocab.material] : []), fic.etiqueta, ...(hoja.campoCol && !hoja.curva.length ? [etiquetaCol] : []), 'Nota']
    return {
      titulo: hoja.nombre, producto: nombreProd, tienda: tienda?.nombre ?? '', fecha: new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
      columnas: cols, curva: hoja.campoCol ? hoja.curva : [],
      filas: ls.map((l) => ({
        valor: valor(l),
        celdas: [num3(l), l.cliente_nombre ?? '', ...(mat.activo ? [txtMat(l.encargo_id)] : []), l.complementos ?? '', ...(hoja.campoCol && !hoja.curva.length ? [valor(l)] : []), notas[l.encargo_id]?.texto ?? ''],
      })),
    }
  }
  async function imprimir() {
    if (!tienda) return
    const ls = delProd.filter((l) => l.imprimir)
    if (!ls.length) { avisar({ tipo: 'aviso', texto: 'Marca antes las líneas que quieres imprimir' }); return }
    const malas = ls.filter((l) => l.coherencia !== 'ENVIADO')
    if (malas.length) { setBloqueo(malas.map((l) => `${num3(l)} ${l.cliente_nombre ?? ''}: ${l.motivos.join(', ') || COH[l.coherencia].txt}`)); return }
    const c = contenido(ls)
    setBusy('imprimir')
    try {
      await registrarImpresion(tienda.id, prodId, ls.map((l) => l.id), c)
      if (!imprimirHoja(c)) avisar({ tipo: 'aviso', persistente: true, texto: 'El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes y usa «Reimprimir» en el historial.' })
      await cargar()
    } catch (x) { avisar({ tipo: 'error', persistente: true, texto: mensajeError(x) }) } finally { setBusy(null) }
  }

  if (!hoja.activo) {
    return (
      <>
        <PageHeader title={hoja.nombre} />
        <div className="flex flex-col items-center gap-3 py-16 text-center text-fg-3">
          <span>La {min(hoja.nombre)} está apagada.</span>
          {rol === 'ADMIN' && <Button asChild><Link to="/ajustes/tienda">Activarla en Ajustes → Tienda</Link></Button>}
        </div>
      </>
    )
  }

  const tabs = orden.map(([k, v]) => ({ key: k, label: v.nombre, count: v.pend || undefined, aviso: listosTodos.some((e) => (e.producto_id ?? SIN) === k), title: `${v.n} líneas · ${v.pend} sin imprimir` }))
  return (
    <>
      <PageHeader title={hoja.nombre} subtitle={lineas ? (() => { const n = todas.filter((l) => !l.impreso_en && l.coherencia !== 'ANULADO').length; return n ? `${n} ${n === 1 ? 'línea' : 'líneas'} sin imprimir` : 'Todo impreso' })() : undefined} />
      {etProd.size === 0 && lineas && (
        <p className="m-3 rounded-sm bg-warn-bg px-3 py-2 text-sm text-warn-fg">Ninguna etapa envía todavía a la {min(hoja.nombre)}. Márcalo en Ajustes → Flujos → la etapa → «Envía a la {min(hoja.nombre)}».</p>
      )}
      {tabs.length > 0 && <Tabs items={tabs} value={prod} onChange={(k) => setSp((s) => { s.set('p', k); return s }, { replace: true })} />}
      {err && <div className="m-3 rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {lineas === null ? <p className="text-fg-3">Cargando…</p> : tabs.length === 0 ? (
          <p className="py-12 text-center text-fg-3">Aún no hay nada en la hoja. {gr.Con('encargo', 'los')} se añaden aquí al marcar la etapa que envía a producción.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span><b className="tabular">{delProd.length}</b> en la hoja</span>
              <span><b className="tabular">{nEnv}</b> enviados</span>
              <span><b className="tabular">{delProd.filter((l) => !l.impreso_en).length}</b> sin imprimir</span>
              <span><b className="tabular">{listos.length}</b> listos para enviar</span>
              <div className="flex-1" />
              <Segmented value={ver} onChange={(k) => setVer(k as typeof ver)} items={[{ key: 'todas', label: 'Todas' }, { key: 'pendientes', label: 'Sin imprimir' }]} />
              {gestion && <Button variant="primary" cargando={busy === 'imprimir'} onClick={imprimir}><IconPrinter size={14} /> Imprimir marcadas ({delProd.filter((l) => l.imprimir).length})</Button>}
            </div>

            {listos.length > 0 && (
              <section className="flex flex-col gap-1 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Listos para enviar a producción</span>
                  <button className="text-sm text-fg-3 hover:text-fg hover:underline" onClick={() => setSelListos(new Set(listos.filter((e) => !(e.puertas_pendientes ?? []).some((p) => p.dura)).map((e) => e.id)))}>Marcar todos</button>
                  <div className="flex-1" />
                  <Button size="sm" variant="primary" disabled={!selListos.size} cargando={busy === 'enviar'} onClick={enviarListos}>Enviar {selListos.size || ''}</Button>
                </div>
                {listos.map((e) => {
                  const duras = (e.puertas_pendientes ?? []).filter((p) => p.dura)
                  return (
                    <label key={e.id} className={cn('flex items-center gap-2 text-sm', duras.length && 'opacity-70')}>
                      <input type="checkbox" disabled={!!duras.length} checked={selListos.has(e.id)} onChange={(x) => setSelListos((s) => { const n = new Set(s); if (x.target.checked) n.add(e.id); else n.delete(e.id); return n })} />
                      <Link to={`/encargos/${e.id}`} className="font-medium hover:underline">{num3(e)}</Link>
                      <span>{e.cliente_nombre}</span>
                      <span className="text-fg-3">→ {e.etapa_siguiente_nombre}</span>
                      {duras.length > 0 && <span className="text-danger-fg">bloqueado: {duras.map((p) => p.mensaje).join(' · ')}</span>}
                      {duras.map((p) => <ArregloPuerta key={p.mensaje} e={e} p={p} compacto onHecho={() => cargar().catch(() => {})} />)}
                    </label>
                  )
                })}
              </section>
            )}

            {vis.length === 0 ? <p className="text-fg-3">{delProd.length ? 'Todo lo de esta hoja está impreso.' : 'Esta hoja aún no tiene líneas.'}</p> : (
              <Table>
                <thead><Tr>
                  <Th className="w-8" title="Marcar para imprimir"><IconPrinter size={13} /></Th><Th>Nº</Th><Th>{vocab.cliente}</Th>
                  {mat.activo && <Th>{vocab.material}</Th>}<Th>{fic.etiqueta}</Th>
                  {hoja.campoCol && (hoja.curva.length ? hoja.curva.map((t) => <Th key={t} className="w-7 text-center">{t}</Th>) : <Th>{etiquetaCol}</Th>)}
                  <Th>Estado</Th><Th>Nota</Th><Th>Impreso</Th>
                </Tr></thead>
                <tbody>
                  {vis.map((l) => (
                    <Tr key={l.id} className={cn(l.imprimir && !l.impreso_en && 'bg-warn-bg/40', l.coherencia === 'ANULADO' && 'opacity-55')}>
                      <Td><input type="checkbox" disabled={!gestion} checked={l.imprimir} onChange={() => toggleImprimir(l)} aria-label="Imprimir" /></Td>
                      <Td><Link to={`/encargos/${l.encargo_id}`} className="font-medium hover:underline">{num3(l)}</Link></Td>
                      <Td>{l.cliente_nombre}</Td>
                      {mat.activo && <Td className="text-sm text-fg-2">{txtMat(l.encargo_id) || '—'}</Td>}
                      <Td className="text-sm">
                        <button disabled={!gestion || l.coherencia === 'ANULADO'} className="group inline-flex items-start gap-1 text-left" onClick={() => setComp({ l, v: l.complementos ?? '' })}>
                          <span>{l.complementos || <span className="text-fg-3">—</span>}</span>
                          {gestion && <IconPencil size={12} className="mt-0.5 shrink-0 text-fg-3 opacity-0 group-hover:opacity-100" />}
                        </button>
                      </Td>
                      {hoja.campoCol && (hoja.curva.length
                        ? hoja.curva.map((t) => <Td key={t} className="text-center">{valor(l) === t ? '●' : ''}</Td>)
                        : <Td>{valor(l) || '—'}</Td>)}
                      <Td title={l.motivos.join(' · ')}>
                        <Tag color={COH[l.coherencia].color}>{COH[l.coherencia].txt}</Tag>
                        {l.motivos.length > 0 && <div className="mt-0.5 max-w-[220px] text-xs text-fg-3">{l.motivos.join(' · ')}</div>}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <span className="max-w-[200px] truncate">{notas[l.encargo_id]?.texto ?? ''}</span>
                          <NotaCampo etiqueta="Producción" nota={notas[l.encargo_id]} editable={l.coherencia !== 'ANULADO'}
                            onGuardar={async (t) => { await ponerNotaCampo(l.encargo_id, 'produccion', t); setNotas(await notasProduccion(todas.map((x) => x.encargo_id))) }} />
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-fg-2">{l.impreso_en ? fechaCorta(l.impreso_en) : '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}

            {imps.length > 0 && (
              <section className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-3">Impresiones</span>
                {imps.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 text-sm">
                    <span className="text-fg-2">{new Date(i.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span>{i.n_lineas} {i.n_lineas === 1 ? 'línea' : 'líneas'}</span>
                    <button className="text-fg-2 underline hover:text-fg" onClick={() => { if (!imprimirHoja(i.contenido)) avisar({ tipo: 'aviso', texto: 'Permite las ventanas emergentes para reimprimir' }) }}>Reimprimir</button>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!bloqueo} onOpenChange={(o) => !o && setBloqueo(null)} title="No se puede imprimir todavía"
        description="Solo se imprime lo enviado a producción y coherente con su encargo. Revisa o desmarca estas líneas:"
        actions={[{ label: 'Entendido', onClick: () => setBloqueo(null) }]}>
        <ul className="m-0 pl-4 text-sm">{(bloqueo ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
      </Dialog>
      <Dialog open={!!comp} onOpenChange={(o) => !o && setComp(null)} title={`${fic.etiqueta} · ${comp ? num3(comp.l) : ''}`}
        description={`Se guarda en ${gr.con('encargo', 'el')}: es el mismo dato que se ve en su ficha.`}
        actions={[{ label: 'Guardar', onClick: async () => {
          if (!comp) return
          try { await actualizarEncargo(comp.l.encargo_id, { complementos: comp.v.trim() || null }); setComp(null); await cargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
        } }]}>
        <Input autoFocus value={comp?.v ?? ''} onChange={(e) => comp && setComp({ ...comp, v: e.target.value })} />
      </Dialog>
    </>
  )
}

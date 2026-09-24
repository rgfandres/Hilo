import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { IconBrandWhatsapp, IconSearch } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import {
  ajustarStock, ajustesMaterial, cambiarResto, cant, crearPedido, guardarMaterial, guardarResto, lineasDeTienda, listarMateriales,
  listarMovimientos, listarPedidos, listarRestos, nombreMaterial, propuestaPedido, recibirLinea, restoCandidato, revertirMovimiento,
  avisoStock, bajoUmbral, cerrarLineaPedido, type LineaMaterial, type LineaPedido, type MaterialEstado, type Movimiento, type Resto,
} from '@/data/materiales'
import { listarProveedoresCat, type ProveedorFila } from '@/data/catalogos'
import { mensajeError } from '@/data/encargos'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/layout/AppShell'
import { DialogoResto } from '@/components/Material'
import { Interruptor } from '@/pages/ajustes/Ajustes'
import { Button, CapaCarga, Dialog, FormRow, Input, Segmented, Select, Sheet, Table, Tabs, Tag, Td, Th, Tr, useAvisos, Textarea } from '@/ui'
import { copiarTexto, compartir } from '@/lib/copiar'
import { cn, fechaCorta, num3, locale, zona } from '@/lib/utils'
import { min } from '@/lib/vocab'

type Vista = 'catalogo' | 'pedidos' | 'movimientos' | 'restos'
const n = (x: string) => Number(String(x).replace(',', '.'))
const fecha = (s: string) => fechaCorta(s)

/** Materiales: catálogo con stock, pedidos a proveedor, libro de movimientos y restos. */
export function Materiales() {
  const { tienda, vocab, rol } = useAuth()
  const aj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const [sp, setSp] = useSearchParams()
  const vista = (sp.get('v') as Vista) || 'catalogo'
  const [mats, setMats] = React.useState<MaterialEstado[] | null>(null)
  const [lineas, setLineas] = React.useState<LineaMaterial[]>([])
  const [pedidos, setPedidos] = React.useState<LineaPedido[]>([])
  const [restos, setRestos] = React.useState<Resto[]>([])
  const [provs, setProvs] = React.useState<ProveedorFila[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const puedeEditar = rol === 'ADMIN' || rol === 'OPERATIVO'

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [m, l, p, r, pv] = await Promise.all([listarMateriales(tienda.id), lineasDeTienda(tienda.id), listarPedidos(tienda.id), listarRestos(tienda.id), listarProveedoresCat(tienda.id)])
    setMats(m); setLineas(l); setPedidos(p); setRestos(r); setProvs(pv)
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])
  // En directo: si otro puesto recibe o asigna, se refresca
  React.useEffect(() => {
    if (!tienda) return
    let t: ReturnType<typeof setTimeout> | undefined
    const ch = supabase.channel(`mat-${tienda.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material', filter: `tienda_id=eq.${tienda.id}` }, () => { clearTimeout(t); t = setTimeout(() => cargar().catch(() => {}), 400) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encargo_material', filter: `tienda_id=eq.${tienda.id}` }, () => { clearTimeout(t); t = setTimeout(() => cargar().catch(() => {}), 400) })
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [tienda, cargar])

  const lista = mats ?? []
  const nPedir = lista.filter((m) => m.activo && propuestaPedido(m).pedir > 0).length
  const nCamino = pedidos.filter((p) => p.estado === 'PENDIENTE' || p.estado === 'PARCIAL').length
  const tabs = [
    { key: 'catalogo', label: 'Catálogo', count: lista.filter((m) => m.activo).length },
    { key: 'pedidos', label: 'Pedidos', count: nPedir || undefined, aviso: nPedir > 0, title: `${nPedir} por pedir · ${nCamino} en camino` },
    { key: 'movimientos', label: 'Movimientos' },
    { key: 'restos', label: 'Restos', count: restos.length || undefined },
  ]

  if (!aj.activo) {
    return (
      <>
        <PageHeader title={vocab.materiales} />
        <div className="flex flex-col items-center gap-3 py-16 text-center text-fg-3">
          <span>El módulo de {min(vocab.materiales)} está apagado.</span>
          {rol === 'ADMIN' && <Button asChild><Link to="/ajustes/modulos">Activarlo en Ajustes → Módulos</Link></Button>}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={vocab.materiales} subtitle={mats ? `${lista.filter((m) => m.activo).length} en el catálogo` : undefined} />
      <Tabs items={tabs} value={vista} onChange={(k) => setSp((s) => { s.set('v', k); return s }, { replace: true })} />
      {err && <div className="m-3 rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err} <button className="font-medium underline" onClick={() => { setErr(null); cargar().catch((x) => setErr(mensajeError(x))) }}>Reintentar</button></div>}
      <div className="min-h-0 flex-1 overflow-auto">
        {mats === null ? <p className="p-4 text-fg-3">Cargando…</p>
          : vista === 'catalogo' ? <Catalogo mats={lista} provs={provs} puedeEditar={puedeEditar} unidad={aj.unidad} onCambio={cargar} />
          : vista === 'pedidos' ? <Pedidos mats={lista} lineas={lineas} pedidos={pedidos} provs={provs} puedeEditar={puedeEditar} onCambio={cargar} />
          : vista === 'movimientos' ? <Movimientos mats={lista} puedeEditar={puedeEditar} unidad={aj.unidad} onCambio={cargar} />
          : <Restos mats={lista} restos={restos} unidad={aj.unidad} onCambio={cargar} />}
      </div>
    </>
  )
}

/* ------------------------------ Catálogo ------------------------------ */
function Catalogo({ mats, provs, puedeEditar, unidad, onCambio }: {
  mats: MaterialEstado[]; provs: ProveedorFila[]; puedeEditar: boolean; unidad: string; onCambio: () => Promise<void>
}) {
  const { vocab, gr } = useAuth()
  const [q, setQ] = React.useState('')
  const [filtro, setFiltro] = React.useState<'todos' | 'bajo' | 'inactivos'>('todos')
  const [editar, setEditar] = React.useState<MaterialEstado | 'nuevo' | null>(null)
  const [stock, setStock] = React.useState<MaterialEstado | null>(null)
  const t = q.trim().toLowerCase()
  const bajo = bajoUmbral
  const vis = mats.filter((m) => (filtro === 'inactivos' ? !m.activo : m.activo) && (filtro !== 'bajo' || bajo(m))
    && (!t || `${m.tipo} ${m.variante} ${m.proveedor_nombre ?? ''} ${m.ubicacion ?? ''}`.toLowerCase().includes(t)))
  const tipos = [...new Set(vis.map((m) => m.tipo))]
  return (
    <>
      <div className="flex min-h-11 flex-wrap items-center gap-3 border-b border-border-light px-4 py-1.5">
        <div className="relative w-[260px] max-md:w-full">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <Input className="h-7 pl-8" placeholder="Buscar tipo, variante, proveedor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented value={filtro} onChange={(k) => setFiltro(k as typeof filtro)} items={[
          { key: 'todos', label: 'Todos', count: mats.filter((m) => m.activo).length },
          { key: 'bajo', label: 'Bajo umbral', count: mats.filter((m) => m.activo && bajo(m)).length },
          { key: 'inactivos', label: 'Inactivos', count: mats.filter((m) => !m.activo).length },
        ]} />
        <span className="text-sm text-fg-3">{vis.length} de {mats.length}</span>
        <div className="flex-1" />
        {puedeEditar && <Button variant="primary" onClick={() => setEditar('nuevo')}>+ {vocab.material}</Button>}
      </div>
      {vis.length === 0 ? <p className="p-6 text-center text-fg-3">{mats.length ? 'Nada coincide.' : `Todavía no hay ${min(vocab.materiales)}. Añade ${gr.genero.material === 'f' ? 'la primera' : 'el primero'} o cré${gr.genero.material === 'f' ? 'ala' : 'alo'} al asignarl${gr.o('material')} a ${gr.con('encargo', 'un')}.`}</p> : (
        <Table>
          <thead><Tr><Th>Variante</Th><Th>Proveedor</Th><Th className="text-right">Stock</Th><Th className="text-right">Necesario para {min(vocab.encargos)}</Th><Th className="text-right">En camino</Th><Th className="text-right">Umbral</Th><Th>Ubicación</Th><Th /></Tr></thead>
          <tbody>
            {tipos.map((tipo) => (
              <React.Fragment key={tipo}>
                <tr><td colSpan={8} className="bg-bg-2 px-3 py-1 text-xs font-medium uppercase tracking-wide text-fg-3">{tipo}</td></tr>
                {vis.filter((m) => m.tipo === tipo).map((m) => {
                  const av = avisoStock(m)
                  return (
                    <Tr key={m.id} className={cn(!m.activo && 'opacity-55')}>
                      <Td><button className="font-medium hover:underline" onClick={() => setEditar(m)}>{m.variante || '(sin variante)'}</button></Td>
                      <Td className="text-fg-2">{m.proveedor_nombre ?? '—'}</Td>
                      <Td className="text-right tabular">
                        {puedeEditar ? <button className="rounded-sm px-1 hover:bg-bg-4" title="Corregir el stock (queda en el libro)" onClick={() => setStock(m)}>{cant(m.stock, unidad)}</button> : cant(m.stock, unidad)}
                      </Td>
                      <Td className="text-right tabular text-fg-2">{Number(m.demanda) > 0 ? <>{cant(m.demanda, unidad)} <span className="text-fg-3">({m.encargos_pendientes} {Number(m.encargos_pendientes) === 1 ? min(vocab.encargo) : min(vocab.encargos)})</span></> : '—'}</Td>
                      <Td className="text-right tabular text-fg-2">{Number(m.en_camino) > 0 ? cant(m.en_camino, unidad) : '—'}</Td>
                      <Td className="text-right tabular text-fg-3">{cant(m.umbral_efectivo, unidad)}</Td>
                      <Td className="text-fg-2">{m.ubicacion ?? ''}</Td>
                      <Td>{av.nivel === 'falta' ? <Tag color="red">Falta</Tag> : av.nivel === 'limite' ? <Tag color="amber">Al límite</Tag> : Number(m.restos) > 0 ? <Tag color="gray">+{cant(m.restos, unidad)} en restos</Tag> : null}
                        {!m.unidad_efectiva && <span className="ml-1 text-xs text-fg-3" title="Sin unidad de pedido: la propuesta no se redondea y no se ofrecen restos">sin unidad de pedido</span>}</Td>
                    </Tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </Table>
      )}
      <FichaMaterial m={editar} mats={mats} provs={provs} soloLectura={!puedeEditar} onClose={() => setEditar(null)} onSaved={onCambio} />
      <DialogoStock m={stock} unidad={unidad} onClose={() => setStock(null)} onSaved={onCambio} />
    </>
  )
}

function DialogoStock({ m, unidad, onClose, onSaved }: { m: MaterialEstado | null; unidad: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const avisar = useAvisos()
  const [v, setV] = React.useState(''); const [motivo, setMotivo] = React.useState(''); const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => { if (m) { setV(String(m.stock)); setMotivo(''); setErr(null) } }, [m])
  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && onClose()} title={`Corregir stock · ${nombreMaterial(m)}`} error={err}
      description={`Ahora hay ${cant(m?.stock, unidad)}. El cambio queda en «Movimientos» y se puede revertir.`}
      actions={[{ label: 'Guardar', onClick: async () => {
        if (!m) return
        const x = n(v)
        if (!(x >= 0)) { setErr('Cantidad no válida'); return }
        if (!motivo.trim()) { setErr('Indica el motivo (recuento, merma, error…)'); return }
        try { await ajustarStock(m.id, x, motivo); await onSaved(); avisar({ tipo: 'ok', texto: `Stock: ${cant(x, unidad)}` }); onClose() } catch (e) { setErr(mensajeError(e)) }
      } }]}>
      <FormRow label={`Stock real (${unidad})`}><Input className="h-7 w-[140px]" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></FormRow>
      <FormRow label="Motivo"><Input className="h-7" placeholder="Recuento, merma, error al anotar…" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></FormRow>
    </Dialog>
  )
}

function FichaMaterial({ m, mats, provs, soloLectura, onClose, onSaved }: {
  m: MaterialEstado | 'nuevo' | null; mats: MaterialEstado[]; provs: ProveedorFila[]; soloLectura: boolean; onClose: () => void; onSaved: () => Promise<void>
}) {
  const { tienda, gr } = useAuth()
  const aj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const nuevo = m === 'nuevo'
  const vacio = { tipo: '', variante: '', proveedor_id: '', umbral: '', unidad_pedido: '', ubicacion: '', notas: '', activo: true }
  const [f, setF] = React.useState(vacio)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (!m) return
    setErr(null)
    setF(m === 'nuevo' ? vacio : {
      tipo: m.tipo, variante: m.variante, proveedor_id: m.proveedor_id ?? '', umbral: m.umbral == null ? '' : String(m.umbral),
      unidad_pedido: m.unidad_pedido == null ? '' : String(m.unidad_pedido), ubicacion: m.ubicacion ?? '', notas: m.notas ?? '', activo: m.activo,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m])
  const tipos = [...new Set(mats.map((x) => x.tipo))]
  async function guardar() {
    if (!tienda || !m) return
    if (!f.tipo.trim()) { setErr('El tipo es obligatorio'); return }
    const otro = mats.find((x) => x.tipo.toLowerCase() === f.tipo.trim().toLowerCase() && x.variante.toLowerCase() === f.variante.trim().toLowerCase() && (nuevo || x.id !== (m as MaterialEstado).id))
    if (otro) { setErr('Ya existe esa variante de ese tipo'); return }
    const umbral = f.umbral.trim() ? n(f.umbral) : null
    const unidad = f.unidad_pedido.trim() ? n(f.unidad_pedido) : null
    if ((umbral != null && !(umbral >= 0)) || (unidad != null && !(unidad > 0))) { setErr('Revisa los números'); return }
    setBusy(true); setErr(null)
    try {
      await guardarMaterial(tienda.id, nuevo ? null : (m as MaterialEstado).id, {
        tipo: f.tipo, variante: f.variante, proveedor_id: f.proveedor_id || null, umbral, unidad_pedido: unidad,
        ubicacion: f.ubicacion.trim() || null, notas: f.notas.trim() || null, activo: f.activo,
      })
      await onSaved(); onClose()
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }
  const titulo = nuevo ? gr.Con('material', 'nuevo') : nombreMaterial(m as MaterialEstado | null)
  return (
    <Sheet open={!!m} onOpenChange={(o) => !o && onClose()} side="right" title={titulo} className="flex flex-col gap-3">
      <div className="text-md font-semibold">{titulo}</div>
      <datalist id="tipos-material">{tipos.map((x) => <option key={x} value={x} />)}</datalist>
      <FormRow label="Tipo *"><Input className="h-7" list="tipos-material" disabled={soloLectura} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} placeholder="Qué es: la familia del material" autoFocus={nuevo} /></FormRow>
      <FormRow label="Variante"><Input className="h-7" disabled={soloLectura} value={f.variante} onChange={(e) => setF({ ...f, variante: e.target.value })} placeholder="Color, referencia, grosor…" /></FormRow>
      <FormRow label="Proveedor">
        <Select disabled={soloLectura} value={f.proveedor_id} onChange={(e) => setF({ ...f, proveedor_id: e.target.value })}>
          <option value="">— sin proveedor —</option>
          {provs.filter((p) => p.activo || p.id === f.proveedor_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
      </FormRow>
      <FormRow label={`Umbral (${aj.unidad})`} ayuda={`Por debajo avisa. Vacío = el de la tienda (${(tienda?.ajustes as Record<string, unknown>)?.umbral_material_defecto ?? 0}).`}>
        <Input className="h-7 w-[140px]" inputMode="decimal" disabled={soloLectura} value={f.umbral} onChange={(e) => setF({ ...f, umbral: e.target.value })} />
      </FormRow>
      <FormRow label={`Unidad de pedido (${aj.unidad})`} ayuda="Lo que vende el proveedor de una vez (un rollo de 50…). Vacío = la del proveedor.">
        <Input className="h-7 w-[140px]" inputMode="decimal" disabled={soloLectura} value={f.unidad_pedido} onChange={(e) => setF({ ...f, unidad_pedido: e.target.value })} />
      </FormRow>
      <FormRow label="Ubicación"><Input className="h-7" disabled={soloLectura} value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })} placeholder="Estantería, cajón…" /></FormRow>
      <FormRow label="Notas"><Textarea disabled={soloLectura} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></FormRow>
      {!nuevo && <FormRow label="Estado"><Interruptor checked={f.activo} disabled={soloLectura} onChange={(v) => setF({ ...f, activo: v })} label={f.activo ? 'Activo: se puede elegir' : 'Inactivo: no sale al elegir'} /></FormRow>}
      {m && typeof m !== 'string' && <p className="text-sm text-fg-3">Stock {cant(m.stock, aj.unidad)}. El stock no se escribe aquí: cambia con pedidos, recepciones y consumos (o «Corregir stock» en la tabla).</p>}
      {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
      {!soloLectura && (
        <div className="sticky bottom-0 -mx-5 mt-auto flex justify-end gap-1.5 border-t border-border bg-bg px-5 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} cargando={busy}>Guardar</Button>
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------------ Pedidos ------------------------------ */
interface Propuesta { m: MaterialEstado; pedir: string; incluir: boolean; lineas: LineaMaterial[] }

function Pedidos({ mats, lineas, pedidos, provs, puedeEditar, onCambio }: {
  mats: MaterialEstado[]; lineas: LineaMaterial[]; pedidos: LineaPedido[]; provs: ProveedorFila[]; puedeEditar: boolean; onCambio: () => Promise<void>
}) {
  const { tienda, vocab, gr } = useAuth()
  const aj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const avisar = useAvisos()
  const [prop, setProp] = React.useState<Record<string, Propuesta>>({})
  const [filtro, setFiltro] = React.useState<'camino' | 'todos'>('camino')
  const [recibir, setRecibir] = React.useState<LineaPedido | null>(null)
  const [cerrar, setCerrar] = React.useState<LineaPedido | null>(null)
  const [motivoCerrar, setMotivoCerrar] = React.useState('')
  const [resto, setResto] = React.useState<{ m: MaterialEstado; cantidad: number } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [texto, setTexto] = React.useState<string | null>(null)

  // Propuesta: lo que hace falta para cubrir lo pedido por los encargos más el umbral, redondeado a la unidad de pedido
  React.useEffect(() => {
    setProp((viejo) => {
      const nuevo: Record<string, Propuesta> = {}
      for (const m of mats) {
        if (!m.activo) continue
        const p = propuestaPedido(m)
        if (p.pedir <= 0) continue
        nuevo[m.id] = { m, pedir: viejo[m.id]?.pedir ?? String(p.pedir), incluir: viejo[m.id]?.incluir ?? true, lineas: lineas.filter((l) => l.material_id === m.id && l.estado === 'PENDIENTE') }
      }
      return nuevo
    })
  }, [mats, lineas])

  const porProv = new Map<string, Propuesta[]>()
  for (const p of Object.values(prop)) { const k = p.m.proveedor_id ?? ''; porProv.set(k, [...(porProv.get(k) ?? []), p]) }
  const nombreProv = (id: string) => provs.find((p) => p.id === id)?.nombre ?? 'Sin proveedor'

  function textoPedido(provId: string, xs: Propuesta[]) {
    return `Hola${provId ? ` ${nombreProv(provId)}` : ''}, te hago un pedido:\n` + xs.filter((x) => x.incluir && n(x.pedir) > 0).map((x) => `· ${nombreMaterial(x.m)}: ${cant(n(x.pedir), aj.unidad)}`).join('\n') + `\nGracias, ${tienda?.nombre ?? ''}`
  }
  async function hacerPedido(provId: string, xs: Propuesta[]) {
    if (!tienda) return
    const sel = xs.filter((x) => x.incluir && n(x.pedir) > 0)
    if (!sel.length) { avisar({ tipo: 'aviso', texto: 'Marca al menos una línea' }); return }
    setBusy(provId)
    try {
      await crearPedido(tienda.id, provId || null, sel.map((x) => {
        // Reparto entre encargos: a cada uno lo suyo; si el pedido es «por encargo» (unidad pequeña), la unidad entera
        const u = Number(x.m.unidad_efectiva || 0)
        const porEnc = u > 0 && u <= aj.porEncargoMax
        // Solo pasan a «pedido» los encargos que quedan cubiertos (por orden de llegada) con lo pedido más lo libre del stock
        const libre = Math.max(0, Number(x.m.stock) + Number(x.m.en_camino) - (Number(x.m.demanda) - Number(x.m.demanda_sin_pedir)))
        let queda = n(x.pedir) + libre
        const cubiertos = []
        for (const l of x.lineas) {
          const c = porEnc ? Math.ceil(Number(l.cantidad) / u - 1e-9) * u : Number(l.cantidad)
          if (c > queda + 1e-9) continue
          queda -= c; cubiertos.push({ id: l.encargo_id, cantidad: c })
        }
        return { material_id: x.m.id, cantidad: n(x.pedir), encargos: cubiertos }
      }))
      avisar({ tipo: 'ok', texto: `Pedido anotado${provId ? ` a ${nombreProv(provId)}` : ''}` })
      setTexto(textoPedido(provId, xs))
      await onCambio()
    } catch (e) { avisar({ tipo: 'error', texto: mensajeError(e) }) } finally { setBusy(null) }
  }

  const visibles = pedidos.filter((p) => filtro === 'todos' || p.estado === 'PENDIENTE' || p.estado === 'PARCIAL')
  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-md font-semibold">Por pedir</h2>
        {porProv.size === 0 && <p className="m-0 text-fg-3">Nada que pedir: el stock y lo que está en camino cubren lo pedido por {gr.con('encargo', 'los')} y el umbral.</p>}
        {[...porProv.entries()].map(([provId, xs]) => (
          <div key={provId} className="flex flex-col gap-1 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{nombreProv(provId)}</span>
              <div className="flex-1" />
              <Button size="sm" onClick={async () => { const t = textoPedido(provId, xs); if (await compartir('Pedido', t) === 'no') { if (await copiarTexto(t)) avisar({ tipo: 'ok', texto: 'Texto copiado: pégalo en WhatsApp' }); else setTexto(t) } }}>
                <IconBrandWhatsapp size={13} /> Copiar texto
              </Button>
              {puedeEditar && <Button size="sm" variant="primary" cargando={busy === provId} onClick={() => hacerPedido(provId, xs)}>Anotar pedido</Button>}
            </div>
            <Table>
              <thead><Tr><Th className="w-8" /><Th>{vocab.material}</Th><Th className="text-right">Stock</Th><Th className="text-right">Necesario para {min(vocab.encargos)}</Th><Th className="text-right">Falta</Th><Th>Pedir</Th><Th>Para</Th></Tr></thead>
              <tbody>
                {xs.map((x) => {
                  const p = propuestaPedido(x.m)
                  return (
                    <Tr key={x.m.id}>
                      <Td><input type="checkbox" checked={x.incluir} onChange={(e) => setProp((s) => ({ ...s, [x.m.id]: { ...x, incluir: e.target.checked } }))} aria-label="Incluir" /></Td>
                      <Td className="font-medium">{nombreMaterial(x.m)}</Td>
                      <Td className="text-right tabular">{cant(x.m.stock, aj.unidad)}</Td>
                      <Td className="text-right tabular text-fg-2">{cant(x.m.demanda, aj.unidad)}</Td>
                      <Td className="text-right tabular text-fg-2">{cant(p.falta, aj.unidad)}</Td>
                      <Td><Input className="h-6 w-[90px]" inputMode="decimal" value={x.pedir} onChange={(e) => setProp((s) => ({ ...s, [x.m.id]: { ...x, pedir: e.target.value } }))} />
                        {x.m.unidad_efectiva ? <span className="ml-1 text-xs text-fg-3">de {x.m.unidad_efectiva} en {x.m.unidad_efectiva}</span> : <span className="ml-1 text-xs text-fg-3">sin unidad de pedido</span>}</Td>
                      <Td className="text-sm text-fg-2">{x.lineas.length ? x.lineas.map((l) => <Link key={l.id} to={`/encargos/${l.encargo_id}`} className="mr-1.5 hover:underline">{num3(l.encargo)} {l.encargo?.cliente?.nombre}</Link>) : <span className="text-fg-3">stock</span>}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-md font-semibold">Pedidos hechos</h2>
          <Segmented value={filtro} onChange={(k) => setFiltro(k as typeof filtro)} items={[{ key: 'camino', label: 'En camino', count: pedidos.filter((p) => p.estado === 'PENDIENTE' || p.estado === 'PARCIAL').length }, { key: 'todos', label: 'Todos', count: pedidos.length }]} />
        </div>
        {visibles.length === 0 ? <p className="m-0 text-fg-3">{filtro === 'camino' ? 'Nada en camino.' : 'Aún no hay pedidos.'}</p> : (
          <Table>
            <thead><Tr><Th>Fecha</Th><Th>Proveedor</Th><Th>{vocab.material}</Th><Th className="text-right">Recibido</Th><Th>Estado</Th><Th>Para</Th><Th /></Tr></thead>
            <tbody>
              {visibles.map((p) => (
                <Tr key={p.id}>
                  <Td className="text-fg-2">{fecha(p.fecha)}</Td>
                  <Td className="text-fg-2">{p.proveedor_nombre ?? '—'}</Td>
                  <Td className="font-medium">{nombreMaterial(p)}</Td>
                  <Td className="text-right tabular">{Number(p.recibido).toLocaleString(locale())} / {cant(p.cantidad, aj.unidad)}</Td>
                  <Td><Tag color={p.estado === 'RECIBIDO' ? 'green' : p.estado === 'CERRADA' ? 'gray' : p.estado === 'PARCIAL' ? 'amber' : 'blue'}>{p.estado === 'RECIBIDO' ? 'Recibido' : p.estado === 'CERRADA' ? 'Cerrado' : p.estado === 'PARCIAL' ? 'Parcial' : 'En camino'}</Tag>
                    {p.estado === 'CERRADA' && p.cerrada_motivo && <div className="text-xs text-fg-3">{p.cerrada_motivo}</div>}</Td>
                  <Td className="text-sm text-fg-2">{p.encargos.map((e) => <Link key={e.id} to={`/encargos/${e.id}`} className="mr-1.5 hover:underline">{num3(e)} {e.cliente}</Link>)}</Td>
                  <Td className="whitespace-nowrap">{p.estado !== 'RECIBIDO' && p.estado !== 'CERRADA' && <>
                    <Button size="sm" onClick={() => setRecibir(p)}>He recibido…</Button>
                    {puedeEditar && <Button size="sm" variant="ghost" onClick={() => { setCerrar(p); setMotivoCerrar('') }} title="El proveedor no servirá lo que falta: deja de contar como «en camino»">Cerrar</Button>}
                  </>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <CapaCarga texto={busy ? 'Anotando el pedido…' : null} />
      <Dialog open={!!cerrar} onOpenChange={(o) => !o && setCerrar(null)} title={`Cerrar el pedido · ${nombreMaterial(cerrar)}`}
        description={cerrar ? `Faltan ${cant(cerrar.pendiente, aj.unidad)} que ya no se esperan: dejan de contar como «en camino» y ${min(vocab.encargos)} que lo esperaban vuelven a «por pedir».` : ''}
        actions={[{ label: 'Cerrar el pedido', variant: 'danger', onClick: async () => {
          if (!cerrar) return
          try { await cerrarLineaPedido(cerrar.id, motivoCerrar); setCerrar(null); await onCambio(); avisar({ tipo: 'ok', texto: 'Pedido cerrado' }) } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
        } }]}>
        <Input placeholder="Motivo (opcional): no hay existencias, se anula…" value={motivoCerrar} onChange={(e) => setMotivoCerrar(e.target.value)} />
      </Dialog>
      <DialogoRecibir linea={recibir} unidad={aj.unidad} onClose={() => setRecibir(null)} onHecho={async (stock) => {
        const m = mats.find((x) => x.id === recibir?.material_id)
        await onCambio()
        const r = m ? restoCandidato(stock, m.unidad_efectiva, aj.umbralResto) : 0
        if (m && r > 0) setResto({ m, cantidad: r })
      }} />
      <DialogoResto resto={resto} unidad={aj.unidad} onCerrar={() => setResto(null)} onGuardar={async (r) => { await guardarResto(r.m.id, r.cantidad, 'Sobrante tras recibir'); await onCambio() }} />
      <Dialog open={texto != null} onOpenChange={(o) => !o && setTexto(null)} title="Texto del pedido" description="Cópialo y mándalo por WhatsApp o correo." actions={[{ label: 'Copiar', onClick: async () => { if (texto && await copiarTexto(texto)) { avisar({ tipo: 'ok', texto: 'Copiado' }); setTexto(null) } } }]}>
        <Textarea className="min-h-[140px]" readOnly value={texto ?? ''} onFocus={(e) => e.currentTarget.select()} />
      </Dialog>
    </div>
  )
}

export function DialogoRecibir({ linea, unidad, onClose, onHecho }: { linea: LineaPedido | null; unidad: string; onClose: () => void; onHecho: (stock: number) => Promise<void> }) {
  const { vocab } = useAuth()
  const avisar = useAvisos()
  const [v, setV] = React.useState(''); const [asignar, setAsignar] = React.useState(true); const [err, setErr] = React.useState<string | null>(null)
  const vivos = (linea?.encargos ?? []).filter((e) => e.activo !== false)
  React.useEffect(() => { if (linea) { setV(String(linea.pendiente)); setAsignar(linea.encargos.some((e) => e.activo !== false)); setErr(null) } }, [linea])
  return (
    <Dialog open={!!linea} onOpenChange={(o) => !o && onClose()} title={`He recibido · ${nombreMaterial(linea)}`} error={err}
      description={linea ? `Pedido ${cant(linea.cantidad, unidad)}; faltan ${cant(linea.pendiente, unidad)}. Puedes recibir por partes o más de lo pedido.` : ''}
      actions={[{ label: 'Recibir', onClick: async () => {
        if (!linea) return
        const x = n(v)
        if (!(x > 0)) { setErr('Indica cuánto ha llegado'); return }
        try {
          const r = await recibirLinea(linea.id, x, asignar)
          avisar({ tipo: 'ok', texto: `Recibido ${cant(x, unidad)}${r.asignados ? ` · asignado a ${r.asignados} ${r.asignados === 1 ? min(vocab.encargo) : min(vocab.encargos)}` : ''} · stock ${cant(r.stock, unidad)}` })
          onClose(); await onHecho(Number(r.stock))
        } catch (e) { setErr(mensajeError(e)) }
      } }]}>
      <FormRow label={`Ha llegado (${unidad})`}><Input className="h-7 w-[140px]" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></FormRow>
      {linea && vivos.length > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={asignar} onChange={(e) => setAsignar(e.target.checked)} />
          <span>Asignarlo ya a sus {min(vocab.encargos)} ({vivos.map((e) => num3(e)).join(', ')}): cuenta como recibido y se descuenta del stock.</span>
        </label>
      )}
    </Dialog>
  )
}

/* ------------------------------ Movimientos ------------------------------ */
const TIPO_MOV: Record<Movimiento['tipo'], string> = { PEDIDO: 'Pedido', RECEPCION: 'Recepción', CONSUMO: 'Consumo', AJUSTE: 'Ajuste', RESTO: 'Resto', REVERSO: 'Revertido' }

function Movimientos({ mats, puedeEditar, unidad, onCambio }: { mats: MaterialEstado[]; puedeEditar: boolean; unidad: string; onCambio: () => Promise<void> }) {
  const { tienda, vocab, gr } = useAuth()
  const avisar = useAvisos()
  const [mat, setMat] = React.useState('')
  const [movs, setMovs] = React.useState<Movimiento[] | null>(null)
  const cargar = React.useCallback(async () => { if (tienda) setMovs(await listarMovimientos(tienda.id, mat || undefined)) }, [tienda, mat])
  React.useEffect(() => { cargar().catch((x) => avisar({ tipo: 'error', texto: mensajeError(x) })) }, [cargar, avisar])
  async function revertir(m: Movimiento) {
    try { await revertirMovimiento(m.id); await Promise.all([cargar(), onCambio()]); avisar({ tipo: 'ok', texto: 'Movimiento revertido' }) } catch (e) { avisar({ tipo: 'error', texto: mensajeError(e) }) }
  }
  const nom = (id: string) => nombreMaterial(mats.find((m) => m.id === id))
  return (
    <>
      <div className="flex h-11 items-center gap-3 border-b border-border-light px-4">
        <Select className="w-[260px]" value={mat} onChange={(e) => setMat(e.target.value)} aria-label={vocab.material}>
          <option value="">{gr.Con('material', 'todos')}</option>
          {mats.map((m) => <option key={m.id} value={m.id}>{nombreMaterial(m)}</option>)}
        </Select>
        <span className="text-sm text-fg-3">Cada cambio de stock queda aquí. Los últimos 300.</span>
      </div>
      {movs === null ? <p className="p-4 text-fg-3">Cargando…</p> : movs.length === 0 ? <p className="p-6 text-center text-fg-3">Sin movimientos.</p> : (
        <Table>
          <thead><Tr><Th>Fecha</Th><Th>{vocab.material}</Th><Th>Tipo</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Efecto en stock</Th><Th>Nota</Th><Th /></Tr></thead>
          <tbody>
            {movs.map((m) => (
              <Tr key={m.id} className={cn(m.revertido && 'opacity-55')}>
                <Td className="whitespace-nowrap text-fg-2">{new Date(m.fecha).toLocaleString(locale(), { timeZone: zona(), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Td>
                <Td>{nom(m.material_id)}</Td>
                <Td><Tag color={m.tipo === 'CONSUMO' ? 'blue' : m.tipo === 'RECEPCION' ? 'green' : m.tipo === 'REVERSO' ? 'gray' : 'amber'}>{TIPO_MOV[m.tipo]}</Tag>{m.revertido && <span className="ml-1 text-xs text-fg-3">revertido</span>}</Td>
                <Td className="text-right tabular">{cant(m.cantidad, unidad)}</Td>
                <Td className={cn('text-right tabular', Number(m.delta) > 0 ? 'text-ok-fg' : Number(m.delta) < 0 ? 'text-danger-fg' : 'text-fg-3')}>{Number(m.delta) === 0 ? '—' : `${Number(m.delta) > 0 ? '+' : ''}${Number(m.delta).toLocaleString('es-ES')}`}</Td>
                <Td className="text-sm text-fg-2">{m.encargo_id && <Link to={`/encargos/${m.encargo_id}`} className="mr-1 underline">{min(vocab.encargo)}</Link>}{m.notas}</Td>
                <Td>{puedeEditar && !m.revertido && (m.tipo === 'RECEPCION' || m.tipo === 'AJUSTE') && <Button size="sm" variant="ghost" onClick={() => revertir(m)}>Revertir</Button>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}

/* ------------------------------ Restos ------------------------------ */
function Restos({ mats, restos, unidad, onCambio }: { mats: MaterialEstado[]; restos: Resto[]; unidad: string; onCambio: () => Promise<void> }) {
  const { vocab } = useAuth()
  const avisar = useAvisos()
  const [editar, setEditar] = React.useState<Resto | null>(null)
  const [usado, setUsado] = React.useState<Resto | null>(null)
  const [v, setV] = React.useState('')
  const total = restos.reduce((a, r) => a + Number(r.cantidad), 0)
  const porMat = new Map<string, Resto[]>()
  for (const r of restos) porMat.set(r.material_id, [...(porMat.get(r.material_id) ?? []), r])
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="m-0 rounded-sm bg-bg-3 px-3 py-2 text-sm text-fg-2">
        Los restos son sobrantes que ya no llegan a una unidad de pedido. <b>No cuentan en el stock</b> ni en los avisos: úsalos para arreglos o trabajos pequeños y dalos por usados cuando se acaben.
      </p>
      <span className="text-sm text-fg-3">{restos.length} restos · {cant(total, unidad)} en total</span>
      {restos.length === 0 ? <p className="m-0 text-fg-3">No hay restos guardados.</p> : (
        <Table>
          <thead><Tr><Th>{vocab.material}</Th><Th className="text-right">Cantidad</Th><Th>Origen</Th><Th>Fecha</Th><Th /></Tr></thead>
          <tbody>
            {[...porMat.entries()].map(([mid, rs]) => rs.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{nombreMaterial(mats.find((m) => m.id === mid))}</Td>
                <Td className="text-right tabular">{cant(r.cantidad, unidad)}</Td>
                <Td className="text-sm text-fg-2">{r.encargo_id ? <Link to={`/encargos/${r.encargo_id}`} className="hover:underline">{r.origen ?? 'Encargo'}</Link> : r.origen ?? '—'}</Td>
                <Td className="text-fg-2">{fecha(r.fecha)}</Td>
                <Td className="whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => { setEditar(r); setV(String(r.cantidad)) }}>Corregir</Button>
                  <Button size="sm" variant="ghost" onClick={() => setUsado(r)}>Usado</Button>
                </Td>
              </Tr>
            )))}
          </tbody>
        </Table>
      )}
      <Dialog open={!!editar} onOpenChange={(o) => !o && setEditar(null)} title="Corregir resto" description="La cantidad que queda de verdad. Si pones 0 se da por usado."
        actions={[{ label: 'Guardar', onClick: async () => {
          if (!editar) return
          try { await cambiarResto(editar.id, n(v) || 0); await onCambio(); setEditar(null) } catch (e) { avisar({ tipo: 'error', texto: mensajeError(e) }) }
        } }]}>
        <FormRow label={`Cantidad (${unidad})`}><Input className="h-7 w-[140px]" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></FormRow>
      </Dialog>
      <Dialog open={!!usado} onOpenChange={(o) => !o && setUsado(null)} title="Dar por usado"
        description={usado ? `${nombreMaterial(mats.find((m) => m.id === usado.material_id))}: ${cant(usado.cantidad, unidad)}. Deja de aparecer en «Restos».` : ''}
        actions={[{ label: 'Dar por usado', onClick: async () => {
          if (!usado) return
          try { await cambiarResto(usado.id, 0); await onCambio(); setUsado(null) } catch (e) { avisar({ tipo: 'error', texto: mensajeError(e) }) }
        } }]} />
    </div>
  )
}

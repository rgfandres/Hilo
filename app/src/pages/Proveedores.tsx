import * as React from 'react'
import { nombreMenu } from '@/lib/pantallas'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { IconMail, IconPhone } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { ajustesMaterial, guardarUnidadProveedor, unidadesProveedor } from '@/data/materiales'
import { encargosDeProveedor, errorNombre, guardarProveedor, haceEncargos, listarProveedoresCat, obtenerProveedor, vendeMaterial, type ProveedorFila, type TipoProveedor } from '@/data/catalogos'
import { listarEtapas, mensajeError } from '@/data/encargos'
import { leerNumero } from '@/data/config'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { Button, Dialog, Field, FormRow, Input, SectionLabel, Select, Sheet, Table, Tabs, Tag, Td, Textarea, Th, Tr, tagColorFromHex } from '@/ui'
import { Interruptor } from '@/pages/ajustes/Ajustes'
import { num3 } from '@/lib/utils'
import { min } from '@/lib/vocab'

/** Lista de proveedores con lo que tiene cada uno en su mano. */
export function Proveedores() {
  const { tienda, vocab, gr, rol } = useAuth()
  const nav = useNavigate()
  const puedeEditar = rol === 'ADMIN' || rol === 'OPERATIVO'
  const [lista, setLista] = React.useState<ProveedorFila[] | null>(null)
  const [inactivos, setInactivos] = React.useState(false)
  const [nuevo, setNuevo] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const cargar = React.useCallback(async () => { if (tienda) setLista(await listarProveedoresCat(tienda.id)) }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  // Con materiales: dos listas, los que hacen encargos y los que venden material
  const matAj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const [sp, setSp] = useSearchParams()
  const deMaterial = matAj.activo && sp.get('t') === 'material'
  const tituloMat = `Proveedores de ${min(vocab.material)}`
  const delTipo = (lista ?? []).filter((p) => (deMaterial ? vendeMaterial(p) : haceEncargos(p)))
  const visibles = delTipo.filter((p) => inactivos || p.activo)
  const nInactivos = delTipo.filter((p) => !p.activo).length
  return (
    <>
      <PageHeader title={deMaterial ? tituloMat : nombreMenu(tienda?.ajustes as Record<string, unknown>, 'proveedores', vocab.proveedores)} subtitle={lista ? `${visibles.length}` : undefined}>
        {puedeEditar && <Button variant="primary" onClick={() => setNuevo(true)}>+ {deMaterial ? 'Proveedor' : vocab.proveedor}</Button>}
      </PageHeader>
      {matAj.activo && (
        <Tabs value={deMaterial ? 'material' : 'encargos'} onChange={(k) => setSp(k === 'material' ? { t: 'material' } : {}, { replace: true })} items={[
          { key: 'encargos', label: vocab.proveedores, count: (lista ?? []).filter((p) => p.activo && haceEncargos(p)).length },
          { key: 'material', label: tituloMat, count: (lista ?? []).filter((p) => p.activo && vendeMaterial(p)).length },
        ]} />
      )}
      {(nInactivos > 0 || err) && (
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-light px-4">
          {nInactivos > 0 && <Interruptor checked={inactivos} onChange={setInactivos} label={`Ver inactiv${gr.o('proveedor', true)} (${nInactivos})`} />}
          {err && <span className="inline-flex items-center gap-2 rounded-sm bg-danger-bg px-2 py-0.5 text-sm text-danger-fg">{err}<button className="font-medium underline" onClick={() => { setErr(null); cargar().catch((x) => setErr(mensajeError(x))) }}>Reintentar</button></span>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {deMaterial ? (
          <Table>
            <thead><tr><Th className="w-[240px]">Nombre</Th><Th className="w-[180px]">Unidad de pedido</Th><Th className="w-[150px]">Teléfono</Th><Th>Correo</Th></tr></thead>
            <tbody>
              {visibles.map((p) => (
                <Tr key={p.id} className="cursor-pointer" onClick={() => nav(`/proveedores/${p.id}`)}>
                  <Td className="titular font-medium">{p.nombre}{!p.activo && <Tag color="gray" className="ml-2">inactivo</Tag>}{p.tipo === 'AMBOS' && <Tag color="gray" className="ml-2">también {min(vocab.proveedor)}</Tag>}{p.asignable === false && <Tag color="gray" className="ml-2">no se asigna</Tag>}</Td>
                  <Td className="text-fg-2 tabular">{p.unidad_pedido ? `${Number(p.unidad_pedido).toLocaleString('es-ES')} ${matAj.unidad}` : <span className="text-fg-3">—</span>}</Td>
                  <Td className="text-fg-2">{p.telefono ?? <span className="text-fg-3">—</span>}</Td>
                  <Td className="text-fg-2">{p.email_contacto ?? <span className="text-fg-3">—</span>}</Td>
                </Tr>
              ))}
              {lista && visibles.length === 0 && <tr><td colSpan={4} className="h-24 text-center text-fg-3">Todavía no hay proveedores de {min(vocab.material)}.</td></tr>}
            </tbody>
          </Table>
        ) : (
        <Table>
          <thead><tr>
            <Th className="w-[240px]">Nombre</Th><Th className="w-[140px]">En su mano</Th><Th className="w-[120px]" title="Demasiados días en su mano">Atascados</Th><Th className="w-[140px]" title="En curso, sin contar lo terminado">Asignados</Th>
            <Th className="w-[150px]">Teléfono</Th><Th>Acceso al portal</Th>
          </tr></thead>
          <tbody>
            {visibles.map((p) => (
              <Tr key={p.id} className="cursor-pointer" onClick={() => nav(`/proveedores/${p.id}`)}>
                <Td className="titular font-medium">{p.nombre}{!p.activo && <Tag color="gray" className="ml-2">inactiv{gr.o('proveedor')}</Tag>}</Td>
                <Td>{p.en_su_mano > 0 ? <span className="font-medium">{p.en_su_mano}</span> : <span className="text-fg-3">—</span>}</Td>
                <Td>{p.atascados ? <span className="font-medium text-danger-fg">{p.atascados}</span> : <span className="text-fg-3">—</span>}</Td>
                <Td className="text-fg-2">{p.asignados || <span className="text-fg-3">—</span>}</Td>
                <Td className="text-fg-2">{p.telefono ?? <span className="text-fg-3">—</span>}</Td>
                <Td className="text-fg-3">{p.accesos === 0 ? 'sin acceso' : `${p.accesos} ${p.accesos === 1 ? 'correo' : 'correos'}`}</Td>
              </Tr>
            ))}
            {lista && visibles.length === 0 && <tr><td colSpan={6} className="h-24 text-center text-fg-3">{lista.length ? `Tod${gr.o('proveedor', true)} están inactiv${gr.o('proveedor', true)}: activa «Ver inactiv${gr.o('proveedor', true)}» para verl${gr.o('proveedor', true)}.` : `Todavía no hay ${min(vocab.proveedores)}.`}</td></tr>}
          </tbody>
        </Table>
        )}
      </div>
      <EditarProveedor open={nuevo} p={null} tipoNuevo={deMaterial ? 'MATERIAL' : 'ENCARGOS'} lista={lista ?? []} onClose={() => setNuevo(false)} onSaved={(id) => nav(`/proveedores/${id}`)} />
    </>
  )
}

/** Ficha del proveedor: contacto, lo que tiene ahora mismo y accesos a su portal. */
export function Proveedor() {
  const { id } = useParams()
  const { tienda, vocab, gr, rol } = useAuth()
  const nav = useNavigate()
  const puedeEditar = rol === 'ADMIN' || rol === 'OPERATIVO'
  const [p, setP] = React.useState<ProveedorFila | null | undefined>(undefined)
  const [encs, setEncs] = React.useState<EncargoEstado[]>([])
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [lista, setLista] = React.useState<ProveedorFila[]>([])
  const [editar, setEditar] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const cargar = React.useCallback(async () => {
    if (!id || !tienda) return
    const [x, e, et, l] = await Promise.all([obtenerProveedor(id), encargosDeProveedor(id), listarEtapas(tienda.id), listarProveedoresCat(tienda.id)])
    setP(x); setEncs(e); setEtapas(et); setLista(l)
  }, [id, tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  if (p === undefined) return <div className="p-8 text-fg-3">{err ?? 'Cargando…'}</div>
  if (p === null) return <div className="p-8 text-fg-3">No se encuentra {gr.con('proveedor', 'este')}.</div>
  const et = (e: EncargoEstado) => etapas.find((x) => x.id === e.etapa_actual_id)
  // «En su mano»: la etapa actual la ve el proveedor y todavía queda otra visible por delante
  const enSuMano = (e: EncargoEstado) => {
    const a = et(e); if (!a?.visible_para_proveedor) return false
    return etapas.some((x) => x.tipo_encargo_id === e.tipo_encargo_id && x.visible_para_proveedor && x.orden > a.orden)
  }
  const ahora = encs.filter((e) => !e.es_final && enSuMano(e))
  // Mismo criterio que la lista: lo terminado no cuenta como asignado
  const resto = encs.filter((e) => !e.es_final && !ahora.includes(e))

  const tabla = (lista: EncargoEstado[]) => (
    <Table>
      <thead><tr><Th className="w-12">Nº</Th><Th className="w-[200px]">{vocab.cliente}</Th><Th className="w-[160px]">{vocab.producto}</Th><Th className="w-[200px]">Etapa</Th><Th>En la etapa</Th></tr></thead>
      <tbody>
        {lista.map((e) => (
          <Tr key={e.id} className="cursor-pointer" onClick={() => nav(`/encargos/${e.id}`)}>
            <Td className="titular text-fg-3 tabular">{num3(e)}</Td>
            <Td className="titular font-medium">{e.cliente_nombre}</Td>
            <Td>{e.producto_nombre ?? <span className="text-fg-3">—</span>}</Td>
            <Td>{e.en_revision ? <Tag color="red">Incidencia</Tag> : <Tag color={tagColorFromHex(et(e)?.color)}>{e.etapa_actual_nombre ?? 'Sin empezar'}</Tag>}</Td>
            <Td className={e.atascado ? 'text-danger-fg' : 'text-fg-3'}>{e.dias_en_etapa == null ? '—' : `${e.dias_en_etapa} ${e.dias_en_etapa === 1 ? 'día' : 'días'}`}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )

  return (
    <>
      <PageHeader title={<span><Link to="/proveedores" className="text-fg-3">{vocab.proveedores}</Link><span className="mx-2 text-border-strong">/</span>{p.nombre}</span>}>
        {rol === 'ADMIN' && <Button variant="ghost" asChild><Link to={`/portal?proveedor=${p.id}`}>Ver su portal</Link></Button>}
        {puedeEditar && <Button variant="ghost" onClick={() => setEditar(true)}>Editar</Button>}
      </PageHeader>
      <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
        <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-auto border-r border-border p-5 max-md:w-full max-md:overflow-visible max-md:border-b max-md:border-r-0 max-md:p-4">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-xl font-semibold tracking-tight">{p.nombre}{!p.activo && <Tag color="gray">inactiv{gr.o('proveedor')}</Tag>}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.telefono && <Button size="sm" asChild><a href={`tel:${p.telefono.replace(/\s/g, '')}`}><IconPhone size={13} /> Llamar</a></Button>}
            {p.email_contacto && <Button size="sm" asChild><a href={`mailto:${p.email_contacto}`}><IconMail size={13} /> Correo</a></Button>}
          </div>
          <div className="flex flex-col">
            <Field label="Teléfono">{p.telefono ?? '—'}</Field>
            <Field label="Correo">{p.email_contacto ?? '—'}</Field>
            <Field label="Acceso al portal">{p.accesos === 0 ? 'sin acceso' : `${p.accesos} ${p.accesos === 1 ? 'correo' : 'correos'}`}</Field>
          </div>
          {rol === 'ADMIN' && <Link to="/ajustes/proveedores" className="text-sm text-fg-3 hover:text-fg">Gestionar los correos con acceso en Ajustes →</Link>}
          {p.notas && <div className="flex flex-col gap-1"><SectionLabel>Notas</SectionLabel><p className="whitespace-pre-wrap text-fg-2">{p.notas}</p></div>}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col overflow-auto">
          <div className="flex h-9 shrink-0 items-center border-b border-border px-5 font-medium">En su mano <span className="ml-1.5 text-fg-3">{ahora.length}</span></div>
          {ahora.length ? tabla(ahora) : <p className="px-5 py-4 text-fg-3">Ahora mismo no tiene nada.</p>}
          <div className="flex h-9 shrink-0 items-center border-y border-border px-5 font-medium">Otros asignados <span className="ml-1.5 text-fg-3">{resto.length}</span></div>
          {resto.length ? tabla(resto) : <p className="px-5 py-4 text-fg-3">—</p>}
        </section>
      </div>
      <EditarProveedor open={editar} p={p} lista={lista} onClose={() => setEditar(false)} onSaved={() => { cargar() }} />
    </>
  )
}

function EditarProveedor({ open, p, lista, onClose, onSaved, tipoNuevo = 'ENCARGOS' }: {
  open: boolean; p: ProveedorFila | null; lista: ProveedorFila[]; onClose: () => void; onSaved: (id: string) => void; tipoNuevo?: TipoProveedor
}) {
  const { tienda, vocab, gr } = useAuth()
  const [f, setF] = React.useState({ nombre: '', tel: '', email: '', notas: '', activo: true, tipo: 'ENCARGOS' as TipoProveedor, asignable: true })
  const idCreado = React.useRef<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirmar, setConfirmar] = React.useState(false)
  const matAj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const [unidad, setUnidad] = React.useState('')
  // Unidad tal como llegó: si aún no ha llegado (o no se pudo leer) no se toca al guardar
  const unidadIni = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setUnidad(''); unidadIni.current = p ? null : ''
    if (p && tienda && matAj.activo) unidadesProveedor(tienda.id).then((u) => { const v = u[p.id] == null ? '' : String(u[p.id]).replace('.', ','); unidadIni.current = v; setUnidad(v) }).catch(() => {})
    setF(p ? { nombre: p.nombre, tel: p.telefono ?? '', email: p.email_contacto ?? '', notas: p.notas ?? '', activo: p.activo, tipo: p.tipo ?? 'ENCARGOS', asignable: p.asignable !== false } : { nombre: '', tel: '', email: '', notas: '', activo: true, tipo: tipoNuevo, asignable: true })
    setErr(null)
  }, [open, p])

  async function guardar(confirmado = false) {
    if (!tienda) return
    const nombre = f.nombre.trim()
    if (!nombre) { setErr('El nombre es obligatorio'); return }
    if (lista.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== p?.id)) { setErr(`Ya existe ${gr.con('proveedor', 'un')} con ese nombre`); return }
    if (p && p.activo && !f.activo && !confirmado) { setConfirmar(true); return }
    setBusy(true); setErr(null)
    try {
      const u = unidad.trim() ? (leerNumero(unidad) ?? NaN) : null
      if (u != null && !(u > 0)) throw new Error('La unidad de pedido no es válida')
      const id = await guardarProveedor(tienda.id, p?.id ?? idCreado.current, { nombre, telefono: f.tel.trim() || null, email_contacto: f.email.trim() || null, notas: f.notas.trim() || null, activo: f.activo, asignable: f.asignable, ...(matAj.activo ? { tipo: f.tipo } : {}) })
      idCreado.current = id   // si el segundo paso falla, reintentar edita este y no crea otro
      if (matAj.activo && unidadIni.current !== null && unidad !== unidadIni.current) await guardarUnidadProveedor(id, u)
      onSaved(id); onClose()
    } catch (x) { setErr(errorNombre(mensajeError(x), gr.con('proveedor', 'un'))) } finally { setBusy(false) }
  }
  const titulo = p ? `Editar ${min(vocab.proveedor)}` : gr.Con('proveedor', 'nuevo')
  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()} side="right" title={titulo} className="flex flex-col gap-4 overflow-auto">
        <div className="text-md font-semibold">{titulo}</div>
        <div className="flex flex-col gap-1">
          <FormRow label="Nombre *"><Input className="h-7" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></FormRow>
          <FormRow label="Teléfono"><Input className="h-7" type="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} /></FormRow>
          <FormRow label="Correo"><Input className="h-7" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Para contactar (no da acceso)" /></FormRow>
          {matAj.activo && <FormRow label="Qué hace" ayuda={`A quien hace ${min(vocab.encargos)} se le pueden asignar; a quien vende ${min(vocab.material)}, pedírselo.`}>
            <Select className="w-[240px]" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoProveedor })}>
              <option value="ENCARGOS">Hace {min(vocab.encargos)} ({min(vocab.proveedor)})</option>
              <option value="MATERIAL">Vende {min(vocab.material)}</option>
              <option value="AMBOS">Las dos cosas</option>
            </Select>
          </FormRow>}
          {matAj.activo && <FormRow label={`Unidad de pedido (${matAj.unidad})`} ayuda={`Lo que vende de una vez (un rollo de 50…). Se usa para redondear los pedidos de ${min(vocab.material)}.`}>
            <Input className="h-7 w-[140px]" inputMode="decimal" value={unidad} onChange={(e) => { setUnidad(e.target.value); if (unidadIni.current === null) unidadIni.current = '\u0000' }} placeholder="Opcional" /></FormRow>}
          {f.tipo !== 'MATERIAL' && <FormRow label="Se elige en" ayuda={`Apágalo para quien trabaja sin que se le asignen ${min(vocab.encargos)} (por ejemplo, quien corta por la hoja de producción).`}>
            <Interruptor checked={f.asignable} onChange={(v) => setF({ ...f, asignable: v })} label={f.asignable ? `Se le pueden asignar ${min(vocab.encargos)}` : `No sale para elegirl${gr.o('proveedor')}`} />
          </FormRow>}
          {p && <FormRow label="Estado"><Interruptor checked={f.activo} onChange={(v) => setF({ ...f, activo: v })} label={f.activo ? `Activ${gr.o('proveedor')}` : `Inactiv${gr.o('proveedor')}: no se le asigna nada ni entra`} /></FormRow>}
        </div>
        <div className="flex flex-col gap-1"><SectionLabel>Notas</SectionLabel><Textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Opcional: especialidad, plazos, precios…" /></div>
        {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
        <div className="sticky bottom-0 -mx-5 mt-auto flex justify-end gap-1.5 border-t border-border bg-bg px-5 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={() => guardar()} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </Sheet>
      <Dialog open={confirmar} onOpenChange={setConfirmar} title={`Dejar ${gr.con('proveedor', 'el')} inactiv${gr.o('proveedor')}`}
        description={`No se le podrán asignar ${min(vocab.encargos)} nuev${gr.o('encargo', true)} y sus correos dejarán de entrar al portal. Lo que ya tiene asignado no cambia.`}
        actions={[{ label: 'Dejar inactiv' + gr.o('proveedor'), onClick: async () => { setConfirmar(false); await guardar(true) } }]} />
    </>
  )
}

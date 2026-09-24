import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconBrandWhatsapp, IconMail, IconPhone, IconSearch } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import {
  actualizarClienteCat, crearCliente, encargosDeCliente, listarClientesCat, obtenerCliente, type ClienteFila,
} from '@/data/catalogos'
import { camposDe, plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { listarEtapas, mensajeError } from '@/data/encargos'
import { telefonoWhatsApp } from '@/data/mensajes'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { CamposForm, CamposVista, aTexto, limpiar } from '@/components/CampoInput'
import { HistorialCliente } from '@/components/HistorialMedidas'
import { Button, Field, FormRow, Input, SectionLabel, Sheet, Table, Tag, Td, Textarea, Th, Tr, tagColorFromHex } from '@/ui'
import { fechaCorta, num3 } from '@/lib/utils'
import { min } from '@/lib/vocab'


/** Lista de clientes: búsqueda en vivo (nombre, teléfono o correo), 50 por página. */
export function Clientes() {
  const { tienda, vocab, gr, rol } = useAuth()
  const [reintento, setReintento] = React.useState(0)
  const POR_PAGINA = Number((tienda?.ajustes as Record<string, unknown> | undefined)?.tamano_pagina ?? 50)
  const nav = useNavigate()
  const puedeCrear = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'
  const [q, setQ] = React.useState('')
  const [pagina, setPagina] = React.useState(0)
  const [res, setRes] = React.useState<{ filas: ClienteFila[]; total: number } | null>(null)
  const [nuevo, setNuevo] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => { setPagina(0) }, [q])
  React.useEffect(() => {
    if (!tienda) return
    const t = setTimeout(() => { listarClientesCat(tienda.id, q, pagina, POR_PAGINA).then(setRes).catch((x) => setErr(mensajeError(x))) }, 200)
    return () => clearTimeout(t)
  }, [tienda, q, pagina, POR_PAGINA, reintento])

  const paginas = res ? Math.max(1, Math.ceil(res.total / POR_PAGINA)) : 1
  return (
    <>
      <PageHeader title={vocab.clientes} subtitle={res ? `${res.total} ${res.total === 1 ? min(vocab.cliente) : min(vocab.clientes)}` : undefined}>
        {puedeCrear && <Button variant="primary" onClick={() => setNuevo(true)}>+ {vocab.cliente}</Button>}
      </PageHeader>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-light px-4">
        <div className="relative w-[320px]">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <Input className="h-7 pl-8" placeholder="Buscar por nombre, teléfono o correo" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        {err && <span className="inline-flex items-center gap-2 rounded-sm bg-danger-bg px-2 py-0.5 text-sm text-danger-fg">{err}<button className="font-medium underline" onClick={() => { setErr(null); setReintento((n) => n + 1) }}>Reintentar</button></span>}
        <div className="flex-1" />
        {paginas > 1 && (
          <div className="flex items-center gap-2 text-sm text-fg-3">
            <Button size="sm" variant="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            Página {pagina + 1} de {paginas}
            <Button size="sm" variant="ghost" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <thead><tr>
            <Th className="w-[240px]">Nombre</Th><Th className="w-[150px]">Teléfono</Th><Th className="w-[220px]">Correo</Th>
            <Th className="w-[140px]">{vocab.encargos}</Th><Th>Último</Th>
          </tr></thead>
          <tbody>
            {res?.filas.map((c) => (
              <Tr key={c.id} className="cursor-pointer" onClick={() => nav(`/clientes/${c.id}`)}>
                <Td className="titular font-medium">{c.nombre}</Td>
                <Td className="text-fg-2">{c.telefono ?? <span className="text-fg-3">—</span>}</Td>
                <Td className="text-fg-2">{c.email ?? <span className="text-fg-3">—</span>}</Td>
                <Td className="text-fg-2">{c.encargos === 0 ? <span className="text-fg-3">—</span> : <>{c.encargos}{c.en_curso > 0 && <span className="text-fg-3"> · {c.en_curso} en curso</span>}</>}</Td>
                <Td className="text-fg-3">{c.ultimo_encargo ? fechaCorta(c.ultimo_encargo) : '—'}</Td>
              </Tr>
            ))}
            {res && res.filas.length === 0 && (
              <tr><td colSpan={5} className="h-24 text-center text-fg-3">{q ? 'Nada coincide con la búsqueda.' : `Todavía no hay ${min(vocab.clientes)}.`}</td></tr>
            )}
          </tbody>
        </Table>
      </div>
      <EditarCliente open={nuevo} cliente={null} onClose={() => setNuevo(false)} onSaved={(id) => nav(`/clientes/${id}`)} titulo={gr.Con('cliente', 'nuevo')} />
    </>
  )
}

/** Ficha del cliente: contacto clicable, sus datos y todos sus encargos. */
export function Cliente() {
  const { id } = useParams()
  const { tienda, vocab, gr, rol } = useAuth()
  const puedeEditar = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'
  const [c, setC] = React.useState<ClienteFila | null | undefined>(undefined)
  const [encs, setEncs] = React.useState<EncargoEstado[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [editar, setEditar] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const nav = useNavigate()

  const cargar = React.useCallback(async () => {
    if (!id || !tienda) return
    const [cl, e, p, et] = await Promise.all([obtenerCliente(id), encargosDeCliente(id), plantillas(tienda.id), listarEtapas(tienda.id)])
    setC(cl); setEncs(e); setPs(p); setEtapas(et)
  }, [id, tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  if (c === undefined) return <div className="p-8 text-fg-3">{err ?? 'Cargando…'}</div>
  if (c === null) return <div className="p-8 text-fg-3">No se encuentra {gr.con('cliente', 'este')}.</div>
  const campos: Campo[] = camposDe(ps, 'CLIENTE')
  const prefijo = String((tienda?.ajustes as Record<string, unknown>)?.prefijo_telefono ?? '34')
  const wa = telefonoWhatsApp(c.telefono, prefijo)
  const color = (e: EncargoEstado) => tagColorFromHex(etapas.find((x) => x.id === e.etapa_actual_id)?.color)

  return (
    <>
      <PageHeader title={<span><Link to="/clientes" className="text-fg-3">{vocab.clientes}</Link><span className="mx-2 text-border-strong">/</span>{c.nombre}</span>}>
        {puedeEditar && <Button variant="ghost" onClick={() => setEditar(true)}>Editar</Button>}
        {puedeEditar && <Button variant="primary" asChild><Link to={`/encargos/nuevo?cliente=${c.id}`}>+ {vocab.encargo}</Link></Button>}
      </PageHeader>
      <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-auto border-r border-border p-5 max-md:w-full max-md:overflow-visible max-md:border-b max-md:border-r-0 max-md:p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-semibold tracking-tight">{c.nombre}</span>
            <span className="text-fg-3">{vocab.cliente} desde {fechaCorta(c.creado_en)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.telefono && <Button size="sm" asChild><a href={`tel:${c.telefono.replace(/\s/g, '')}`}><IconPhone size={13} /> Llamar</a></Button>}
            {wa && <Button size="sm" asChild><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><IconBrandWhatsapp size={13} /> WhatsApp</a></Button>}
            {c.email && <Button size="sm" asChild><a href={`mailto:${c.email}`}><IconMail size={13} /> Correo</a></Button>}
          </div>
          <div className="flex flex-col">
            <Field label="Teléfono">{c.telefono ?? '—'}</Field>
            <Field label="Correo">{c.email ?? '—'}</Field>
            <CamposVista campos={campos} datos={c.datos} />
          </div>
          <HistorialCliente clienteId={c.id} campos={campos} encargos={encs} refresco={c} />
          {c.notas && (
            <div className="flex flex-col gap-1">
              <SectionLabel>Notas</SectionLabel>
              <p className="whitespace-pre-wrap text-fg-2">{c.notas}</p>
            </div>
          )}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col max-md:min-h-[70vh]">
          <div className="flex h-9 items-center border-b border-border px-5 font-medium">{vocab.encargos} <span className="ml-1.5 text-fg-3">{encs.length}</span></div>
          <div className="min-h-0 flex-1 overflow-auto">
            {encs.length === 0 ? <p className="p-5 text-fg-3">{gr.Con('cliente', 'este')} todavía no tiene {min(vocab.encargos)}.</p> : (
              <Table>
                <thead><tr><Th className="w-12">Nº</Th><Th className="w-[180px]">{vocab.producto}</Th><Th className="w-[200px]">Etapa</Th><Th className="w-[140px]">{vocab.proveedor}</Th><Th>Creado</Th></tr></thead>
                <tbody>
                  {encs.map((e) => (
                    <Tr key={e.id} className="cursor-pointer" onClick={() => nav(`/encargos/${e.id}`)}>
                      <Td className="titular text-fg-3 tabular">{num3(e)}</Td>
                      <Td>{e.producto_nombre ?? <span className="text-fg-3">—</span>}</Td>
                      <Td>{e.estado === 'ANULADO' ? <Tag color="gray">Anulado</Tag> : e.en_revision ? <Tag color="red">Incidencia</Tag> : <Tag color={color(e)}>{e.etapa_actual_nombre ?? 'Sin empezar'}</Tag>}</Td>
                      <Td className="text-fg-2">{e.proveedor_nombre ?? <span className="text-fg-3">—</span>}</Td>
                      <Td className="text-fg-3">{fechaCorta(e.creado_en)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </section>
      </div>
      <EditarCliente open={editar} cliente={c} onClose={() => setEditar(false)} onSaved={() => { cargar() }} titulo={`Editar ${gr.con('cliente', 'el').split(' ')[1]}`} />
    </>
  )
}

/** Alta o edición de cliente (nombre obligatorio + contacto + campos configurables + notas). */
function EditarCliente({ open, cliente, onClose, onSaved, titulo }: {
  open: boolean; cliente: ClienteFila | null; onClose: () => void; onSaved: (id: string) => void; titulo: string
}) {
  const { tienda, gr } = useAuth()
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [f, setF] = React.useState({ nombre: '', tel: '', email: '', notas: '', datos: {} as Record<string, string> })
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (open && tienda) plantillas(tienda.id).then(setPs).catch(() => {}) }, [open, tienda])
  React.useEffect(() => {
    if (!open) return
    setF(cliente ? { nombre: cliente.nombre, tel: cliente.telefono ?? '', email: cliente.email ?? '', notas: cliente.notas ?? '', datos: aTexto(cliente.datos) }
      : { nombre: '', tel: '', email: '', notas: '', datos: {} })
    setErr(null)
  }, [open, cliente])
  const campos = camposDe(ps, 'CLIENTE')

  async function guardar() {
    if (!tienda) return
    if (!f.nombre.trim()) { setErr(`El nombre ${gr.con('cliente', 'del')} es obligatorio`); return }
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr('Ese correo no parece válido'); return }
    const falta = campos.filter((c) => c.obligatorio && !f.datos[c.clave])
    if (falta.length) { setErr(`Falta: ${falta.map((c) => c.etiqueta).join(', ')}`); return }
    setBusy(true); setErr(null)
    const fila = { nombre: f.nombre, telefono: f.tel.trim() || null, email: f.email.trim() || null, notas: f.notas.trim() || null, datos: limpiar(f.datos, cliente?.datos ?? {}) }
    try {
      if (cliente) { await actualizarClienteCat(cliente.id, fila); onSaved(cliente.id) }
      else { const r = await crearCliente(tienda.id, fila); onSaved(r.id) }
      onClose()
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} side="right" title={titulo} className="flex flex-col gap-4 overflow-auto">
      <div className="text-md font-semibold">{titulo}</div>
      <div className="flex flex-col gap-1">
        <FormRow label="Nombre *"><Input className="h-7" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></FormRow>
        <FormRow label="Teléfono"><Input className="h-7" type="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} /></FormRow>
        <FormRow label="Correo"><Input className="h-7" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormRow>
        <CamposForm pegar campos={campos} valores={f.datos} onCambio={(k, v) => setF((s) => ({ ...s, datos: { ...s.datos, [k]: v } }))} />
      </div>
      <div className="flex flex-col gap-1">
        <SectionLabel>Notas</SectionLabel>
        <Textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Opcional" />
      </div>
      {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
      <div className="sticky bottom-0 -mx-5 mt-auto flex justify-end gap-1.5 border-t border-border bg-bg px-5 pt-3">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Sheet>
  )
}

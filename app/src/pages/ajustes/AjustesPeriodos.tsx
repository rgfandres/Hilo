import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { min } from '@/lib/vocab'
import { activarPeriodo, actualizarPeriodo, archivarPeriodo, crearPeriodo, guardarTienda, listarPeriodos, type PeriodoFila } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { Button, Dialog, Input, Tag } from '@/ui'
import { fechaCorta } from '@/lib/utils'
import { Bloque, Estado, FilaLista, Interruptor, Lista, Pagina } from './Ajustes'

/**
 * Ajustes → Periodos (temporadas, años, campañas…).
 * Solo uno está activo: las listas, «Para hoy» y la numeración trabajan sobre él.
 * Crear uno nuevo no lo activa: se activa a mano cuando toque.
 */
export function AjustesPeriodos() {
  const { tienda, recargar, vocab, gr } = useAuth()
  const [lista, setLista] = React.useState<PeriodoFila[] | null>(null)
  const [nuevo, setNuevo] = React.useState({ nombre: '', inicio: '', fin: '' })
  const [editar, setEditar] = React.useState<PeriodoFila | null>(null)
  const [activar, setActivar] = React.useState<PeriodoFila | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [dErr, setDErr] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => { if (tienda) setLista(await listarPeriodos(tienda.id)) }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  async function archivar(p: PeriodoFila, si: boolean) {
    setErr(null); setOk(null)
    try { await archivarPeriodo(p.id, si); await cargar(); setOk(si ? `«${p.nombre}» archivad${gr.o('periodo')}: sus ${vocab.encargos.toLowerCase()} se conservan` : `«${p.nombre}» vuelve a la lista`) }
    catch (x) { setErr(mensajeError(x)) }
  }
  const nombreHoja = `la ${String((tienda?.ajustes as Record<string, unknown> | undefined)?.hoja_nombre ?? 'hoja de producción').toLowerCase()}`
  const reinicia = (tienda?.ajustes as Record<string, unknown> | undefined)?.numeracion_reinicia_por_periodo !== false

  return (
    <>
      <Pagina titulo={vocab.periodos} ayuda={`Temporadas, años o campañas. Las listas de ${vocab.encargos.toLowerCase()} muestran ${gr.con('periodo', 'el')} activ${gr.o('periodo')}.`}
        mas={`Solo puede haber ${gr.con('periodo', 'un')} activ${gr.o('periodo')} a la vez. Al cambiarl${gr.o('periodo')}, todo el equipo pasa a ver ${gr.genero.periodo === 'f' ? 'la nueva' : 'el nuevo'} y lo que se cree irá ahí; nada de lo anterior se borra.${reinicia ? ` La numeración empieza en 001 en cada ${min(vocab.periodo)}.` : ''}`} />
      <Interruptor checked={(tienda?.ajustes as Record<string, unknown> | undefined)?.solo_periodo_activo === true}
        label={`Ver solo ${gr.con('periodo', 'el')} activ${gr.o('periodo')}: lo que sigue abierto de otr${gr.o('periodo', true)} no sale en las listas, ${nombreHoja} ni en el portal de ${min(vocab.proveedores)}`}
        onChange={async (v) => {
          if (!tienda) return
          setErr(null); setOk(null)
          try { await guardarTienda(tienda.id, tienda.nombre, { ...(tienda.ajustes as Record<string, unknown>), solo_periodo_activo: v || null }); await recargar(); setOk('Guardado') }
          catch (x) { setErr(mensajeError(x)) }
        }} />
      <Bloque titulo="Lista">
        {lista == null ? <p className="text-fg-3">Cargando…</p> : lista.length === 0 ? <p className="text-fg-3">No hay {min(vocab.periodos)}: se trabaja con todo junto.</p> : (
          <>
          <Lista>
            {lista.filter((p) => !p.archivado).map((p) => (
              <FilaLista key={p.id}>
                <span className="flex-1 font-medium">{p.nombre}</span>
                <span className="text-sm text-fg-3">{p.fecha_inicio && p.fecha_fin ? `${fechaCorta(p.fecha_inicio)} – ${fechaCorta(p.fecha_fin)}` : p.fecha_inicio ? `desde ${fechaCorta(p.fecha_inicio)}` : p.fecha_fin ? `hasta ${fechaCorta(p.fecha_fin)}` : ''}</span>
                {p.activo ? <Tag color="green">Activ{gr.o('periodo')}</Tag> : <Button size="sm" onClick={() => { setActivar(p); setDErr(null) }}>Activar</Button>}
                <Button variant="ghost" size="sm" onClick={() => { setEditar(p); setDErr(null) }}>Editar</Button>
                {!p.activo && <Button variant="ghost" size="sm" title="Sale de la lista; sus encargos se conservan" onClick={() => archivar(p, true)}>Archivar</Button>}
              </FilaLista>
            ))}
          </Lista>
          {lista.some((p) => p.archivado) && (
            <details>
              <summary className="cursor-pointer text-sm text-fg-2">Archivad{gr.o('periodo', true)} ({lista.filter((p) => p.archivado).length})</summary>
              <Lista className="mt-2">
                {lista.filter((p) => p.archivado).map((p) => (
                  <FilaLista key={p.id}>
                    <span className="flex-1 text-fg-2">{p.nombre}</span>
                    <Button variant="ghost" size="sm" onClick={() => archivar(p, false)}>Sacar del archivo</Button>
                  </FilaLista>
                ))}
              </Lista>
            </details>
          )}
          </>
        )}
        <form className="flex items-center gap-2" onSubmit={async (e) => {
          e.preventDefault(); if (!tienda || !nuevo.nombre.trim()) return
          setErr(null); setOk(null)
          if (nuevo.inicio && nuevo.fin && nuevo.fin < nuevo.inicio) { setErr('El fin no puede ser anterior al inicio'); return }
          try { await crearPeriodo(tienda.id, nuevo.nombre, nuevo.inicio, nuevo.fin); setNuevo({ nombre: '', inicio: '', fin: '' }); await cargar(); setOk(`${vocab.periodo} cread${gr.o('periodo')} (no activ${gr.o('periodo')})`) }
          catch (x) { const m = mensajeError(x); setErr(/duplicate|unique/i.test(m) ? `Ya hay ${gr.con('periodo', 'un')} con ese nombre` : m) }
        }}>
          <Input className="h-7" placeholder="Nombre (p. ej. 2027)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <Input className="h-7 w-[150px]" type="date" title="Inicio (opcional)" value={nuevo.inicio} onChange={(e) => setNuevo({ ...nuevo, inicio: e.target.value })} />
          <Input className="h-7 w-[150px]" type="date" title="Fin (opcional)" value={nuevo.fin} onChange={(e) => setNuevo({ ...nuevo, fin: e.target.value })} />
          <Button type="submit" variant="primary" disabled={!nuevo.nombre.trim()}>Crear</Button>
        </form>
        <Estado ok={ok} err={err} />
      </Bloque>

      <Dialog open={!!activar} onOpenChange={() => setActivar(null)} error={dErr} title={`Activar «${activar?.nombre}»`}
        description={`Todo el equipo pasará a ver ${gr.con('encargo', 'los')} de ${gr.con('periodo', 'este')} y lo nuevo se creará ahí. Nada de lo anterior se borra.`}
        actions={[{ label: 'Activar', onClick: async () => {
          if (!activar) return
          try { await activarPeriodo(activar.id); setActivar(null); await cargar(); await recargar(); setOk(`${vocab.periodo} activ${gr.o('periodo')} cambiad${gr.o('periodo')}`) } catch (x) { setDErr(mensajeError(x)) }
        } }]} />

      <EditarPeriodo p={editar} onClose={() => setEditar(null)} onSaved={async () => { await cargar(); await recargar(); setOk('Guardado') }} />
    </>
  )
}

function EditarPeriodo({ p, onClose, onSaved }: { p: PeriodoFila | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { vocab } = useAuth()
  const [f, setF] = React.useState({ nombre: '', inicio: '', fin: '' })
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => { if (p) { setF({ nombre: p.nombre, inicio: p.fecha_inicio ?? '', fin: p.fecha_fin ?? '' }); setErr(null) } }, [p])
  return (
    <Dialog open={!!p} onOpenChange={onClose} title={`Editar ${min(vocab.periodo)}`} error={err}
      actions={[{ label: 'Guardar', disabled: !f.nombre.trim(), onClick: async () => {
        if (!p) return
        if (f.inicio && f.fin && f.fin < f.inicio) { setErr('El fin no puede ser anterior al inicio'); return }
        try { await actualizarPeriodo(p.id, { nombre: f.nombre.trim(), fecha_inicio: f.inicio || null, fecha_fin: f.fin || null }); onClose(); await onSaved() }
        catch (x) { setErr(mensajeError(x)) }
      } }]}>
      <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <div className="flex gap-2">
        <Input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
        <Input type="date" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
      </div>
    </Dialog>
  )
}

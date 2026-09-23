import * as React from 'react'
import { IconArrowDown, IconArrowUp, IconLock, IconAlertTriangle, IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import {
  actualizarEtapa, actualizarPuerta, actualizarTipo, borrarEtapa, borrarPuerta, claveUnica, crearEtapa, crearPuerta,
  crearTipo, listarEtapasDe, listarPuertas, listarTipos, reordenarEtapas, type PuertaDef, type TipoEncargo,
} from '@/data/ajustes'
import { camposDe, plantillas, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import type { Etapa, Rol } from '@/lib/types'
import { ROLES, min } from '@/lib/vocab'
import { Button, Dialog, Input, Select, Tag, tagColorFromHex } from '@/ui'
import { cn } from '@/lib/utils'
import { Bloque, Estado, FilaLista, Interruptor, Lista } from './Ajustes'

const PALETA = ['#999999', '#C98A00', '#2B4C9B', '#5A3E96', '#1E6B3C', '#A32E24', '#C2185B']
const TIPOS_PUERTA: { v: PuertaDef['tipo']; label: string }[] = [
  { v: 'HITO_PREVIO', label: 'Haber pasado por' },
  { v: 'CAMPO_NO_VACIO', label: 'Tener relleno' },
  { v: 'CHECK', label: 'Tener marcado' },
]

/**
 * Ajustes → Flujos. Editor en forma de lista:
 * tipos de encargo → etapas en orden → condiciones para entrar en cada etapa.
 * Cada cambio se guarda al momento.
 */
export function AjustesFlujos() {
  const { tienda, vocab, nombresRol, recargar, gr } = useAuth()
  const [tipos, setTipos] = React.useState<TipoEncargo[]>([])
  const [tipoId, setTipoId] = React.useState<string>('')
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [puertas, setPuertas] = React.useState<PuertaDef[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [abierta, setAbierta] = React.useState<string | null>(null)
  const [nuevaEtapa, setNuevaEtapa] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [dlgTipo, setDlgTipo] = React.useState<null | 'nuevo' | 'renombrar'>(null)
  const [nombreTipo, setNombreTipo] = React.useState('')
  const [borrar, setBorrar] = React.useState<Etapa | null>(null)
  const [dErr, setDErr] = React.useState<string | null>(null)

  const cargarTipos = React.useCallback(async () => {
    if (!tienda) return
    const [t, p] = await Promise.all([listarTipos(tienda.id), plantillas(tienda.id)])
    setTipos(t); setPs(p)
    setTipoId((cur) => (t.some((x) => x.id === cur) ? cur : t[0]?.id ?? ''))
  }, [tienda])
  const cargarEtapas = React.useCallback(async () => {
    if (!tipoId) { setEtapas([]); setPuertas([]); return }
    const e = await listarEtapasDe(tipoId)
    setEtapas(e)
    setPuertas(await listarPuertas(e.map((x) => x.id)))
  }, [tipoId])
  React.useEffect(() => { cargarTipos().catch((x) => setErr(mensajeError(x))) }, [cargarTipos])
  React.useEffect(() => { cargarEtapas().catch((x) => setErr(mensajeError(x))) }, [cargarEtapas])

  async function hacer(fn: () => Promise<unknown>, msg = 'Guardado') {
    setErr(null); setOk(null)
    try { await fn(); await cargarEtapas(); setOk(msg); return true } catch (x) { setErr(mensajeError(x)); await cargarEtapas().catch(() => {}); return false }
  }

  const tipo = tipos.find((t) => t.id === tipoId)
  const campos = camposDe(ps, 'ENCARGO', tipoId)
  const opcionesCampo = [
    { v: 'producto_id', l: vocab.producto },
    { v: 'proveedor_id', l: vocab.proveedor },
    ...campos.map((c) => ({ v: c.clave, l: c.etiqueta })),
  ]
  const checksUsados = puertas.filter((p) => p.tipo === 'CHECK').map((p) => p.referencia)

  function mover(i: number, d: -1 | 1) {
    const ids = etapas.map((e) => e.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setEtapas((es) => { const c = [...es]; [c[i], c[j]] = [c[j], c[i]]; return c })
    hacer(() => reordenarEtapas(tipoId, ids), 'Orden guardado')
  }

  return (
    <>
      <Bloque titulo="Flujos" ayuda={`Cada tipo de ${vocab.encargo.toLowerCase()} tiene sus etapas, en orden. ${gr.Con('encargo', 'un')} avanza de una a la siguiente.`}
        acciones={<Button onClick={() => { setDlgTipo('nuevo'); setNombreTipo(''); setDErr(null) }}>+ Tipo</Button>}>
        <div className="flex flex-wrap items-center gap-1.5">
          {tipos.map((t) => (
            <button key={t.id} onClick={() => { setTipoId(t.id); setAbierta(null) }}
              className={cn('h-7 rounded-sm border px-2.5 font-medium', t.id === tipoId ? 'border-gray-12 bg-gray-12 text-white' : 'border-border text-fg-2 hover:bg-bg-3', !t.activo && 'opacity-60')}>
              {t.nombre}
            </button>
          ))}
        </div>
        {tipo && (<>
          <div className="flex flex-wrap items-center gap-3 text-sm text-fg-3">
            <button className="hover:text-fg" onClick={() => { setDlgTipo('renombrar'); setNombreTipo(tipo.nombre); setDErr(null) }}>Renombrar</button>
            <Interruptor checked={tipo.activo} label="Se puede elegir al crear"
              onChange={async (v) => { try { await actualizarTipo(tipo.id, { activo: v }); await cargarTipos() } catch (x) { setErr(mensajeError(x)) } }} />
            <label className="flex items-center gap-1.5" title="Letras delante del número y contador propio: «S» → S001, S002…">
              Serie
              <input key={tipo.id} defaultValue={tipo.serie ?? ''} maxLength={4} placeholder="—"
                onBlur={async (e) => {
                  const v = e.target.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
                  e.target.value = v
                  if (v === (tipo.serie ?? '')) return
                  try { await actualizarTipo(tipo.id, { serie: v }); await cargarTipos() } catch (x) { setErr(mensajeError(x)) }
                }}
                className="h-6 w-14 rounded-sm border border-border bg-bg px-1.5 text-center font-mono text-fg" />
            </label>
          </div>
          {tipo.serie && <p className="m-0 text-sm text-fg-3">Los nuevos de este tipo se numeran {tipo.serie}001, {tipo.serie}002… con su propio contador. Los ya creados no cambian.</p>}
        </>)}
      </Bloque>

      {tipo && (
        <Bloque titulo={`Etapas de «${tipo.nombre}»`}
          ayuda={<>Pulsa una etapa para ver sus condiciones. <IconLock size={12} className="inline" /> bloquea el paso; <IconAlertTriangle size={12} className="inline" /> solo avisa.</>}>
          <Lista>
            {etapas.map((e, i) => {
              const ps = puertas.filter((p) => p.etapa_destino_id === e.id)
              return (
                <React.Fragment key={e.id}>
                  <FilaLista className="gap-2">
                    <div className="flex flex-col">
                      <button aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="text-fg-3 hover:text-fg disabled:opacity-30"><IconArrowUp size={12} /></button>
                      <button aria-label="Bajar" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)} className="text-fg-3 hover:text-fg disabled:opacity-30"><IconArrowDown size={12} /></button>
                    </div>
                    <span className="w-5 text-right text-sm text-fg-3 tabular">{i + 1}</span>
                    <ColorEtapa value={e.color} onChange={(c) => hacer(() => actualizarEtapa(e.id, { color: c }))} />
                    <NombreEnLinea value={e.nombre} onSave={(v) => hacer(() => actualizarEtapa(e.id, { nombre: v }))} />
                    <div className="flex-1" />
                    {ps.some((p) => p.dura) && <IconLock size={13} className="text-danger-fg" />}
                    {ps.some((p) => !p.dura) && <IconAlertTriangle size={13} className="text-warn-fg" />}
                    {e.es_final && <Tag color="green">final</Tag>}
                    <Select className="w-[140px]" value={e.rol_ejecuta} title="Quién marca esta etapa"
                      onChange={(ev) => hacer(() => actualizarEtapa(e.id, { rol_ejecuta: ev.target.value as Rol }))}>
                      {ROLES.map((r) => <option key={r} value={r}>{nombresRol[r]}</option>)}
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setAbierta(abierta === e.id ? null : e.id)}>{abierta === e.id ? 'Cerrar' : 'Detalles'}</Button>
                  </FilaLista>
                  {abierta === e.id && (
                    <div className="flex flex-col gap-4 bg-bg-2 px-4 py-3">
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Interruptor checked={e.visible_para_proveedor} label={`La ve ${gr.con('proveedor', 'el')}`}
                          onChange={(v) => hacer(() => actualizarEtapa(e.id, { visible_para_proveedor: v }))} />
                        <Interruptor checked={!!e.marca_proveedor} disabled={!e.visible_para_proveedor} label={`La marca ${gr.con('proveedor', 'el')} desde su portal`}
                          onChange={(v) => hacer(() => actualizarEtapa(e.id, { marca_proveedor: v }))} />
                        <Interruptor checked={e.es_espera} label="Es una espera (no cuenta como estancado)"
                          onChange={(v) => hacer(() => actualizarEtapa(e.id, { es_espera: v }))} />
                        <Interruptor checked={e.es_final} label={`Es el final (${min(vocab.encargo)} terminad${gr.o('encargo')})`}
                          onChange={(v) => hacer(() => actualizarEtapa(e.id, { es_final: v }))} />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-fg-2">
                        Grupo de bandejas
                        <GrupoEnLinea value={e.grupo ?? ''} onSave={(v) => hacer(() => actualizarEtapa(e.id, { grupo: v.trim() || null }))} />
                        <span className="text-fg-3">Opcional. Las etapas con el mismo grupo salen juntas en las pestañas de la lista.</span>
                      </label>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-fg-2">Para entrar en «{e.nombre}» hace falta…</span>
                        {ps.length === 0 && <span className="text-sm text-fg-3">Nada: se puede pasar siempre.</span>}
                        {ps.map((p) => (
                          <Condicion key={p.id} p={p} previas={etapas.slice(0, i)} campos={opcionesCampo}
                            onSave={(patch) => hacer(() => actualizarPuerta(p.id, patch))}
                            onDelete={() => hacer(() => borrarPuerta(p.id), 'Condición quitada')} />
                        ))}
                        <div className="flex gap-1.5 pt-1">
                          {TIPOS_PUERTA.map((t) => (
                            <Button key={t.v} size="sm" disabled={t.v === 'HITO_PREVIO' && i === 0}
                              onClick={() => {
                                if (!tienda) return
                                const ref = t.v === 'HITO_PREVIO' ? etapas[i - 1].clave
                                  : t.v === 'CAMPO_NO_VACIO' ? opcionesCampo[0].v
                                  : claveUnica('comprobacion', checksUsados)
                                const nombreRef = t.v === 'HITO_PREVIO' ? etapas[i - 1].nombre : t.v === 'CAMPO_NO_VACIO' ? opcionesCampo[0].l : 'Comprobación'
                                hacer(() => crearPuerta(tienda.id, {
                                  etapa_destino_id: e.id, tipo: t.v, referencia: ref, dura: true,
                                  etiqueta: t.v === 'CHECK' ? 'Comprobación' : null,
                                  mensaje: t.v === 'HITO_PREVIO' ? `Antes tiene que pasar por ${nombreRef}` : t.v === 'CAMPO_NO_VACIO' ? `Falta ${nombreRef.toLowerCase()}` : 'Falta marcar la comprobación',
                                }), 'Condición añadida')
                              }}>+ {t.label.toLowerCase()}</Button>
                          ))}
                        </div>
                      </div>

                      <div><Button variant="danger" size="sm" onClick={() => { setBorrar(e); setDErr(null) }}><IconTrash size={13} /> Borrar etapa</Button></div>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </Lista>
          <form className="flex gap-2" onSubmit={async (ev) => {
            ev.preventDefault(); if (!tienda || !nuevaEtapa.trim()) return
            if (await hacer(() => crearEtapa(tienda.id, tipoId, nuevaEtapa, etapas), 'Etapa añadida')) setNuevaEtapa('')
          }}>
            <Input className="h-7" placeholder="Nombre de la nueva etapa (se añade al final)" value={nuevaEtapa} onChange={(e) => setNuevaEtapa(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!nuevaEtapa.trim()}>Añadir etapa</Button>
          </form>
          <Estado ok={ok} err={err} />
        </Bloque>
      )}

      <Dialog open={!!dlgTipo} onOpenChange={() => setDlgTipo(null)} error={dErr}
        title={dlgTipo === 'nuevo' ? `Nuevo tipo de ${vocab.encargo.toLowerCase()}` : 'Renombrar tipo'}
        description={dlgTipo === 'nuevo' ? 'Por ejemplo: «A medida», «Arreglo», «Reparación». Después le añades sus etapas.' : undefined}
        actions={[{ label: dlgTipo === 'nuevo' ? 'Crear' : 'Guardar', disabled: !nombreTipo.trim(), onClick: async () => {
          if (!tienda) return
          try {
            if (dlgTipo === 'nuevo') { const t = await crearTipo(tienda.id, nombreTipo, tipos.map((x) => x.clave)); await cargarTipos(); setTipoId(t.id) }
            else if (tipo) { await actualizarTipo(tipo.id, { nombre: nombreTipo.trim() }); await cargarTipos() }
            setDlgTipo(null); await recargar()
          } catch (x) { setDErr(mensajeError(x)) }
        } }]}>
        <Input autoFocus value={nombreTipo} onChange={(e) => setNombreTipo(e.target.value)} />
      </Dialog>

      <Dialog open={!!borrar} onOpenChange={() => setBorrar(null)} error={dErr} title={`Borrar «${borrar?.nombre}»`}
        description={`Solo se puede borrar si ${gr.con('encargo', 'ningun')} ha pasado todavía por ella. Sus condiciones se borran con ella.`}
        actions={[{ label: 'Borrar', variant: 'danger', onClick: async () => {
          if (!borrar) return
          try { await borrarEtapa(borrar.id); setBorrar(null); setAbierta(null); await cargarEtapas(); setOk('Etapa borrada') } catch (x) { setDErr(mensajeError(x)) }
        } }]} />
    </>
  )
}

/** Una condición (puerta) editable en línea. */
function Condicion({ p, previas, campos, onSave, onDelete }: {
  p: PuertaDef; previas: Etapa[]; campos: { v: string; l: string }[]
  onSave: (patch: Partial<PuertaDef>) => void; onDelete: () => void
}) {
  const [mensaje, setMensaje] = React.useState(p.mensaje)
  const [etiqueta, setEtiqueta] = React.useState(p.etiqueta ?? '')
  React.useEffect(() => { setMensaje(p.mensaje); setEtiqueta(p.etiqueta ?? '') }, [p])
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-bg p-2">
      <div className="flex items-center gap-2">
        <span className="w-[120px] shrink-0 text-sm text-fg-2">{TIPOS_PUERTA.find((t) => t.v === p.tipo)?.label}</span>
        {p.tipo === 'HITO_PREVIO' && (
          <Select value={p.referencia} onChange={(e) => {
            // Si el mensaje seguía siendo el automático, se adapta a la nueva etapa
            const antes = previas.find((x) => x.clave === p.referencia)?.nombre
            const nueva = previas.find((x) => x.clave === e.target.value)?.nombre
            const auto = !antes || p.mensaje === `Antes tiene que pasar por ${antes}`
            onSave({ referencia: e.target.value, ...(auto && nueva ? { mensaje: `Antes tiene que pasar por ${nueva}` } : {}) })
          }}>
            {!previas.some((x) => x.clave === p.referencia) && <option value={p.referencia}>{p.referencia} (ya no está antes)</option>}
            {previas.map((x) => <option key={x.id} value={x.clave}>{x.nombre}</option>)}
          </Select>
        )}
        {p.tipo === 'CAMPO_NO_VACIO' && (
          <Select value={p.referencia} onChange={(e) => {
            const antes = campos.find((c) => c.v === p.referencia)?.l
            const nueva = campos.find((c) => c.v === e.target.value)?.l
            const auto = !antes || p.mensaje === `Falta ${antes.toLowerCase()}`
            onSave({ referencia: e.target.value, ...(auto && nueva ? { mensaje: `Falta ${nueva.toLowerCase()}` } : {}) })
          }}>
            {!campos.some((c) => c.v === p.referencia) && <option value={p.referencia}>{p.referencia}</option>}
            {campos.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </Select>
        )}
        {p.tipo === 'CHECK' && (
          <Input className="h-7" value={etiqueta} placeholder="Qué hay que marcar (se verá como casilla)"
            onChange={(e) => setEtiqueta(e.target.value)}
            onBlur={() => etiqueta.trim() && etiqueta !== (p.etiqueta ?? '') && onSave({
              etiqueta: etiqueta.trim(),
              // si el mensaje seguía siendo el genérico, se adapta a la casilla
              ...(p.mensaje === 'Falta marcar la comprobación' || p.mensaje === `Falta: ${p.etiqueta}` ? { mensaje: `Falta: ${etiqueta.trim()}` } : {}),
            })} />
        )}
        <Select className="w-[110px] shrink-0" value={p.dura ? 'dura' : 'blanda'} onChange={(e) => onSave({ dura: e.target.value === 'dura' })}>
          <option value="dura">Bloquea</option>
          <option value="blanda">Solo avisa</option>
        </Select>
        <button aria-label="Quitar condición" onClick={onDelete} className="text-fg-3 hover:text-danger-fg"><IconTrash size={14} /></button>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-[120px] shrink-0 text-sm text-fg-3">Mensaje</span>
        <Input className="h-7" value={mensaje} onChange={(e) => setMensaje(e.target.value)}
          onBlur={() => mensaje.trim() && mensaje !== p.mensaje && onSave({ mensaje: mensaje.trim() })} />
      </div>
    </div>
  )
}

/** Nombre editable: se guarda al salir del campo o con Enter. */
function NombreEnLinea({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = React.useState(value)
  React.useEffect(() => setV(value), [value])
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Nombre de la etapa"
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value) }}
      onBlur={() => { if (v.trim() && v.trim() !== value) onSave(v.trim()); else setV(value) }}
      className="h-7 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 font-medium hover:border-border focus:border-border-strong focus:bg-bg" />
  )
}

/** Punto de color de la etapa con paleta pastel. */
function ColorEtapa({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="relative">
      <button aria-label="Color de la etapa" onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-bg-4">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: value ?? '#D6D6D6' }} />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-10 flex gap-1 rounded-md border border-border bg-bg p-1.5 shadow-light">
          {PALETA.map((c) => (
            <button key={c} aria-label={c} onClick={() => { onChange(c); setOpen(false) }} className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-bg-4">
              <Tag color={tagColorFromHex(c)} className="h-3 w-3 rounded-full p-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


/** Texto corto que se guarda al salir del campo o con Enter. */
function GrupoEnLinea({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = React.useState(value)
  React.useEffect(() => setV(value), [value])
  const guardar = () => { if (v !== value) onSave(v) }
  return (
    <input value={v} maxLength={30} placeholder="Sin grupo" onChange={(ev) => setV(ev.target.value)} onBlur={guardar}
      onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
      className="h-7 w-40 rounded-sm border border-border bg-bg px-2 text-base placeholder:text-fg-3 focus:border-border-strong" />
  )
}

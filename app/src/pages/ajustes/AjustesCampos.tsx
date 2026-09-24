import * as React from 'react'
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { borrarPuerta, claveDe, claveUnica, guardarCampos, listarPuertas, listarTipos, type PuertaDef, type TipoEncargo } from '@/data/ajustes'
import { listarEtapas, mensajeError } from '@/data/encargos'
import { listarPlantillas, MARCADORES } from '@/data/mensajes'
import { MARCADORES_FICHA, obtenerPlantillaFicha } from '@/data/ficha'
import { guiaDe } from '@/data/guia'
import { ajustesHoja } from '@/data/produccion'
import { plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { Button, Dialog, Input, Select } from '@/ui'
import { cn } from '@/lib/utils'
import { BarraGuardar, Bloque, Estado, Interruptor } from './Ajustes'

type Destino = { entidad: PlantillaCampos['entidad']; tipoId: string | null }
const TIPOS_CAMPO: { v: Campo['tipo']; l: string }[] = [
  { v: 'texto', l: 'Texto' }, { v: 'numero', l: 'Número' }, { v: 'fecha', l: 'Fecha' }, { v: 'opcion', l: 'Lista de opciones' },
]
type CampoExt = Campo & { visible_proveedor?: boolean }

/**
 * Ajustes → Campos: qué datos se guardan de cada cliente, encargo y producto.
 * La clave interna se fija al crear el campo; cambiar la etiqueta no pierde datos.
 */
export function AjustesCampos() {
  const { tienda, vocab, gr } = useAuth()
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [tipos, setTipos] = React.useState<TipoEncargo[]>([])
  const [dest, setDest] = React.useState<Destino>({ entidad: 'CLIENTE', tipoId: null })
  const [campos, setCampos] = React.useState<CampoExt[]>([])
  const [original, setOriginal] = React.useState('[]')
  const [nuevo, setNuevo] = React.useState('')
  const [nuevoTipo, setNuevoTipo] = React.useState<Campo['tipo']>('texto')
  const [quitar, setQuitar] = React.useState<number | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Dónde se usa cada campo (condiciones de etapa, guía, hoja, mensajes, ficha), para avisar antes de quitarlo o cambiarlo
  const [puertas, setPuertas] = React.useState<(PuertaDef & { etapa: string })[]>([])
  const [textos, setTextos] = React.useState<{ donde: string; texto: string }[]>([])
  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [p, t, et, msgs, ficha] = await Promise.all([plantillas(tienda.id), listarTipos(tienda.id), listarEtapas(tienda.id), listarPlantillas(tienda.id).catch(() => []), obtenerPlantillaFicha(tienda.id).catch(() => null)])
    setPs(p); setTipos(t)
    const pu = await listarPuertas(et.map((e) => e.id))
    setPuertas(pu.map((x) => ({ ...x, etapa: et.find((e) => e.id === x.etapa_destino_id)?.nombre ?? '' })))
    setTextos([...msgs.map((m) => ({ donde: `el mensaje «${m.nombre}»`, texto: m.texto })), ...(ficha ? [{ donde: 'la ficha imprimible', texto: ficha }] : [])])
  }, [tienda])
  const usos = (clave: string): string[] => {
    const aj = tienda?.ajustes as Record<string, unknown>
    const g = guiaDe(aj)
    const out: string[] = []
    for (const p of puertas.filter((x) => x.tipo === 'CAMPO_NO_VACIO' && x.referencia === clave)) out.push(`la condición para entrar en «${p.etapa}»${p.dura ? ' (bloquea)' : ''}`)
    if (g.principal === clave) out.push('la guía de medidas (medida principal)')
    if (g.validan.includes(clave)) out.push('la guía de medidas (medida que valida)')
    if (g.destino === clave) out.push('la guía de medidas (donde se guarda el valor)')
    if (ajustesHoja(aj).campoCol === clave) out.push('las columnas de la hoja de producción')
    for (const t of textos) if (t.texto.includes(`{${clave}}`)) out.push(t.donde)
    return out
  }
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  // Al cambiar de destino, cargar su lista (sin mezclar con otros destinos)
  React.useEffect(() => {
    const fila = ps.find((p) => p.entidad === dest.entidad && (p.tipo_encargo_id ?? null) === dest.tipoId)
    const c = [...(fila?.campos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) as CampoExt[]
    setCampos(c); setOriginal(JSON.stringify(c))
  }, [ps, dest])
  React.useEffect(() => { setErr(null); setOk(null) }, [dest])

  const sucio = JSON.stringify(campos) !== original
  const esEncargo = dest.entidad === 'ENCARGO'
  const verProveedor = dest.entidad !== 'PRODUCTO'
  // Claves ya usadas en la entidad (en cualquier tipo), para no chocar
  const usadas = ps.filter((p) => p.entidad === dest.entidad).flatMap((p) => p.campos.map((c) => c.clave))
    .concat(campos.map((c) => c.clave))

  const set = (i: number, patch: Partial<CampoExt>) => setCampos((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  function mover(i: number, d: -1 | 1) {
    const j = i + d; if (j < 0 || j >= campos.length) return
    setCampos((cs) => { const c = [...cs]; [c[i], c[j]] = [c[j], c[i]]; return c })
  }
  function anadir(ev: React.FormEvent) {
    ev.preventDefault()
    if (!nuevo.trim()) return
    // Claves reservadas: las de serie y las de los marcadores de mensajes y ficha ({numero}, {importe}…)
    const reservadas = ['producto_id', 'proveedor_id', 'nombre', 'telefono', 'email', ...MARCADORES.map((m) => m.k), ...MARCADORES_FICHA.map((m) => m.k)]
    const clave = claveUnica(claveDe(nuevo, true), [...usadas, ...reservadas])
    setCampos((cs) => [...cs, { clave, etiqueta: nuevo.trim(), tipo: nuevoTipo, ...(nuevoTipo === 'opcion' ? { opciones: [] } : {}) }])
    setNuevo('')
  }
  const [avisoTipo, setAvisoTipo] = React.useState<string[] | null>(null)
  const [quitarPuertas, setQuitarPuertas] = React.useState(true)
  async function guardar(confirmarTipo = false) {
    if (!tienda) return
    const sinOpciones = campos.find((c) => c.tipo === 'opcion' && !(c.opciones ?? []).length)
    if (sinOpciones) { setErr(`«${sinOpciones.etiqueta}» necesita al menos una opción`); return }
    if (campos.some((c) => !c.etiqueta.trim())) { setErr('Hay un campo sin nombre'); return }
    const rep = campos.map((c) => c.etiqueta.trim().toLowerCase()).find((x, i, a) => a.indexOf(x) !== i)
    if (rep) { setErr(`Hay dos campos con el mismo nombre: «${rep}»`); return }
    // Cambiar el tipo de un campo que se usa en otros sitios: se avisa
    const antes = JSON.parse(original) as CampoExt[]
    const cambiados = campos.filter((c) => { const a = antes.find((x) => x.clave === c.clave); return a && a.tipo !== c.tipo && usos(c.clave).length })
    if (cambiados.length && !confirmarTipo) { setAvisoTipo(cambiados.map((c) => `«${c.etiqueta}» se usa en ${usos(c.clave).join(', ')}`)); return }
    setAvisoTipo(null)
    setBusy(true); setErr(null); setOk(null)
    try { await guardarCampos(tienda.id, dest.entidad, dest.tipoId, campos); await cargar(); setOk('Guardado') }
    catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  const destinos: { k: string; l: string; d: Destino }[] = [
    { k: 'c', l: vocab.cliente, d: { entidad: 'CLIENTE', tipoId: null } },
    { k: 'e', l: `${vocab.encargo} · todos`, d: { entidad: 'ENCARGO', tipoId: null } },
    ...tipos.map((t) => ({ k: 'e' + t.id, l: `${vocab.encargo} · ${t.nombre}`, d: { entidad: 'ENCARGO' as const, tipoId: t.id } })),
    { k: 'p', l: vocab.producto, d: { entidad: 'PRODUCTO', tipoId: null } },
  ]

  return (
    <>
      <Bloque titulo="Campos" ayuda={`Los datos que se guardan de cada cosa. Nombre, teléfono y correo ${gr.con('cliente', 'del')} ya vienen de serie.`}>
        <div className="flex flex-wrap gap-1.5">
          {destinos.map((o) => {
            const activo = o.d.entidad === dest.entidad && o.d.tipoId === dest.tipoId
            return (
              <button key={o.k} disabled={sucio && !activo} title={sucio && !activo ? 'Guarda o descarta antes de cambiar' : undefined}
                onClick={() => setDest(o.d)}
                className={cn('h-7 rounded-sm border px-2.5 font-medium disabled:opacity-40', activo ? 'border-gray-12 bg-gray-12 text-white' : 'border-border text-fg-2 hover:bg-bg-3')}>
                {o.l}
              </button>
            )
          })}
        </div>
        {esEncargo && (
          <p className="text-sm text-fg-3">
            {dest.tipoId ? 'Solo aparecen en este tipo, además de los de «todos».' : 'Aparecen en todos los tipos.'}
          </p>
        )}
      </Bloque>

      <div className="flex flex-col gap-2">
        {campos.length === 0 && <p className="text-fg-3">Todavía no hay campos aquí.</p>}
        {campos.map((c, i) => (
          <div key={c.clave} className="flex flex-col gap-2 rounded-md border border-border p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="text-fg-3 hover:text-fg disabled:opacity-30"><IconArrowUp size={12} /></button>
                <button aria-label="Bajar" disabled={i === campos.length - 1} onClick={() => mover(i, 1)} className="text-fg-3 hover:text-fg disabled:opacity-30"><IconArrowDown size={12} /></button>
              </div>
              <Input className="h-7 flex-1 font-medium" value={c.etiqueta} onChange={(e) => set(i, { etiqueta: e.target.value })} aria-label="Nombre del campo" />
              <Select className="w-[160px]" value={c.tipo} onChange={(e) => set(i, { tipo: e.target.value as Campo['tipo'], ...(e.target.value === 'opcion' && !c.opciones ? { opciones: [] } : {}) })}>
                {TIPOS_CAMPO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                {!TIPOS_CAMPO.some((t) => t.v === c.tipo) && <option value={c.tipo}>{c.tipo}</option>}
              </Select>
              <button aria-label="Quitar campo" onClick={() => setQuitar(i)} className="px-1 text-fg-3 hover:text-danger-fg"><IconTrash size={14} /></button>
            </div>
            {c.tipo === 'opcion' && (
              <Opciones value={c.opciones ?? []} onChange={(o) => set(i, { opciones: o })} />
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-6 text-sm">
              <Interruptor checked={!!c.obligatorio} label="Obligatorio" onChange={(v) => set(i, { obligatorio: v, ...(v ? { secundario: false } : {}) })} />
              {c.tipo === 'numero' && dest.entidad !== 'PRODUCTO' && <Interruptor checked={!!c.medida} label="Es una medida" onChange={(v) => set(i, { medida: v })} />}
              {c.tipo === 'numero' && c.medida && <Input className="h-6 w-20 text-sm" placeholder="Unidad" value={c.unidad ?? ''} onChange={(e) => set(i, { unidad: e.target.value || undefined })} aria-label="Unidad de la medida" />}
              {esEncargo && <Interruptor checked={!!c.en_tabla} label="Columna en la lista" onChange={(v) => set(i, { en_tabla: v })} />}
              {verProveedor && <Interruptor checked={!!c.visible_proveedor} label={`Lo ve ${gr.con('proveedor', 'el')}`} onChange={(v) => set(i, { visible_proveedor: v })} />}
              <Interruptor checked={!!c.destacado} label="Destacado" onChange={(v) => set(i, { destacado: v, ...(v ? { secundario: false } : {}) })} />
              <Interruptor checked={!!c.secundario} disabled={!!c.obligatorio} label="Plegado en «Más datos»" onChange={(v) => set(i, { secundario: v, ...(v ? { destacado: false } : {}) })} />
            </div>
            <div className="pl-6">
              <Input className="h-7 text-sm" placeholder="Ayuda bajo el campo (opcional): cómo se toma o qué poner" value={c.ayuda ?? ''}
                onChange={(e) => set(i, { ayuda: e.target.value || undefined })} aria-label="Ayuda del campo" />
            </div>
          </div>
        ))}
        <form onSubmit={anadir} className="flex gap-2">
          <Input className="h-7" placeholder="Nombre del nuevo campo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <Select className="w-[180px]" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as Campo['tipo'])}>
            {TIPOS_CAMPO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Button type="submit" disabled={!nuevo.trim()}>Añadir</Button>
        </form>
      </div>

      <BarraGuardar sucio={sucio} busy={busy} ok={ok} err={err} onGuardar={() => guardar()} onDescartar={() => { setCampos(JSON.parse(original)); setErr(null) }} />

      <Dialog open={quitar !== null} onOpenChange={() => setQuitar(null)} title={`Quitar «${quitar !== null ? campos[quitar]?.etiqueta : ''}»`}
        description="Deja de pedirse y de mostrarse. Los datos ya guardados no se borran: si vuelves a crear un campo con la misma clave, reaparecen."
        actions={[{ label: 'Quitar', variant: 'danger', onClick: async () => {
          if (quitar === null) return
          const clave = campos[quitar].clave
          // Las condiciones que exigen este campo bloquearían para siempre: se quitan con él (si se elige)
          if (quitarPuertas) for (const p of puertas.filter((x) => x.tipo === 'CAMPO_NO_VACIO' && x.referencia === clave)) await borrarPuerta(p.id)
          setCampos((cs) => cs.filter((_, j) => j !== quitar)); setQuitar(null)
          if (quitarPuertas) await cargar().catch(() => {})
        } }]}>
        {quitar !== null && usos(campos[quitar]?.clave).length > 0 && (
          <div className="flex flex-col gap-1 rounded-sm bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <b>Se usa en:</b>
            <ul className="m-0 pl-4">{usos(campos[quitar].clave).map((u) => <li key={u}>{u}</li>)}</ul>
            {puertas.some((x) => x.tipo === 'CAMPO_NO_VACIO' && x.referencia === campos[quitar].clave) && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={quitarPuertas} onChange={(e) => setQuitarPuertas(e.target.checked)} /> Quitar también esas condiciones (si no, bloquearían para siempre)</label>
            )}
            <span>Revisa lo demás después (guía, hoja, textos).</span>
          </div>
        )}
      </Dialog>
      <Dialog open={!!avisoTipo} onOpenChange={(o) => !o && setAvisoTipo(null)} title="Has cambiado el tipo de campos que se usan"
        description="Puede que dejen de funcionar donde se usan. ¿Guardar igualmente?"
        actions={[{ label: 'Guardar igualmente', onClick: () => guardar(true) }]}>
        <ul className="m-0 pl-4 text-sm">{(avisoTipo ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
      </Dialog>
    </>
  )
}

/** Editor de opciones: una por línea en chips, Enter para añadir. */
function Opciones({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = React.useState('')
  const add = () => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setT('') }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-6">
      {value.map((o) => (
        <span key={o} className="inline-flex h-6 items-center gap-1 rounded-sm bg-bg-4 px-2 text-sm">
          {o}
          <button aria-label={`Quitar ${o}`} className="text-fg-3 hover:text-fg" onClick={() => onChange(value.filter((x) => x !== o))}>×</button>
        </span>
      ))}
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Nueva opción + Enter"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} onBlur={add}
        className="h-6 w-[180px] rounded-sm border border-border bg-bg px-2 text-sm" />
    </div>
  )
}

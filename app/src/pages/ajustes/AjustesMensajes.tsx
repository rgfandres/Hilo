import * as React from 'react'
import { IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { claveUnica, listarEtapasDe, listarTipos } from '@/data/ajustes'
import { plantillas as leerCampos, type Campo } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import {
  MARCADORES, actualizarPlantilla, marcadoresConcordancia, borrarPlantilla, crearPlantilla, listarPlantillas, rellenar, type Canal, type PlantillaMensaje,
} from '@/data/mensajes'
import { Button, Dialog, Input, Select, Textarea } from '@/ui'
import { Bloque, Estado } from './Ajustes'
import { min } from '@/lib/vocab'

type EtapaOpcion = { id: string; label: string }

/**
 * Ajustes → Mensajes: plantillas para avisar al cliente.
 * Si una plantilla va ligada a una etapa, la app la sugiere al pasar a esa etapa.
 */
export function AjustesMensajes() {
  const { tienda, vocab, gr } = useAuth()
  const [lista, setLista] = React.useState<PlantillaMensaje[]>([])
  const [etapas, setEtapas] = React.useState<EtapaOpcion[]>([])
  const [campos, setCampos] = React.useState<Campo[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [borrar, setBorrar] = React.useState<PlantillaMensaje | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [pl, tipos, ps] = await Promise.all([listarPlantillas(tienda.id), listarTipos(tienda.id), leerCampos(tienda.id)])
    const ets = (await Promise.all(tipos.map(async (t) => (await listarEtapasDe(t.id)).map((e) => ({ id: e.id, label: tipos.length > 1 ? `${t.nombre} · ${e.nombre}` : e.nombre }))))).flat()
    setLista(pl); setEtapas(ets)
    const vistos = new Set<string>()
    setCampos(ps.filter((p) => p.entidad !== 'PRODUCTO').flatMap((p) => p.campos).filter((c) => !vistos.has(c.clave) && (vistos.add(c.clave), true)))
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  // Ejemplo para la vista previa
  const ejemplo: Record<string, unknown> = {
    nombre: 'Ana García', nombre_pila: 'Ana', numero: '042', proveedor: vocab.proveedor,
    etapa: etapas[0]?.label ?? 'Etapa', tienda: tienda?.nombre, enlace_resena: (tienda?.ajustes as Record<string, unknown>)?.enlace_resena ?? 'https://…',
    ...Object.fromEntries(campos.map((c) => [c.clave, c.etiqueta.toLowerCase()])),
    producto: 'Nombre de ejemplo',
    ...marcadoresConcordancia(vocab.producto, gr.genero.producto, 'Nombre de ejemplo'),
  }

  async function nueva() {
    if (!tienda) return
    setErr(null); setOk(null)
    try {
      await crearPlantilla({
        tienda_id: tienda.id, etapa_id: null, clave: claveUnica('mensaje', lista.map((p) => p.clave)),
        nombre: 'Nuevo mensaje', texto: 'Hola {nombre_pila}, ', canal: 'AMBOS', orden: (lista.at(-1)?.orden ?? 0) + 1,
      })
      await cargar(); setOk('Plantilla creada al final de la lista')
    } catch (x) { setErr(mensajeError(x)) }
  }

  return (
    <>
      <Bloque titulo="Mensajes" acciones={<Button variant="primary" onClick={nueva}>+ Plantilla</Button>}
        ayuda={`Consejo: para que los artículos concuerden, usa {tu_producto} en vez de «tu {producto}» y termina los adjetivos con {o} (list{o}). Textos preparados para avisar ${gr.con('cliente', 'al')} por WhatsApp o correo. Si los unes a una etapa, se sugieren al llegar a ella. Nunca se envían solos.`}>
        <div className="flex flex-wrap gap-1.5 text-sm">
          <span className="text-fg-3">Marcadores:</span>
          {MARCADORES.map((m) => <code key={m.k} title={m.ayuda} className="rounded-sm bg-bg-4 px-1.5">{`{${m.k}}`}</code>)}
          {campos.map((c) => <code key={c.clave} title={c.etiqueta} className="rounded-sm bg-bg-4 px-1.5 text-fg-3">{`{${c.clave}}`}</code>)}
        </div>
        <Estado ok={ok} err={err} />
      </Bloque>

      <div className="flex flex-col gap-3">
        {lista.length === 0 && <p className="text-fg-3">No hay plantillas todavía.</p>}
        {lista.map((p) => (
          <TarjetaPlantilla key={p.id} p={p} etapas={etapas} ejemplo={ejemplo}
            onGuardar={async (patch) => { setErr(null); setOk(null); try { await actualizarPlantilla(p.id, patch); await cargar(); setOk(`«${patch.nombre ?? p.nombre}» guardada`) } catch (x) { setErr(mensajeError(x)) } }}
            onBorrar={() => setBorrar(p)} />
        ))}
      </div>

      <Dialog open={!!borrar} onOpenChange={() => setBorrar(null)} title={`Borrar «${borrar?.nombre}»`}
        description={`Los mensajes ya enviados con ella se conservan en el historial de cada ${min(vocab.encargo)}.`}
        actions={[{ label: 'Borrar', variant: 'danger', onClick: async () => {
          if (!borrar) return
          try { await borrarPlantilla(borrar.id); setBorrar(null); await cargar(); setOk('Plantilla borrada') } catch (x) { setErr(mensajeError(x)); setBorrar(null) }
        } }]} />
    </>
  )
}

function TarjetaPlantilla({ p, etapas, ejemplo, onGuardar, onBorrar }: {
  p: PlantillaMensaje; etapas: EtapaOpcion[]; ejemplo: Record<string, unknown>
  onGuardar: (patch: Partial<PlantillaMensaje>) => Promise<void>; onBorrar: () => void
}) {
  const inicial = React.useMemo(() => ({ nombre: p.nombre, etapa_id: p.etapa_id ?? '', canal: p.canal, texto: p.texto }), [p])
  const [f, setF] = React.useState(inicial)
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => setF(inicial), [inicial])
  const sucio = JSON.stringify(f) !== JSON.stringify(inicial)

  function insertar(m: string) {
    const t = ref.current
    const pos = t?.selectionStart ?? f.texto.length
    const nuevo = f.texto.slice(0, pos) + `{${m}}` + f.texto.slice(t?.selectionEnd ?? pos)
    setF({ ...f, texto: nuevo })
    requestAnimationFrame(() => { t?.focus(); t?.setSelectionRange(pos + m.length + 2, pos + m.length + 2) })
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Input className="h-7 flex-1 font-medium" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} aria-label="Nombre de la plantilla" />
        <button aria-label="Borrar plantilla" onClick={onBorrar} className="px-1 text-fg-3 hover:text-danger-fg"><IconTrash size={14} /></button>
      </div>
      <div className="flex items-center gap-2 max-md:flex-wrap">
        <span className="w-[140px] shrink-0 text-sm text-fg-3 max-md:w-full">Se sugiere al pasar a</span>
        <Select value={f.etapa_id} onChange={(e) => setF({ ...f, etapa_id: e.target.value })}>
          <option value="">Nunca (solo a mano)</option>
          {etapas.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </Select>
        <Select className="w-[180px] shrink-0 max-md:w-full" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as Canal })}>
          <option value="AMBOS">WhatsApp y correo</option>
          <option value="WHATSAPP">Solo WhatsApp</option>
          <option value="EMAIL">Solo correo</option>
        </Select>
      </div>
      <Textarea ref={ref} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm text-fg-3">Insertar:</span>
        {MARCADORES.map((m) => (
          <button key={m.k} type="button" title={m.ayuda} onClick={() => insertar(m.k)} className="h-6 rounded-sm border border-border px-1.5 text-sm text-fg-2 hover:bg-bg-3">{m.k}</button>
        ))}
      </div>
      <div className="rounded-sm bg-bg-3 px-3 py-2 text-sm text-fg-2">
        <span className="text-fg-3">Vista previa: </span>{rellenar(f.texto, ejemplo)}
      </div>
      {sucio && (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" onClick={() => setF(inicial)}>Descartar</Button>
          <Button variant="primary" disabled={!f.nombre.trim() || !f.texto.trim()}
            onClick={() => onGuardar({ nombre: f.nombre.trim(), etapa_id: f.etapa_id || null, canal: f.canal, texto: f.texto })}>Guardar</Button>
        </div>
      )}
    </div>
  )
}


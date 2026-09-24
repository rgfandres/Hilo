import * as React from 'react'
import { IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { claveUnica, guardarTienda, listarEtapasDe, listarTipos } from '@/data/ajustes'
import { marcadorEtiqueta, plantillas as leerCampos, type Campo } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import {
  MARCADORES, ayudaMarcador, fraseEtapa, actualizarPlantilla, marcadoresConcordancia, borrarPlantilla, crearPlantilla, listarPlantillas, rellenar, type Canal, type PlantillaMensaje,
} from '@/data/mensajes'
import { Button, Dialog, Input, Select, Textarea } from '@/ui'
import { Bloque, Estado, Pagina } from './Ajustes'
import { min } from '@/lib/vocab'
import { ajustesDinero } from '@/lib/utils'
import { useCambiosSinGuardar } from '@/lib/salir'

type EtapaOpcion = { id: string; label: string; nombre: string }

/**
 * Ajustes → Mensajes: plantillas para avisar al cliente.
 * Si una plantilla va ligada a una etapa, la app la sugiere al pasar a esa etapa.
 */
export function AjustesMensajes() {
  const { tienda, vocab, gr, recargar } = useAuth()
  const [lista, setLista] = React.useState<PlantillaMensaje[]>([])
  const [etapas, setEtapas] = React.useState<EtapaOpcion[]>([])
  const [campos, setCampos] = React.useState<Campo[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [borrar, setBorrar] = React.useState<PlantillaMensaje | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [pl, tipos, ps] = await Promise.all([listarPlantillas(tienda.id), listarTipos(tienda.id), leerCampos(tienda.id)])
    const ets = (await Promise.all(tipos.map(async (t) => (await listarEtapasDe(t.id)).map((e) => ({ id: e.id, nombre: e.nombre, label: tipos.length > 1 ? `${t.nombre} · ${e.nombre}` : e.nombre }))))).flat()
    setLista(pl); setEtapas(ets)
    const vistos = new Set<string>()
    setCampos(ps.filter((p) => p.entidad !== 'PRODUCTO').flatMap((p) => p.campos).filter((c) => !vistos.has(c.clave) && (vistos.add(c.clave), true)))
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  // Solo los marcadores que tienen sentido en esta tienda (sin reseña configurada o sin importes, no se ofrecen)
  const ajT = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const usaDinero = ajustesDinero(ajT).usa
  // Los campos se ofrecen con su nombre visible ({tipo_tela}); si choca con un marcador fijo, con su clave
  const alias = (c: Campo) => { const a = marcadorEtiqueta(c); return a && !MARCADORES.some((m) => m.k === a) ? a : c.clave }
  const marcadores = MARCADORES.map((m) => ({ ...m, ayuda: ayudaMarcador(m.ayuda, vocab) })).filter((m) => !(m.k === 'enlace_resena' && !ajT.enlace_resena) && !(['importe', 'a_cuenta', 'pendiente'].includes(m.k) && !usaDinero))
    .concat(campos.map((c) => ({ k: alias(c), ayuda: c.etiqueta })))
  // Ejemplo para la vista previa
  const ejemplo: Record<string, unknown> = {
    nombre: 'Ana García', nombre_pila: 'Ana', numero: '042', proveedor: vocab.proveedor,
    etapa: etapas[0]?.nombre ?? 'Etapa', estado: fraseEtapa(ajT, etapas[0]?.nombre ?? 'Etapa'), complementos: 'lazo rojo', usuario: 'Ana', tienda: tienda?.nombre, enlace_resena: (tienda?.ajustes as Record<string, unknown>)?.enlace_resena ?? 'https://…',
    ...Object.fromEntries(campos.flatMap((c) => [[c.clave, c.etiqueta.toLowerCase()], [alias(c), c.etiqueta.toLowerCase()]])),
    producto: 'Nombre de ejemplo', importe: '120,00 €', a_cuenta: '40,00 €', pendiente: '80,00 €',
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
      <Pagina titulo="Mensajes al cliente" ayuda={`Textos preparados para avisar ${gr.con('cliente', 'al')} por WhatsApp o correo. Nunca se envían solos.`}
        mas={`Si unes un mensaje a una etapa, se sugiere al llegar a ella. Los huecos entre llaves ({nombre}, {numero}…) se rellenan solos. Para que los artículos concuerden, usa {tu_producto} en vez de «tu {producto}» y termina los adjetivos con {o} (list{o}). Con {proveedor|quien lo hace}, si no hay valor se escribe lo de después de la barra. Lo que va entre [[ y ]] solo sale si todo lo de dentro tiene valor: [[Déjanos una reseña: {enlace_resena}]].`}
        acciones={<Button variant="primary" onClick={nueva}>+ Plantilla</Button>} />
      <Bloque titulo="Plantillas">
        <div className="flex flex-wrap gap-1.5 text-sm">
          <span className="text-fg-3">Marcadores:</span>
          {marcadores.map((m) => <code key={m.k} title={m.ayuda} className="rounded-sm bg-bg-4 px-1.5">{`{${m.k}}`}</code>)}
        </div>
        <Estado ok={ok} err={err} />
      </Bloque>

      <Bloque titulo="Cómo se envían">
        <FrasesYCorreo aj={ajT} etapas={[...new Set(etapas.map((e) => e.nombre))]} onGuardar={async (patch) => {
          if (!tienda) return
          setErr(null); setOk(null)
          try { await guardarTienda(tienda.id, tienda.nombre, { ...ajT, ...patch }); await recargar(); setOk('Guardado') } catch (x) { setErr(mensajeError(x)) }
        }} />
      </Bloque>

      <div className="flex flex-col gap-3">
        {lista.length === 0 && <p className="text-fg-3">No hay plantillas todavía.</p>}
        {lista.map((p) => (
          <TarjetaPlantilla key={p.id} p={p} etapas={etapas} ejemplo={ejemplo} marcadores={marcadores}
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

function TarjetaPlantilla({ p, etapas, ejemplo, marcadores, onGuardar, onBorrar }: {
  p: PlantillaMensaje; etapas: EtapaOpcion[]; ejemplo: Record<string, unknown>; marcadores: { k: string; ayuda: string }[]
  onGuardar: (patch: Partial<PlantillaMensaje>) => Promise<void>; onBorrar: () => void
}) {
  // Memo por contenido: recargar la lista (al guardar otra) no reinicia lo que se está escribiendo aquí
  const inicial = React.useMemo(() => ({ nombre: p.nombre, etapa_id: p.etapa_id ?? '', canal: p.canal, texto: p.texto, asunto: p.asunto ?? '', al_incidencia: !!p.al_incidencia }),
    [p.nombre, p.etapa_id, p.canal, p.texto, p.asunto, p.al_incidencia])
  const [f, setF] = React.useState(inicial)
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => setF(inicial), [inicial])
  const sucio = JSON.stringify(f) !== JSON.stringify(inicial)
  useCambiosSinGuardar(sucio)

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
      <label className="flex items-center gap-2 text-sm text-fg-2">
        <input type="checkbox" className="accent-gray-12" checked={f.al_incidencia} onChange={(e) => setF({ ...f, al_incidencia: e.target.checked })} />
        Sugerirla también al abrir una incidencia (un retraso)
      </label>
      {f.canal !== 'WHATSAPP' && <Input className="h-7" value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} placeholder="Asunto del correo (opcional; admite marcadores)" aria-label="Asunto" />}
      <Textarea ref={ref} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm text-fg-3">Insertar:</span>
        {marcadores.map((m) => (
          <button key={m.k} type="button" title={m.ayuda} onClick={() => insertar(m.k)} className="h-6 rounded-sm border border-border px-1.5 text-sm text-fg-2 hover:bg-bg-3">{m.k}</button>
        ))}
      </div>
      <div className="rounded-sm bg-bg-3 px-3 py-2 text-sm text-fg-2">
        <span className="text-fg-3">Vista previa: </span>{f.asunto.trim() && f.canal !== 'WHATSAPP' && <><b>{rellenar(f.asunto, ejemplo)}</b> · </>}<span className="whitespace-pre-wrap">{rellenar(f.texto, ejemplo)}</span>
      </div>
      {sucio && (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" onClick={() => setF(inicial)}>Descartar</Button>
          <Button variant="primary" disabled={!f.nombre.trim() || !f.texto.trim()}
            onClick={() => onGuardar({ nombre: f.nombre.trim(), etapa_id: f.etapa_id || null, canal: f.canal, texto: f.texto, asunto: f.asunto.trim() || null, al_incidencia: f.al_incidencia })}>Guardar</Button>
        </div>
      )}
    </div>
  )
}


/** Cómo se dice cada etapa en los mensajes ({estado}) y con qué se abre el correo */
function FrasesYCorreo({ aj, etapas, onGuardar }: { aj: Record<string, unknown>; etapas: string[]; onGuardar: (patch: Record<string, unknown>) => Promise<void> }) {
  const inicial = React.useMemo(() => ({ frases: { ...((aj.frases_etapa ?? {}) as Record<string, string>) }, correo: String(aj.correo_web ?? '') }), [aj])
  const [f, setF] = React.useState(inicial)
  React.useEffect(() => setF(inicial), [inicial])
  const sucio = JSON.stringify(f) !== JSON.stringify(inicial)
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2 max-md:flex-wrap">
        <span className="w-[140px] shrink-0 text-fg-3">El correo se abre en</span>
        <Select className="w-[300px]" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })}>
          <option value="">El programa de correo del equipo</option>
          <option value="gmail">Gmail en el navegador</option>
        </Select>
      </div>
      <details>
        <summary className="cursor-pointer text-fg-2">Cómo se dice cada etapa en los mensajes: <code>{'{estado}'}</code></summary>
        <p className="my-1 text-fg-3">«Se encuentra {'{estado}'}». Puede llevar marcadores: «en manos de {'{proveedor}'}». Vacío: el nombre de la etapa en minúscula.</p>
        <div className="flex flex-col gap-1">
          {etapas.map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span className="w-[180px] shrink-0 truncate text-fg-2" title={n}>{n}</span>
              <Input className="h-7" value={f.frases[n] ?? ''} placeholder={n.charAt(0).toLowerCase() + n.slice(1)} onChange={(e) => setF({ ...f, frases: { ...f.frases, [n]: e.target.value } })} />
            </div>
          ))}
        </div>
      </details>
      {sucio && (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" onClick={() => setF(inicial)}>Descartar</Button>
          <Button variant="primary" onClick={() => {
            const frases = Object.fromEntries(Object.entries(f.frases).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
            return onGuardar({ frases_etapa: Object.keys(frases).length ? frases : null, correo_web: f.correo || null })
          }}>Guardar</Button>
        </div>
      )}
    </div>
  )
}

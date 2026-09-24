import * as React from 'react'
import { IconX } from '@tabler/icons-react'
import { crearHito, deshacerUltimoHito, mensajeError } from '@/data/encargos'
import type { EncargoEstado, Etapa, Rol } from '@/lib/types'
import { Button, CapaCarga, Dialog, Select, useAvisos } from '@/ui'
import { num3 } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { useAuth } from '@/auth/AuthProvider'

type Motivo = 'anulado' | 'tipo' | 'yaEsta' | 'permiso' | 'bloqueado' | 'salto'
interface Plan {
  pasan: { e: EncargoEstado; salta: string[]; avisos: string[] }[]
  fuera: { e: EncargoEstado; motivo: Motivo; detalle?: string }[]
}
const TEXTO_MOTIVO: Record<Motivo, string> = {
  anulado: 'anulado', tipo: 'otro tipo', yaEsta: 'ya está ahí o más adelante', permiso: 'tu rol no marca esa etapa', bloqueado: 'bloqueado', salto: 'se saltaría etapas (solo Administración puede saltar)',
}

/**
 * Barra de acciones en lote: pasar varios encargos a una etapa de una vez.
 * Antes de hacerlo explica qué pasará con cada uno (quién pasa, quién se queda y por qué,
 * a quién se le salta algún paso). Se hace de uno en uno, y todo se puede deshacer junto.
 */
export function AccionLote({ seleccion, etapas, rol, vocabEncargo, vocabEncargos, onTodos, onSalir, onHecho }: {
  seleccion: EncargoEstado[]; etapas: Etapa[]; rol: Rol | null; vocabEncargo: string; vocabEncargos: string
  onTodos: () => void; onSalir: () => void; onHecho: () => Promise<void> | void
}) {
  const avisar = useAvisos()
  const tipos = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const e of seleccion) m.set(e.tipo_encargo_id, e.tipo_nombre ?? 'Tipo')
    return m
  }, [seleccion])
  const destinos = etapas.filter((x) => tipos.has(x.tipo_encargo_id)).sort((a, b) => a.orden - b.orden)
  // Por defecto, la siguiente etapa más repetida entre los seleccionados
  const sugerida = React.useMemo(() => {
    const c = new Map<string, number>()
    for (const e of seleccion) if (e.etapa_siguiente_id) c.set(e.etapa_siguiente_id, (c.get(e.etapa_siguiente_id) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }, [seleccion])
  const [destino, setDestino] = React.useState('')
  React.useEffect(() => { if (!destinos.some((d) => d.id === destino)) setDestino(sugerida) }, [sugerida, destinos, destino])
  const [abierto, setAbierto] = React.useState(false)
  const [conAvisos, setConAvisos] = React.useState(false)
  const [progreso, setProgreso] = React.useState<string | null>(null)
  const { gr } = useAuth()
  const et = destinos.find((d) => d.id === destino)

  const plan = React.useMemo((): Plan => {
    const p: Plan = { pasan: [], fuera: [] }
    if (!et) return p
    const delFlujo = etapas.filter((x) => x.tipo_encargo_id === et.tipo_encargo_id).sort((a, b) => a.orden - b.orden)
    for (const e of seleccion) {
      if (e.estado === 'ANULADO') { p.fuera.push({ e, motivo: 'anulado' }); continue }
      if (e.tipo_encargo_id !== et.tipo_encargo_id) { p.fuera.push({ e, motivo: 'tipo' }); continue }
      const actual = e.etapa_actual_orden ?? -1
      if (actual >= et.orden) { p.fuera.push({ e, motivo: 'yaEsta' }); continue }
      if (!(rol === 'ADMIN' || rol === 'OPERATIVO' || rol === et.rol_ejecuta)) { p.fuera.push({ e, motivo: 'permiso' }); continue }
      const esSiguiente = e.etapa_siguiente_id === et.id
      const duras = esSiguiente ? (e.puertas_pendientes ?? []).filter((x) => x.dura) : []
      if (duras.length) { p.fuera.push({ e, motivo: 'bloqueado', detalle: duras.map((x) => x.mensaje).join(' · ') }); continue }
      const salta = delFlujo.filter((x) => x.orden > actual && x.orden < et.orden).map((x) => x.nombre)
      // Saltar etapas intermedias solo lo hace Administración (y se le dice cuáles se salta)
      if (salta.length && rol !== 'ADMIN') { p.fuera.push({ e, motivo: 'salto', detalle: salta.join(', ') }); continue }
      const avisos = esSiguiente ? (e.puertas_pendientes ?? []).filter((x) => !x.dura).map((x) => x.mensaje) : []
      p.pasan.push({ e, salta, avisos })
    }
    return p
  }, [seleccion, et, etapas, rol])

  const conAvisoN = plan.pasan.filter((x) => x.avisos.length).length
  const vanA = plan.pasan.filter((x) => conAvisos || !x.avisos.length)
  const saltan = vanA.filter((x) => x.salta.length)
  const saltanTodos = plan.pasan.filter((x) => x.salta.length).length

  async function ejecutar() {
    if (!et) return
    const hechos: { e: EncargoEstado; hito: string }[] = []
    const fallos: string[] = []
    for (let i = 0; i < vanA.length; i++) {
      const { e } = vanA[i]
      setProgreso(`${i + 1} de ${vanA.length}…`)
      try { const hito = await crearHito(e.id, et.clave, { forzarBlandas: conAvisos }); hechos.push({ e, hito }) }
      catch (x) { fallos.push(`${num3(e)} ${e.cliente_nombre}: ${mensajeError(x)}`) }
    }
    setProgreso(null); setAbierto(false)
    await onHecho()
    if (hechos.length) {
      avisar({
        tipo: 'ok', texto: `${hechos.length} pasad${gr.o('encargo', hechos.length !== 1)} a «${et.nombre}»`,
        accion: {
          label: 'Deshacer', onClick: async () => {
            let mal = 0
            for (const { e, hito } of hechos) { try { await deshacerUltimoHito(e.id, hito) } catch { mal++ } }
            await onHecho()
            avisar(mal ? { tipo: 'error', texto: `No se pudieron deshacer ${mal}. Revísal${gr.o('encargo', true)} un${gr.o('encargo')} a un${gr.o('encargo')}.` } : { tipo: 'info', texto: 'Deshecho' })
          },
        },
      })
    }
    if (fallos.length) avisar({ tipo: 'error', persistente: true, texto: `No se pudieron pasar ${fallos.length}: ${fallos.join(' · ')}` })
    if (hechos.length && !fallos.length) onSalir()
  }

  const lista = (xs: EncargoEstado[]) => xs.slice(0, 6).map((e) => `${num3(e)} ${e.cliente_nombre}`).join(', ') + (xs.length > 6 ? ` y ${xs.length - 6} más` : '')
  const porMotivo = (m: Motivo) => plan.fuera.filter((x) => x.motivo === m)

  return (
    <>
      <div role="toolbar" aria-label="Acciones con la selección"
        className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 shadow-strong max-md:bottom-[calc(64px+env(safe-area-inset-bottom))]">
        <span className="font-medium tabular">{seleccion.length} seleccionad{gr.o('encargo', seleccion.length !== 1)}</span>
        <button className="text-sm text-fg-3 underline-offset-2 hover:text-fg hover:underline" onClick={onTodos}>Marcar los de esta página</button>
        {seleccion.length > 0 && destinos.length > 0 && <>
          <span className="text-fg-3">· Pasar a</span>
          <Select className="h-7 w-[190px]" value={destino} onChange={(x) => setDestino(x.target.value)} aria-label="Etapa de destino">
            {!destino && <option value="">Elige etapa…</option>}
            {[...tipos.entries()].map(([id, nombre]) => (
              <optgroup key={id} label={tipos.size > 1 ? nombre : 'Etapas'}>
                {destinos.filter((d) => d.tipo_encargo_id === id).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </optgroup>
            ))}
          </Select>
          <Button variant="primary" disabled={!et} onClick={() => { setConAvisos(false); setAbierto(true) }}>Pasar…</Button>
        </>}
        <button aria-label="Salir de la selección" title="Salir de la selección (Esc)" onClick={onSalir} className="ml-1 text-fg-3 hover:text-fg"><IconX size={16} /></button>
      </div>

      <CapaCarga texto={progreso && `Pasando ${progreso}`} />
      <Dialog open={abierto} onOpenChange={(o) => { if (!progreso) setAbierto(o) }}
        title={et ? `Pasar a «${et.nombre}»` : 'Pasar'}
        description={vanA.length ? `${vanA.length === 1 ? 'Pasará 1' : `Pasarán ${vanA.length}`} ${vanA.length === 1 ? min(vocabEncargo) : min(vocabEncargos)}. Se hace de uno en uno y luego se puede deshacer todo junto.` : `Ningun${gr.o('encargo')} de ${gr.con('encargo', 'los')} seleccionad${gr.o('encargo', true)} puede pasar a esa etapa.`}
        actions={[{ label: progreso ? `Pasando ${progreso}` : `Pasar ${vanA.length}`, disabled: !vanA.length, onClick: ejecutar }]}>
        <div className="flex max-h-[45vh] flex-col gap-2 overflow-auto text-sm">
          {vanA.length > 0 && <p className="m-0"><b>Pasan:</b> {lista(vanA.map((x) => x.e))}</p>}
          {saltan.length > 0 && (
            <div className="rounded-sm bg-warn-bg px-2.5 py-1.5 text-warn-fg">
              <b>Se saltan pasos</b> en {saltan.length}: {saltan.slice(0, 4).map((x) => `${num3(x.e)} (sin «${x.salta.join('», «')}»)`).join(', ')}{saltan.length > 4 ? '…' : ''}. Asegúrate de que esos pasos no hacen falta.
            </div>
          )}
          {conAvisoN === 0 && saltanTodos > 0 && (
            <label className="flex items-start gap-2 rounded-sm bg-bg-3 px-2.5 py-1.5">
              <input type="checkbox" className="mt-0.5" checked={conAvisos} onChange={(x) => setConAvisos(x.target.checked)} />
              <span>Si «{et?.nombre}» tiene avisos, pasarl{gr.o('encargo', true)} igualmente (al saltar etapas no se ven antes).</span>
            </label>
          )}
          {conAvisoN > 0 && (
            <label className="flex items-start gap-2 rounded-sm bg-bg-3 px-2.5 py-1.5">
              <input type="checkbox" className="mt-0.5" checked={conAvisos} onChange={(x) => setConAvisos(x.target.checked)} />
              <span>{conAvisoN} tienen avisos ({[...new Set(plan.pasan.flatMap((x) => x.avisos))].slice(0, 3).join(' · ')}). Pasarl{gr.o('encargo', true)} también.</span>
            </label>
          )}
          {(['bloqueado', 'salto', 'yaEsta', 'permiso', 'tipo', 'anulado'] as Motivo[]).map((m) => {
            const xs = porMotivo(m)
            if (!xs.length) return null
            return (
              <p key={m} className="m-0 text-fg-2">
                <b>Se quedan ({m === 'anulado' ? `anulad${gr.o('encargo', xs.length !== 1)}` : m === 'bloqueado' ? `bloquead${gr.o('encargo', xs.length !== 1)}` : TEXTO_MOTIVO[m]}):</b> {m === 'bloqueado'
                  ? xs.slice(0, 4).map((x) => `${num3(x.e)} — ${x.detalle}`).join(' · ') + (xs.length > 4 ? '…' : '')
                  : lista(xs.map((x) => x.e))}
              </p>
            )
          })}
        </div>
      </Dialog>
    </>
  )
}

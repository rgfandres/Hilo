import * as React from 'react'
import { Link } from 'react-router-dom'
import type { Campo } from '@/data/config'
import { formatearValor } from '@/data/config'
import { historialCliente, historialEncargo, type Historial } from '@/data/guia'
import { SectionLabel } from '@/ui'
import { fechaCorta, num3 } from '@/lib/utils'

const igual = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '')
/** Solo las medidas (campos marcados «Es una medida»); si no hay ninguno marcado, los numéricos */
const soloMedidas = (cs: Campo[]) => { const m = cs.filter((c) => c.medida); return m.length ? m : cs.filter((c) => c.tipo === 'numero') }
function cambios(campos: Campo[], antes: Record<string, unknown>, ahora: Record<string, unknown>) {
  return campos.filter((c) => !igual(antes[c.clave], ahora[c.clave]))
    .map((c) => ({ c, antes: formatearValor(c, antes[c.clave]), ahora: formatearValor(c, ahora[c.clave]) }))
}

/** Ficha del cliente: cada cambio de sus datos, con qué encargo se tomaron. */
export function HistorialCliente({ clienteId, campos, encargos, refresco }: {
  clienteId: string; campos: Campo[]; encargos: { id: string; numero: number; serie?: string | null }[]; refresco?: unknown
}) {
  const [h, setH] = React.useState<Historial[] | null>(null)
  React.useEffect(() => { historialCliente(clienteId).then(setH).catch(() => setH([])) }, [clienteId, refresco])
  if (!h || h.length < 2) return null
  // De más reciente a más antiguo: cada entrada frente a la anterior en el tiempo
  const med = soloMedidas(campos)
  const filas = h.map((x, i) => ({ x, dif: i + 1 < h.length ? cambios(med, h[i + 1].datos, x.datos) : [] }))
    .filter((f, i) => f.dif.length > 0 || f.x.encargo_id || i === h.length - 1)
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Historial de medidas</SectionLabel>
      {filas.map(({ x, dif }) => {
        const e = x.encargo_id ? encargos.find((y) => y.id === x.encargo_id) : undefined
        return (
          <div key={x.id} className="border-b border-border-light py-1 text-sm">
            <span className="text-fg-3">{fechaCorta(x.fecha)}</span>
            {e && <> · <Link to={`/encargos/${e.id}`} className="hover:underline">con el {num3(e)}</Link></>}
            {dif.length > 0
              ? <div className="text-fg-2">{dif.map((d) => `${d.c.etiqueta}: ${d.antes} → ${d.ahora}`).join(' · ')}</div>
              : !e && <div className="text-fg-3">Datos iniciales</div>}
          </div>
        )
      })}
    </div>
  )
}

/** Ficha del encargo: si las medidas han cambiado desde que se hizo, se avisa con el antes y el ahora. */
export function MedidasDelEncargo({ encargoId, campos, actuales }: { encargoId: string; campos: Campo[]; actuales: Record<string, unknown> | null | undefined }) {
  const [h, setH] = React.useState<Historial | null>(null)
  React.useEffect(() => { historialEncargo(encargoId).then(setH).catch(() => {}) }, [encargoId])
  if (!h || !actuales) return null
  const dif = cambios(soloMedidas(campos), h.datos, actuales)
  if (!dif.length) return null
  return (
    <div className="rounded-sm bg-warn-bg px-2.5 py-1.5 text-sm text-warn-fg">
      <div className="font-medium">Medidas cambiadas desde el {fechaCorta(h.fecha)}, cuando se hizo:</div>
      {dif.map((d) => <div key={d.c.clave}>{d.c.etiqueta}: {d.antes} → {d.ahora}</div>)}
    </div>
  )
}

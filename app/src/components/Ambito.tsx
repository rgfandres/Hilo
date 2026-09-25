import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { listarPeriodos, type PeriodoFila } from '@/data/ajustes'
import { Select } from '@/ui'

/**
 * «¿Para qué se configura esto?»: para toda la tienda o solo para un periodo.
 * Un periodo sin lo suyo propio usa lo de la tienda.
 */
export function useAmbito(clave: string) {
  const { tienda } = useAuth()
  const [periodos, setPeriodos] = React.useState<PeriodoFila[]>([])
  const [ambito, setAmbito] = React.useState('')
  const recargarPeriodos = React.useCallback(async () => { if (tienda) setPeriodos((await listarPeriodos(tienda.id)).filter((p) => !p.archivado)) }, [tienda])
  React.useEffect(() => { recargarPeriodos().catch(() => {}) }, [recargarPeriodos])
  const periodo = periodos.find((p) => p.id === ambito) ?? null
  const propio = periodo ? periodo.ajustes?.[clave] : undefined
  return { periodos, ambito, setAmbito, periodo, propio, recargarPeriodos }
}

export function SelectorAmbito({ periodos, ambito, onCambio, clave }: { periodos: PeriodoFila[]; ambito: string; onCambio: (v: string) => void; clave: string }) {
  const { vocab, gr } = useAuth()
  if (!periodos.length) return null
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-fg-3">Configurar para</span>
      <Select className="w-auto" value={ambito} onChange={(e) => onCambio(e.target.value)}>
        <option value="">Toda la tienda</option>
        {periodos.map((p) => <option key={p.id} value={p.id}>{vocab.periodo} {p.nombre}{p.ajustes?.[clave] != null ? ' (propia)' : ''}{p.activo ? ` · activ${gr.o('periodo')}` : ''}</option>)}
      </Select>
    </label>
  )
}

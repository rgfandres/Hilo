import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import type { Campo } from '@/data/config'
import { guiaDe, opcionesGuia, sugerir, type Guia, type Sugerencia } from '@/data/guia'

/**
 * Guía de medidas en un formulario: el campo destino toma las opciones de la guía y se
 * autorrellena con la propuesta mientras nadie lo haya tocado a mano.
 */
export function useGuia({ datos, etiquetas, valor, setValor, inicialTocado }: {
  datos: Record<string, unknown>; etiquetas: Record<string, string>
  valor: string; setValor: (v: string) => void; inicialTocado: boolean
}) {
  const { tienda, periodo } = useAuth()
  const g: Guia = React.useMemo(() => guiaDe(tienda?.ajustes as Record<string, unknown>, periodo?.ajustes), [tienda, periodo])
  const [tocado, setTocado] = React.useState(inicialTocado)
  const sug = React.useMemo(() => sugerir(g, datos, etiquetas), [g, datos, etiquetas])
  React.useEffect(() => {
    if (!tocado && sug && valor !== sug.valor) setValor(sug.valor)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sug?.valor, tocado, valor])
  /** Campos con el destino convertido en lista de la guía */
  const adaptar = React.useCallback((cs: Campo[]) => (!g.activa || !g.destino || !g.filas.length) ? cs
    : cs.map((c) => (c.clave === g.destino ? { ...c, tipo: 'opcion' as const, opciones: opcionesGuia(g) } : c)), [g])
  return { g, sug, tocado, marcarTocado: () => setTocado(true), adaptar }
}

export function AvisoGuia({ sug, valor, onUsar }: { sug: Sugerencia | null; valor: string; onUsar: () => void }) {
  if (!sug) return null
  const color = sug.nivel === 'ok' ? 'bg-ok-bg text-ok-fg' : sug.nivel === 'aviso' ? 'bg-warn-bg text-warn-fg' : 'bg-danger-bg text-danger-fg'
  return (
    <p className={`m-0 rounded-sm px-2.5 py-1.5 text-sm md:ml-[128px] ${color}`}>
      Propuesta: <b>{sug.valor}</b> · {sug.motivo}
      {valor !== sug.valor && <> · <button type="button" className="font-medium underline" onClick={onUsar}>Usar {sug.valor}</button></>}
    </p>
  )
}

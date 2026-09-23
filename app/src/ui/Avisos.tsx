import * as React from 'react'
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX, IconAlertCircle } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * Avisos flotantes. Cuatro tipos con icono; duración según gravedad
 * (ok 3 s · info 4 s · aviso 7 s · error 8 s); los importantes se quedan hasta cerrarlos;
 * pueden llevar una acción (Deshacer, Abrir…). El texto dice el siguiente paso.
 */
export type TipoAviso = 'ok' | 'info' | 'aviso' | 'error'
export interface Aviso { id: number; tipo: TipoAviso; texto: string; accion?: { label: string; onClick: () => void }; persistente?: boolean }
type Nuevo = Omit<Aviso, 'id'>

const DURACION: Record<TipoAviso, number> = { ok: 3000, info: 4000, aviso: 7000, error: 8000 }
const Ctx = React.createContext<(a: Nuevo) => void>(() => {})

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = React.useState<Aviso[]>([])
  const cerrar = React.useCallback((id: number) => setLista((l) => l.filter((x) => x.id !== id)), [])
  const avisar = React.useCallback((a: Nuevo) => {
    const id = Date.now() + Math.random()
    setLista((l) => [...l.slice(-3), { ...a, id }])
    if (!a.persistente) setTimeout(() => cerrar(id), DURACION[a.tipo])
  }, [cerrar])
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 max-md:left-4 max-md:right-4 max-md:top-[calc(56px+env(safe-area-inset-top))] max-md:w-auto" aria-live="polite">
        {lista.map((a) => {
          const Icono = { ok: IconCircleCheck, info: IconInfoCircle, aviso: IconAlertTriangle, error: IconAlertCircle }[a.tipo]
          return (
            <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'}
              className={cn('pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2.5 shadow-strong',
                a.tipo === 'ok' && 'border-ok-bg bg-bg', a.tipo === 'info' && 'border-border bg-bg',
                a.tipo === 'aviso' && 'border-warn-bg bg-warn-bg', a.tipo === 'error' && 'border-danger-bg bg-danger-bg')}>
              <Icono size={16} className={cn('mt-0.5 shrink-0', a.tipo === 'ok' && 'text-ok-fg', a.tipo === 'info' && 'text-fg-2', a.tipo === 'aviso' && 'text-warn-fg', a.tipo === 'error' && 'text-danger-fg')} />
              <span className={cn('min-w-0 flex-1', a.tipo === 'error' && 'text-danger-fg', a.tipo === 'aviso' && 'text-warn-fg')}>{a.texto}</span>
              {a.accion && <button onClick={() => { a.accion!.onClick(); cerrar(a.id) }} className="shrink-0 font-semibold underline underline-offset-2">{a.accion.label}</button>}
              <button onClick={() => cerrar(a.id)} aria-label="Cerrar aviso" className="shrink-0 text-fg-3 hover:text-fg"><IconX size={14} /></button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export const useAvisos = () => React.useContext(Ctx)

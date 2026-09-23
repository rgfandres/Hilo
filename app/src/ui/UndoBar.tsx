import * as React from 'react'
import { cn } from '@/lib/utils'

/** Barra negra de deshacer con cuenta atrás (8 s por defecto). */
export function UndoBar({ message, onUndo, onExpire, seconds = 8, className }: {
  message: string; onUndo: () => void; onExpire: () => void; seconds?: number; className?: string
}) {
  const [left, setLeft] = React.useState(seconds)
  React.useEffect(() => {
    setLeft(seconds)
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [message, seconds])
  React.useEffect(() => { if (left <= 0) onExpire() }, [left, onExpire])
  return (
    <div role="status" className={cn('flex items-center gap-3 rounded-md bg-inverted px-3.5 py-3 text-md text-inverted-fg shadow-strong', className)}>
      <span className="flex-1 truncate">{message}</span>
      <button onClick={onUndo} className="font-semibold underline underline-offset-[3px]">Deshacer</button>
      <span className="w-3.5 text-right text-fg-3 tabular">{Math.max(left, 0)}</span>
    </div>
  )
}

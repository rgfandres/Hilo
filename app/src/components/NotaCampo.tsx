import { mensajeError } from '@/data/encargos'
import * as React from 'react'
import { IconMessageCircle, IconMessageCircleFilled } from '@tabler/icons-react'
import type { NotaCampo as Nota } from '@/data/encargos'
import { createPortal } from 'react-dom'
import { Button, Textarea } from '@/ui'
import { cn, fechaCorta, locale, zona } from '@/lib/utils'

/**
 * 💬 junto a un campo: si hay nota se ve siempre y al pulsar se lee (autor y fecha);
 * si no hay, aparece al pasar por encima para añadir una. Vacía = se borra.
 */
export function NotaCampo({ etiqueta, nota, autor, editable, onGuardar }: {
  etiqueta: string; nota?: Nota; autor?: string; editable: boolean
  onGuardar: (texto: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [texto, setTexto] = React.useState('')
  const [editando, setEditando] = React.useState(false)
  const [guardando, setGuardando] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const boton = React.useRef<HTMLButtonElement>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const colocar = () => {
      const r = boton.current?.getBoundingClientRect(); if (!r) return
      const ancho = Math.min(280, window.innerWidth - 24)
      const alto = panel.current?.offsetHeight ?? 150
      const abajo = r.bottom + 4 + alto < window.innerHeight
      setPos({ top: abajo ? r.bottom + 4 : Math.max(8, r.top - 4 - alto), left: Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12)) })
    }
    colocar()
    const fuera = (e: MouseEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !boton.current?.contains(t)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    window.addEventListener('scroll', colocar, true); window.addEventListener('resize', colocar)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', colocar, true); window.removeEventListener('resize', colocar) }
  }, [open, editando])
  if (!nota && !editable) return null

  function abrir(o: boolean) {
    setOpen(o); setErr(null)
    if (o) { setTexto(nota?.texto ?? ''); setEditando(!nota) }
  }
  async function guardar(t: string) {
    setGuardando(true); setErr(null)
    try { await onGuardar(t); setOpen(false) }
    catch (x) { setErr(mensajeError(x)) }
    finally { setGuardando(false) }
  }
  const cuando = nota ? `${fechaCorta(nota.actualizado_en)} ${new Date(nota.actualizado_en).toLocaleTimeString(locale(), { timeZone: zona(), hour: '2-digit', minute: '2-digit' })}` : ''

  return (
    <>
      <button ref={boton} type="button" onClick={() => abrir(!open)} title={nota ? nota.texto : `Añadir nota a «${etiqueta}»`}
        aria-label={nota ? `Nota de «${etiqueta}»: ${nota.texto}` : `Añadir nota a «${etiqueta}»`} aria-expanded={open}
        className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm align-middle hover:bg-bg-4',
          nota ? 'text-warn-fg' : 'text-fg-3 opacity-0 focus:opacity-100 group-hover/campo:opacity-100 max-md:opacity-60', open && 'opacity-100')}>
        {nota ? <IconMessageCircleFilled size={14} /> : <IconMessageCircle size={14} />}
      </button>
      {open && pos && createPortal(
        <div ref={panel} role="dialog" aria-label={`Nota · ${etiqueta}`} style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-[280px] max-w-[calc(100vw-24px)] rounded-md border border-border bg-bg p-2 shadow-light"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && editando) guardar(texto) }}>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-3">Nota · {etiqueta}</span>
            {!editando && nota ? (
              <>
                <p className="m-0 whitespace-pre-wrap">{nota.texto}</p>
                <span className="text-sm text-fg-3">{autor ?? 'Alguien del equipo'} · {cuando}</span>
                {editable && (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => setEditando(true)}>Editar</Button>
                    <Button size="sm" variant="ghost" cargando={guardando} onClick={() => guardar('')}>Quitar nota</Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <Textarea autoFocus rows={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Algo que el equipo deba saber de este dato…" />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="primary" cargando={guardando} disabled={!texto.trim() && !nota} onClick={() => guardar(texto)}>Guardar</Button>
                  <Button size="sm" variant="ghost" onClick={() => nota ? setEditando(false) : setOpen(false)}>Cancelar</Button>
                </div>
              </>
            )}
            {err && <span className="text-sm text-danger-fg">{err}</span>}
          </div>
        </div>, document.body)}
    </>
  )
}

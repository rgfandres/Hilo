import * as React from 'react'
import { IconMessageCircle, IconMessageCircleFilled } from '@tabler/icons-react'
import type { NotaCampo as Nota } from '@/data/encargos'
import { Popover } from '@/ui/Popover'
import { Button, Textarea } from '@/ui'
import { cn, fechaCorta, locale } from '@/lib/utils'

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
  if (!nota && !editable) return null

  function abrir(o: boolean) {
    setOpen(o); setErr(null)
    if (o) { setTexto(nota?.texto ?? ''); setEditando(!nota) }
  }
  async function guardar(t: string) {
    setGuardando(true); setErr(null)
    try { await onGuardar(t); setOpen(false) }
    catch (x) { setErr(x instanceof Error ? x.message : (x as { message?: string })?.message ?? 'No se pudo guardar') }
    finally { setGuardando(false) }
  }
  const cuando = nota ? `${fechaCorta(nota.actualizado_en)} ${new Date(nota.actualizado_en).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}` : ''

  return (
    <Popover open={open} onOpenChange={abrir} className="w-[280px] p-2"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} title={nota ? nota.texto : `Añadir nota a «${etiqueta}»`}
          aria-label={nota ? `Nota de «${etiqueta}»: ${nota.texto}` : `Añadir nota a «${etiqueta}»`}
          className={cn('inline-flex h-5 w-5 items-center justify-center rounded-sm align-middle hover:bg-bg-4',
            nota ? 'text-warn-fg' : 'text-fg-3 opacity-0 focus:opacity-100 group-hover/campo:opacity-100 max-md:opacity-60')}>
          {nota ? <IconMessageCircleFilled size={14} /> : <IconMessageCircle size={14} />}
        </button>
      )}>
      <div className="flex flex-col gap-2" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && editando) guardar(texto) }}>
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
    </Popover>
  )
}

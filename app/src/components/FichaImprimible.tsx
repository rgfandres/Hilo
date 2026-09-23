import * as React from 'react'
import * as RDialog from '@radix-ui/react-dialog'
import { IconCopy, IconPrinter, IconShare } from '@tabler/icons-react'
import { Button } from '@/ui'
import { useCerrarConAtras } from '@/lib/movil'
import { compartir, copiarTexto } from '@/lib/copiar'

/**
 * Vista previa de la ficha (A4) con Imprimir / guardar PDF, Copiar como texto y,
 * en el móvil, Compartir. Se imprime desde un marco aislado: solo sale la ficha.
 * Se puede volver a imprimir tantas veces como haga falta.
 */
export function FichaImprimible({ open, onOpenChange, html, texto, titulo }: {
  open: boolean; onOpenChange: (o: boolean) => void; html: string; texto: string; titulo: string
}) {
  const marco = React.useRef<HTMLIFrameElement>(null)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [manual, setManual] = React.useState(false)
  useCerrarConAtras(open, () => onOpenChange(false))
  React.useEffect(() => { if (open) { setAviso(null); setManual(false) } }, [open])

  function imprimir() {
    const w = marco.current?.contentWindow
    if (!w) { setAviso('No se ha podido preparar la ficha. Vuelve a intentarlo.'); return }
    w.focus(); w.print()
  }
  async function copiar() {
    if (await copiarTexto(texto)) setAviso('Copiada. Pégala en WhatsApp o en un correo.')
    else { setManual(true); setAviso('Tu navegador no deja copiar solo: selecciona el texto y cópialo.') }
  }
  async function share() {
    const r = await compartir(titulo, texto)
    if (r === 'no') copiar()
  }
  const puedeCompartir = typeof navigator !== 'undefined' && !!navigator.share

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <RDialog.Content aria-describedby={undefined}
          className="fixed inset-4 z-50 mx-auto flex max-w-[860px] flex-col overflow-hidden rounded-md border border-border bg-bg-3 shadow-strong focus:outline-none max-md:inset-0 max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
            <RDialog.Title className="min-w-0 flex-1 truncate font-medium">{titulo}</RDialog.Title>
            <Button variant="primary" onClick={imprimir}><IconPrinter size={14} />Imprimir o PDF</Button>
            <Button onClick={copiar}><IconCopy size={14} />Copiar texto</Button>
            {puedeCompartir && <Button onClick={share}><IconShare size={14} />Compartir</Button>}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
          {aviso && <div className="border-b border-border bg-bg px-4 py-1.5 text-sm text-fg-2">{aviso}</div>}
          {manual && (
            <textarea readOnly value={texto} onFocus={(e) => e.currentTarget.select()} autoFocus
              className="h-40 w-full shrink-0 border-b border-border bg-bg p-3 font-mono text-sm" />
          )}
          <div className="min-h-0 flex-1 overflow-auto p-4 max-md:p-0">
            <iframe ref={marco} title="Ficha" srcDoc={html} className="mx-auto block h-full min-h-[70vh] w-full max-w-[794px] rounded-sm border border-border bg-white max-md:rounded-none max-md:border-0" />
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

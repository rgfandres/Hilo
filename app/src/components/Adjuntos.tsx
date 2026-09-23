import * as React from 'react'
import { IconCamera, IconFile, IconTrash, IconUpload } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { borrarAdjunto, enlacesAdjuntos, listarAdjuntos, subirAdjunto, tamanoLegible, MAX_ADJUNTO_MB, type Adjunto } from '@/data/adjuntos'
import { mensajeError } from '@/data/encargos'
import { Button, Dialog } from '@/ui'
import { cn, fechaCorta } from '@/lib/utils'

/** Fotos y documentos de un encargo (o de otra entidad). Privados: se abren con enlace temporal. */
export function Adjuntos({ entidad, entidadId, soloLectura }: { entidad: string; entidadId: string; soloLectura?: boolean }) {
  const { tienda, rol } = useAuth()
  const [lista, setLista] = React.useState<Adjunto[] | null>(null)
  const [urls, setUrls] = React.useState<Record<string, string>>({})
  const [subiendo, setSubiendo] = React.useState(0)
  const [err, setErr] = React.useState<string | null>(null)
  const [borrar, setBorrar] = React.useState<Adjunto | null>(null)
  const [arrastre, setArrastre] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const camara = React.useRef<HTMLInputElement>(null)
  const puedeBorrar = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'

  const cargar = React.useCallback(async () => {
    const l = await listarAdjuntos(entidad, entidadId)
    setLista(l); setUrls(await enlacesAdjuntos(l))
  }, [entidad, entidadId])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  async function subir(files: FileList | File[] | null) {
    if (!files || !tienda) return
    const arr = [...files]
    setErr(null); setSubiendo(arr.length)
    for (const f of arr) {
      try { await subirAdjunto(tienda.id, entidad, entidadId, f) }
      catch (x) { setErr(`${f.name}: ${mensajeError(x)}`) }
      finally { setSubiendo((n) => n - 1) }
    }
    await cargar().catch(() => {})
  }

  const esImagen = (a: Adjunto) => (a.tipo ?? '').startsWith('image/')
  return (
    <div className={cn('flex flex-col gap-3', arrastre && 'rounded-md outline-2 outline-dashed outline-border-strong')}
      onDragOver={(e) => { if (soloLectura) return; e.preventDefault(); setArrastre(true) }}
      onDragLeave={() => setArrastre(false)}
      onDrop={(e) => { if (soloLectura) return; e.preventDefault(); setArrastre(false); subir(e.dataTransfer.files) }}>
      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => input.current?.click()} disabled={subiendo > 0}><IconUpload size={14} />Subir fotos o documentos</Button>
          <Button variant="ghost" className="md:hidden" onClick={() => camara.current?.click()} disabled={subiendo > 0}><IconCamera size={14} />Hacer foto</Button>
          <span className="text-sm text-fg-3 max-md:hidden">o arrástralos aquí · hasta {MAX_ADJUNTO_MB} MB · las fotos grandes se reducen</span>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
          <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
        </div>
      )}
      {subiendo > 0 && <div className="text-sm text-fg-2">Subiendo {subiendo}…</div>}
      {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
      {lista && lista.length === 0 && <p className="m-0 text-fg-3">No hay nada adjunto todavía.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {lista?.map((a) => (
          <div key={a.id} className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-bg">
            <a href={urls[a.id]} target="_blank" rel="noopener noreferrer" className="flex aspect-[4/3] items-center justify-center bg-bg-3" title="Abrir">
              {esImagen(a) && urls[a.id]
                ? <img src={urls[a.id]} alt={a.nombre ?? ''} className="h-full w-full object-cover" loading="lazy" />
                : <IconFile size={32} className="text-fg-3" />}
            </a>
            <div className="flex items-center gap-1 px-2 py-1.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium" title={a.nombre ?? ''}>{a.nombre ?? 'Adjunto'}</span>
                <span className="text-xs text-fg-3">{fechaCorta(a.fecha)} · {tamanoLegible(a.tamano)}</span>
              </div>
              {!soloLectura && puedeBorrar && (
                <button onClick={() => setBorrar(a)} aria-label="Borrar adjunto" className="rounded-sm p-1 text-fg-3 hover:bg-bg-4 hover:text-danger-fg"><IconTrash size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!borrar} onOpenChange={() => setBorrar(null)} title="Borrar adjunto"
        description={`«${borrar?.nombre ?? ''}» se borrará para siempre.`}
        actions={[{ label: 'Borrar', variant: 'danger', onClick: async () => { if (borrar) { await borrarAdjunto(borrar).catch((x) => setErr(mensajeError(x))); setBorrar(null); await cargar() } } }]} />
    </div>
  )
}

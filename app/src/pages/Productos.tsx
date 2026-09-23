import * as React from 'react'
import { IconPhoto, IconSearch, IconUpload, IconX } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { errorNombre, guardarProducto, listarProductosCat, subirFoto, type ProductoFila } from '@/data/catalogos'
import { camposDe, plantillas, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import { PageHeader } from '@/layout/AppShell'
import { CamposForm, aTexto, limpiar } from '@/components/CampoInput'
import { Button, Dialog, FormRow, Input, SectionLabel, Sheet, Tag } from '@/ui'
import { Interruptor } from '@/pages/ajustes/Ajustes'
import { cn, locale } from '@/lib/utils'
import { min } from '@/lib/vocab'

export function formatoPrecio(n: number | null | undefined, moneda = 'EUR') {
  if (n == null) return null
  try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(n) } catch { return `${n} ${moneda}` }
}

/** Catálogo de productos: tarjetas con foto, búsqueda y baja lógica (nunca se borran). */
export function Productos() {
  const { tienda, vocab, gr, rol } = useAuth()
  const puedeEditar = rol === 'ADMIN' || rol === 'OPERATIVO'
  const moneda = String((tienda?.ajustes as Record<string, unknown>)?.moneda ?? 'EUR')
  const [lista, setLista] = React.useState<ProductoFila[] | null>(null)
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [q, setQ] = React.useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [inactivos, setInactivos] = React.useState(false)
  const [editar, setEditar] = React.useState<ProductoFila | 'nuevo' | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [l, p] = await Promise.all([listarProductosCat(tienda.id), plantillas(tienda.id)])
    setLista(l); setPs(p)
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  const t = q.trim().toLowerCase()
  const visibles = (lista ?? []).filter((p) => (inactivos || p.activo) && (!t || p.nombre.toLowerCase().includes(t)))
  const nInactivos = (lista ?? []).filter((p) => !p.activo).length

  return (
    <>
      <PageHeader title={vocab.productos} subtitle={lista ? `${visibles.length} de ${lista.length}` : undefined}>
        {puedeEditar && <Button variant="primary" onClick={() => setEditar('nuevo')}>+ {vocab.producto}</Button>}
      </PageHeader>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-light px-4">
        <div className="relative w-[280px]">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <Input className="h-7 pl-8" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {nInactivos > 0 && <Interruptor checked={inactivos} onChange={setInactivos} label={`Ver inactiv${gr.o('producto', true)} (${nInactivos})`} />}
        {err && <span className="inline-flex items-center gap-2 rounded-sm bg-danger-bg px-2 py-0.5 text-sm text-danger-fg">{err}<button className="font-medium underline" onClick={() => { setErr(null); cargar().catch((x) => setErr(mensajeError(x))) }}>Reintentar</button></span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {lista === null ? <p className="text-fg-3">Cargando…</p> : visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-fg-3">
            <span>{lista.length === 0 ? `Todavía no hay ${min(vocab.productos)} en el catálogo.` : 'Nada coincide con la búsqueda.'}</span>
            {puedeEditar && lista.length === 0 && <Button variant="primary" onClick={() => setEditar('nuevo')}>Añadir {gr.genero.producto === 'f' ? 'la primera' : 'el primer'} {min(vocab.producto)}</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {visibles.map((p) => (
              <button key={p.id} onClick={() => setEditar(p)}
                className={cn('flex flex-col overflow-hidden rounded-md border border-border bg-bg text-left hover:border-border-strong', !p.activo && 'opacity-55')}>
                <div className="flex aspect-[4/3] items-center justify-center bg-bg-3">
                  {p.foto_url ? <img src={p.foto_url} alt="" className="h-full w-full object-cover" loading="lazy"
                    onError={(e) => { const img = e.currentTarget; img.style.display = 'none'; img.insertAdjacentHTML('afterend', '<span class="text-sm text-fg-3">La foto no carga</span>') }} /> : <IconPhoto size={28} className="text-gray-7" />}
                </div>
                <div className="flex flex-col gap-1 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 truncate font-medium">{p.nombre}</span>
                    {!p.activo && <Tag color="gray">inactiv{gr.o('producto')}</Tag>}
                  </div>
                  <span className="text-sm text-fg-3">
                    {[formatoPrecio(p.precio_base, moneda), p.encargos ? `${p.encargos} ${p.encargos === 1 ? min(vocab.encargo) : min(vocab.encargos)}` : null].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <EditarProducto p={editar} ps={ps} soloLectura={!puedeEditar} onClose={() => setEditar(null)} onSaved={cargar} lista={lista ?? []} />
    </>
  )
}

function EditarProducto({ p, ps, lista, soloLectura, onClose, onSaved }: {
  p: ProductoFila | 'nuevo' | null; ps: PlantillaCampos[]; lista: ProductoFila[]; soloLectura: boolean
  onClose: () => void; onSaved: () => Promise<void>
}) {
  const { tienda, vocab, gr } = useAuth()
  const nuevo = p === 'nuevo'
  const campos = camposDe(ps, 'PRODUCTO')
  const [f, setF] = React.useState({ nombre: '', precio: '', foto: '', activo: true, datos: {} as Record<string, string> })
  const [inicial, setInicial] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [subiendo, setSubiendo] = React.useState(false)
  const [fotoMal, setFotoMal] = React.useState(false)
  const [confirmarBaja, setConfirmarBaja] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!p) return
    const v = p === 'nuevo'
      ? { nombre: '', precio: '', foto: '', activo: true, datos: {} }
      : { nombre: p.nombre, precio: p.precio_base == null ? '' : String(p.precio_base), foto: p.foto_url ?? '', activo: p.activo, datos: aTexto(p.datos) }
    setF(v); setInicial(JSON.stringify(v)); setErr(null); setFotoMal(false)
  }, [p])

  const sucio = JSON.stringify(f) !== inicial
  async function subir(file: File) {
    if (!tienda) return
    setSubiendo(true); setErr(null)
    try { const url = await subirFoto(tienda.id, file); setF((s) => ({ ...s, foto: url })); setFotoMal(false) }
    catch (x) { setErr(mensajeError(x)) } finally { setSubiendo(false) }
  }
  async function guardar(confirmado = false) {
    if (!tienda || !p) return
    const nombre = f.nombre.trim()
    if (!nombre) { setErr('El nombre es obligatorio'); return }
    const otro = lista.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && (nuevo || x.id !== (p as ProductoFila).id))
    if (otro) { setErr(`Ya existe ${gr.con('producto', 'un')} con ese nombre${otro.activo ? '' : ` (inactiv${gr.o('producto')})`}`); return }
    const precio = f.precio.trim() ? Number(f.precio.replace(',', '.')) : null
    if (precio != null && !(precio >= 0)) { setErr('El precio no es válido'); return }
    const falta = campos.filter((c) => c.obligatorio && !f.datos[c.clave])
    if (falta.length) { setErr(`Falta: ${falta.map((c) => c.etiqueta).join(', ')}`); return }
    if (!nuevo && !f.activo && (p as ProductoFila).activo && !confirmado) { setConfirmarBaja(true); return }
    setBusy(true); setErr(null)
    try {
      await guardarProducto(tienda.id, nuevo ? null : (p as ProductoFila).id, {
        nombre, precio_base: precio, foto_url: f.foto.trim() || null, activo: f.activo,
        datos: limpiar(f.datos, nuevo ? {} : (p as ProductoFila).datos),
      })
      await onSaved(); onClose()
    } catch (x) { setErr(errorNombre(mensajeError(x), gr.con('producto', 'un'))) } finally { setBusy(false) }
  }

  const titulo = nuevo ? gr.Con('producto', 'nuevo') : (p as ProductoFila | null)?.nombre ?? ''
  return (
    <>
      <Sheet open={!!p} onOpenChange={(o) => !o && onClose()} side="right" title={titulo} className="flex flex-col gap-4 overflow-auto">
        <div className="text-md font-semibold">{titulo}</div>
        <div className="flex flex-col gap-2">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-bg-3">
            {f.foto && !fotoMal
              ? <a href={f.foto} target="_blank" rel="noopener noreferrer" title="Ver a tamaño completo" className="h-full w-full"><img src={f.foto} alt="" className="h-full w-full object-cover" onError={() => setFotoMal(true)} /></a>
              : <span className="flex flex-col items-center gap-1 text-sm text-fg-3"><IconPhoto size={28} className="text-gray-7" />{fotoMal ? 'La foto no carga: revisa el enlace' : 'Sin foto'}</span>}
            {f.foto && !soloLectura && (
              <button aria-label="Quitar foto" onClick={() => setF({ ...f, foto: '' })} className="absolute right-2 top-2 rounded-sm bg-bg/90 p-1 text-fg-2 hover:text-fg"><IconX size={14} /></button>
            )}
          </div>
          {!soloLectura && (
            <div className="flex gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) subir(file); e.target.value = '' }} />
              <Button size="sm" disabled={subiendo} onClick={() => fileRef.current?.click()}><IconUpload size={13} /> {subiendo ? 'Subiendo…' : 'Subir foto'}</Button>
              <Input className="h-6 text-sm" placeholder="…o pega un enlace a la foto" value={f.foto.startsWith('http') ? f.foto : ''} onChange={(e) => { setF({ ...f, foto: e.target.value }); setFotoMal(false) }} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <FormRow label="Nombre *"><Input className="h-7" disabled={soloLectura} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus={nuevo} /></FormRow>
          <FormRow label="Precio"><Input className="h-7 w-[140px]" disabled={soloLectura} inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} placeholder="Opcional" /></FormRow>
          <CamposForm campos={campos} valores={f.datos} onCambio={(k, v) => setF((s) => ({ ...s, datos: { ...s.datos, [k]: v } }))} />
          {!nuevo && (
            <FormRow label="Estado">
              <Interruptor checked={f.activo} disabled={soloLectura} onChange={(v) => setF({ ...f, activo: v })} label={f.activo ? `Activ${gr.o('producto')}: se puede elegir` : `Inactiv${gr.o('producto')}: no sale al crear`} />
            </FormRow>
          )}
        </div>
        {campos.length === 0 && !soloLectura && (
          <p className="text-sm text-fg-3">¿Necesitas más datos de cada {min(vocab.producto)}? Añádelos en Ajustes → Campos → {vocab.producto}.</p>
        )}
        {!nuevo && (p as ProductoFila | null)?.encargos ? (
          <div className="flex flex-col gap-1">
            <SectionLabel>Uso</SectionLabel>
            <span className="text-fg-2">{(p as ProductoFila).encargos} {(p as ProductoFila).encargos === 1 ? min(vocab.encargo) : min(vocab.encargos)} con {gr.con('producto', 'este')}. Si cambias el nombre, se ve el nuevo en todos.</span>
          </div>
        ) : null}
        {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
        {!soloLectura && (
          <div className="sticky bottom-0 -mx-5 mt-auto flex justify-end gap-1.5 border-t border-border bg-bg px-5 pt-3">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button variant="primary" onClick={() => guardar()} disabled={busy || subiendo || (!nuevo && !sucio)}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        )}
      </Sheet>
      <Dialog open={confirmarBaja} onOpenChange={setConfirmarBaja} title={`Dejar ${gr.con('producto', 'el')} inactiv${gr.o('producto')}`}
        description={`Dejará de aparecer al crear ${min(vocab.encargos)}, pero no se borra: ${gr.con('encargo', 'los')} que ya ${gr.genero.producto === 'f' ? 'la' : 'lo'} usan lo conservan y puedes reactivarl${gr.o('producto')} cuando quieras.`}
        actions={[{ label: 'Dejar inactiv' + gr.o('producto'), onClick: async () => { setConfirmarBaja(false); await guardar(true) } }]} />
    </>
  )
}

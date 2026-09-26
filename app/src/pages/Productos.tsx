import { useLocation } from 'react-router-dom'
import * as React from 'react'
import { nombreMenu } from '@/lib/pantallas'
import { coincide } from '@/lib/texto'
import { IconPhoto, IconSearch, IconUpload, IconX } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { ajustesFicha, errorNombre, guardarProducto, listarProductosCat, subirFoto, tieneFicha, type ProductoFila } from '@/data/catalogos'
import { ajustesMaterial, cant, listarMateriales, unidadPorTipo } from '@/data/materiales'
import { camposDe, leerNumero, plantillas, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import { PageHeader } from '@/layout/AppShell'
import { CamposForm, CamposVista, aTexto, limpiar } from '@/components/CampoInput'
import { Button, Dialog, FormRow, Input, SectionLabel, Select, Sheet, Tag, Textarea } from '@/ui'
import { Interruptor } from '@/pages/ajustes/Ajustes'
import { ajustesDinero, cn, locale } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { ListasTienda } from '@/components/ListasTienda'
import { RecetaEditor, limpiarReceta } from '@/components/RecetaEditor'
import { useListas, type Componente } from '@/data/listas'

/** «A medida · 8,7 m · Complementos: …» */
export function resumenFicha(p: { material_tipo?: string | null; consumo?: number | null; construccion?: string | null; receta?: string | null }, aj: Record<string, unknown> | null | undefined) {
  const mat = ajustesMaterial(aj)
  const ud = mat.activo && p.material_tipo ? unidadPorTipo.get(p.material_tipo) : undefined
  return [p.construccion, p.consumo != null ? `${p.material_tipo ? `${p.material_tipo} ` : ''}${ud ? cant(p.consumo, ud) : Number(p.consumo).toLocaleString('es-ES')}` : p.material_tipo,
    p.receta ? `${ajustesFicha(aj).etiqueta}: ${p.receta}` : null].filter(Boolean).join(' · ')
}

export function formatoPrecio(n: number | null | undefined, moneda = 'EUR') {
  if (n == null) return null
  try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(n) } catch { return `${n} ${moneda}` }
}

/** Catálogo de productos: tarjetas con foto, búsqueda y baja lógica (nunca se borran). */
export function Productos() {
  const { tienda, vocab, gr, rol } = useAuth()
  const puedeEditar = rol === 'ADMIN' || rol === 'OPERATIVO'
  const moneda = String((tienda?.ajustes as Record<string, unknown>)?.moneda ?? 'EUR')
  // Precio y aviso de ficha, solo si la tienda usa importes / fichas
  const usaDinero = ajustesDinero(tienda?.ajustes as Record<string, unknown>).usa
  const usaFichas = ajustesFicha(tienda?.ajustes as Record<string, unknown>).construcciones.length > 0 || ajustesMaterial(tienda?.ajustes as Record<string, unknown>).activo
  const [lista, setLista] = React.useState<ProductoFila[] | null>(null)
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [q, setQ] = React.useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [inactivos, setInactivos] = React.useState(false)
  const [soloInactivos, setSoloInactivos] = React.useState(false)
  // La búsqueda puede llegar por la URL (desde el buscador) estando ya en esta pantalla
  const loc = useLocation()
  React.useEffect(() => { const u = new URLSearchParams(loc.search).get('q'); if (u != null) setQ(u) }, [loc.search])
  // Si lo buscado solo está entre los inactivos, se muestran
  React.useEffect(() => {
    if (!q.trim() || !lista) return
    const m = lista.filter((p) => coincide(q, [p.nombre]))
    if (m.length && m.every((p) => !p.activo)) setInactivos(true)
  }, [q, lista])
  const [editar, setEditar] = React.useState<ProductoFila | 'nuevo' | null>(null)
  const [vista, setVista] = React.useState<'productos' | 'listas'>(() => new URLSearchParams(window.location.search).get('v') === 'listas' ? 'listas' : 'productos')
  const [err, setErr] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [l, p] = await Promise.all([listarProductosCat(tienda.id), plantillas(tienda.id)])
    setLista(l); setPs(p)
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  // Búsqueda sin tildes ni mayúsculas (igual que el buscador general)
  const visibles = (lista ?? []).filter((p) => (soloInactivos ? !p.activo : inactivos || p.activo) && (!q.trim() || coincide(q, [p.nombre])))
  const [fotoMal, setFotoMalLista] = React.useState<Set<string>>(new Set())
  const nInactivos = (lista ?? []).filter((p) => !p.activo).length

  return (
    <>
      <PageHeader title={nombreMenu(tienda?.ajustes as Record<string, unknown>, 'productos', vocab.productos)} subtitle={lista && vista === 'productos' ? `${visibles.length} de ${lista.length}` : undefined}>
        {puedeEditar && vista === 'productos' && <Button variant="primary" onClick={() => setEditar('nuevo')}>+ {vocab.producto}</Button>}
      </PageHeader>
      <div className="flex h-10 shrink-0 items-end gap-4 border-b border-border-light px-4" role="tablist">
        {([['productos', vocab.productos], ['listas', 'Listas de la tienda']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={cn('-mb-px border-b-2 pb-2 text-sm', vista === k ? 'border-fg font-medium text-fg' : 'border-transparent text-fg-2 hover:text-fg')}>{l}</button>
        ))}
      </div>
      {vista === 'listas' ? <ListasTienda soloLectura={!puedeEditar} /> : <>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-light px-4">
        <div className="relative w-[280px] max-md:w-full">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <Input className="h-7 pl-8" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {nInactivos > 0 && !soloInactivos && <Interruptor checked={inactivos} onChange={setInactivos} label={`Ver inactiv${gr.o('producto', true)} (${nInactivos})`} />}
        {nInactivos > 0 && <label className="flex shrink-0 items-center gap-1.5 text-sm text-fg-2"><input type="checkbox" className="accent-gray-12" checked={soloInactivos} onChange={(e) => setSoloInactivos(e.target.checked)} />Solo inactiv{gr.o('producto', true)}</label>}
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
                  {p.foto_url && !fotoMal.has(p.foto_url) ? <img src={p.foto_url} alt="" className="h-full w-full object-cover" loading="lazy"
                    onError={() => setFotoMalLista((s) => new Set(s).add(p.foto_url!))} />
                    : p.foto_url ? <span className="text-sm text-fg-3">La foto no carga</span> : <IconPhoto size={28} className="text-gray-7" />}
                </div>
                <div className="flex flex-col gap-1 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 truncate font-medium">{p.nombre}</span>
                    {!p.activo && <Tag color="gray">inactiv{gr.o('producto')}</Tag>}
                  </div>
                  {tieneFicha(p) ? <span className="truncate text-xs text-fg-2">{resumenFicha(p, tienda?.ajustes as Record<string, unknown>)}</span>
                    : puedeEditar && usaFichas && <span className="text-xs text-warn-fg">Sin ficha técnica</span>}
                  {String((p.datos as Record<string, unknown> | null)?.notas ?? '').trim() && <span className="line-clamp-2 text-xs text-fg-3">{String((p.datos as Record<string, unknown>).notas)}</span>}
                  <span className="text-sm text-fg-3">
                    {[usaDinero ? formatoPrecio(p.precio_base, moneda) : null, p.encargos ? `${p.encargos} ${p.encargos === 1 ? min(vocab.encargo) : min(vocab.encargos)}` : null].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      </>}

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
  const vacio = { nombre: '', precio: '', foto: '', activo: true, datos: {} as Record<string, string>, mtipo: '', consumo: '', construccion: '', receta: '', componentes: [] as Componente[] }
  const [f, setF] = React.useState(vacio)
  const ajs = tienda?.ajustes as Record<string, unknown>
  const fic = ajustesFicha(ajs)
  const mat = ajustesMaterial(ajs)
  // Tipos de material y su unidad (la del primero de cada tipo)
  const [udTipo, setUdTipo] = React.useState<Record<string, string>>({})
  const [varTipo, setVarTipo] = React.useState<Record<string, string[]>>({})
  const tiposMat = Object.keys(udTipo)
  React.useEffect(() => { if (p && tienda && mat.activo) listarMateriales(tienda.id).then((ms) => {
    const r: Record<string, string> = {}, v: Record<string, string[]> = {}
    for (const m of ms) { r[m.tipo] ??= m.unidad; if (m.variante && m.activo !== false) (v[m.tipo] ??= []).includes(m.variante) || v[m.tipo].push(m.variante) }
    setUdTipo(r); setVarTipo(v)
  }).catch(() => {}) }, [p, tienda, mat.activo])
  const listas = useListas(p ? tienda?.id : null)
  const camposEnc = [...new Map(ps.filter((x) => x.entidad === 'ENCARGO').flatMap((x) => x.campos ?? []).map((c) => [c.clave, c])).values()]
  const udConsumo = udTipo[f.mtipo] ?? mat.unidad
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
      ? vacio
      : { nombre: p.nombre, precio: p.precio_base == null ? '' : String(p.precio_base), foto: p.foto_url ?? '', activo: p.activo, datos: aTexto(p.datos),
          mtipo: p.material_tipo ?? '', consumo: p.consumo == null ? '' : String(p.consumo), construccion: p.construccion ?? '', receta: p.receta ?? '', componentes: (p.componentes ?? []) as Componente[] }
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
    const precio = f.precio.trim() ? (leerNumero(f.precio, { dinero: true }) ?? NaN) : null
    if (precio != null && !(precio >= 0)) { setErr('El precio no es válido: escribe solo el número, p. ej. 1.250,50'); return }
    const consumo = f.consumo.trim() ? (leerNumero(f.consumo) ?? NaN) : null
    if (consumo != null && !(consumo >= 0)) { setErr('El consumo no es válido: escribe solo el número, p. ej. 8,35'); return }
    const falta = campos.filter((c) => c.obligatorio && !f.datos[c.clave])
    if (falta.length) { setErr(`Falta: ${falta.map((c) => c.etiqueta).join(', ')}`); return }
    if (!nuevo && !f.activo && (p as ProductoFila).activo && !confirmado) { setConfirmarBaja(true); return }
    setBusy(true); setErr(null)
    try {
      await guardarProducto(tienda.id, nuevo ? null : (p as ProductoFila).id, {
        nombre, precio_base: precio, foto_url: f.foto.trim() || null, activo: f.activo,
        datos: limpiar(f.datos, nuevo ? {} : (p as ProductoFila).datos),
        material_tipo: f.mtipo.trim() || null, consumo, construccion: f.construccion.trim() || null, receta: f.receta.trim() || null,
        componentes: limpiarReceta(f.componentes),
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
              <Input className="h-6 text-sm" placeholder="…o pega un enlace a la foto" value={f.foto} onChange={(e) => { setF({ ...f, foto: e.target.value }); setFotoMal(false) }} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <FormRow label="Nombre *"><Input className="h-7" disabled={soloLectura} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus={nuevo} /></FormRow>
          {(ajustesDinero(ajs).usa || f.precio) && <FormRow label="Precio"><Input className="h-7 w-[140px]" disabled={soloLectura} inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} placeholder="Opcional" /></FormRow>}
          {soloLectura ? <CamposVista campos={campos} datos={f.datos} soloRellenos />
            : <CamposForm campos={campos} valores={f.datos} onCambio={(k, v) => setF((s) => ({ ...s, datos: { ...s.datos, [k]: v } }))} />}
          {!nuevo && (
            <FormRow label="Estado">
              <Interruptor checked={f.activo} disabled={soloLectura} onChange={(v) => setF({ ...f, activo: v })} label={f.activo ? `Activ${gr.o('producto')}: se puede elegir` : `Inactiv${gr.o('producto')}: no sale al crear`} />
            </FormRow>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <SectionLabel>Ficha técnica</SectionLabel>
          {mat.activo && <>
            <datalist id="tipos-mat-prod">{tiposMat.map((x) => <option key={x} value={x} />)}</datalist>
            <FormRow label={`${vocab.material} principal`} ayuda={`El tipo que lleva; la variante (color, acabado…) se elige en cada ${min(vocab.encargo)}.`}>
              <Input className="h-7" list="tipos-mat-prod" disabled={soloLectura} value={f.mtipo} onChange={(e) => setF({ ...f, mtipo: e.target.value })} />
            </FormRow>
          </>}
          {(mat.activo || f.consumo) && <FormRow label={`Consumo${mat.activo ? ` (${udConsumo})` : ''}`} ayuda={`Cuánto ${mat.activo ? `${min(vocab.material)} ` : ''}gasta una unidad. ${mat.activo ? `Se propone al añadir ${gr.con('material', 'el')} ${gr.con('encargo', 'al')} y es lo que se descuenta.` : ''}`}>
            <Input className="h-7 w-[120px]" inputMode="decimal" disabled={soloLectura} value={f.consumo} onChange={(e) => setF({ ...f, consumo: e.target.value })} />
          </FormRow>}
          {(fic.construcciones.length > 0 || f.construccion) && (
            <FormRow label="Elaboración">
              <Select disabled={soloLectura} value={f.construccion} onChange={(e) => setF({ ...f, construccion: e.target.value })}>
                <option value="">—</option>
                {[...new Set([...fic.construcciones, ...(f.construccion ? [f.construccion] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </FormRow>
          )}
          {(fic.usaComplementos || f.receta) && <FormRow label={fic.etiqueta} ayuda={`Receta: se muestra como pista al crear ${min(vocab.encargos)}; allí solo se anota la variante.`}>
            <Textarea disabled={soloLectura} value={f.receta} onChange={(e) => setF({ ...f, receta: e.target.value })} placeholder="Qué lleva y cuánto" />
          </FormRow>}
          {!mat.activo && !f.consumo && !fic.usaComplementos && !f.receta && fic.construcciones.length === 0 && !f.construccion && <span className="text-sm text-fg-3">Sin datos técnicos que rellenar con los ajustes actuales.</span>}
        </div>
        <div className="flex flex-col gap-1">
          <SectionLabel>Receta: qué lleva</SectionLabel>
          <RecetaEditor value={f.componentes} onChange={(c) => setF((s) => ({ ...s, componentes: c }))} listas={listas}
            variantes={varTipo[f.mtipo] ?? Object.values(varTipo).flat()} etiquetaVariante={mat.activo ? mat.etiquetaVariante : null}
            campos={camposEnc} etiquetaComplementos={fic.etiqueta} encargo={gr.con('encargo', 'un')} producto={`lo marca ${gr.con('producto', 'el')}`} soloLectura={soloLectura} />
          {!soloLectura && listas.length === 0 && <span className="text-xs text-fg-3">Consejo: crea antes una lista (colores, acabados…) en «Listas de la tienda» para elegir de ella.</span>}
        </div>
        {campos.length === 0 && !soloLectura && (
          <p className="text-sm text-fg-3">¿Necesitas más datos de cada {min(vocab.producto)}? Añádelos en Ajustes → Datos que guardáis → {vocab.producto}.</p>
        )}
        {!nuevo && (p as ProductoFila | null)?.encargos ? (
          <div className="flex flex-col gap-1">
            <SectionLabel>Uso</SectionLabel>
            <span className="text-fg-2">{(p as ProductoFila).encargos} {(p as ProductoFila).encargos === 1 ? min(vocab.encargo) : min(vocab.encargos)} con {gr.con('producto', 'este')}. Si cambias el nombre, se ve el nuevo en todos.</span>
          </div>
        ) : null}
        {err && soloLectura && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
        {!soloLectura && (
          <div className="sticky bottom-0 -mx-5 mt-auto flex flex-wrap items-center justify-end gap-1.5 border-t border-border bg-bg px-5 pt-3">
            {err && <div role="alert" className="mr-auto rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg max-md:w-full">{err}</div>}
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

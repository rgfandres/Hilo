import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  ajustesMaterial, anadirLinea, asignarMaterial, avisoStock, cant, desasignarMaterial, guardarMaterial, guardarResto,
  lineasDeEncargo, listarMateriales, nombreMaterial, quitarLinea, restoCandidato, type LineaMaterial, type MaterialEstado,
} from '@/data/materiales'
import { mensajeError } from '@/data/encargos'
import { Button, Combobox, Dialog, FormRow, SectionLabel, Tag, useAvisos, type TagColor } from '@/ui'
import { NumeroInput } from '@/components/CampoInput'
import { min } from '@/lib/vocab'

const ESTADO: Record<LineaMaterial['estado'], { txt: string; color: TagColor }> = {
  PENDIENTE: { txt: 'Pendiente', color: 'amber' }, PEDIDO: { txt: 'Pedido', color: 'blue' }, RECIBIDO: { txt: 'Recibido', color: 'green' },
}

/**
 * Elegir material en cascada: tipo → variante (cambiar el tipo borra la variante) y cantidad.
 * Se guarda la referencia al material, no un texto. Avisa si con lo pedido por todos no alcanza.
 */
export function SelectorMaterial({ materiales, valor, onCambio, onCreado, puedeCrear }: {
  materiales: MaterialEstado[]
  valor: { tipo: string; material_id: string; cantidad: string }
  onCambio: (v: { tipo: string; material_id: string; cantidad: string }) => void
  onCreado?: (m: MaterialEstado) => void
  puedeCrear: boolean
}) {
  const { tienda, vocab } = useAuth()
  const aj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const activos = materiales.filter((m) => m.activo || m.id === valor.material_id)
  const tipos = [...new Set([...activos.map((m) => m.tipo), ...(valor.tipo ? [valor.tipo] : [])])].sort((a, b) => a.localeCompare(b, 'es'))
  const variantes = activos.filter((m) => m.tipo === valor.tipo)
  const elegido = materiales.find((m) => m.id === valor.material_id)
  const aviso = avisoStock(elegido, Number(valor.cantidad || 0))
  return (
    <>
      <FormRow label={`Tipo de ${min(vocab.material)}`}>
        <Combobox opciones={tipos.map((t) => ({ id: t, nombre: t }))} value={valor.tipo} vacio="— elegir —" ariaLabel={`Tipo de ${min(vocab.material)}`}
          onChange={(t) => onCambio({ tipo: t, material_id: '', cantidad: valor.cantidad })}
          etiquetaCrear="Nuevo tipo" crear={puedeCrear ? async (n) => n : undefined} />
      </FormRow>
      <FormRow label="Variante">
        <Combobox opciones={variantes.map((m) => ({ id: m.id, nombre: m.variante || '(sin variante)', nota: cant(m.stock, aj.unidad) }))} value={valor.material_id}
          vacio={valor.tipo ? '— elegir —' : 'Elige antes el tipo'} ariaLabel="Variante" etiquetaCrear="Añadir al catálogo"
          onChange={(id) => onCambio({ ...valor, material_id: id })}
          crear={puedeCrear && valor.tipo && tienda ? async (n) => {
            const id = await guardarMaterial(tienda.id, null, { tipo: valor.tipo, variante: n, proveedor_id: null, umbral: null, unidad_pedido: null, ubicacion: null, notas: null, activo: true })
            onCreado?.({ id, tienda_id: tienda.id, tipo: valor.tipo, variante: n, proveedor_id: null, proveedor_nombre: null, stock: 0, umbral: null, unidad_pedido: null,
              ubicacion: null, notas: null, activo: true, unidad_efectiva: null, umbral_efectivo: 0, demanda: 0, encargos_pendientes: 0, demanda_sin_pedir: 0, en_camino: 0, restos: 0 })
            return id
          } : undefined} />
      </FormRow>
      <FormRow label={`Cantidad (${aj.unidad})`}><NumeroInput value={valor.cantidad} onChange={(c) => onCambio({ ...valor, cantidad: c })} /></FormRow>
      {elegido && aviso.nivel && (
        <p className={`my-1 rounded-sm px-2.5 py-1.5 text-sm ${aviso.nivel === 'falta' ? 'bg-danger-bg text-danger-fg' : 'bg-warn-bg text-warn-fg'}`}>
          {aviso.nivel === 'falta' ? `No hay ${min(vocab.material)} suficiente` : `${vocab.material} al límite`}: con lo pedido por {elegido.encargos_pendientes + 1} {elegido.encargos_pendientes === 0 ? min(vocab.encargo) : min(vocab.encargos)}, {aviso.texto} {aj.unidad}.
          {' '}Hay {cant(elegido.stock, aj.unidad)}{Number(elegido.en_camino) > 0 ? ` y ${cant(elegido.en_camino, aj.unidad)} en camino` : ''}.
        </p>
      )}
    </>
  )
}

/** Sección «Material» en la ficha del encargo: qué lleva, en qué punto está y recibirlo (consume del stock). */
export function MaterialesEncargo({ encargo, editable, onCambio, refresco, sugerido }: {
  refresco?: Date
  /** De la ficha técnica del producto: tipo de material y consumo que se proponen al añadir */
  sugerido?: { tipo: string | null; consumo: number | null } | null
  encargo: { id: string; tienda_id: string; numero: number; serie?: string | null; estado: string }
  editable: boolean
  onCambio: () => void
}) {
  const { tienda, vocab, rol } = useAuth()
  const avisar = useAvisos()
  const aj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const [lineas, setLineas] = React.useState<LineaMaterial[]>([])
  const [mats, setMats] = React.useState<MaterialEstado[]>([])
  const [nuevo, setNuevo] = React.useState<{ tipo: string; material_id: string; cantidad: string } | null>(null)
  const [resto, setResto] = React.useState<{ m: MaterialEstado; cantidad: number } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const anulado = encargo.estado !== 'ACTIVO'

  const cargar = React.useCallback(async () => {
    const [l, m] = await Promise.all([lineasDeEncargo(encargo.id), listarMateriales(encargo.tienda_id)])
    setLineas(l); setMats(m)
  }, [encargo.id, encargo.tienda_id])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar, refresco])

  async function hacer(id: string, fn: () => Promise<unknown>) {
    setBusy(id); setErr(null)
    try { await fn(); await cargar(); onCambio() } catch (x) { setErr(mensajeError(x)) } finally { setBusy(null) }
  }
  async function recibir(l: LineaMaterial) {
    await hacer(l.id, async () => {
      const stock = await asignarMaterial(l.id)
      const m = mats.find((x) => x.id === l.material_id)
      avisar({ tipo: 'ok', texto: `${nombreMaterial(m)} asignado · quedan ${cant(stock, aj.unidad)}`, accion: { label: 'Deshacer', onClick: () => { hacer(l.id, () => desasignarMaterial(l.id)) } } })
      const r = m ? restoCandidato(stock, m.unidad_efectiva, aj.umbralResto) : 0
      if (m && r > 0) setResto({ m, cantidad: r })
    })
  }
  async function anadir() {
    if (!nuevo?.material_id) { setErr(`Elige ${min(vocab.material)} y variante`); return }
    await hacer('nuevo', async () => { await anadirLinea(encargo.tienda_id, encargo.id, nuevo.material_id, Number(nuevo.cantidad || 0)); setNuevo(null) })
  }

  const puedeEditar = editable && !anulado && rol !== 'LOGISTICA'
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{vocab.material}</SectionLabel>
      {lineas.length === 0 && !nuevo && <span className="text-sm text-fg-3">Sin {min(vocab.material)} asignado.</span>}
      {lineas.map((l) => {
        const m = mats.find((x) => x.id === l.material_id)
        const av = l.estado !== 'RECIBIDO' ? avisoStock(m) : { nivel: null, texto: '' }
        return (
          <div key={l.id} className="flex flex-col gap-1 border-b border-border-light py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 font-medium">{nombreMaterial(m)}</span>
              <span className="text-fg-2 tabular">{cant(l.cantidad, aj.unidad)}</span>
              <Tag color={ESTADO[l.estado].color}>{ESTADO[l.estado].txt}</Tag>
            </div>
            {!anulado && (
              <div className="flex flex-wrap gap-1.5">
                {l.estado !== 'RECIBIDO'
                  ? <Button size="sm" cargando={busy === l.id} onClick={() => recibir(l)} title={`Resta del stock y cuenta como recibido para este ${min(vocab.encargo)}`}>Recibido</Button>
                  : <Button size="sm" variant="ghost" cargando={busy === l.id} onClick={() => hacer(l.id, () => desasignarMaterial(l.id))} title="Devuelve el consumo al stock">Deshacer recibido</Button>}
                {puedeEditar && l.estado !== 'RECIBIDO' && <Button size="sm" variant="ghost" onClick={() => hacer(l.id, () => quitarLinea(l.id))}>Quitar</Button>}
              </div>
            )}
            {av.nivel && m && (
              <span className={`text-sm ${av.nivel === 'falta' ? 'text-danger-fg' : 'text-warn-fg'}`}>
                {av.nivel === 'falta' ? 'No alcanza' : 'Al límite'}: {av.texto} {aj.unidad}{Number(m.en_camino) > 0 ? ` (hay ${cant(m.en_camino, aj.unidad)} en camino)` : ''}.{' '}
                <Link to={`/materiales?v=pedidos`} className="underline">Pedir</Link>
              </span>
            )}
          </div>
        )
      })}
      {puedeEditar && !nuevo && <Button size="sm" variant="ghost" className="self-start" onClick={() => setNuevo({ tipo: sugerido?.tipo && mats.some((m) => m.tipo === sugerido.tipo) ? sugerido.tipo : '', material_id: '', cantidad: sugerido?.consumo != null ? String(sugerido.consumo) : '' })}>+ Añadir {min(vocab.material)}</Button>}
      {nuevo && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          <SelectorMaterial materiales={mats} valor={nuevo} onCambio={setNuevo} puedeCrear={rol === 'ADMIN' || rol === 'OPERATIVO'} onCreado={(m) => setMats((x) => [...x, m])} />
          <div className="flex gap-1.5 pt-1">
            <Button size="sm" variant="primary" cargando={busy === 'nuevo'} onClick={anadir}>Añadir</Button>
            <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}

      <DialogoResto resto={resto} unidad={aj.unidad} onCerrar={() => setResto(null)}
        onGuardar={async (r) => { await guardarResto(r.m.id, r.cantidad, `Sobrante tras el ${min(vocab.encargo)} ${encargo.serie ?? ''}${String(encargo.numero).padStart(3, '0')}`, encargo.id); await cargar() }} />
    </div>
  )
}

/** «¿Guardar como resto?»: lo que queda ya no llega a una unidad de pedido. Por defecto, sí. */
export function DialogoResto({ resto, unidad, onCerrar, onGuardar }: {
  resto: { m: MaterialEstado; cantidad: number } | null; unidad: string
  onCerrar: () => void; onGuardar: (r: { m: MaterialEstado; cantidad: number }) => Promise<void>
}) {
  const avisar = useAvisos()
  return (
    <Dialog open={!!resto} onOpenChange={(o) => { if (!o) onCerrar() }} title="¿Guardar como resto?"
      description={resto ? `De ${nombreMaterial(resto.m)} quedan ${cant(resto.cantidad, unidad)}: ya no llega a una unidad de pedido. Si lo apartas como resto, el stock queda a 0 y el trozo se ve en «Restos».` : ''}
      actions={[{ label: 'Guardar como resto', onClick: async () => {
        if (!resto) return
        try { await onGuardar(resto); avisar({ tipo: 'ok', texto: `Guardado como resto: ${cant(resto.cantidad, unidad)}` }); onCerrar() }
        catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
      } }]} />
  )
}

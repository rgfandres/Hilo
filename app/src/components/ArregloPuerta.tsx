import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { actualizarEncargo, asignarProveedor, listarProductos, listarProveedores, marcarCheck } from '@/data/encargos'
import { altaRapidaProducto, altaRapidaProveedor } from '@/data/catalogos'
import type { EncargoEstado, Puerta } from '@/lib/types'
import { Button, Combobox } from '@/ui'
import { min } from '@/lib/vocab'

type Cat = { id: string; nombre: string; activo: boolean }
const cache: { tienda?: string; prov?: Promise<Cat[]>; prod?: Promise<Cat[]> } = {}
function catalogos(tiendaId: string) {
  if (cache.tienda !== tiendaId) { cache.tienda = tiendaId; cache.prov = listarProveedores(tiendaId); cache.prod = listarProductos(tiendaId) }
  return { prov: cache.prov!, prod: cache.prod! }
}

/**
 * La acción recomendada para cumplir una condición pendiente, en el mismo sitio del aviso:
 * asignar proveedor, elegir producto, marcar la comprobación o completar un campo.
 */
export function ArregloPuerta({ e, p, onHecho, onCompletar, compacto }: {
  e: EncargoEstado; p: Puerta; onHecho: () => void; onCompletar?: () => void; compacto?: boolean
}) {
  const { rol, vocab } = useAuth()
  const [prov, setProv] = React.useState<Cat[]>([])
  const [prod, setProd] = React.useState<Cat[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const editar = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'
  const necesita = p.tipo === 'CAMPO_NO_VACIO' && (p.referencia === 'proveedor_id' || p.referencia === 'producto_id')
  React.useEffect(() => {
    if (!necesita) return
    const c = catalogos(e.tienda_id)
    c.prov.then(setProv).catch(() => {}); c.prod.then(setProd).catch(() => {})
  }, [necesita, e.tienda_id])

  async function hacer(fn: () => Promise<unknown>) {
    setErr(null)
    try { await fn(); cache.tienda = undefined; onHecho() } catch (x) { setErr((x as { message?: string })?.message ?? 'No se pudo') }
  }
  const ancho = compacto ? 'w-[200px]' : 'w-full'
  let control: React.ReactNode = null
  if (p.tipo === 'CAMPO_NO_VACIO' && p.referencia === 'proveedor_id' && rol !== 'ATENCION') {
    control = <Combobox className={ancho} vacio={`Asignar ${min(vocab.proveedor)}…`} value="" ariaLabel={`Asignar ${min(vocab.proveedor)}`}
      opciones={prov.filter((x) => x.activo)} onChange={(id) => id && hacer(() => asignarProveedor(e.id, id))}
      crear={rol === 'ADMIN' ? (n) => altaRapidaProveedor(e.tienda_id, n) : undefined} etiquetaCrear="Añadir" />
  } else if (p.tipo === 'CAMPO_NO_VACIO' && p.referencia === 'producto_id' && editar) {
    control = <Combobox className={ancho} vacio={`Elegir ${min(vocab.producto)}…`} value="" ariaLabel={`Elegir ${min(vocab.producto)}`}
      opciones={prod.filter((x) => x.activo)} onChange={(id) => id && hacer(() => actualizarEncargo(e.id, { producto_id: id }))}
      crear={rol === 'ADMIN' || rol === 'OPERATIVO' ? (n) => altaRapidaProducto(e.tienda_id, n) : undefined} etiquetaCrear="Añadir al catálogo" />
  } else if (p.tipo === 'CHECK' && p.referencia) {
    control = <Button size="sm" onClick={() => hacer(() => marcarCheck(e.id, p.referencia!, true))}>Marcar hecho</Button>
  } else if (p.tipo === 'CAMPO_NO_VACIO' && editar && onCompletar) {
    control = <Button size="sm" onClick={onCompletar}>Completar</Button>
  }
  if (!control && !err) return null
  return <span className="inline-flex flex-col gap-1">{control}{err && <span className="text-sm text-danger-fg">{err}</span>}</span>
}

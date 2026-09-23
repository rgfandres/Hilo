import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import type { Campo } from '@/data/config'
import {
  actualizarCliente, actualizarEncargo, asignarProveedor, listarProductos, listarProveedores, mensajeError,
} from '@/data/encargos'
import type { Cliente, EncargoEstado } from '@/lib/types'
import { Button, Combobox, Dialog, FormRow, Input, SectionLabel, Sheet, useAvisos } from '@/ui'
import { altaRapidaProducto, altaRapidaProveedor } from '@/data/catalogos'
import { CamposForm, aTexto, limpiar } from './CampoInput'
import { min } from '@/lib/vocab'

/**
 * Editar el encargo y su cliente con un solo «Guardar».
 * Logística solo puede cambiar el proveedor (el servidor lo impone igualmente).
 * Si se cierra con cambios sin guardar, pregunta antes de descartarlos.
 */
export function EditarEncargo({ open, onOpenChange, encargo, cliente, camposEnc, camposCli, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  encargo: EncargoEstado
  cliente: Cliente | null
  camposEnc: Campo[]
  camposCli: Campo[]
  onSaved: () => void
}) {
  const avisar = useAvisos()
  const { tienda, rol, vocab, gr } = useAuth()
  const soloProveedor = rol === 'LOGISTICA'
  const [productos, setProductos] = React.useState<{ id: string; nombre: string; activo: boolean }[]>([])
  const [proveedores, setProveedores] = React.useState<{ id: string; nombre: string; activo: boolean }[]>([])

  const inicial = React.useMemo(() => ({
    producto: encargo.producto_id ?? '',
    proveedor: encargo.proveedor_id ?? '',
    dEnc: aTexto(encargo.datos),
    nombre: cliente?.nombre ?? '',
    tel: cliente?.telefono ?? '',
    email: cliente?.email ?? '',
    dCli: aTexto(cliente?.datos),
  }), [encargo, cliente])
  const [f, setF] = React.useState(inicial)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [descartar, setDescartar] = React.useState(false)
  const [quitarProv, setQuitarProv] = React.useState(false)

  React.useEffect(() => { if (open) { setF(inicial); setErr(null) } }, [open, inicial])
  React.useEffect(() => {
    if (!open || !tienda) return
    Promise.all([listarProductos(tienda.id), listarProveedores(tienda.id)])
      .then(([p, v]) => { setProductos(p); setProveedores(v) })
      .catch((x) => setErr(mensajeError(x)))
  }, [open, tienda])

  const sucio = JSON.stringify(f) !== JSON.stringify(inicial)
  const cerrar = (o: boolean) => { if (!o && sucio) setDescartar(true); else onOpenChange(o) }

  async function guardar(confirmadoQuitar = false) {
    if (f.proveedor !== inicial.proveedor && !f.proveedor && !confirmadoQuitar) { setQuitarProv(true); return }
    if (!soloProveedor && !f.nombre.trim()) { setErr(`El nombre ${gr.con('cliente', 'del')} es obligatorio`); return }
    const falta = [...camposEnc.filter((c) => c.obligatorio && !f.dEnc[c.clave]), ...camposCli.filter((c) => c.obligatorio && !f.dCli[c.clave])]
    if (!soloProveedor && falta.length) { setErr(`Falta: ${falta.map((c) => c.etiqueta).join(', ')}`); return }
    setBusy(true); setErr(null)
    try {
      if (!soloProveedor) {
        if (f.producto !== inicial.producto || JSON.stringify(f.dEnc) !== JSON.stringify(inicial.dEnc)) {
          await actualizarEncargo(encargo.id, { producto_id: f.producto || null, datos: limpiar(f.dEnc, encargo.datos) })
        }
        if (cliente && (f.nombre !== inicial.nombre || f.tel !== inicial.tel || f.email !== inicial.email
            || JSON.stringify(f.dCli) !== JSON.stringify(inicial.dCli))) {
          await actualizarCliente(cliente.id, {
            nombre: f.nombre.trim(), telefono: f.tel.trim() || null, email: f.email.trim() || null,
            datos: limpiar(f.dCli, cliente.datos),
          })
        }
      }
      if (f.proveedor !== inicial.proveedor) await asignarProveedor(encargo.id, f.proveedor || null)
      onSaved()
      avisar({ tipo: 'ok', texto: 'Cambios guardados' })
      onOpenChange(false)
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const provActual = proveedores.find((p) => p.id === inicial.proveedor)

  return (
    <>
      <Sheet open={open} onOpenChange={cerrar} side="right" title={`Editar ${min(vocab.encargo)}`} className="flex flex-col gap-4 overflow-auto">
        <div className="text-md font-semibold">Editar {min(vocab.encargo)}</div>

        <div className="flex flex-col gap-1">
          <SectionLabel>{vocab.encargo}</SectionLabel>
          {!soloProveedor && (
            <FormRow label={vocab.producto}>
              <Combobox value={f.producto} onChange={set('producto')} vacio="— sin decidir —" ariaLabel={vocab.producto} etiquetaCrear="Añadir al catálogo"
                opciones={productos.filter((p) => p.activo || p.id === f.producto).map((p) => ({ id: p.id, nombre: p.nombre, nota: p.activo ? undefined : 'inactivo' }))}
                crear={rol === 'ADMIN' || rol === 'OPERATIVO' ? async (n) => {
                  const id = await altaRapidaProducto(encargo.tienda_id, n)
                  setProductos((l) => l.some((x) => x.id === id) ? l : [...l, { id, nombre: n, activo: true }])
                  return id
                } : undefined} />
            </FormRow>
          )}
          <FormRow label={vocab.proveedor}>
            <Combobox value={f.proveedor} onChange={set('proveedor')} vacio="— sin asignar —" ariaLabel={vocab.proveedor} etiquetaCrear="Añadir"
              opciones={[...proveedores.filter((p) => p.activo), ...(provActual && !provActual.activo ? [provActual] : [])].map((p) => ({ id: p.id, nombre: p.nombre, nota: p.activo ? undefined : 'inactivo' }))}
              crear={rol === 'ADMIN' ? async (n) => {
                const id = await altaRapidaProveedor(encargo.tienda_id, n)
                setProveedores((l) => l.some((x) => x.id === id) ? l : [...l, { id, nombre: n, activo: true }])
                return id
              } : undefined} />
          </FormRow>
          {!soloProveedor && <CamposForm campos={camposEnc} valores={f.dEnc} onCambio={(k, v) => setF((s) => ({ ...s, dEnc: { ...s.dEnc, [k]: v } }))} />}
        </div>

        {!soloProveedor && cliente && (
          <div className="flex flex-col gap-1">
            <SectionLabel>{vocab.cliente}</SectionLabel>
            <FormRow label="Nombre *"><Input className="h-7" value={f.nombre} onChange={(e) => set('nombre')(e.target.value)} /></FormRow>
            <FormRow label="Teléfono"><Input className="h-7" type="tel" value={f.tel} onChange={(e) => set('tel')(e.target.value)} /></FormRow>
            <FormRow label="Correo"><Input className="h-7" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} /></FormRow>
            <CamposForm pegar campos={camposCli} valores={f.dCli} onCambio={(k, v) => setF((s) => ({ ...s, dCli: { ...s.dCli, [k]: v } }))} />
            <p className="pt-1 text-sm text-fg-3">Los cambios {gr.con('cliente', 'del')} se ven en tod{gr.o('encargo', true)} sus {min(vocab.encargos)}.</p>
          </div>
        )}

        {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
        <div className="sticky bottom-0 -mx-5 mt-auto flex justify-end gap-1.5 border-t border-border bg-bg px-5 pt-3">
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={() => guardar()} disabled={busy || !sucio}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </Sheet>

      <Dialog open={descartar} onOpenChange={setDescartar} title="¿Descartar los cambios?"
        description="Has cambiado datos que aún no se han guardado."
        actions={[{ label: 'Descartar', variant: 'danger', onClick: () => { setDescartar(false); onOpenChange(false) } }]} />
      <Dialog open={quitarProv} onOpenChange={setQuitarProv} title={`¿Quitar ${gr.con('proveedor', 'el')}?`}
        description={`${gr.Con('encargo', 'el')} se quedará sin ${min(vocab.proveedor)} asignad${gr.o('proveedor')}.`}
        actions={[{ label: 'Quitar y guardar', variant: 'danger', onClick: async () => { setQuitarProv(false); await guardar(true) } }]} />
    </>
  )
}

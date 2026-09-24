import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import type { Campo } from '@/data/config'
import {
  actualizarCliente, actualizarEncargo, asignarProveedor, listarProductos, listarProveedores, mensajeError, comentar,
} from '@/data/encargos'
import type { Cliente, EncargoEstado } from '@/lib/types'
import { Button, Combobox, Dialog, FormRow, Input, SectionLabel, Sheet, useAvisos } from '@/ui'
import { altaRapidaProducto, altaRapidaProveedor } from '@/data/catalogos'
import { ajustesFicha, fichaProducto } from '@/data/catalogos'
import { AvisoGuia, useGuia } from './Guia'
import { guiaDe } from '@/data/guia'
import { supabase } from '@/lib/supabase'
import { CamposForm, NumeroInput, aTexto, limpiar } from './CampoInput'
import { ajustesDinero } from '@/lib/utils'
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
  const { tienda, rol, vocab, gr, periodo } = useAuth()
  const soloProveedor = rol === 'LOGISTICA'
  const din = ajustesDinero(tienda?.ajustes as Record<string, unknown>)
  const [productos, setProductos] = React.useState<{ id: string; nombre: string; activo: boolean }[]>([])
  const [proveedores, setProveedores] = React.useState<{ id: string; nombre: string; activo: boolean }[]>([])

  const inicial = React.useMemo(() => ({
    producto: encargo.producto_id ?? '',
    proveedor: encargo.proveedor_id ?? '',
    dEnc: aTexto(encargo.datos),
    importe: encargo.importe == null ? '' : String(encargo.importe),
    aCuenta: encargo.a_cuenta ? String(encargo.a_cuenta) : '',
    comp: encargo.complementos ?? '',
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
  // Guía de medidas: aquí solo se propone (no se cambia lo ya elegido); «Usar» lo aplica
  // La guía que rige es la del periodo del encargo (puede no ser el activo)
  const [pAj, setPAj] = React.useState<Record<string, unknown> | null | undefined>(undefined)
  React.useEffect(() => {
    if (!open) return
    if (!encargo.periodo_id || encargo.periodo_id === periodo?.id) { setPAj(periodo?.ajustes ?? null); return }
    supabase.from('periodo').select('ajustes').eq('id', encargo.periodo_id).maybeSingle()
      .then(({ data }) => setPAj((data?.ajustes as Record<string, unknown> | null) ?? null))
  }, [open, encargo.periodo_id, periodo])
  const destinoGuia = guiaDe(tienda?.ajustes as Record<string, unknown>, pAj).destino ?? ''
  const datosGuia = React.useMemo(() => ({ ...f.dCli, ...f.dEnc }), [f.dCli, f.dEnc])
  const etiquetasGuia = React.useMemo(() => Object.fromEntries([...camposCli, ...camposEnc].map((c) => [c.clave, c.etiqueta])), [camposCli, camposEnc])
  const guia = useGuia({ datos: datosGuia, etiquetas: etiquetasGuia, valor: String(f.dEnc[destinoGuia] ?? ''), inicialTocado: true, setValor: () => {}, periodoAjustes: pAj ?? null })
  const fic = ajustesFicha(tienda?.ajustes as Record<string, unknown>)
  const [receta, setReceta] = React.useState<string | null>(null)
  React.useEffect(() => { setReceta(null); if (open && f.producto) fichaProducto(f.producto).then((p) => setReceta(p?.receta ?? null)).catch(() => {}) }, [open, f.producto])
  const cerrar = (o: boolean) => { if (!o && sucio) setDescartar(true); else onOpenChange(o) }

  async function guardar(confirmadoQuitar = false) {
    if (f.proveedor !== inicial.proveedor && !f.proveedor && !confirmadoQuitar) { setQuitarProv(true); return }
    if (!soloProveedor && !f.nombre.trim()) { setErr(`El nombre ${gr.con('cliente', 'del')} es obligatorio`); return }
    const falta = [...camposEnc.filter((c) => c.obligatorio && !f.dEnc[c.clave]), ...camposCli.filter((c) => c.obligatorio && !f.dCli[c.clave])]
    if (!soloProveedor && falta.length) { setErr(`Falta: ${falta.map((c) => c.etiqueta).join(', ')}`); return }
    if (f.aCuenta !== '' && Number(f.aCuenta) > 0 && f.importe === '') { setErr('Si hay algo entregado a cuenta, pon también el importe'); return }
    if (f.importe !== '' && f.aCuenta !== '' && Number(f.aCuenta) > Number(f.importe)) { setErr('Lo entregado a cuenta no puede ser mayor que el importe'); return }
    setBusy(true); setErr(null)
    try {
      if (!soloProveedor) {
        if (f.producto !== inicial.producto || JSON.stringify(f.dEnc) !== JSON.stringify(inicial.dEnc) || f.importe !== inicial.importe || f.aCuenta !== inicial.aCuenta || f.comp !== inicial.comp) {
          await actualizarEncargo(encargo.id, {
            producto_id: f.producto || null, datos: limpiar(f.dEnc, encargo.datos), complementos: f.comp.trim() || null,
            ...(f.importe !== inicial.importe || f.aCuenta !== inicial.aCuenta ? { importe: f.importe === '' ? null : Number(f.importe), a_cuenta: f.aCuenta === '' ? 0 : Number(f.aCuenta) } : {}),
          })
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
      // Si con las medidas nuevas la guía pide revisar y se ha cambiado el valor, queda un comentario automático
      const nuevoValor = String(f.dEnc[destinoGuia] ?? '')
      if (!soloProveedor && guia.sug?.revisar && nuevoValor !== String(inicial.dEnc[destinoGuia] ?? '')) await comentar(encargo.id, `Guía de medidas: ${guia.sug.motivo}.`)
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
          {rol === 'ATENCION' ? (
            <FormRow label={vocab.proveedor}><span className="text-fg-2">{encargo.proveedor_nombre ?? '—'} <span className="text-sm text-fg-3">(lo asigna administración u operativo)</span></span></FormRow>
          ) : <FormRow label={vocab.proveedor}>
            <Combobox value={f.proveedor} onChange={set('proveedor')} vacio="— sin asignar —" ariaLabel={vocab.proveedor} etiquetaCrear="Añadir"
              opciones={[...proveedores.filter((p) => p.activo), ...(provActual && !provActual.activo ? [provActual] : [])].map((p) => ({ id: p.id, nombre: p.nombre, nota: p.activo ? undefined : 'inactivo' }))}
              crear={rol === 'ADMIN' || rol === 'OPERATIVO' ? async (n) => {
                const id = await altaRapidaProveedor(encargo.tienda_id, n)
                setProveedores((l) => l.some((x) => x.id === id) ? l : [...l, { id, nombre: n, activo: true }])
                return id
              } : undefined} />
          </FormRow>}
          {!soloProveedor && <CamposForm campos={guia.adaptar(camposEnc)} valores={f.dEnc} onCambio={(k, v) => setF((s) => ({ ...s, dEnc: { ...s.dEnc, [k]: v } }))} />}
          {!soloProveedor && camposEnc.some((c) => c.clave === destinoGuia) && <AvisoGuia sug={guia.sug} valor={String(f.dEnc[destinoGuia] ?? '')} onUsar={() => { if (guia.sug) setF((s) => ({ ...s, dEnc: { ...s.dEnc, [destinoGuia]: guia.sug!.valor } })) }} />}
          {!soloProveedor && (
            <FormRow label={fic.etiqueta} ayuda={receta ? `Receta de ${gr.con('producto', 'este')}: ${receta}. Aquí solo la variante.` : undefined}>
              <Input className="h-7" value={f.comp} onChange={(e) => setF((s) => ({ ...s, comp: e.target.value }))} placeholder={receta ? 'Color, acabado…' : 'Opcional'} />
            </FormRow>
          )}
          {!soloProveedor && din.usa && <>
            <FormRow label={`Importe (${din.moneda})`}><NumeroInput value={f.importe} onChange={set('importe')} /></FormRow>
            <FormRow label="A cuenta"><NumeroInput value={f.aCuenta} onChange={set('aCuenta')} /></FormRow>
          </>}
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

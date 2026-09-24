import * as React from 'react'
import { IconCheck } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { mensajeError } from '@/data/encargos'
import { PLANTILLAS, datosPlantilla, type PlantillaSector } from '@/plantillas-sector'
import { Button, Input, SectionLabel } from '@/ui'
import { cn } from '@/lib/utils'

/** Alta de tienda: nombre + plantilla de partida. Todo se puede cambiar luego en Ajustes. */
export function NuevaTienda() {
  const { tiendas, setTiendaPorId, signOut, session } = useAuth()
  const [nombre, setNombre] = React.useState('')
  const [sel, setSel] = React.useState<PlantillaSector>(PLANTILLAS[0])
  const [ejemplos, setEjemplos] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [creando, setCreando] = React.useState(false)
  const tieneEjemplos = !!(sel.productos?.length || sel.proveedores?.length)

  async function crear() {
    if (creando) return
    if (!nombre.trim()) { setError('Ponle un nombre a la tienda'); return }
    setCreando(true); setError(null)
    const datos = datosPlantilla(sel)
    if (!ejemplos) { delete datos.productos; delete datos.proveedores }
    const { data, error } = await supabase.rpc('crear_tienda', { p_nombre: nombre.trim(), p_plantilla: datos })
    if (error) { setError(mensajeError(error)); setCreando(false); return }
    setTiendaPorId(data as string)
    // Recarga completa: la tienda nueva entra con su vocabulario, flujos y permisos desde cero
    window.location.assign('/ajustes/tienda')
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-3">
      <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 py-10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Nueva tienda</h1>
            <p className="text-fg-2">Elige un punto de partida. Palabras, etapas, campos y mensajes se cambian después en Ajustes.</p>
          </div>
          {tiendas.length > 0
            ? <Button variant="ghost" onClick={() => window.location.assign('/')}>Cancelar</Button>
            : <Button variant="ghost" onClick={signOut}>Salir</Button>}
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionLabel>Nombre</SectionLabel>
          <Input autoFocus value={nombre} maxLength={80} placeholder="Nombre de tu tienda" onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') crear() }} />
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionLabel>Punto de partida</SectionLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PLANTILLAS.map((p) => (
              <button key={p.id} type="button" onClick={() => setSel(p)} data-plantilla={p.id}
                className={cn('flex flex-col gap-1 rounded-md border bg-bg p-3 text-left hover:border-border-strong',
                  sel.id === p.id ? 'border-fg ring-1 ring-fg' : 'border-border')}>
                <span className="flex items-center gap-1.5 font-medium">
                  {p.nombre}{sel.id === p.id && <IconCheck size={14} />}
                </span>
                <span className="text-sm text-fg-2">{p.descripcion}</span>
              </button>
            ))}
          </div>
        </div>

        <Vista p={sel} />

        {tieneEjemplos && (
          <label className="flex items-center gap-2 text-fg-2">
            <input type="checkbox" checked={ejemplos} onChange={(e) => setEjemplos(e.target.checked)} />
            Añadir también el catálogo y los proveedores de ejemplo
          </label>
        )}

        {error && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-danger-fg">{error}</div>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-fg-3">Entrarás como administración con {session?.user.email}.</span>
          <Button variant="primary" size="lg" disabled={creando} onClick={crear}>{creando ? 'Creando…' : 'Crear tienda'}</Button>
        </div>
      </div>
    </div>
  )
}

/** Lo que trae la plantilla, para decidir sin sorpresas. */
function Vista({ p }: { p: PlantillaSector }) {
  const v = p.vocab ?? {}
  const palabras = [v.encargo ?? 'Encargo', v.cliente ?? 'Cliente', v.producto ?? 'Producto', v.proveedor ?? 'Proveedor']
  const nCampos = Object.values(p.campos ?? {}).reduce((n, c) => n + (c?.length ?? 0), 0) + p.tipos.reduce((n, t) => n + (t.campos?.length ?? 0), 0)
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-fg-3">Palabras:</span>
        {palabras.map((w) => <span key={w} className="rounded-sm bg-bg-4 px-1.5 py-0.5">{w}</span>)}
      </div>
      {p.tipos.map((t) => (
        <div key={t.clave} className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.nombre}</span>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {t.etapas.map((e, i) => (
              <React.Fragment key={e.clave}>
                {i > 0 && <span className="text-fg-3">→</span>}
                <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.color ?? '#999' }} />{e.nombre}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
      <div className="text-sm text-fg-3">
        {nCampos} {nCampos === 1 ? 'campo' : 'campos'} · {p.mensajes?.length ?? 0} {p.mensajes?.length === 1 ? 'mensaje' : 'mensajes'} preparados
      </div>
    </div>
  )
}

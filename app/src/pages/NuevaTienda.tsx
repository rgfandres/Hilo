import * as React from 'react'
import { IconCheck } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { mensajeError } from '@/data/encargos'
import { ORDEN_PLANTILLAS, PLANTILLAS, datosPlantilla, type PlantillaSector } from '@/plantillas-sector'
import { Button, Input, SectionLabel } from '@/ui'
import { cn } from '@/lib/utils'

/** Qué se puede encender al dar de alta (se guarda en los ajustes de la tienda; todo se cambia luego en Ajustes) */
type Mod = { k: string; nombre: string; que: string }
const MODULOS: Mod[] = [
  { k: 'materiales', nombre: 'Materiales y stock', que: 'Materiales con su stock, pedidos a proveedores y restos' },
  { k: 'produccion', nombre: 'Hoja de producción', que: 'La orden de fabricación (o de corte) por producto, para imprimir' },
  { k: 'logistica', nombre: 'Logística y reparto', que: 'Quién lleva y recoge qué, con pantalla propia en el móvil' },
  { k: 'guia', nombre: 'Guía de medidas', que: 'Propone un dato (p. ej. el tamaño) a partir de las medidas' },
  { k: 'cobros', nombre: 'Cobros y señales', que: 'Importe, lo que deja a cuenta y lo pendiente de cobro' },
]
function modulosDe(p: PlantillaSector): Record<string, boolean> {
  const aj = (p.ajustes ?? {}) as Record<string, unknown>
  const m = (aj.modulos ?? {}) as Record<string, boolean>
  return { materiales: !!m.materiales, produccion: !!m.produccion, logistica: !!m.logistica,
    guia: !!(aj.guia_medidas as { activa?: boolean } | undefined)?.activa, cobros: aj.usar_importe === true }
}
// Orden en pantalla: de lo más habitual a «en blanco»
const LISTA = [...PLANTILLAS].sort((a, b) => (ORDEN_PLANTILLAS.indexOf(a.id) + 1 || 99) - (ORDEN_PLANTILLAS.indexOf(b.id) + 1 || 99))

/** Alta de tienda en dos pasos: qué negocio es (plantilla) y qué quiere controlar (módulos). Todo se cambia luego en Ajustes. */
export function NuevaTienda() {
  const { tiendas, setTiendaPorId, signOut, session } = useAuth()
  const [nombre, setNombre] = React.useState('')
  const [sel, setSel] = React.useState<PlantillaSector>(LISTA[0])
  const [paso, setPaso] = React.useState<1 | 2>(1)
  const [mods, setMods] = React.useState<Record<string, boolean>>(() => modulosDe(LISTA[0]))
  React.useEffect(() => { setMods(modulosDe(sel)) }, [sel])
  const tieneGuia = !!(sel.ajustes as Record<string, unknown> | undefined)?.guia_medidas
  const [ejemplos, setEjemplos] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [creando, setCreando] = React.useState(false)
  // Alta solo con invitación: quien aún no administra ninguna tienda necesita un código
  const [conCodigo, setConCodigo] = React.useState(false)
  const [codigo, setCodigo] = React.useState('')
  React.useEffect(() => { supabase.rpc('puedo_crear_tienda').then(({ data }) => setConCodigo(data !== true)) }, [])
  const tieneEjemplos = !!(sel.productos?.length || sel.proveedores?.length || sel.materiales?.length)

  async function crear() {
    if (creando) return
    if (!nombre.trim()) { setError('Ponle un nombre a la tienda'); return }
    if (conCodigo && !codigo.trim()) { setError('Escribe tu código de invitación'); return }
    setCreando(true); setError(null)
    const datos = datosPlantilla(sel)
    if (!ejemplos) { delete datos.productos; delete datos.proveedores; delete datos.materiales }
    // Lo elegido en el paso 2
    const aj0 = (datos.ajustes ?? {}) as Record<string, unknown>
    const guia = aj0.guia_medidas as Record<string, unknown> | undefined
    datos.ajustes = { ...aj0,
      modulos: { ...((aj0.modulos ?? {}) as Record<string, boolean>), materiales: mods.materiales, produccion: mods.produccion, logistica: mods.logistica },
      usar_importe: mods.cobros,
      ...(guia ? { guia_medidas: { ...guia, activa: mods.guia } } : {}) }
    // La tienda nueva empieza con el asistente de configuración pendiente
    datos.ajustes = { ...(datos.ajustes ?? {}), asistente: { hecho: false, paso: 0 } }
    const { data, error } = await supabase.rpc('crear_tienda', { p_nombre: nombre.trim(), p_plantilla: datos, p_codigo: codigo.trim() || null })
    if (error) { setError(mensajeError(error)); setCreando(false); return }
    setTiendaPorId(data as string)
    // Recarga completa: la tienda nueva entra con su vocabulario, flujos y permisos desde cero
    window.location.assign('/ajustes/asistente')
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

        {conCodigo && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg p-3">
            <SectionLabel>Código de invitación</SectionLabel>
            <p className="text-sm text-fg-2">Hilo está en acceso anticipado: para crear tu tienda necesitas un código. Si te han invitado a una tienda que ya existe, abre el enlace de la invitación en lugar de crear una.</p>
            <Input value={codigo} maxLength={40} placeholder="HILO-…" onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="max-w-[240px] font-mono" />
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-fg-3">
          <span className={cn('rounded-full px-2 py-0.5 font-medium', paso === 1 ? 'bg-fg text-bg' : 'bg-bg-4 text-fg-2')}>1</span>
          <span className={paso === 1 ? 'font-medium text-fg' : ''}>Tu negocio</span>
          <span className="h-px w-8 bg-border" />
          <span className={cn('rounded-full px-2 py-0.5 font-medium', paso === 2 ? 'bg-fg text-bg' : 'bg-bg-4 text-fg-2')}>2</span>
          <span className={paso === 2 ? 'font-medium text-fg' : ''}>Qué quieres controlar</span>
        </div>

        {paso === 1 && <>
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Nombre</SectionLabel>
            <Input autoFocus value={nombre} maxLength={80} placeholder="Nombre de tu tienda o negocio" onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) setPaso(2) }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <SectionLabel>¿Qué tipo de negocio tienes?</SectionLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LISTA.map((p) => (
                <button key={p.id} type="button" onClick={() => setSel(p)} data-plantilla={p.id}
                  className={cn('flex flex-col gap-1 rounded-md border bg-bg p-3 text-left hover:border-border-strong',
                    sel.id === p.id ? 'border-fg ring-1 ring-fg' : 'border-border')}>
                  <span className="flex items-center gap-1.5 font-medium">
                    {p.id === 'blanco' ? 'Otro negocio (en blanco)' : p.nombre}{sel.id === p.id && <IconCheck size={14} />}
                  </span>
                  <span className="text-sm text-fg-2">{p.descripcion}</span>
                </button>
              ))}
            </div>
          </div>
          <Vista p={sel} />
        </>}

        {paso === 2 && <>
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-md font-semibold">¿Qué quieres llevar con Hilo?</h2>
            <p className="m-0 text-sm text-fg-2">Vienen marcados los habituales en «{sel.id === 'blanco' ? 'otro negocio' : sel.nombre.toLowerCase()}». Clientes, trabajos con sus pasos, equipo, proveedores con su portal y mensajes van siempre.</p>
          </div>
          <div className="flex flex-col rounded-md border border-border bg-bg">
            {MODULOS.filter((m) => m.k !== 'guia' || tieneGuia).map((m) => (
              <label key={m.k} className="flex cursor-pointer items-start gap-3 border-b border-border-light px-3 py-2.5 last:border-b-0">
                <input type="checkbox" className="mt-1 accent-gray-12" checked={!!mods[m.k]} onChange={(e) => setMods((x) => ({ ...x, [m.k]: e.target.checked }))} />
                <span className="flex flex-col">
                  <span className="font-medium">{m.nombre}</span>
                  <span className="text-sm text-fg-2">{m.que}</span>
                </span>
              </label>
            ))}
          </div>
          {tieneEjemplos && (
            <label className="flex items-center gap-2 text-fg-2">
              <input type="checkbox" checked={ejemplos} onChange={(e) => setEjemplos(e.target.checked)} />
              Añadir también el catálogo y los proveedores de ejemplo
            </label>
          )}
          <p className="m-0 text-sm text-fg-3">Nombres, pasos, campos y módulos se cambian cuando quieras en Ajustes.</p>
        </>}

        {error && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-danger-fg">{error}</div>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-fg-3">Entrarás como administración con {session?.user.email}.</span>
          {paso === 1
            ? <Button variant="primary" size="lg" onClick={() => { if (!nombre.trim()) { setError('Ponle un nombre a la tienda'); return } setError(null); setPaso(2) }}>Continuar</Button>
            : <span className="flex gap-2"><Button variant="ghost" size="lg" onClick={() => setPaso(1)}>Volver</Button><Button variant="primary" size="lg" disabled={creando} onClick={crear}>{creando ? 'Creando…' : 'Crear mi tienda'}</Button></span>}
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

import * as React from 'react'
import { GuardaSalida, confirmarSalida } from '@/lib/salir'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  IconClock, IconLayoutList, IconUser, IconBox, IconBuildingWarehouse,
  IconChartBar, IconSettings, IconSearch, IconChevronDown, IconMenu2, IconPlus, IconDots, IconListCheck, IconRuler2, IconPrinter, IconTruck,
} from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { BuscadorGlobal } from '@/components/BuscadorGlobal'
import { listarEncargos } from '@/data/encargos'
import { ajustesMaterial, listarMateriales, propuestaPedido } from '@/data/materiales'
import { ajustesHoja } from '@/data/produccion'
import { ajustesLogistica } from '@/data/logistica'
import { activo, pendientesDe, tope99 } from '@/lib/bandejas'
import { cn } from '@/lib/utils'
import { useCerrarConAtras } from '@/lib/movil'
import { useConexion } from '@/lib/conexion'

function Item({ to, icon, children, count, title }: { to: string; icon: React.ReactNode; children: React.ReactNode; count?: number; title?: string }) {
  return (
    <NavLink
      to={to}
      title={title}
      className={({ isActive }) =>
        cn('flex h-7 items-center gap-2 rounded-sm px-2 text-base font-medium text-fg hover:bg-bg-4 max-md:h-10 max-md:text-md', isActive && 'bg-gray-5')
      }
    >
      {({ isActive }) => (
        <>
          <span className="text-fg-2">{icon}</span>
          <span className="flex-1 truncate">{children}</span>
          {/* El contador se oculta cuando ya estás en la sección */}
          {!!count && !isActive && <span className="rounded-full bg-danger px-1.5 text-xxs font-semibold leading-4 text-white tabular">{tope99(count)}</span>}
        </>
      )}
    </NavLink>
  )
}

export function AppShell() {
  const { tienda, tiendas, setTienda, session, signOut, vocab, periodo, rol, verComo, setVerComo, nombresRol } = useAuth()
  const loc = useLocation()
  const logo = ((tienda?.ajustes as Record<string, unknown> | undefined)?.logo_url as string | undefined) ?? null
  const [cuenta, setCuenta] = React.useState<{ encargos: number; atascados: number; logistica: number }>({ encargos: 0, atascados: 0, logistica: 0 })
  const conMateriales = ajustesMaterial(tienda?.ajustes as Record<string, unknown>).activo && rol !== 'LOGISTICA'
  const [porPedir, setPorPedir] = React.useState(0)
  const conexion = useConexion()
  const hoja = ajustesHoja(tienda?.ajustes as Record<string, unknown>)
  const conLogistica = ajustesLogistica(tienda?.ajustes as Record<string, unknown>).activo
  // Contadores del menú: se recalculan al cambiar de pantalla y cada minuto (solo con la pestaña visible)
  React.useEffect(() => {
    if (!tienda) return
    let vivo = true
    const leer = () => {
      if (document.hidden) return
      listarEncargos(tienda.id, { periodoId: periodo?.id ?? null }).then((rows) => {
        // «Atascados» = demasiados días en manos de un proveedor (lo mismo que se ve en su pantalla)
        if (vivo) setCuenta({ encargos: pendientesDe(rows, rol), atascados: rows.filter((r) => activo(r) && r.atascado && r.en_proveedor).length,
          logistica: rows.filter((r) => activo(r) && r.etapa_siguiente_rol === 'LOGISTICA').length })
      }).catch(() => {})
      if (conMateriales && (rol === 'ADMIN' || rol === 'OPERATIVO')) listarMateriales(tienda.id).then((ms) => { if (vivo) setPorPedir(ms.filter((m) => m.activo && propuestaPedido(m).pedir > 0).length) }).catch(() => {})
    }
    leer()
    const t = setInterval(leer, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [tienda, periodo, rol, loc.pathname, conMateriales])
  const [pick, setPick] = React.useState(false)
  const menuTienda = React.useRef<HTMLDivElement>(null)
  // El menú de tiendas se cierra con Esc o al pulsar fuera
  React.useEffect(() => {
    if (!pick) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(false) }
    const fuera = (e: MouseEvent) => { if (menuTienda.current && !menuTienda.current.contains(e.target as Node)) setPick(false) }
    document.addEventListener('keydown', tecla); document.addEventListener('mousedown', fuera)
    return () => { document.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', fuera) }
  }, [pick])
  const [buscar, setBuscar] = React.useState(false)
  const [menu, setMenu] = React.useState(false)
  // El cajón se cierra al navegar y con el botón «Atrás» del móvil
  React.useEffect(() => { setMenu(false); setPick(false) }, [loc.pathname, loc.search])
  useCerrarConAtras(menu, () => setMenu(false))
  React.useEffect(() => {
    if (!menu) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [menu])
  // Móvil: si se entra directamente a una pantalla interior (enlace, notificación…),
  // el primer «Atrás» lleva al inicio del rol en lugar de salir de la app.
  const nav = useNavigate()
  React.useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const inicio = rol === 'LOGISTICA' ? (ajustesLogistica(tienda?.ajustes as Record<string, unknown>).activo ? '/logistica' : '/encargos?b=mio') : '/'
    const aqui = loc.pathname + loc.search
    if ((window.history.state?.idx ?? 0) === 0 && aqui !== inicio) {
      nav(inicio, { replace: true })
      setTimeout(() => nav(aqui), 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // ⌘K / Ctrl+K abre el buscador desde cualquier pantalla
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscar((b) => !b) } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const inicial = (session?.user.user_metadata?.name as string | undefined)?.[0]?.toUpperCase() ?? 'U'
  const nombre = (session?.user.user_metadata?.name as string | undefined) ?? session?.user.email ?? ''

  // Barra inferior del móvil: 4 destinos según el rol + «Más» (abre el menú completo)
  const destinos = rol === 'LOGISTICA'
    ? [conLogistica ? { to: '/logistica', label: 'Mi trabajo', icon: IconTruck, n: cuenta.logistica } : { to: '/encargos?b=mio', label: 'Mi trabajo', icon: IconListCheck }, { to: '/encargos', label: vocab.encargos, icon: IconLayoutList, n: conLogistica ? undefined : cuenta.encargos },
       { to: '/proveedores', label: vocab.proveedores, icon: IconBuildingWarehouse }, { to: '/para-hoy', label: 'Para hoy', icon: IconClock }]
    : rol === 'ATENCION'
      ? [{ to: '/', label: 'Para hoy', icon: IconClock }, { to: '/clientes', label: vocab.clientes, icon: IconUser },
         { to: '/encargos/nuevo', label: 'Nuevo', icon: IconPlus }, { to: '/encargos', label: vocab.encargos, icon: IconLayoutList, n: cuenta.encargos }]
      : [{ to: '/', label: 'Para hoy', icon: IconClock }, { to: '/encargos', label: vocab.encargos, icon: IconLayoutList, n: cuenta.encargos },
         { to: '/encargos/nuevo', label: 'Nuevo', icon: IconPlus }, { to: '/clientes', label: vocab.clientes, icon: IconUser }]
  const bParam = new URLSearchParams(loc.search).get('b')
  const esActivo = (to: string) => {
    if (to === '/') return loc.pathname === '/'
    if (to === '/para-hoy') return loc.pathname === '/para-hoy'
    if (to === '/encargos?b=mio') return loc.pathname === '/encargos' && bParam === 'mio'
    if (to === '/encargos') return loc.pathname.startsWith('/encargos') && loc.pathname !== '/encargos/nuevo' && bParam !== 'mio'
    return loc.pathname === to || loc.pathname.startsWith(to + '/')
  }

  const navContenido = (
    <>
        <div className="relative mb-2" ref={menuTienda}>
          <button
            aria-haspopup="menu" aria-expanded={pick}
            onClick={() => setPick((p) => !p)}
            className="flex h-7 w-full items-center gap-2 rounded-sm px-2 hover:bg-bg-4"
          >
            {logo ? <img src={logo} alt="" className="h-5 w-5 shrink-0 rounded-sm object-contain" /> : <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: 'var(--accent)' }} />}
            <span className="flex-1 truncate text-left font-semibold">{tienda?.nombre ?? 'Hilo'}</span>
            <IconChevronDown size={12} className="text-fg-3" />
          </button>
          {pick && (
            <div className="absolute left-0 right-0 top-8 z-10 rounded-md border border-border bg-bg p-1 shadow-light">
              {tiendas.map((t) => (
                <button key={t.id} onClick={() => { setPick(false); confirmarSalida(() => setTienda(t)) }} className="flex h-7 w-full items-center rounded-sm px-2 text-left hover:bg-bg-4">
                  {t.nombre}
                </button>
              ))}
              <div className="my-1 h-px bg-border" />
              <button onClick={() => window.location.assign('/nueva-tienda')} className="flex h-7 w-full items-center rounded-sm px-2 text-left text-fg-2 hover:bg-bg-4">
                + Nueva tienda
              </button>
            </div>
          )}
          {periodo && <div className="px-2 pt-0.5 text-sm text-fg-3" title="Periodo activo">{periodo.nombre}</div>}
        </div>
        <button onClick={() => setBuscar(true)} className="mb-2 flex h-7 items-center gap-2 rounded-sm border border-border bg-bg px-2 text-fg-3 hover:border-border-strong">
          <IconSearch size={14} /><span className="flex-1 text-left">Buscar</span><span className="text-xs">{esMac ? '⌘K' : 'Ctrl K'}</span>
        </button>

        <Item to={rol === 'LOGISTICA' ? '/para-hoy' : '/'} icon={<IconClock size={14} />}>Para hoy</Item>
        <Item to="/encargos" icon={<IconLayoutList size={14} />} count={cuenta.encargos} title="Pendientes para ti: tu trabajo y lo que hay que revisar">{vocab.encargos}</Item>
        <Item to="/clientes" icon={<IconUser size={14} />}>{vocab.clientes}</Item>
        <Item to="/productos" icon={<IconBox size={14} />}>{vocab.productos}</Item>
        <Item to="/proveedores" icon={<IconBuildingWarehouse size={14} />} count={rol === 'ADMIN' || rol === 'OPERATIVO' ? cuenta.atascados : 0} title="Atascados: demasiados días en manos de un proveedor">{vocab.proveedores}</Item>
        {conLogistica && rol !== 'ATENCION' && <Item to="/logistica" icon={<IconTruck size={14} />} count={rol === 'LOGISTICA' ? cuenta.logistica : 0}>{nombresRol.LOGISTICA}</Item>}
        {hoja.activo && rol !== 'LOGISTICA' && <Item to="/produccion" icon={<IconPrinter size={14} />}>{hoja.nombre}</Item>}
        {conMateriales && <Item to="/materiales" icon={<IconRuler2 size={14} />} count={porPedir} title="Por pedir: el stock no cubre lo pedido por los encargos más el umbral">{vocab.materiales}</Item>}
        <div className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-fg-3">Vistas</div>
        {rol === 'ADMIN' && <Item to="/informes" icon={<IconChartBar size={14} />}>Informes</Item>}
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 px-2 pb-1 text-xs text-fg-3" title={conexion === 'conectado' ? 'Conectado con el servidor' : 'Sin conexión: lo que cambies no se guardará'}>
          <span className={cn('h-1.5 w-1.5 rounded-full', conexion === 'conectado' ? 'bg-ok' : 'bg-danger')} />{conexion === 'conectado' ? 'Conectado' : 'Sin conexión'}
        </span>
        <Item to="/ajustes" icon={<IconSettings size={14} />}>Ajustes</Item>
        <button onClick={() => confirmarSalida(() => { signOut() })} title="Cerrar sesión" className="flex h-7 items-center gap-2 rounded-sm px-2 text-fg-2 hover:bg-bg-4">
          <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-gray-5 text-[10px] font-semibold text-fg">{inicial}</span>
          <span className="truncate">{nombre}</span>
        </button>
    </>
  )

  return (
    <div className="flex h-full bg-bg">
      {/* Escritorio: menú lateral fijo */}
      <nav className="hidden w-[220px] shrink-0 flex-col gap-0.5 border-r border-border bg-bg-3 p-2 pt-3 md:flex">{navContenido}</nav>

      {/* Móvil: barra superior fija */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-[calc(48px+env(safe-area-inset-top))] items-end gap-1 border-b border-border bg-bg px-2 pb-1.5 md:hidden">
        <button onClick={() => setMenu(true)} aria-label="Abrir menú" aria-expanded={menu} className="flex h-9 w-9 items-center justify-center rounded-sm hover:bg-bg-4"><IconMenu2 size={20} /></button>
        {logo ? <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-sm object-contain" /> : <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: 'var(--accent)' }} />}
        <span className="min-w-0 flex-1 truncate text-md font-semibold">{tienda?.nombre ?? 'Hilo'}</span>
        {periodo && <span className="text-sm text-fg-3">{periodo.nombre}</span>}
        <button onClick={() => setBuscar(true)} aria-label="Buscar" className="flex h-9 w-9 items-center justify-center rounded-sm hover:bg-bg-4"><IconSearch size={20} /></button>
      </div>

      {/* Móvil: menú en cajón con fondo */}
      {menu && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenu(false)} />
          <nav className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-0.5 overflow-y-auto bg-bg-3 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-[calc(12px+env(safe-area-inset-top))] shadow-strong">
            {navContenido}
          </nav>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col max-md:pb-[calc(56px+env(safe-area-inset-bottom))] max-md:pt-[calc(48px+env(safe-area-inset-top))]">
        {verComo && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 bg-warn-bg px-4 py-1.5 text-warn-fg" role="status">
            <span>Viendo la app como <b>{nombresRol[verComo]}</b> · solo lectura: nada se guarda.</span>
            <button onClick={() => setVerComo(null)} className="font-medium underline underline-offset-2">Salir de «Ver como»</button>
          </div>
        )}
        {conexion === 'sin-conexion' && (
          <div className="flex shrink-0 items-center gap-2 bg-danger-bg px-4 py-1.5 text-sm text-danger-fg" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Sin conexión: lo que cambies no se guardará hasta que vuelva.
          </div>
        )}
        <Outlet />
      </main>

      {/* Móvil: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(56px+env(safe-area-inset-bottom))] items-start border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Accesos rápidos">
        {destinos.map((d) => {
          const on = esActivo(d.to)
          return (
            <NavLink key={d.to} to={d.to} className={cn('relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs', on ? 'font-semibold text-fg' : 'text-fg-3')}>
              <d.icon size={22} stroke={on ? 2 : 1.6} />
              <span className="max-w-full truncate px-1">{d.label}</span>
              {!!d.n && !on && <span className="absolute right-[calc(50%-20px)] top-1.5 rounded-full bg-danger px-1 text-xxs font-semibold leading-4 text-white">{tope99(d.n)}</span>}
            </NavLink>
          )
        })}
        <button onClick={() => setMenu(true)} className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-fg-3">
          <IconDots size={22} stroke={1.6} /><span>Más</span>
        </button>
      </nav>

      <BuscadorGlobal open={buscar} onOpenChange={setBuscar} />
      <GuardaSalida />
    </div>
  )
}

/** Cabecera de página: 40 px, título + acciones a la derecha. */
export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4 max-md:h-auto max-md:min-h-11 max-md:flex-wrap max-md:gap-2 max-md:py-1.5">
      <span className="min-w-0 truncate whitespace-nowrap font-medium max-md:max-w-full">{title}</span>
      {subtitle && <span className="hidden whitespace-nowrap text-fg-3 lg:inline">{subtitle}</span>}
      <div className="flex-1" />
      {children}
    </header>
  )
}

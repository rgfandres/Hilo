import * as React from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/layout/AppShell'
import { cn } from '@/lib/utils'
import { Button, Popover } from '@/ui'
import { useCambiosSinGuardar } from '@/lib/salir'
import { AvisoAsistente } from './AjustesAsistente'

type Quien = 'admin' | 'gestion' | 'todos'
type Aj = Record<string, unknown>
type Sec = { to: string; label: (v: Etiquetas) => string; quien: Quien; si?: (aj: Aj) => boolean }
type Etiquetas = { vocab: ReturnType<typeof useAuth>['vocab']; roles: Record<string, string>; aj: Aj }
const mod = (k: string) => (aj: Aj) => (aj.modulos as Record<string, boolean> | undefined)?.[k] === true
/** Menú de ajustes agrupado por lo que el usuario quiere hacer (no por cómo está hecho por dentro). */
const GRUPOS: { titulo: string; items: Sec[] }[] = [
  { titulo: 'Tu tienda', items: [
    { to: 'tienda', label: () => 'Datos de la tienda', quien: 'admin' },
    { to: 'region', label: () => 'Idioma y región', quien: 'admin' },
    { to: 'palabras', label: () => 'Cómo lo llamáis', quien: 'admin' },
    { to: 'importar', label: () => 'Importar datos', quien: 'admin' },
  ] },
  { titulo: 'Cómo trabajáis', items: [
    { to: 'flujos', label: () => 'Tipos y etapas', quien: 'admin' },
    { to: 'bandejas', label: () => 'Bandejas de la lista', quien: 'admin' },
    { to: 'tarjetas', label: () => 'Tarjetas de Para hoy', quien: 'admin' },
    { to: 'campos', label: () => 'Datos que guardáis', quien: 'admin' },
    { to: 'periodos', label: () => 'Periodos', quien: 'admin' },
    { to: 'reglas', label: () => 'Avisos y reglas', quien: 'admin' },
  ] },
  { titulo: 'Módulos', items: [
    { to: 'modulos', label: () => 'Activar módulos', quien: 'admin' },
    { to: 'materiales', label: ({ vocab }) => vocab.materiales, quien: 'admin', si: mod('materiales') },
    { to: 'hoja', label: ({ aj }) => String(aj.hoja_nombre ?? 'Hoja de producción'), quien: 'admin', si: mod('produccion') },
    { to: 'logistica', label: () => 'Pantalla de logística', quien: 'admin', si: mod('logistica') },
    { to: 'guia', label: () => 'Guía de medidas', quien: 'admin' },
    { to: 'ficha-tecnica', label: () => 'Ficha técnica', quien: 'admin' },
  ] },
  { titulo: 'Clientes y proveedores', items: [
    { to: 'mensajes', label: () => 'Mensajes al cliente', quien: 'admin' },
    { to: 'ficha', label: ({ vocab }) => `Hoja de ${vocab.encargo.toLowerCase()}`, quien: 'admin' },
    { to: 'proveedores', label: ({ vocab }) => `Portal de ${vocab.proveedores.toLowerCase()}`, quien: 'gestion' },
  ] },
  { titulo: 'Personas y acceso', items: [
    { to: 'equipo', label: () => 'Equipo', quien: 'admin' },
    { to: 'papeles', label: () => 'Nombres de los papeles', quien: 'admin' },
    { to: 'pantallas', label: () => 'Qué ve cada papel', quien: 'admin' },
    { to: 'seguridad', label: () => 'Seguridad', quien: 'admin' },
  ] },
  { titulo: 'Mi cuenta', items: [
    { to: 'cuenta', label: () => 'Mi cuenta', quien: 'todos' },
  ] },
]
const SECCIONES = GRUPOS.flatMap((g) => g.items)
const puedeVer = (q: Quien, rol: string | null) => q === 'todos' || rol === 'ADMIN' || (q === 'gestion' && rol === 'OPERATIVO')

/** Ajustes: menú agrupado a la izquierda y la sección a la derecha. */
export function Ajustes() {
  const { rol, vocab, tienda, nombresRol } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Aj
  const et: Etiquetas = { vocab, roles: nombresRol as Record<string, string>, aj }
  // Una sección a la que el rol no tiene acceso (p. ej. escrita a mano en la dirección) no se abre
  const loc = useLocation()
  const seccion = SECCIONES.find((x) => loc.pathname.split('/')[2] === x.to)
  if (seccion && !puedeVer(seccion.quien, rol)) return <Navigate to="/ajustes/cuenta" replace />
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((s) => puedeVer(s.quien, rol) && (!s.si || s.si(aj) || s === seccion)) })).filter((g) => g.items.length)
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <nav aria-label="Ajustes" className="flex w-[220px] shrink-0 flex-col gap-4 overflow-auto border-r border-border p-3 max-md:w-full max-md:flex-row max-md:gap-1 max-md:overflow-x-auto max-md:border-b max-md:border-r-0 max-md:p-2">
          {grupos.map((g) => (
            <div key={g.titulo} className="flex flex-col gap-0.5 max-md:contents">
              <span className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-fg-3 max-md:hidden">{g.titulo}</span>
              {g.items.map((s) => (
                <NavLink key={s.to} to={s.to}
                  className={({ isActive }) => cn('flex h-7 shrink-0 items-center rounded-sm px-2 text-fg-2 hover:bg-bg-4 max-md:h-9', isActive && 'bg-gray-5 font-medium text-fg')}>
                  {s.label(et)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-8 px-8 py-6 max-md:px-4 max-md:py-4">
            {loc.pathname !== '/ajustes/asistente' && <AvisoAsistente />}
            <Outlet />
          </div>
        </div>
      </div>
    </>
  )
}

export function AjustesInicio() {
  const { rol } = useAuth()
  return <Navigate to={rol === 'ADMIN' ? 'tienda' : rol === 'OPERATIVO' ? 'proveedores' : 'cuenta'} replace />
}

/** Cabecera de cada página de ajustes: título, UNA línea de ayuda y, si hace falta, «¿Qué es esto?» con el resto. */
export function Pagina({ titulo, ayuda, mas, acciones }: { titulo: string; ayuda?: React.ReactNode; mas?: React.ReactNode; acciones?: React.ReactNode }) {
  const [ver, setVer] = React.useState(false)
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <h1 className="m-0 flex-1 text-xl font-semibold">{titulo}</h1>
        {acciones}
      </div>
      {ayuda && (
        <p className="m-0 text-fg-2">
          {ayuda}
          {mas && <> <button type="button" aria-expanded={ver} onClick={() => setVer(!ver)} className="text-fg-3 underline underline-offset-2 hover:text-fg">{ver ? 'Ocultar' : '¿Qué es esto?'}</button></>}
        </p>
      )}
      {ver && mas && <div className="rounded-md bg-bg-3 px-3 py-2 leading-relaxed text-fg-2">{mas}</div>}
    </header>
  )
}

/** Botón «i» con una explicación más larga que se abre al pulsarlo. */
export function Info({ children, titulo }: { children: React.ReactNode; titulo: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} className="w-[300px] p-3 leading-relaxed text-fg-2"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label={`Qué es ${titulo}`} aria-expanded={open}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-semibold text-fg-3 hover:bg-bg-4 hover:text-fg">i</button>
      )}>
      {children}
    </Popover>
  )
}

/** Parte plegable para lo que casi nadie necesita tocar. */
export function Avanzado({ titulo = 'Opciones avanzadas', resumen, children, defecto = false, className }: { titulo?: string; resumen?: React.ReactNode; children: React.ReactNode; defecto?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(defecto)
  return (
    <div className={cn('rounded-md border border-border bg-bg', className)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-2">
        <span className="w-3 text-fg-3">{open ? '▾' : '▸'}</span>
        <span className="font-medium">{titulo}</span>
        {resumen && <span className="truncate text-sm text-fg-3">{resumen}</span>}
      </button>
      {open && <div className="flex flex-col gap-3 border-t border-border-light px-3 py-3">{children}</div>}
    </div>
  )
}

/** Bloque de ajustes: título, explicación en una línea y contenido. */
export function Bloque({ titulo, ayuda, acciones, children }: {
  titulo: string; ayuda?: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <h2 className="text-md font-semibold">{titulo}</h2>
          {ayuda && <p className="text-fg-3">{ayuda}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  )
}

/** Lista con bordes (filas separadas por línea), estilo Twenty. */
export function Lista({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col divide-y divide-border-light rounded-md border border-border', className)}>{children}</div>
}
export function FilaLista({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn('flex min-h-10 items-center gap-3 px-3 py-1.5 max-md:flex-wrap max-md:gap-2', onClick && 'cursor-pointer hover:bg-bg-2', className)}>
      {children}
    </div>
  )
}

/** Aviso de guardado / error bajo un formulario. */
export function Estado({ ok, err }: { ok?: string | null; err?: string | null }) {
  if (err) return <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>
  if (ok) return <div className="text-sm text-ok-fg">{ok}</div>
  return null
}

/** Interruptor accesible (checkbox con aspecto de switch). */
export function Interruptor({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn('relative inline-flex items-center gap-2', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-4 w-7 rounded-full bg-gray-6 transition-colors peer-checked:bg-gray-12 peer-focus-visible:ring-2 peer-focus-visible:ring-gray-8 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-3" />
      {label && <span>{label}</span>}
    </label>
  )
}

/** Barra fija de «Guardar / Descartar», igual en todas las páginas de ajustes, con aviso al salir sin guardar. */
export function BarraGuardar({ sucio, busy, ok, err, onGuardar, onDescartar, extra }: {
  sucio: boolean; busy?: boolean; ok?: string | null; err?: string | null
  onGuardar: () => void; onDescartar?: () => void; extra?: React.ReactNode
}) {
  useCambiosSinGuardar(sucio)
  return (
    <div className="sticky bottom-0 -mx-8 flex flex-wrap items-center gap-3 border-t border-border bg-bg px-8 py-3 max-md:-mx-4 max-md:px-4">
      <Estado ok={ok} err={err} />
      {sucio && !err && <span className="text-sm text-warn-fg">Cambios sin guardar</span>}
      <div className="flex-1" />
      {extra}
      {onDescartar && <Button variant="ghost" disabled={!sucio || busy} onClick={onDescartar}>Descartar</Button>}
      <Button variant="primary" disabled={!sucio || busy} onClick={onGuardar}>{busy ? 'Guardando…' : 'Guardar'}</Button>
    </div>
  )
}

/** Fila de formulario sin <label> (para grupos de controles: listas, botones…). Mismo aspecto que FormRow. */
export function FilaForm({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-2 max-md:flex-col max-md:items-stretch max-md:gap-1">
      <span className="w-[120px] shrink-0 pt-2 text-sm leading-tight text-fg-3 max-md:w-auto max-md:pt-0">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {children}
        {ayuda && <span className="text-xs text-fg-3">{ayuda}</span>}
      </div>
    </div>
  )
}

/** Lista de textos editable: una fila por valor, con «Añadir», quitar y subir (el orden cuenta). */
export function ListaTextos({ valores, onChange, placeholder, anadir = '+ Añadir', nombre }: {
  valores: string[]; onChange: (v: string[]) => void; placeholder?: string; anadir?: string; nombre: string
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([])
  const [foco, setFoco] = React.useState<number | null>(null)
  React.useEffect(() => { if (foco != null) { refs.current[foco]?.focus(); setFoco(null) } }, [foco])
  const poner = (i: number, v: string) => onChange(valores.map((x, j) => (j === i ? v : x)))
  const quitar = (i: number) => onChange(valores.filter((_, j) => j !== i))
  const subir = (i: number) => { if (i === 0) return; const n = [...valores]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n) }
  const repes = new Set(valores.map((x) => x.trim().toLowerCase()).filter((x, i, a) => x && a.indexOf(x) !== i))
  return (
    <div className="flex flex-col gap-1">
      {valores.map((v, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-5 text-right text-sm text-fg-3">{i + 1}</span>
          <input ref={(el) => { refs.current[i] = el }} value={v} placeholder={placeholder} aria-label={`${nombre} ${i + 1}`}
            onChange={(e) => poner(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onChange([...valores.slice(0, i + 1), '', ...valores.slice(i + 1)]); setFoco(i + 1) } }}
            className={cn('h-7 w-[260px] rounded-sm border bg-bg px-2 outline-none focus:border-gray-8 max-md:flex-1', repes.has(v.trim().toLowerCase()) ? 'border-danger' : 'border-border')} />
          <button type="button" onClick={() => subir(i)} disabled={i === 0} aria-label={`Subir ${v || 'fila'}`} className="h-7 w-7 rounded-sm text-fg-3 hover:bg-bg-4 disabled:opacity-30">↑</button>
          <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${v || 'fila'}`} className="h-7 w-7 rounded-sm text-fg-3 hover:bg-bg-4 hover:text-danger-fg">✕</button>
        </div>
      ))}
      {repes.size > 0 && <span className="text-xs text-danger-fg">Hay valores repetidos: se guardará uno de cada.</span>}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => { onChange([...valores, '']); setFoco(valores.length) }}>{anadir}</Button>
    </div>
  )
}

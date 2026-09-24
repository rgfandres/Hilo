import * as React from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/layout/AppShell'
import { cn } from '@/lib/utils'
import { Button } from '@/ui'
import { useCambiosSinGuardar } from '@/lib/salir'

type Quien = 'admin' | 'gestion' | 'todos'
const SECCIONES: { to: string; label: string; quien: Quien }[] = [
  { to: 'cuenta', label: 'Mi cuenta', quien: 'todos' },
  { to: 'tienda', label: 'Tienda', quien: 'admin' },
  { to: 'equipo', label: 'Equipo', quien: 'admin' },
  { to: 'seguridad', label: 'Seguridad', quien: 'admin' },
  { to: 'proveedores', label: '', quien: 'gestion' }, // etiqueta = vocabulario
  { to: 'flujos', label: 'Flujos', quien: 'admin' },
  { to: 'campos', label: 'Campos', quien: 'admin' },
  { to: 'mensajes', label: 'Mensajes', quien: 'admin' },
  { to: 'ficha', label: 'Ficha', quien: 'admin' },
  { to: 'periodos', label: 'Periodos', quien: 'admin' },
  { to: 'guia', label: 'Guía de medidas', quien: 'admin' },
]
const puedeVer = (q: Quien, rol: string | null) => q === 'todos' || rol === 'ADMIN' || (q === 'gestion' && rol === 'OPERATIVO')

/** Ajustes: sub-menú a la izquierda (como Twenty) y la sección a la derecha. */
export function Ajustes() {
  const { rol, vocab } = useAuth()
  const visibles = SECCIONES.filter((s) => puedeVer(s.quien, rol))
  // Una sección a la que el rol no tiene acceso (p. ej. escrita a mano en la dirección) no se abre
  const loc = useLocation()
  const seccion = SECCIONES.find((x) => loc.pathname.split('/')[2] === x.to)
  if (seccion && !puedeVer(seccion.quien, rol)) return <Navigate to="/ajustes/cuenta" replace />
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <nav className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-border p-2 max-md:w-full max-md:flex-row max-md:overflow-x-auto max-md:border-b max-md:border-r-0">
          {visibles.map((s) => (
            <NavLink key={s.to} to={s.to}
              className={({ isActive }) => cn('flex h-7 shrink-0 items-center rounded-sm px-2 font-medium text-fg-2 hover:bg-bg-4 max-md:h-9', isActive && 'bg-gray-5 text-fg')}>
              {s.label || `Portal de ${vocab.proveedores.toLowerCase()}`}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-8 px-8 py-6 max-md:px-4 max-md:py-4">
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
    <label className={cn('inline-flex items-center gap-2', disabled ? 'opacity-50' : 'cursor-pointer')}>
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

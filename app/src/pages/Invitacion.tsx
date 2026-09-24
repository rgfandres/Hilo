import * as React from 'react'
import { useParams } from 'react-router-dom'
import { LS_INVITACION, useAuth } from '@/auth/AuthProvider'
import { aceptarInvitacion, verInvitacion } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { rolesDe } from '@/lib/vocab'
import type { Rol } from '@/lib/types'
import { Button } from '@/ui'
import { Login } from './Login'

/**
 * /invitacion/:token — sin sesión: guarda el enlace y pide entrar o crear cuenta
 * (al entrar se acepta solo). Con sesión: botón «Unirme».
 */
export function Invitacion() {
  const { token = '' } = useParams()
  const { session, recargar, setTiendaPorId, tiendas } = useAuth()
  const [info, setInfo] = React.useState<{ tienda: string; rol: Rol; email: string | null; valida: boolean; tienda_id?: string; roles?: Record<string, string> } | null | undefined>(undefined)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Se vuelve a leer al cambiar la sesión (al entrar, la invitación ya se ha aceptado sola)
  React.useEffect(() => { verInvitacion(token).then(setInfo).catch(() => setInfo(null)) }, [token, session?.user.id])
  const yaDentro = !!session && !!info?.tienda_id && tiendas.some((t) => t.id === info.tienda_id)
  React.useEffect(() => { if (!session && info?.valida) localStorage.setItem(LS_INVITACION, token) }, [session, info, token])

  if (info === undefined) return <div className="flex h-full items-center justify-center text-fg-3">Cargando…</div>
  const rol = info ? rolesDe({ roles: info.roles ?? {} })[info.rol] : ''
  if (yaDentro && info?.tienda_id) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-3 p-4">
        <div className="flex w-[360px] max-w-full flex-col gap-3 rounded-md border border-border bg-bg p-6">
          <span className="text-lg font-semibold">Ya formas parte de {info.tienda}</span>
          <Button variant="primary" onClick={() => { setTiendaPorId(info.tienda_id!); window.location.assign('/') }}>Entrar</Button>
        </div>
      </div>
    )
  }
  if (!info || !info.valida) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-3 p-4">
        <div className="flex w-[360px] max-w-full flex-col gap-3 rounded-md border border-border bg-bg p-6">
          <span className="text-lg font-semibold">Invitación no válida</span>
          <p className="text-fg-2">El enlace ha caducado, se ha anulado o ya se ha usado. Pide uno nuevo a quien te invitó.</p>
          <Button onClick={() => window.location.assign('/')}>Ir a Hilo</Button>
        </div>
      </div>
    )
  }
  const texto = <>Te han invitado a <b className="font-medium text-fg">{info.tienda}</b> como {rol.toLowerCase()}{info.email ? <> con el correo <b className="font-medium text-fg">{info.email}</b></> : null}.</>
  if (!session) return <Login aviso={texto} modoInicial="crear" />
  return (
    <div className="flex h-full items-center justify-center bg-bg-3 p-4">
      <div className="flex w-[360px] max-w-full flex-col gap-3 rounded-md border border-border bg-bg p-6">
        <span className="text-lg font-semibold">Unirte a {info.tienda}</span>
        <p className="text-fg-2">{texto}</p>
        {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
        <Button variant="primary" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null)
          try { const id = await aceptarInvitacion(token); setTiendaPorId(id); await recargar(); window.location.assign('/') } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
        }}>Unirme</Button>
      </div>
    </div>
  )
}

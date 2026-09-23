import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  const { session, recargar, setTiendaPorId } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = React.useState<{ tienda: string; rol: Rol; email: string | null; valida: boolean } | null | undefined>(undefined)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => { verInvitacion(token).then(setInfo).catch(() => setInfo(null)) }, [token])
  React.useEffect(() => { if (!session && info?.valida) localStorage.setItem(LS_INVITACION, token) }, [session, info, token])

  if (info === undefined) return <div className="flex h-full items-center justify-center text-fg-3">Cargando…</div>
  const rol = info ? rolesDe(null)[info.rol] : ''
  if (!info || !info.valida) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-3">
        <div className="flex w-[360px] flex-col gap-3 rounded-md border border-border bg-bg p-6">
          <span className="text-lg font-semibold">Invitación no válida</span>
          <p className="text-fg-2">El enlace ha caducado, se ha anulado o ya se ha usado. Pide uno nuevo a quien te invitó.</p>
          <Button onClick={() => nav('/')}>Ir a Hilo</Button>
        </div>
      </div>
    )
  }
  const texto = <>Te han invitado a <b className="font-medium text-fg">{info.tienda}</b> como {rol.toLowerCase()}{info.email ? <> con el correo <b className="font-medium text-fg">{info.email}</b></> : null}.</>
  if (!session) return <Login aviso={texto} modoInicial="crear" />
  return (
    <div className="flex h-full items-center justify-center bg-bg-3">
      <div className="flex w-[360px] flex-col gap-3 rounded-md border border-border bg-bg p-6">
        <span className="text-lg font-semibold">Unirte a {info.tienda}</span>
        <p className="text-fg-2">{texto}</p>
        {err && <div className="rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
        <Button variant="primary" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null)
          try { const id = await aceptarInvitacion(token); setTiendaPorId(id); await recargar(); nav('/') } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
        }}>Unirme</Button>
      </div>
    </div>
  )
}

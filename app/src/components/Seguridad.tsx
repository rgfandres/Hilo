import * as React from 'react'
import { locale, zona } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/ui'

/** Ajustes de seguridad de una tienda (Ajustes → Seguridad). */
export interface Seguridad {
  metodos: { password: boolean; enlace: boolean; google: boolean }
  exigir_2fa: boolean
  dominios: string[]
  rol_por_defecto: 'OPERATIVO' | 'ATENCION' | 'LOGISTICA'
}
export function seguridadDe(ajustes: Record<string, unknown> | undefined): Seguridad {
  const s = (ajustes?.seguridad ?? {}) as Partial<Seguridad>
  return {
    metodos: { password: s.metodos?.password ?? true, enlace: s.metodos?.enlace ?? true, google: s.metodos?.google ?? true },
    exigir_2fa: !!s.exigir_2fa,
    dominios: s.dominios ?? [],
    rol_por_defecto: s.rol_por_defecto ?? 'ATENCION',
  }
}
const NOMBRE_METODO: Record<keyof Seguridad['metodos'], string> = { password: 'correo y contraseña', enlace: 'enlace por correo', google: 'Google' }

/** Cómo ha entrado la persona en esta sesión. */
export async function metodoActual(): Promise<keyof Seguridad['metodos'] | null> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  // Lo que cuenta es cómo se ha entrado EN ESTA SESIÓN (igual que comprueba el servidor), no con qué se creó la cuenta
  const metodos = (data?.currentAuthenticationMethods ?? []).map((m) => (typeof m === 'string' ? m : m.method) as string)
  if (metodos.includes('oauth')) return 'google'
  if (metodos.includes('password')) return 'password'
  if (metodos.some((m) => m === 'otp' || m === 'magiclink')) return 'enlace'
  return null
}

/**
 * Aplica la seguridad de la tienda antes de enseñar la app: forma de entrar
 * permitida y verificación en dos pasos (si la tienda la exige).
 */
export function ControlSeguridad({ children }: { children: React.ReactNode }) {
  const { tienda, signOut, session } = useAuth()
  const seg = seguridadDe(tienda?.ajustes)
  const [estado, setEstado] = React.useState<'mirando' | 'ok' | 'metodo' | 'verificar' | 'activar' | 'error'>('mirando')
  const tiendaVista = React.useRef<string | null>(null)
  const [metodo, setMetodo] = React.useState<keyof Seguridad['metodos'] | null>(null)
  const [clave, setClave] = React.useState(0)

  React.useEffect(() => {
    let vivo = true
    // Al cambiar de tienda no se enseña nada hasta comprobar su seguridad
    if (tiendaVista.current !== (tienda?.id ?? null)) { tiendaVista.current = tienda?.id ?? null; setEstado('mirando') }
    ;(async () => {
      if (!seg.exigir_2fa && seg.metodos.password && seg.metodos.enlace && seg.metodos.google) { setEstado('ok'); return }
      const m = await metodoActual()
      if (!vivo) return
      setMetodo(m)
      if (m && !seg.metodos[m]) { setEstado('metodo'); return }
      if (seg.exigir_2fa) {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (!vivo) return
        if (data?.currentLevel !== 'aal2') { setEstado(data?.nextLevel === 'aal2' ? 'verificar' : 'activar'); return }
      }
      setEstado('ok')
    })().catch(() => { if (vivo) setEstado('error') })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tienda?.id, session?.access_token, clave, JSON.stringify(seg)])

  if (estado === 'ok') return <>{children}</>
  if (estado === 'mirando') return <div className="flex h-full items-center justify-center text-fg-3">Comprobando la seguridad de la tienda…</div>
  const permitidos = (Object.keys(seg.metodos) as (keyof Seguridad['metodos'])[]).filter((k) => seg.metodos[k]).map((k) => NOMBRE_METODO[k])
  return (
    <div className="flex h-full items-center justify-center bg-bg-3 p-4">
      <div className="flex w-[380px] max-w-full flex-col gap-4 rounded-md border border-border bg-bg p-6">
        {estado === 'error' && (
          <>
            <span className="text-lg font-semibold">No se ha podido comprobar la seguridad</span>
            <p className="m-0 text-fg-2">Revisa la conexión y vuelve a intentarlo.</p>
            <div className="flex gap-2"><Button variant="primary" onClick={() => setClave((c) => c + 1)}>Reintentar</Button><Button variant="ghost" onClick={signOut}>Salir</Button></div>
          </>
        )}
        {estado === 'metodo' && (
          <>
            <span className="text-lg font-semibold">Entra de otra forma</span>
            <p className="m-0 text-fg-2">{tienda?.nombre} no permite entrar con {metodo ? NOMBRE_METODO[metodo] : 'este método'}. Sal y vuelve a entrar con: {permitidos.join(', ')}.</p>
            <Button variant="primary" onClick={signOut}>Salir</Button>
          </>
        )}
        {estado === 'verificar' && <VerificarCodigo onOk={() => setClave((c) => c + 1)} onSalir={signOut} tienda={tienda?.nombre ?? ''} />}
        {estado === 'activar' && (
          <>
            <span className="text-lg font-semibold">Activa la verificación en dos pasos</span>
            <p className="m-0 text-fg-2">{tienda?.nombre} la exige. Necesitas una app de códigos (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
            <ActivarDosPasos onOk={() => setClave((c) => c + 1)} />
            <Button variant="ghost" onClick={signOut}>Salir</Button>
          </>
        )}
      </div>
    </div>
  )
}

function VerificarCodigo({ onOk, onSalir, tienda }: { onOk: () => void; onSalir: () => void; tienda: string }) {
  const [codigo, setCodigo] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  async function verificar(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    const { data } = await supabase.auth.mfa.listFactors()
    const f = data?.totp?.[0]
    if (!f) { setErr('No hay ninguna app de códigos activada'); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: codigo.trim() })
    if (error) setErr('Código incorrecto o caducado. Prueba con el siguiente.'); else onOk()
  }
  return (
    <form onSubmit={verificar} className="flex flex-col gap-3">
      <span className="text-lg font-semibold">Código de verificación</span>
      <p className="m-0 text-fg-2">{tienda} pide un segundo paso. Escribe el código de 6 cifras de tu app.</p>
      <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.4em]" />
      {err && <div className="rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</div>}
      <Button variant="primary" type="submit" disabled={codigo.length !== 6}>Verificar</Button>
      <Button variant="ghost" type="button" onClick={onSalir}>Salir</Button>
    </form>
  )
}

/** Alta de la app de códigos: QR + clave + primer código. También se usa desde Ajustes → Cuenta. */
export function ActivarDosPasos({ onOk }: { onOk: () => void }) {
  const [alta, setAlta] = React.useState<{ id: string; qr: string; secreto: string } | null>(null)
  const [codigo, setCodigo] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => {
    let vivo = true
    ;(async () => {
      // Quita altas a medias (sin verificar) antes de empezar otra
      const { data: l } = await supabase.auth.mfa.listFactors()
      for (const f of (l?.all ?? []).filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Hilo ${new Date().toLocaleDateString(locale(), { timeZone: zona() })}` })
      if (!vivo) return
      if (error || !data) { setErr(error?.message ?? 'No se pudo empezar'); return }
      setAlta({ id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret })
    })()
    return () => { vivo = false }
  }, [])
  async function confirmar(e: React.FormEvent) {
    e.preventDefault(); if (!alta) return
    setErr(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: alta.id, code: codigo.trim() })
    if (error) setErr('Código incorrecto. Comprueba la hora del móvil y prueba con el siguiente.'); else onOk()
  }
  if (err && !alta) return <div className="rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</div>
  if (!alta) return <div className="text-fg-3">Preparando…</div>
  return (
    <form onSubmit={confirmar} className="flex flex-col items-center gap-3">
      <img src={alta.qr} alt="Código QR para la app de verificación" className="h-44 w-44 rounded-sm border border-border bg-white p-2" />
      <span className="text-center text-sm text-fg-3">Escanéalo con la app. Si no puedes, escribe esta clave: <span className="select-all break-all font-mono text-fg">{alta.secreto}</span></span>
      <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Código de 6 cifras" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.3em]" />
      {err && <div className="w-full rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</div>}
      <Button variant="primary" type="submit" disabled={codigo.length !== 6} className="w-full">Activar</Button>
    </form>
  )
}

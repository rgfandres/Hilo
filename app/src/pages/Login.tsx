import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Input } from '@/ui'

const traducir = (m: string) =>
  /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
  : /email not confirmed/i.test(m) ? 'Confirma tu correo: te hemos enviado un enlace.'
  : /already registered/i.test(m) ? 'Ese correo ya tiene cuenta. Entra con tu contraseña.'
  : /at least/i.test(m) ? 'La contraseña debe tener al menos 6 caracteres.'
  : /rate limit|too many/i.test(m) ? 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'
  : /provider is not enabled|unsupported provider/i.test(m) ? 'Esta forma de entrar no está activada en esta instalación.'
  : /same.*password|different from the old/i.test(m) ? 'La contraseña nueva debe ser distinta de la anterior.'
  : m

/** Métodos de acceso que ofrece esta instalación (Google necesitan configurarse en Supabase). */
export const METODOS_INSTANCIA = ((import.meta.env.VITE_ACCESO as string | undefined) ?? 'password,enlace')
  .split(',').map((x) => x.trim()).filter(Boolean)

/** aviso: texto encima del formulario (p. ej. «Te han invitado a…»). */
export function Login({ aviso, modoInicial = 'entrar' }: { aviso?: React.ReactNode; modoInicial?: 'entrar' | 'crear' } = {}) {
  const { signIn, signUp, signInEnlace, signInProveedor, recuperarPassword, caducada } = useAuth()
  const [modo, setModo] = React.useState<'entrar' | 'crear' | 'enlace' | 'olvido'>(modoInicial)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [msg, setMsg] = React.useState<{ tipo: 'error' | 'ok'; texto: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const hayEnlace = METODOS_INSTANCIA.includes('enlace')
  const hayPassword = METODOS_INSTANCIA.includes('password')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const err = modo === 'entrar' ? await signIn(email, password)
      : modo === 'crear' ? await signUp(email, password)
      : modo === 'enlace' ? await signInEnlace(email)
      : await recuperarPassword(email)
    if (err) setMsg({ tipo: 'error', texto: traducir(err) })
    else if (modo === 'crear') setMsg({ tipo: 'ok', texto: 'Cuenta creada. Si te pide confirmar, revisa tu correo.' })
    else if (modo === 'enlace') setMsg({ tipo: 'ok', texto: `Te hemos enviado un enlace a ${email}. Ábrelo en este dispositivo para entrar.` })
    else if (modo === 'olvido') setMsg({ tipo: 'ok', texto: `Si ${email} tiene cuenta, te llegará un enlace para poner una contraseña nueva.` })
    setBusy(false)
  }
  async function proveedor(p: 'google') {
    setMsg(null)
    const err = await signInProveedor(p)
    if (err) setMsg({ tipo: 'error', texto: traducir(err) })
  }
  const titulo = { entrar: 'Entrar', crear: 'Crear cuenta', enlace: 'Entrar con un enlace', olvido: 'Recuperar la contraseña' }[modo]
  const cambiar = (m: typeof modo) => { setModo(m); setMsg(null) }

  return (
    <div className="flex h-full items-center justify-center bg-bg-3 p-4">
      <form onSubmit={enviar} className="flex w-[360px] max-w-full flex-col gap-4 rounded-md border border-border bg-bg p-6">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm bg-inverted" />
          <span className="font-semibold">Hilo</span>
        </div>
        {caducada && <div className="rounded-sm bg-warn-bg px-3 py-2 text-warn-fg">Tu sesión ha caducado. Vuelve a entrar y seguirás donde estabas.</div>}
        {aviso && <div className="rounded-sm bg-bg-3 px-3 py-2 text-fg-2">{aviso}</div>}
        <span className="text-lg font-semibold">{titulo}</span>
        {METODOS_INSTANCIA.includes('google') && modo === 'entrar' && (
          <div className="flex flex-col gap-2">
            {METODOS_INSTANCIA.includes('google') && <Button type="button" size="lg" onClick={() => proveedor('google')}>Continuar con Google</Button>}
            <div className="flex items-center gap-2 text-sm text-fg-3"><span className="h-px flex-1 bg-border" />o con tu correo<span className="h-px flex-1 bg-border" /></div>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="login-email" className="text-sm text-fg-2">Correo</label>
          <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {(modo === 'entrar' || modo === 'crear') && (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <label htmlFor="login-pass" className="text-sm text-fg-2">Contraseña</label>
              {modo === 'entrar' && <button type="button" onClick={() => cambiar('olvido')} className="text-sm text-fg-3 hover:text-fg">¿La has olvidado?</button>}
            </div>
            <Input id="login-pass" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
        )}
        {msg && <div className={msg.tipo === 'error' ? 'rounded-sm bg-danger-bg px-3 py-2 text-danger-fg' : 'rounded-sm bg-ok-bg px-3 py-2 text-ok-fg'}>{msg.texto}</div>}
        <Button variant="primary" size="lg" type="submit" disabled={busy}>
          {{ entrar: 'Entrar', crear: 'Crear cuenta', enlace: 'Enviarme el enlace', olvido: 'Enviarme el enlace' }[modo]}
        </Button>
        <div className="flex flex-col items-center gap-1.5 text-sm">
          {modo === 'entrar' && hayEnlace && <button type="button" onClick={() => cambiar('enlace')} className="text-fg-2 hover:text-fg">Entrar sin contraseña, con un enlace por correo</button>}
          {modo !== 'entrar' && hayPassword && <button type="button" onClick={() => cambiar('entrar')} className="text-fg-2 hover:text-fg">Entrar con contraseña</button>}
          {modo !== 'crear' && hayPassword && <button type="button" onClick={() => cambiar('crear')} className="text-fg-3 hover:text-fg">¿No tienes cuenta? Crear una</button>}
        </div>
      </form>
    </div>
  )
}

/** Tras abrir el enlace de «He olvidado la contraseña». */
export function NuevaContrasena() {
  const { cambiarPassword, terminarRecuperacion } = useAuth()
  const [pw, setPw] = React.useState('')
  const [pw2, setPw2] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (pw !== pw2) { setErr('Las dos contraseñas no coinciden'); return }
    setBusy(true); setErr(null)
    const x = await cambiarPassword(pw)
    setBusy(false)
    if (x) setErr(traducir(x)); else terminarRecuperacion()
  }
  return (
    <div className="flex h-full items-center justify-center bg-bg-3 p-4">
      <form onSubmit={guardar} className="flex w-[360px] max-w-full flex-col gap-4 rounded-md border border-border bg-bg p-6">
        <span className="text-lg font-semibold">Pon una contraseña nueva</span>
        <Input type="password" autoComplete="new-password" placeholder="Contraseña nueva" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
        <Input type="password" autoComplete="new-password" placeholder="Repite la contraseña" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
        {err && <div className="rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</div>}
        <Button variant="primary" size="lg" type="submit" disabled={busy}>Guardar y entrar</Button>
      </form>
    </div>
  )
}

export function SinAcceso() {
  const { session, signOut } = useAuth()
  return (
    <div className="flex h-full items-center justify-center bg-bg-3">
      <div className="flex w-[360px] flex-col gap-4 rounded-md border border-border bg-bg p-6">
        <span className="font-medium">Esta cuenta no tiene acceso a ninguna tienda</span>
        <p className="text-fg-2">Has entrado como <span className="text-fg">{session?.user.email}</span>. Pide a quien administra la tienda que te añada en Ajustes → Equipo.</p>
        <p className="text-fg-2">¿Es tu negocio? Puedes crear tu propia tienda y configurarla a tu manera.</p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => window.location.assign('/nueva-tienda')}>Crear mi tienda</Button>
          <Button onClick={signOut}>Salir</Button>
        </div>
      </div>
    </div>
  )
}

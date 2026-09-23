import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { ActivarDosPasos, seguridadDe } from '@/components/Seguridad'
import { Button, Dialog, FormRow, Input } from '@/ui'
import { Bloque, Estado } from './Ajustes'

/** Ajustes → Mi cuenta: quién soy, contraseña, verificación en dos pasos y salir. */
export function AjustesCuenta() {
  const { session, rolReal, nombresRol, tienda, signOut, cambiarPassword } = useAuth()
  const [pw, setPw] = React.useState('')
  const [pw2, setPw2] = React.useState('')
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [factores, setFactores] = React.useState<{ id: string; nombre: string }[] | null>(null)
  const [nivel, setNivel] = React.useState<string | null>(null)
  const [activando, setActivando] = React.useState(false)
  const [quitar, setQuitar] = React.useState<string | null>(null)
  const exigida = seguridadDe(tienda?.ajustes).exigir_2fa
  const email = session?.user.email ?? ''
  const proveedor = session?.user.app_metadata?.provider as string | undefined

  const leer = React.useCallback(async () => {
    const [{ data: f }, { data: a }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()])
    setFactores((f?.totp ?? []).map((x) => ({ id: x.id, nombre: x.friendly_name ?? 'App de códigos' })))
    setNivel(a?.currentLevel ?? null)
  }, [])
  React.useEffect(() => { leer().catch(() => setFactores([])) }, [leer])

  async function guardarPw(e: React.FormEvent) {
    e.preventDefault(); setOk(null); setErr(null)
    if (pw.length < 6) { setErr('Mínimo 6 caracteres'); return }
    if (pw !== pw2) { setErr('Las dos contraseñas no coinciden'); return }
    const x = await cambiarPassword(pw)
    if (x) setErr(/different from the old/i.test(x) ? 'Debe ser distinta de la actual' : x); else { setOk('Contraseña cambiada'); setPw(''); setPw2('') }
  }

  return (
    <>
      <Bloque titulo="Mi cuenta" ayuda="Tus datos de acceso. Valen para todas las tiendas en las que estés.">
        <div className="flex flex-col gap-1">
          <FormRow label="Conectado como"><span className="font-medium">{email}</span></FormRow>
          <FormRow label="Entras con">{proveedor === 'google' ? 'Google' : 'Correo'}</FormRow>
          {rolReal && <FormRow label={`Rol en ${tienda?.nombre}`}>{nombresRol[rolReal]}</FormRow>}
        </div>
      </Bloque>

      {(!proveedor || proveedor === 'email') && (
        <Bloque titulo="Contraseña" ayuda="Si entras con enlace por correo, aquí puedes poner una contraseña para entrar también con ella.">
          <form onSubmit={guardarPw} className="flex flex-col gap-2">
            <FormRow label="Nueva"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></FormRow>
            <FormRow label="Repetir"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></FormRow>
            <div className="flex items-center gap-3"><Button type="submit" disabled={!pw}>Cambiar contraseña</Button><Estado ok={ok} err={err} /></div>
          </form>
        </Bloque>
      )}

      <Bloque titulo="Verificación en dos pasos" ayuda={`Al entrar, además te pedirá un código de una app del móvil.${exigida ? ` ${tienda?.nombre} la exige.` : ''}`}>
        {factores == null ? <span className="text-fg-3">Comprobando…</span> : factores.length > 0 ? (
          <div className="flex flex-col gap-2">
            {factores.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2">
                <span className="text-ok-fg">✓ Activada</span><span className="text-fg-3">· {f.nombre}</span>
                {!exigida && (nivel === 'aal2'
                  ? <Button size="sm" variant="ghost" onClick={() => setQuitar(f.id)}>Desactivar</Button>
                  : <span className="text-sm text-fg-3">Para desactivarla, entra con el código.</span>)}
              </div>
            ))}
          </div>
        ) : activando ? (
          <div className="max-w-[320px]"><ActivarDosPasos onOk={() => { setActivando(false); leer() }} /></div>
        ) : (
          <div><Button onClick={() => setActivando(true)}>Activar</Button></div>
        )}
      </Bloque>

      <Bloque titulo="Sesión" ayuda="En un dispositivo compartido, sal al terminar para que entre otra persona.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={signOut}>Salir</Button>
          <Button variant="ghost" onClick={signOut}>Cambiar de usuario</Button>
        </div>
      </Bloque>

      <Dialog open={!!quitar} onOpenChange={() => setQuitar(null)} title="Desactivar la verificación en dos pasos"
        description="Entrarás solo con tu correo. Puedes volver a activarla cuando quieras."
        actions={[{ label: 'Desactivar', variant: 'danger', onClick: async () => { if (quitar) await supabase.auth.mfa.unenroll({ factorId: quitar }); setQuitar(null); await leer() } }]} />
    </>
  )
}

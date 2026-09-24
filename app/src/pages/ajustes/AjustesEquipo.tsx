import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { seguridadDe } from '@/components/Seguridad'
import { copiarTexto } from '@/lib/copiar'
import { useAuth } from '@/auth/AuthProvider'
import {
  activarMiembro, cambiarRol, crearInvitacion, enlaceInvitacion, listarEquipo, listarInvitaciones, quitarMiembro, revocarInvitacion,
  type Invitacion, type MiembroEquipo,
} from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import type { Rol } from '@/lib/types'
import { ROLES, ayudaRoles } from '@/lib/vocab'
import { Button, Dialog, Input, Select, Tag } from '@/ui'
import { fechaCorta } from '@/lib/utils'
import { Bloque, Estado, FilaLista, Lista } from './Ajustes'

/** Ajustes → Equipo: personas, roles e invitaciones (por correo o por enlace). */
export function AjustesEquipo() {
  const { tienda, nombresRol, recargar, vocab, setVerComo } = useAuth()
  const nav = useNavigate()
  const rolDefecto = seguridadDe(tienda?.ajustes).rol_por_defecto as Rol
  const [bajarme, setBajarme] = React.useState<{ m: MiembroEquipo; rol: Rol } | null>(null)
  const AYUDA = ayudaRoles(vocab)
  const [equipo, setEquipo] = React.useState<MiembroEquipo[]>([])
  const [invs, setInvs] = React.useState<Invitacion[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [invitar, setInvitar] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [rol, setRol] = React.useState<Rol>('ATENCION')
  const [nueva, setNueva] = React.useState<Invitacion | null>(null)
  const [quitar, setQuitar] = React.useState<MiembroEquipo | null>(null)
  const [desactivar, setDesactivar] = React.useState<MiembroEquipo | null>(null)
  const [dErr, setDErr] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [e, i] = await Promise.all([listarEquipo(tienda.id), listarInvitaciones(tienda.id)])
    setEquipo(e); setInvs(i)
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  async function hacer(fn: () => Promise<unknown>, msg?: string) {
    setErr(null); setOk(null)
    try { await fn(); await cargar(); if (msg) setOk(msg) } catch (x) { setErr(mensajeError(x)) }
  }

  async function crear() {
    if (!tienda) return
    setDErr(null)
    const e = email.trim()
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setDErr('Ese correo no parece válido'); return }
    if (e && equipo.some((m) => m.email.toLowerCase() === e.toLowerCase())) { setDErr('Esa persona ya está en el equipo'); return }
    if (!e && rol === 'ADMIN') { setDErr(`Con enlace abierto no se puede dar ${nombresRol.ADMIN.toLowerCase()}: pon el correo`); return }
    try {
      const inv = await crearInvitacion(tienda.id, rol, e || null)
      setInvitar(false); setNueva(inv); await cargar()
    } catch (x) { setDErr(mensajeError(x)) }
  }

  async function copiar(token: string) {
    if (await copiarTexto(enlaceInvitacion(token))) setOk('Enlace copiado'); else setOk(enlaceInvitacion(token))
  }

  const admins = equipo.filter((m) => m.rol === 'ADMIN' && m.activo).length

  return (
    <>
      <Bloque titulo="Equipo" ayuda="Quién entra en la tienda y qué puede hacer. Cada persona tiene un rol."
        acciones={<Button variant="primary" onClick={() => { setInvitar(true); setEmail(''); setRol(rolDefecto); setDErr(null) }}>+ Invitar</Button>}>
        <Lista>
          {equipo.map((m) => {
            const ultimoAdmin = m.rol === 'ADMIN' && m.activo && admins <= 1
            return (
              <FilaLista key={m.user_id}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-gray-5 text-xs font-semibold">{m.email[0]?.toUpperCase()}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{m.email}{m.soy_yo && <span className="text-fg-3"> · tú</span>}</span>
                  {!m.activo && <span className="text-sm text-fg-3">Desactivado: no puede entrar</span>}
                </div>
                <Select className="w-[170px]" value={m.rol} disabled={ultimoAdmin}
                  title={ultimoAdmin ? 'Es la única persona con administración' : AYUDA[m.rol]}
                  onChange={(e) => {
                    const nuevo = e.target.value as Rol
                    // Quitarse a uno mismo la administración pide confirmación reforzada
                    if (m.soy_yo && m.rol === 'ADMIN' && nuevo !== 'ADMIN') { setBajarme({ m, rol: nuevo }); return }
                    hacer(() => cambiarRol(m.tienda_id, m.user_id, nuevo).then(() => m.soy_yo ? recargar() : undefined), 'Rol cambiado')
                  }}>
                  {ROLES.map((r) => <option key={r} value={r}>{nombresRol[r]}</option>)}
                </Select>
                <Button variant="ghost" size="sm" disabled={ultimoAdmin}
                  onClick={() => m.activo ? setDesactivar(m) : hacer(() => activarMiembro(m.tienda_id, m.user_id, true), 'Activado')}>
                  {m.activo ? 'Desactivar' : 'Activar'}
                </Button>
                <Button variant="danger" size="sm" disabled={ultimoAdmin} onClick={() => { setQuitar(m); setDErr(null) }}>Quitar</Button>
              </FilaLista>
            )
          })}
        </Lista>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-fg-2">Ver la app como</span>
          {ROLES.filter((r) => r !== 'ADMIN').map((r) => (
            <Button key={r} size="sm" onClick={() => { setVerComo(r); nav('/') }} title="Solo lectura: nada se puede cambiar mientras tanto">{nombresRol[r]}</Button>
          ))}
        </div>
        <p className="text-sm text-fg-3">
          {ROLES.map((r) => <span key={r} className="mr-3 inline-block"><b className="font-medium text-fg-2">{nombresRol[r]}</b>: {AYUDA[r].toLowerCase()}</span>)}
        </p>
        <Estado ok={ok} err={err} />
      </Bloque>

      <Bloque titulo="Invitaciones pendientes" ayuda="Con correo: se acepta sola cuando esa persona entra. Sin correo: vale para cualquiera que tenga el enlace. Caducan a los 14 días.">
        {invs.length === 0 ? <p className="text-fg-3">No hay invitaciones pendientes.</p> : (
          <Lista>
            {invs.map((i) => (
              <FilaLista key={i.id}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{i.email ?? 'Enlace abierto'}</span>
                  <span className="text-sm text-fg-3">Creada el {fechaCorta(i.creado_en)} · caduca el {fechaCorta(i.caduca_en)}</span>
                </div>
                <Tag color="gray">{nombresRol[i.rol]}</Tag>
                <Button variant="ghost" size="sm" onClick={() => copiar(i.token)}>Copiar enlace</Button>
                <Button variant="danger" size="sm" onClick={() => hacer(() => revocarInvitacion(i.id), 'Invitación anulada')}>Anular</Button>
              </FilaLista>
            ))}
          </Lista>
        )}
      </Bloque>

      <Dialog open={invitar} onOpenChange={setInvitar} title="Invitar al equipo" error={dErr}
        description="Deja el correo vacío para crear un enlace que sirva a cualquiera (útil para un grupo)."
        actions={[{ label: 'Crear invitación', onClick: crear }]}>
        <Input autoFocus type="email" placeholder="correo@ejemplo.com (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
          {/* Un enlace abierto lo puede usar cualquiera: nunca con rol de administración */}
          {ROLES.filter((r) => r !== 'ADMIN' || email.trim()).map((r) => <option key={r} value={r}>{nombresRol[r]} — {AYUDA[r].toLowerCase()}</option>)}
        </Select>
        {!email.trim() && <span className="text-sm text-fg-3">Con enlace abierto no se puede dar {nombresRol.ADMIN.toLowerCase()}: pon el correo de esa persona.</span>}
      </Dialog>

      <Dialog open={!!nueva} onOpenChange={() => setNueva(null)} title="Invitación creada"
        description={nueva?.email
          ? `Cuando ${nueva.email} entre en Hilo con ese correo, pasará al equipo sola. También puedes enviarle este enlace:`
          : 'Envía este enlace a quien quieras que entre. Cualquiera con el enlace podrá unirse con ese rol.'}
        actions={[{ label: 'Copiar enlace', onClick: async () => { if (nueva) await copiar(nueva.token); setNueva(null) } }]}>
        {nueva && <Input readOnly value={enlaceInvitacion(nueva.token)} onFocus={(e) => e.target.select()} />}
      </Dialog>

      <Dialog open={!!quitar} onOpenChange={() => setQuitar(null)} title={quitar?.soy_yo ? 'Quitarte del equipo' : 'Quitar del equipo'} error={dErr}
        description={quitar?.soy_yo
          ? 'Perderás el acceso a esta tienda en cuanto confirmes. Solo otra persona con administración podrá volver a invitarte.'
          : `${quitar?.email} dejará de poder entrar. Lo que haya hecho se conserva en el historial.`}
        actions={[{ label: 'Quitar', variant: 'danger', onClick: async () => {
          if (!quitar) return
          try { await quitarMiembro(quitar.tienda_id, quitar.user_id); const yo = quitar.soy_yo; setQuitar(null); if (yo) await recargar(); else await cargar() }
          catch (x) { setDErr(mensajeError(x)) }
        } }]} />
      <Dialog open={!!bajarme} onOpenChange={() => setBajarme(null)} title="Dejar la administración"
        description={`Pasarás a ${bajarme ? nombresRol[bajarme.rol] : ''} y perderás el acceso a Ajustes. Solo otra persona con administración podrá devolvértelo.`}
        actions={[{ label: 'Dejar la administración', variant: 'danger', onClick: async () => {
          if (!bajarme) return
          await hacer(() => cambiarRol(bajarme.m.tienda_id, bajarme.m.user_id, bajarme.rol).then(() => recargar()), 'Rol cambiado')
          setBajarme(null)
        } }]} />
      <Dialog open={!!desactivar} onOpenChange={(o) => !o && setDesactivar(null)}
        title={desactivar?.soy_yo ? 'Desactivarte a ti' : `Desactivar a ${desactivar?.email ?? ''}`}
        description={desactivar?.soy_yo
          ? 'Dejarás de poder entrar en esta tienda en cuanto salgas. Solo otra persona con administración podrá activarte de nuevo.'
          : 'No podrá entrar en la tienda hasta que la actives otra vez. Lo que hizo se conserva. Se puede deshacer con «Activar».'}
        actions={[{ label: 'Desactivar', variant: 'danger', onClick: async () => {
          const m = desactivar; if (!m) return
          setDesactivar(null)
          await hacer(() => activarMiembro(m.tienda_id, m.user_id, false), 'Desactivado')
          if (m.soy_yo) recargar()
        } }]} />
    </>
  )
}

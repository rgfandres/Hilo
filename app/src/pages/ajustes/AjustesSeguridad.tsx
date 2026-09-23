import * as React from 'react'
import { IconX } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { guardarTienda } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { seguridadDe, type Seguridad } from '@/components/Seguridad'
import { METODOS_INSTANCIA } from '@/pages/Login'
import { Button, Input, Select } from '@/ui'
import { Bloque, Estado, Interruptor } from './Ajustes'

/** Dominios de correo gratuito: no se pueden aprobar (entraría cualquiera). */
const DOMINIOS_PUBLICOS = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com', 'aol.com'])

/**
 * Ajustes → Seguridad (como en Twenty): formas de entrar permitidas, verificación en
 * dos pasos obligatoria y dominios aprobados con rol por defecto.
 */
export function AjustesSeguridad() {
  const { tienda, recargar, nombresRol } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const inicial = React.useMemo(() => seguridadDe(aj), [tienda]) // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = React.useState<Seguridad>(inicial)
  const [dominio, setDominio] = React.useState('')
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => setF(inicial), [inicial])
  const sucio = JSON.stringify(f) !== JSON.stringify(inicial)

  const disponibles: { k: keyof Seguridad['metodos']; label: string; instancia: string }[] = [
    { k: 'password', label: 'Correo y contraseña', instancia: 'password' },
    { k: 'enlace', label: 'Enlace por correo (sin contraseña)', instancia: 'enlace' },
    { k: 'google', label: 'Google', instancia: 'google' },
  ]
  const activos = disponibles.filter((d) => METODOS_INSTANCIA.includes(d.instancia) && f.metodos[d.k])

  function anadirDominio() {
    const d = dominio.trim().toLowerCase().replace(/^@/, '')
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) { setErr('Escribe un dominio como «mitienda.es»'); return }
    if (DOMINIOS_PUBLICOS.has(d)) { setErr(`«${d}» es un correo gratuito: entraría cualquiera. Usa el dominio propio de la tienda.`); return }
    if (f.dominios.includes(d)) { setDominio(''); return }
    setErr(null); setF({ ...f, dominios: [...f.dominios, d] }); setDominio('')
  }
  async function guardar() {
    if (!tienda) return
    if (activos.length === 0) { setErr('Deja al menos una forma de entrar'); return }
    setErr(null); setOk(null)
    try {
      await guardarTienda(tienda.id, tienda.nombre, { ...aj, seguridad: f })
      await recargar(); setOk('Guardado')
    } catch (x) { setErr(mensajeError(x)) }
  }

  return (
    <>
      <Bloque titulo="Formas de entrar" ayuda="Qué pueden usar las personas del equipo para entrar en esta tienda. Si alguien entra de otra forma, se le pide que vuelva a entrar.">
        <div className="flex flex-col gap-2">
          {disponibles.map((d) => {
            const hay = METODOS_INSTANCIA.includes(d.instancia)
            return (
              <div key={d.k} className="flex items-center gap-2">
                <Interruptor checked={hay && f.metodos[d.k]} disabled={!hay} label={d.label}
                  onChange={(v) => setF({ ...f, metodos: { ...f.metodos, [d.k]: v } })} />
                {!hay && <span className="text-sm text-fg-3">No activado en esta instalación</span>}
              </div>
            )
          })}
        </div>
      </Bloque>

      <Bloque titulo="Verificación en dos pasos" ayuda="Además de entrar, cada persona escribe un código de una app de su móvil (Google Authenticator, Microsoft Authenticator…).">
        <Interruptor checked={f.exigir_2fa} label="Obligatoria para todo el equipo" onChange={(v) => setF({ ...f, exigir_2fa: v })} />
        {f.exigir_2fa && <p className="m-0 text-sm text-fg-3">Quien aún no la tenga, la activará la próxima vez que entre. Cada uno la gestiona en Ajustes → Mi cuenta.</p>}
      </Bloque>

      <Bloque titulo="Dominio aprobado" ayuda="Cualquiera con un correo confirmado de estos dominios entra sola en la tienda con el rol por defecto. Nunca como administración.">
        <div className="flex flex-wrap gap-1.5">
          {f.dominios.map((d) => (
            <span key={d} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-bg px-2">
              @{d}
              <button onClick={() => setF({ ...f, dominios: f.dominios.filter((x) => x !== d) })} aria-label={`Quitar ${d}`} className="text-fg-3 hover:text-fg"><IconX size={12} /></button>
            </span>
          ))}
          {f.dominios.length === 0 && <span className="text-fg-3">Ninguno.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-7 w-[220px]" placeholder="mitienda.es" value={dominio} onChange={(e) => setDominio(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anadirDominio() } }} />
          <Button onClick={anadirDominio}>Añadir</Button>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-fg-2">
          Rol por defecto (dominio y enlaces de invitación abiertos)
          <Select className="h-7 w-[200px]" value={f.rol_por_defecto} onChange={(e) => setF({ ...f, rol_por_defecto: e.target.value as Seguridad['rol_por_defecto'] })}>
            {(['ATENCION', 'OPERATIVO', 'LOGISTICA'] as const).map((r) => <option key={r} value={r}>{nombresRol[r]}</option>)}
          </Select>
        </label>
      </Bloque>

      <div className="sticky bottom-0 -mx-8 flex items-center gap-3 border-t border-border bg-bg px-8 py-3 max-md:-mx-4 max-md:px-4">
        <Button variant="primary" disabled={!sucio} onClick={guardar}>Guardar</Button>
        <Estado ok={ok} err={err} />
      </div>
    </>
  )
}

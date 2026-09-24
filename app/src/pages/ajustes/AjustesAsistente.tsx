import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  actualizarEtapa, crearEtapa, crearInvitacion, enlaceInvitacion, guardarTienda, listarEtapasDe, listarTipos, marcarFinal,
} from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { copiarTexto } from '@/lib/copiar'
import { ROLES, rolesDe, vocabDe, type Vocab } from '@/lib/vocab'
import type { Etapa, Rol } from '@/lib/types'
import { Button, FormRow, Input, Select } from '@/ui'
import { cn } from '@/lib/utils'
import { Interruptor } from './Ajustes'

const PASOS = ['Tu tienda', 'Cómo lo llamáis', 'Etapas', 'Módulos', 'Tu equipo'] as const
const ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Lima']
type Aj = Record<string, unknown>

/** Estado del asistente guardado en la tienda. Solo las tiendas nuevas lo tienen (hecho: false). */
export function asistenteDe(aj: Aj | null | undefined): { pendiente: boolean; paso: number } {
  const a = (aj?.asistente ?? null) as { hecho?: boolean; paso?: number } | null
  return { pendiente: !!a && a.hecho === false, paso: Math.min(Math.max(a?.paso ?? 0, 0), PASOS.length - 1) }
}

/** Aviso arriba de Ajustes mientras la configuración inicial no esté terminada. */
export function AvisoAsistente() {
  const { tienda, rol } = useAuth()
  const a = asistenteDe(tienda?.ajustes as Aj)
  if (rol !== 'ADMIN' || !a.pendiente) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-warn-bg px-4 py-3 text-warn-fg">
      <div className="flex flex-1 flex-col">
        <span className="font-semibold">Configuración inicial: {a.paso} de {PASOS.length} pasos hechos</span>
        <span className="text-sm">Te quedan: {PASOS.slice(a.paso).join(', ')}.</span>
      </div>
      <Button variant="primary" asChild><Link to="/ajustes/asistente">Seguir configurando</Link></Button>
    </div>
  )
}

/** Ajustes → Asistente: lo imprescindible para empezar, en cinco pasos. Todo se puede cambiar luego. */
export function AjustesAsistente() {
  const { tienda, recargar, gr } = useAuth()
  const nav = useNavigate()
  const aj = (tienda?.ajustes ?? {}) as Aj
  // Reabierto después de terminarlo: desde el principio
  const [paso, setPaso] = React.useState(() => { const a = asistenteDe(aj); return a.pendiente ? a.paso : 0 })
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Datos de cada paso
  const [nombre, setNombre] = React.useState(tienda?.nombre ?? '')
  const [zona, setZona] = React.useState(String(aj.zona_horaria ?? 'Europe/Madrid'))
  const [moneda, setMoneda] = React.useState(String(aj.moneda ?? 'EUR'))
  const [vocab, setVocab] = React.useState<Vocab>(vocabDe(aj))
  const mods0 = (aj.modulos ?? {}) as Record<string, boolean>
  const [mods, setMods] = React.useState({ importe: aj.usar_importe !== false, materiales: !!mods0.materiales, produccion: !!mods0.produccion, logistica: !!mods0.logistica })
  const [tipo, setTipo] = React.useState<{ id: string; nombre: string } | null>(null)
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [nueva, setNueva] = React.useState('')
  const [inv, setInv] = React.useState({ email: '', rol: 'ATENCION' as Rol })
  const [enlaces, setEnlaces] = React.useState<{ email: string; url: string }[]>([])
  const nombresRol = rolesDe(aj)

  const cargarEtapas = React.useCallback(async () => {
    if (!tienda) return
    const ts = (await listarTipos(tienda.id)).filter((t) => t.activo)
    const t = ts[0] ?? null
    setTipo(t)
    if (t) setEtapas(await listarEtapasDe(t.id))
  }, [tienda])
  React.useEffect(() => { if (paso === 2) cargarEtapas().catch((x) => setErr(mensajeError(x))) }, [paso, cargarEtapas])

  async function guardar(extra: Aj, siguiente: number, nombreT = tienda?.nombre ?? '') {
    if (!tienda) return
    await guardarTienda(tienda.id, nombreT, { ...aj, ...extra, asistente: { hecho: siguiente >= PASOS.length, paso: Math.min(siguiente, PASOS.length) } })
    await recargar()
  }

  async function siguiente() {
    if (!tienda) return
    setErr(null)
    const sig = paso + 1
    try {
      setBusy(true)
      if (paso === 0) {
        if (!nombre.trim()) { setErr('La tienda necesita un nombre'); return }
        const mon = moneda.trim().toUpperCase().replace('€', 'EUR').replace('$', 'USD')
        if (!/^[A-Z]{3}$/.test(mon)) { setErr('La moneda va con su código de 3 letras: EUR, USD, MXN…'); return }
        await guardar({ zona_horaria: zona, moneda: mon }, sig, nombre.trim())
      } else if (paso === 1) {
        if (Object.values(vocab).some((v) => !v.trim())) { setErr('Ninguna palabra puede quedar vacía'); return }
        await guardar({ vocab: Object.fromEntries(Object.entries(vocab).map(([k, v]) => [k, v.trim()])) }, sig)
      } else if (paso === 2) {
        if (etapas.length && !etapas.some((e) => e.es_final)) await marcarFinal(etapas[etapas.length - 1].id, true)
        await guardar({}, sig)
      } else if (paso === 3) {
        await guardar({ usar_importe: mods.importe, modulos: { ...mods0, materiales: mods.materiales, produccion: mods.produccion, logistica: mods.logistica } }, sig)
      } else {
        await guardar({}, sig)
      }
      if (sig >= PASOS.length) nav('/ajustes/importar')
      else setPaso(sig)
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }
  // Sin guardar nada más: el aviso seguirá en Ajustes hasta terminar
  const hacerLuego = () => nav('/ajustes/tienda')

  const PALABRAS: { k: keyof Vocab; kp: keyof Vocab; q: string }[] = [
    { k: 'encargo', kp: 'encargos', q: 'Lo que hacéis por encargo' },
    { k: 'cliente', kp: 'clientes', q: 'Quien lo encarga' },
    { k: 'producto', kp: 'productos', q: 'Lo que ofrecéis' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-sm text-fg-3">Configuración inicial · paso {paso + 1} de {PASOS.length}</span>
        <h1 className="m-0 text-xl font-semibold">{['¿Cómo se llama tu tienda?', '¿Cómo lo llamáis vosotros?', `¿Por qué pasos va ${gr.con('encargo', 'un')}?`, '¿Qué vais a usar?', '¿Quién más va a entrar?'][paso]}</h1>
        <p className="m-0 text-fg-2">{[
          'Lo básico para que fechas y precios salgan bien.',
          'La app usará vuestras palabras en menús y botones.',
          'Te proponemos estos. Cámbialos o añade los tuyos; luego podrás afinarlos.',
          'Enciende solo lo que vayáis a usar. Se puede cambiar cuando quieras.',
          'Crea un enlace de invitación para cada persona. Lo puedes hacer luego desde Equipo.',
        ][paso]}</p>
      </header>

      <ol className="m-0 flex list-none gap-1 p-0" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className={cn('flex-1 border-t-4 pt-1 text-xs', i < paso ? 'border-ok-fg text-fg-2' : i === paso ? 'border-gray-12 font-semibold' : 'border-border text-fg-3')}>{p}</li>
        ))}
      </ol>

      {paso === 0 && (
        <div className="flex flex-col gap-1">
          <FormRow label="Nombre"><Input className="h-8" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></FormRow>
          <FormRow label="Zona horaria">
            <Select className="w-[260px]" value={zona} onChange={(e) => setZona(e.target.value)}>
              {[...new Set([zona, ...ZONAS])].map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Moneda"><Input className="h-8 w-24" maxLength={3} value={moneda} onChange={(e) => setMoneda(e.target.value)} /></FormRow>
        </div>
      )}

      {paso === 1 && (
        <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-x-3 gap-y-2 max-md:grid-cols-1">
          <span className="text-sm text-fg-3 max-md:hidden">Qué es</span><span className="text-sm text-fg-3 max-md:hidden">Una</span><span className="text-sm text-fg-3 max-md:hidden">Varias</span>
          {PALABRAS.map((p) => (
            <React.Fragment key={p.k}>
              <span className="text-fg-2">{p.q}</span>
              <Input className="h-8" aria-label={`${p.q} (una)`} value={vocab[p.k]} onChange={(e) => setVocab({ ...vocab, [p.k]: e.target.value })} />
              <Input className="h-8" aria-label={`${p.q} (varias)`} value={vocab[p.kp]} onChange={(e) => setVocab({ ...vocab, [p.kp]: e.target.value })} />
            </React.Fragment>
          ))}
        </div>
      )}

      {paso === 2 && (
        <div className="flex flex-col gap-2">
          {!tipo && <p className="m-0 text-fg-3">Cargando…</p>}
          {tipo && <span className="text-sm text-fg-3">Tipo: {tipo.nombre}. Los demás tipos y las condiciones de cada etapa están en Ajustes → Tipos y etapas.</span>}
          {etapas.map((e, i) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
              <span className="w-5 text-right text-sm text-fg-3">{i + 1}</span>
              <Input className="h-8 min-w-[180px] flex-1" defaultValue={e.nombre} aria-label={`Etapa ${i + 1}`}
                onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nombre) actualizarEtapa(e.id, { nombre: v }).then(cargarEtapas).catch((x) => setErr(mensajeError(x))) }} />
              <Select className="w-[160px]" value={e.rol_ejecuta} aria-label="Quién la marca"
                onChange={(ev) => actualizarEtapa(e.id, { rol_ejecuta: ev.target.value as Rol }).then(cargarEtapas).catch((x) => setErr(mensajeError(x)))}>
                {ROLES.map((r) => <option key={r} value={r}>La marca: {nombresRol[r]}</option>)}
              </Select>
              {e.es_final && <span className="text-sm text-ok-fg">Final</span>}
            </div>
          ))}
          {tipo && tienda && (
            <form className="flex gap-2" onSubmit={async (ev) => {
              ev.preventDefault(); if (!nueva.trim()) return
              try { await crearEtapa(tienda.id, tipo.id, nueva, etapas); setNueva(''); await cargarEtapas() } catch (x) { setErr(mensajeError(x)) }
            }}>
              <Input className="h-8" placeholder="Nueva etapa (se añade al final)" value={nueva} onChange={(e) => setNueva(e.target.value)} />
              <Button type="submit" disabled={!nueva.trim()}>+ Añadir paso</Button>
            </form>
          )}
        </div>
      )}

      {paso === 3 && (
        <div className="flex flex-col gap-3">
          {([
            ['importe', 'Cobros', 'Precio, lo pagado a cuenta y lo que falta por cobrar.'],
            ['materiales', vocab.materiales, `Lo que tenéis y lo que pedís a ${vocab.proveedores.toLowerCase()}.`],
            ['produccion', 'Hoja de producción', `Hoja con los ${vocab.encargos.toLowerCase()} para enviar a quien los fabrica o prepara.`],
            ['logistica', 'Logística', 'Pantalla para quien hace los recados fuera de la tienda.'],
          ] as const).map(([k, t, d]) => (
            <div key={k} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
              <div className="flex flex-1 flex-col"><span className="font-medium">{t}</span><span className="text-sm text-fg-2">{d}</span></div>
              <Interruptor checked={mods[k]} onChange={(v) => setMods({ ...mods, [k]: v })} label={mods[k] ? 'Sí' : 'No'} />
            </div>
          ))}
        </div>
      )}

      {paso === 4 && tienda && (
        <div className="flex flex-col gap-2">
          <form className="flex flex-wrap gap-2" onSubmit={async (ev) => {
            ev.preventDefault()
            const email = inv.email.trim().toLowerCase()
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Ese correo no parece válido'); return }
            try { const i = await crearInvitacion(tienda.id, inv.rol, email); setEnlaces([...enlaces, { email, url: enlaceInvitacion(i.token) }]); setInv({ ...inv, email: '' }); setErr(null) }
            catch (x) { setErr(mensajeError(x)) }
          }}>
            <Input className="h-8 min-w-[220px] flex-1" type="email" placeholder="correo@ejemplo.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
            <Select className="w-[180px]" value={inv.rol} onChange={(e) => setInv({ ...inv, rol: e.target.value as Rol })} aria-label="Papel">
              {ROLES.map((r) => <option key={r} value={r}>{nombresRol[r]}</option>)}
            </Select>
            <Button type="submit">Crear invitación</Button>
          </form>
          {enlaces.map((e) => (
            <div key={e.url} className="flex flex-wrap items-center gap-2 rounded-md bg-bg-3 px-3 py-2 text-sm">
              <span className="flex-1">{e.email}: envíale este enlace</span>
              <Button size="sm" variant="ghost" onClick={() => copiarTexto(e.url)}>Copiar enlace</Button>
            </div>
          ))}
        </div>
      )}

      {err && <p className="m-0 rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {paso > 0 && <Button variant="ghost" disabled={busy} onClick={() => { setErr(null); setPaso(paso - 1) }}>Atrás</Button>}
        <span className="flex-1" />
        <Button variant="ghost" disabled={busy} onClick={hacerLuego}>Terminar luego</Button>
        <Button variant="primary" cargando={busy} onClick={siguiente}>{paso === PASOS.length - 1 ? 'Terminar' : 'Siguiente'}</Button>
      </div>
    </div>
  )
}

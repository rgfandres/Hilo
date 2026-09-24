import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { setSoloLectura, supabase } from '@/lib/supabase'
import { setLocale, setZona } from '@/lib/utils'
import type { Miembro, Periodo, Rol, Tienda } from '@/lib/types'
import { contextoErrores, mensajeError } from '@/data/encargos'
import { setSegundosDeshacer } from '@/ui/Avisos'

/** Dirección de vuelta sin «#»: el proveedor añade «#access_token…» y con otra «#» delante la sesión no se lee */
const sinAlmohadilla = () => window.location.origin + window.location.pathname + window.location.search
import { gramatica, generosDe, rolesDe, vocabDe, type Gramatica, type Vocab } from '@/lib/vocab'

interface AuthState {
  loading: boolean
  session: Session | null
  tiendas: Tienda[]
  tienda: Tienda | null
  rol: Rol | null
  /** Periodo activo de la tienda (listas e indicadores dependen de él) */
  periodo: Periodo | null
  esProveedor: boolean
  /** Tiendas en las que la persona es proveedor (portal) y no miembro */
  tiendasProveedor: Set<string>
  vocab: Vocab
  /** Artículos y concordancia según el vocabulario de la tienda */
  gr: Gramatica
  /** Nombre visible de cada rol en esta tienda */
  nombresRol: Record<Rol, string>
  /** Vuelve a leer tiendas y permisos (tras cambiar Ajustes o aceptar una invitación) */
  recargar: () => Promise<void>
  setTienda: (t: Tienda) => void
  /** Elegir tienda por id (la aplica al recargar si aún no está en la lista) */
  setTiendaPorId: (id: string) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  avisoInvitacion: string | null
  cerrarAvisoInvitacion: () => void
  /** Qué se está cargando (para el mensaje de la pantalla de carga) */
  fase: string
  /** La sesión se cerró sola (caducó): se avisa al volver a entrar */
  caducada: boolean
  cerrarCaducada: () => void
  /** Entrar con enlace por correo, con Google y recuperar la contraseña */
  signInEnlace: (email: string) => Promise<string | null>
  signInProveedor: (p: 'google') => Promise<string | null>
  recuperarPassword: (email: string) => Promise<string | null>
  cambiarPassword: (pw: string) => Promise<string | null>
  /** Llegó con el enlace de «He olvidado la contraseña»: hay que poner una nueva */
  recuperando: boolean
  terminarRecuperacion: () => void
  /** «Ver como» un rol (solo administración): la app se ve como ese rol y en solo lectura */
  verComo: Rol | null
  setVerComo: (r: Rol | null) => void
  rolReal: Rol | null
}

const Ctx = React.createContext<AuthState | null>(null)
const LS_TIENDA = 'hilo_tienda_id'
/** Token de invitación pendiente (se guarda al abrir /invitacion/:token sin sesión) */
export const LS_INVITACION = 'hilo_invitacion'
/** Marca de «Salir» pulsado (para que las demás pestañas no digan «sesión caducada») */
const LS_SALIDA = 'hilo_salida'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true)
  const [session, setSession] = React.useState<Session | null>(null)
  const [tiendas, setTiendas] = React.useState<Tienda[]>([])
  const [miembros, setMiembros] = React.useState<Miembro[]>([])
  const [tienda, setTiendaState] = React.useState<Tienda | null>(null)
  // Tiendas en las que soy proveedor (portal), aparte de en las que soy miembro
  const [tiendasProveedor, setTiendasProveedor] = React.useState<Set<string>>(new Set())
  // El periodo va atado a su tienda: nunca se usa el de la tienda anterior tras cambiar
  const [periodoDe, setPeriodoDe] = React.useState<{ tiendaId: string; p: Periodo | null } | null>(null)
  const [version, setVersion] = React.useState(0)
  const [avisoInvitacion, setAvisoInvitacion] = React.useState<string | null>(null)
  const [fase, setFase] = React.useState('Comprobando tu sesión…')
  const [caducada, setCaducada] = React.useState(false)
  const [recuperando, setRecuperando] = React.useState(false)
  const [verComo, setVerComoState] = React.useState<Rol | null>(null)
  const salidaManual = React.useRef(false)
  const habiaSesion = React.useRef(false)
  const userId = session?.user.id ?? null
  const tiendaRef = React.useRef<Tienda | null>(null)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { habiaSesion.current = !!data.session; setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      // Cerrada sin pulsar «Salir»: caducó (o se revocó). Al volver a entrar se sigue en la misma pantalla.
      let salidaReciente = false
      try { salidaReciente = Date.now() - Number(localStorage.getItem(LS_SALIDA) ?? 0) < 60_000 } catch { /* nada */ }
      if (ev === 'SIGNED_OUT' && habiaSesion.current && !salidaManual.current && !salidaReciente) setCaducada(true)
      if (ev === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (ev === 'SIGNED_IN') { salidaManual.current = false; setCaducada(false) }
      habiaSesion.current = !!s
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Periodo activo (uno por tienda; si no hay, se trabaja sin filtro)
  const cargarPeriodo = React.useCallback(async (tiendaId: string | null) => {
    if (!tiendaId) { setPeriodoDe(null); return }
    const { data } = await supabase.from('periodo').select('id,nombre,ajustes').eq('tienda_id', tiendaId).eq('activo', true).maybeSingle()
    setPeriodoDe((prev) => {
      const p = (data as Periodo) ?? null
      return prev && prev.tiendaId === tiendaId && JSON.stringify(prev.p) === JSON.stringify(p) ? prev : { tiendaId, p }
    })
  }, [])

  React.useEffect(() => {
    if (!userId) { setTiendas([]); setMiembros([]); setTiendaState(null); setPeriodoDe(null); setLoading(false); return }
    let alive = true
    ;(async () => {
      if (version === 0) setLoading(true) // al recargar no se desmonta la pantalla
      setFase('Comprobando invitaciones…')
      // Invitaciones: la del enlace abierto (si la hay) y las pendientes para mi correo
      const token = localStorage.getItem(LS_INVITACION)
      let tiendaInvitada: string | null = null
      if (token) {
        const { data, error } = await supabase.rpc('aceptar_invitacion', { p_token: token })
        localStorage.removeItem(LS_INVITACION)
        if (error) setAvisoInvitacion(mensajeError(error)); else tiendaInvitada = data as string
      }
      await supabase.rpc('aceptar_invitaciones_pendientes')
      await supabase.rpc('unirse_por_dominio').then(() => {}, () => {}) // dominio aprobado por alguna tienda
      setFase('Cargando tus tiendas y permisos…')
      // Las RLS ya limitan a las tiendas del usuario (miembro o proveedor)
      const [{ data: ts }, { data: ms }, { data: pu }] = await Promise.all([
        supabase.from('tienda').select('id,nombre,ajustes').order('nombre'),
        supabase.from('miembro').select('*').eq('user_id', userId).eq('activo', true),
        supabase.from('proveedor').select('tienda_id').limit(1000),
      ])
      if (!alive) return
      const list = (ts ?? []) as Tienda[]
      const mis = (ms ?? []) as Miembro[]
      // Se conservan los objetos que no han cambiado (así las pantallas no recargan sin motivo)
      setTiendas((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list))
      setMiembros((prev) => (JSON.stringify(prev) === JSON.stringify(mis) ? prev : mis))
      const deMiembro = new Set(mis.map((m) => m.tienda_id))
      setTiendasProveedor(new Set(((pu ?? []) as { tienda_id: string }[]).map((x) => x.tienda_id).filter((id) => !deMiembro.has(id))))
      const saved = tiendaInvitada ?? localStorage.getItem(LS_TIENDA)
      const prev = tiendaRef.current
      const nueva = list.find((t) => t.id === (prev?.id ?? saved)) ?? list.find((t) => t.id === saved) ?? list[0] ?? null
      const elegida = prev && nueva && prev.id === nueva.id && JSON.stringify(prev) === JSON.stringify(nueva) ? prev : nueva
      await cargarPeriodo(elegida?.id ?? null)
      if (!alive) return
      setTiendaState(elegida)
      if (!alive) return
      setLoading(false)
    })()
    return () => { alive = false }
  }, [userId, version]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar de tienda y al volver a la pestaña (otro dispositivo puede haber activado otro periodo)
  React.useEffect(() => { if (tienda && periodoDe?.tiendaId !== tienda.id) cargarPeriodo(tienda.id).catch(() => {}) }, [tienda]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const volver = () => { if (document.visibilityState === 'visible' && tienda) cargarPeriodo(tienda.id).catch(() => {}) }
    document.addEventListener('visibilitychange', volver)
    return () => document.removeEventListener('visibilitychange', volver)
  }, [tienda, cargarPeriodo])
  const periodo = periodoDe && periodoDe.tiendaId === tienda?.id ? periodoDe.p : null
  const periodoListo = !tienda || periodoDe?.tiendaId === tienda.id

  // Acento y formato local por tienda
  React.useEffect(() => {
    setLocale((tienda?.ajustes?.locale as string | undefined) ?? 'es-ES')
    setZona(tienda?.ajustes?.zona_horaria as string | undefined)
    setSegundosDeshacer(tienda?.ajustes?.segundos_deshacer)
    const c = (tienda?.ajustes?.color_primario as string | undefined) ?? '#333333'
    document.documentElement.style.setProperty('--accent', c)
  }, [tienda])

  tiendaRef.current = tienda
  const rolReal = React.useMemo<Rol | null>(
    () => miembros.find((m) => m.tienda_id === tienda?.id)?.rol ?? null,
    [miembros, tienda],
  )
  // «Ver como» solo lo usa administración; al cambiar de tienda se sale
  React.useEffect(() => { setVerComoState(null) }, [tienda?.id])
  const rol = rolReal === 'ADMIN' && verComo ? verComo : rolReal
  React.useEffect(() => {
    setSoloLectura(rolReal === 'ADMIN' && verComo ? 'Estás viendo la app como otro rol: solo lectura. Sal de «Ver como» para cambiar algo.' : null)
  }, [verComo, rolReal])

  contextoErrores(tienda?.ajustes as Record<string, unknown> | undefined)
  const esProveedor = !rolReal && !!tienda && tiendasProveedor.has(tienda.id)
  const value: AuthState = {
    loading: loading || !periodoListo, session, tiendas, tienda, rol, periodo, esProveedor, tiendasProveedor,
    vocab: vocabDe(tienda?.ajustes),
    gr: gramatica(vocabDe(tienda?.ajustes), generosDe(tienda?.ajustes, vocabDe(tienda?.ajustes))),
    nombresRol: rolesDe(tienda?.ajustes),
    recargar: async () => { setVersion((v) => v + 1) },
    avisoInvitacion, cerrarAvisoInvitacion: () => setAvisoInvitacion(null),
    setTienda: (t) => { localStorage.setItem(LS_TIENDA, t.id); setTiendaState(t) },
    setTiendaPorId: (id) => { localStorage.setItem(LS_TIENDA, id); setTiendaState((prev) => (prev?.id === id ? prev : null)) },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    },
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      return error ? error.message : null
    },
    signOut: async () => {
      salidaManual.current = true
      setVerComoState(null); setCaducada(false)
      // Limpia lo recordado en este dispositivo que dependa de la persona
      try { localStorage.removeItem(LS_TIENDA); localStorage.setItem(LS_SALIDA, String(Date.now())) } catch { /* nada */ }
      await supabase.auth.signOut()
    },
    fase, caducada, cerrarCaducada: () => setCaducada(false),
    signInEnlace: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: sinAlmohadilla(), shouldCreateUser: true } })
      return error ? error.message : null
    },
    signInProveedor: async (p) => {
      const { error } = await supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo: sinAlmohadilla(), queryParams: { prompt: 'select_account' } } })
      return error ? error.message : null
    },
    recuperarPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      return error ? error.message : null
    },
    cambiarPassword: async (pw) => {
      const { error } = await supabase.auth.updateUser({ password: pw })
      return error ? error.message : null
    },
    recuperando, terminarRecuperacion: () => setRecuperando(false),
    verComo: rolReal === 'ADMIN' ? verComo : null,
    setVerComo: (r) => setVerComoState(r === 'ADMIN' ? null : r),
    rolReal,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = React.useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}

import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { setSoloLectura, supabase } from '@/lib/supabase'
import { setLocale, setZona } from '@/lib/utils'
import type { Miembro, Periodo, Rol, Tienda } from '@/lib/types'
import { contextoErrores } from '@/data/encargos'
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true)
  const [session, setSession] = React.useState<Session | null>(null)
  const [tiendas, setTiendas] = React.useState<Tienda[]>([])
  const [miembros, setMiembros] = React.useState<Miembro[]>([])
  const [tienda, setTiendaState] = React.useState<Tienda | null>(null)
  const [esProveedor, setEsProveedor] = React.useState(false)
  const [periodo, setPeriodo] = React.useState<Periodo | null>(null)
  const [version, setVersion] = React.useState(0)
  const [avisoInvitacion, setAvisoInvitacion] = React.useState<string | null>(null)
  const [fase, setFase] = React.useState('Comprobando tu sesión…')
  const [caducada, setCaducada] = React.useState(false)
  const [recuperando, setRecuperando] = React.useState(false)
  const [verComo, setVerComoState] = React.useState<Rol | null>(null)
  const salidaManual = React.useRef(false)
  const habiaSesion = React.useRef(false)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { habiaSesion.current = !!data.session; setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      // Cerrada sin pulsar «Salir»: caducó (o se revocó). Al volver a entrar se sigue en la misma pantalla.
      if (ev === 'SIGNED_OUT' && habiaSesion.current && !salidaManual.current) setCaducada(true)
      if (ev === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (ev === 'SIGNED_IN') { salidaManual.current = false; setCaducada(false) }
      habiaSesion.current = !!s
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  React.useEffect(() => {
    if (!session) { setTiendas([]); setMiembros([]); setTiendaState(null); setLoading(false); return }
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
        if (error) setAvisoInvitacion(error.message); else tiendaInvitada = data as string
      }
      await supabase.rpc('aceptar_invitaciones_pendientes')
      await supabase.rpc('unirse_por_dominio').then(() => {}, () => {}) // dominio aprobado por alguna tienda
      setFase('Cargando tus tiendas y permisos…')
      // Las RLS ya limitan a las tiendas del usuario (miembro o proveedor)
      const [{ data: ts }, { data: ms }, { data: pu }] = await Promise.all([
        supabase.from('tienda').select('id,nombre,ajustes').order('nombre'),
        supabase.from('miembro').select('*').eq('user_id', session.user.id).eq('activo', true),
        supabase.from('proveedor').select('id,tienda_id').limit(1),
      ])
      if (!alive) return
      const list = (ts ?? []) as Tienda[]
      setTiendas(list)
      setMiembros((ms ?? []) as Miembro[])
      setEsProveedor(!!pu && pu.length > 0 && (!ms || ms.length === 0))
      const saved = tiendaInvitada ?? localStorage.getItem(LS_TIENDA)
      setTiendaState((prev) => list.find((t) => t.id === (prev?.id ?? saved)) ?? list.find((t) => t.id === saved) ?? list[0] ?? null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [session, version])

  // Periodo activo (uno por tienda; si no hay, se trabaja sin filtro)
  React.useEffect(() => {
    if (!tienda) { setPeriodo(null); return }
    let alive = true
    supabase.from('periodo').select('id,nombre,ajustes').eq('tienda_id', tienda.id).eq('activo', true).maybeSingle()
      .then(({ data }) => { if (alive) setPeriodo((data as Periodo) ?? null) })
    return () => { alive = false }
  }, [tienda])

  // Acento y formato local por tienda
  React.useEffect(() => {
    setLocale((tienda?.ajustes?.locale as string | undefined) ?? 'es-ES')
    setZona(tienda?.ajustes?.zona_horaria as string | undefined)
    const c = (tienda?.ajustes?.color_primario as string | undefined) ?? '#333333'
    document.documentElement.style.setProperty('--accent', c)
  }, [tienda])

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
  const value: AuthState = {
    loading, session, tiendas, tienda, rol, periodo, esProveedor,
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
      try { localStorage.removeItem(LS_TIENDA) } catch { /* nada */ }
      await supabase.auth.signOut()
    },
    fase, caducada, cerrarCaducada: () => setCaducada(false),
    signInEnlace: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href, shouldCreateUser: true } })
      return error ? error.message : null
    },
    signInProveedor: async (p) => {
      const { error } = await supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo: window.location.href, queryParams: { prompt: 'select_account' } } })
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

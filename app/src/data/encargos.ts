import { supabase } from '@/lib/supabase'
import type { Comentario, EncargoEstado, Etapa, Hito, TipoHito } from '@/lib/types'

/** Encargos de la tienda. Por defecto, activos del periodo activo (si lo hay). */
export async function listarEncargos(
  tiendaId: string,
  opts: { periodoId?: string | null; estado?: 'ACTIVO' | 'ANULADO' } = {},
): Promise<EncargoEstado[]> {
  let q = supabase
    .from('v_encargo_estado')
    .select('*')
    .eq('tienda_id', tiendaId)
    .eq('estado', opts.estado ?? 'ACTIVO')
  if (opts.periodoId) q = q.eq('periodo_id', opts.periodoId)
  const { data, error } = await q.order('numero', { ascending: false })
  if (error) throw error
  return (data ?? []) as EncargoEstado[]
}

export interface Anulacion { encargo_id: string; fecha: string; motivo: string | null; recuperado_en: string | null }
export async function listarAnulaciones(encargoIds: string[]): Promise<Record<string, Anulacion>> {
  if (encargoIds.length === 0) return {}
  const { data, error } = await supabase.from('anulacion')
    .select('encargo_id,fecha,motivo,recuperado_en').in('encargo_id', encargoIds)
    .is('recuperado_en', null).order('fecha', { ascending: false })
  if (error) throw error
  const out: Record<string, Anulacion> = {}
  for (const a of (data ?? []) as Anulacion[]) if (!out[a.encargo_id]) out[a.encargo_id] = a
  return out
}

export async function obtenerEncargo(id: string): Promise<EncargoEstado | null> {
  const { data, error } = await supabase.from('v_encargo_estado').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as EncargoEstado | null
}

/** Etapas de la tienda en orden de flujo: por tipo de encargo (por nombre) y dentro, por su orden. */
export async function listarEtapas(tiendaId: string): Promise<Etapa[]> {
  const { data, error } = await supabase.from('etapa').select('*, tipo:tipo_encargo_id(nombre)').eq('tienda_id', tiendaId).order('orden')
  if (error) throw error
  type Fila = Etapa & { tipo: { nombre: string } | null }
  return ((data ?? []) as Fila[])
    .sort((a, b) => (a.tipo?.nombre ?? '').localeCompare(b.tipo?.nombre ?? '', 'es') || a.orden - b.orden)
    .map(({ tipo: _t, ...e }) => e as Etapa)
}

export async function listarHitos(encargoId: string): Promise<Hito[]> {
  const { data, error } = await supabase
    .from('hito')
    .select('*, etapa:etapa_id(clave,nombre,color,orden)')
    .eq('encargo_id', encargoId)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Hito[]
}

export async function listarComentarios(encargoId: string): Promise<Comentario[]> {
  const { data, error } = await supabase.from('comentario').select('*').eq('encargo_id', encargoId).order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as Comentario[]
}

export async function comentar(encargoId: string, texto: string) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('comentario').insert({ encargo_id: encargoId, texto, usuario_id: u.user?.id })
  if (error) throw error
}

/** Única vía para avanzar de etapa: valida rol y puertas en el servidor. */
export async function crearHito(encargoId: string, etapaClave: string, opts?: { tipo?: TipoHito; nota?: string; forzarBlandas?: boolean }) {
  const { data, error } = await supabase.rpc('crear_hito', {
    p_encargo: encargoId,
    p_etapa_clave: etapaClave,
    p_tipo: opts?.tipo ?? 'NORMAL',
    p_nota: opts?.nota ?? null,
    p_origen: 'APP',
    p_forzar_blandas: opts?.forzarBlandas ?? false,
  })
  if (error) throw error
  return data as string
}

export async function deshacerUltimoHito(encargoId: string) {
  const { error } = await supabase.rpc('deshacer_ultimo_hito', { p_encargo: encargoId })
  if (error) throw error
}

export async function marcarCheck(encargoId: string, clave: string, marcado: boolean) {
  const { error } = await supabase.rpc('marcar_check', { p_encargo: encargoId, p_clave: clave, p_marcado: marcado })
  if (error) throw error
}

/** Mensaje legible a partir del error de Postgres ("Bloqueado: …"). */
export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Revisa internet y vuelve a intentarlo.'
  if (/timeout|timed out|canceling statement/i.test(m)) return 'El servidor está tardando demasiado. Espera un momento y pulsa «Reintentar».'
  if (/JWT expired|invalid JWT|refresh token/i.test(m)) return 'Tu sesión ha caducado. Vuelve a entrar.'
  if (/Proveedor no válido o inactivo/i.test(m)) return 'Tu cuenta no está asociada a ningún proveedor activo de esta tienda. Pide a la tienda que te añada.'
  if (/duplicate key|unique constraint/i.test(m)) return 'Ya existe uno igual (mismo nombre o número).'
  return m.replace(/^.*?Bloqueado:\s*/, 'No se puede: ')
}

export async function resolverIncidencia(encargoId: string, nota?: string) {
  const { error } = await supabase.rpc('resolver_incidencia', { p_encargo: encargoId, p_nota: nota ?? null })
  if (error) throw error
}

export async function cambiarFechaHito(hitoId: string, fecha: Date) {
  const { error } = await supabase.rpc('cambiar_fecha_hito', { p_hito: hitoId, p_fecha: fecha.toISOString() })
  if (error) throw error
}

export async function anularEncargo(encargoId: string, motivo: string) {
  const { error } = await supabase.rpc('anular_encargo', { p_encargo: encargoId, p_motivo: motivo })
  if (error) throw error
}

export async function recuperarEncargo(encargoId: string, reiniciar: boolean) {
  const { error } = await supabase.rpc('recuperar_encargo', { p_encargo: encargoId, p_reiniciar: reiniciar })
  if (error) throw error
}

/** Asignar o quitar proveedor (vale para Logística, que no puede editar el resto). */
export async function asignarProveedor(encargoId: string, proveedorId: string | null) {
  const { error } = await supabase.rpc('asignar_proveedor', { p_encargo: encargoId, p_proveedor: proveedorId })
  if (error) throw error
}

export async function actualizarEncargo(id: string, patch: { producto_id?: string | null; datos?: Record<string, unknown>; importe?: number | null; a_cuenta?: number }) {
  const { error } = await supabase.from('encargo').update(patch).eq('id', id)
  if (error) throw error
}

export async function actualizarCliente(id: string, patch: { nombre?: string; telefono?: string | null; email?: string | null; datos?: Record<string, unknown> }) {
  const { error } = await supabase.from('cliente').update(patch).eq('id', id)
  if (error) throw error
}

export async function buscarClientes(tiendaId: string, q: string) {
  const { data, error } = await supabase.from('cliente')
    .select('id,nombre,telefono,email,datos')
    .eq('tienda_id', tiendaId)
    .or(`nombre.ilike.%${q.replace(/[%,()]/g, ' ')}%,telefono.ilike.%${q.replace(/[%,()]/g, ' ')}%`)
    .order('nombre').limit(8)
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; telefono: string | null; email: string | null; datos: Record<string, unknown> }[]
}

/** Nº previsto para un tipo de encargo (con su serie): «007», «S012». Orientativo: se fija al guardar. */
export async function siguienteNumero(tipoId: string, periodoId: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('siguiente_numero_tipo', { p_tipo: tipoId, p_periodo: periodoId })
  if (error) return null
  return data as string | null
}

export async function listarProveedores(tiendaId: string) {
  const { data, error } = await supabase.from('proveedor').select('id,nombre,activo').eq('tienda_id', tiendaId).order('nombre')
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; activo: boolean }[]
}

export async function listarProductos(tiendaId: string) {
  const { data, error } = await supabase.from('producto').select('id,nombre,activo').eq('tienda_id', tiendaId).order('nombre')
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; activo: boolean }[]
}

export async function marcarRevisar(encargoId: string, nota: string) {
  const { error } = await supabase.rpc('marcar_revisar', { p_encargo: encargoId, p_nota: nota })
  if (error) throw error
}
export async function quitarRevisar(encargoId: string) {
  const { error } = await supabase.rpc('quitar_revisar', { p_encargo: encargoId })
  if (error) throw error
}
export async function editarNotaHito(hitoId: string, nota: string) {
  const { error } = await supabase.rpc('editar_nota_hito', { p_hito: hitoId, p_nota: nota })
  if (error) throw error
}

/** Nota corta pegada a un campo del encargo (💬). */
export interface NotaCampo { encargo_id: string; campo: string; texto: string; usuario_id: string | null; actualizado_en: string }

export async function listarNotasCampo(encargoId: string): Promise<Record<string, NotaCampo>> {
  const { data, error } = await supabase.from('nota_campo').select('*').eq('encargo_id', encargoId)
  if (error) throw error
  return Object.fromEntries(((data ?? []) as NotaCampo[]).map((n) => [n.campo, n]))
}

/** Texto vacío = borrar la nota. */
export async function ponerNotaCampo(encargoId: string, campo: string, texto: string) {
  const { error } = await supabase.rpc('poner_nota_campo', { p_encargo: encargoId, p_campo: campo, p_texto: texto })
  if (error) throw error
}

/** Qué habrá que hacer a mano si se anula (proveedor, dinero, avisos). Solo lectura. */
export interface ImpactoAnular { proveedor: string | null; en_proveedor: boolean; importe: number | null; a_cuenta: number; n_mensajes: number; n_adjuntos: number; n_hitos: number }
export async function impactoAnular(encargoId: string): Promise<ImpactoAnular> {
  const { data, error } = await supabase.rpc('impacto_anular', { p_encargo: encargoId })
  if (error) throw error
  return data as ImpactoAnular
}

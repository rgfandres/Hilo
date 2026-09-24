import { supabase } from '@/lib/supabase'
import type { Etapa, Rol } from '@/lib/types'
import type { Campo, PlantillaCampos } from '@/data/config'

function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error
  return r.data
}

/** Clave estable a partir de un nombre: "Tejido elegido" → "TEJIDO_ELEGIDO" (o minúsculas para campos). */
export function claveDe(nombre: string, minusculas = false): string {
  const s = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'X'
  return minusculas ? s.toLowerCase() : s.toUpperCase()
}
export function claveUnica(base: string, usadas: string[]): string {
  let c = base, i = 2
  while (usadas.includes(c)) c = `${base}_${i++}`
  return c
}

// ---------- Tienda
/** Un update que no toca ninguna fila (sin permiso, o ya no existe) es un error, no «Guardado» */
function okFila(r: { data: unknown[] | null; error: unknown }) {
  if (r.error) throw r.error
  if (!r.data?.length) throw new Error('permission denied: no se ha guardado nada (puede que ya no tengas permiso o que se haya borrado)')
}

export async function guardarTienda(id: string, nombre: string, ajustes: Record<string, unknown>) {
  okFila(await supabase.from('tienda').update({ nombre, ajustes }).eq('id', id).select('id'))
}

// ---------- Equipo
export interface MiembroEquipo { tienda_id: string; user_id: string; email: string; rol: Rol; activo: boolean; creado_en: string; soy_yo: boolean }
export interface Invitacion { id: string; email: string | null; rol: Rol; token: string; creado_en: string; caduca_en: string; aceptada_en: string | null; revocada_en: string | null }

export async function listarEquipo(tiendaId: string) {
  return ok(await supabase.from('v_equipo').select('*').eq('tienda_id', tiendaId).order('creado_en')) as MiembroEquipo[]
}
export async function cambiarRol(tiendaId: string, userId: string, rol: Rol) {
  okFila(await supabase.from('miembro').update({ rol }).eq('tienda_id', tiendaId).eq('user_id', userId).select('id'))
}
export async function activarMiembro(tiendaId: string, userId: string, activo: boolean) {
  okFila(await supabase.from('miembro').update({ activo }).eq('tienda_id', tiendaId).eq('user_id', userId).select('id'))
}
export async function quitarMiembro(tiendaId: string, userId: string) {
  ok(await supabase.from('miembro').delete().eq('tienda_id', tiendaId).eq('user_id', userId))
}
export async function listarInvitaciones(tiendaId: string) {
  return ok(await supabase.from('invitacion').select('*').eq('tienda_id', tiendaId)
    .is('aceptada_en', null).is('revocada_en', null).gt('caduca_en', new Date().toISOString()).order('creado_en', { ascending: false })) as Invitacion[]
}
export async function crearInvitacion(tiendaId: string, rol: Rol, email: string | null) {
  return ok(await supabase.from('invitacion').insert({ tienda_id: tiendaId, rol, email: email?.trim().toLowerCase() || null })
    .select('*').single()) as Invitacion
}
export async function revocarInvitacion(id: string) {
  okFila(await supabase.from('invitacion').update({ revocada_en: new Date().toISOString() }).eq('id', id).select('id'))
}
export const enlaceInvitacion = (token: string) => `${window.location.origin}/invitacion/${token}`

// ---------- Proveedores y su acceso
export interface ProveedorConAcceso { id: string; nombre: string; activo: boolean; notas: string | null; emails: string[] }
export async function listarProveedoresAcceso(tiendaId: string): Promise<ProveedorConAcceso[]> {
  const ps = ok(await supabase.from('proveedor').select('id,nombre,activo,notas, proveedor_usuario(email)')
    .eq('tienda_id', tiendaId).order('nombre')) as unknown as (Omit<ProveedorConAcceso, 'emails'> & { proveedor_usuario: { email: string }[] })[]
  return ps.map(({ proveedor_usuario, ...p }) => ({ ...p, emails: proveedor_usuario.map((u) => u.email).sort() }))
}
export async function crearProveedor(tiendaId: string, nombre: string) {
  ok(await supabase.from('proveedor').insert({ tienda_id: tiendaId, nombre: nombre.trim() }))
}
export async function actualizarProveedor(id: string, patch: { nombre?: string; activo?: boolean; notas?: string | null }) {
  okFila(await supabase.from('proveedor').update(patch).eq('id', id).select('id'))
}
export async function anadirCorreoProveedor(proveedorId: string, email: string) {
  ok(await supabase.from('proveedor_usuario').insert({ proveedor_id: proveedorId, email: email.trim().toLowerCase() }))
}
export async function quitarCorreoProveedor(proveedorId: string, email: string) {
  ok(await supabase.from('proveedor_usuario').delete().eq('proveedor_id', proveedorId).eq('email', email))
}

// ---------- Flujos
export interface TipoEncargo { id: string; clave: string; nombre: string; activo: boolean; serie: string }
export interface PuertaDef { id: string; etapa_destino_id: string; tipo: 'HITO_PREVIO' | 'CAMPO_NO_VACIO' | 'CHECK' | 'MATERIAL'; referencia: string; mensaje: string; dura: boolean; etiqueta: string | null }

export async function listarTipos(tiendaId: string) {
  return ok(await supabase.from('tipo_encargo').select('id,clave,nombre,activo,serie').eq('tienda_id', tiendaId).order('nombre')) as TipoEncargo[]
}
export async function crearTipo(tiendaId: string, nombre: string, usadas: string[]) {
  // Nace sin poder elegirse: primero necesita sus etapas y una final
  return ok(await supabase.from('tipo_encargo').insert({ tienda_id: tiendaId, nombre: nombre.trim(), clave: claveUnica(claveDe(nombre), usadas), activo: false })
    .select('id,clave,nombre,activo,serie').single()) as TipoEncargo
}
export async function marcarFinal(etapaId: string, final: boolean) {
  ok(await supabase.rpc('marcar_final', { p_etapa: etapaId, p_final: final }))
}
export async function actualizarTipo(id: string, patch: { nombre?: string; activo?: boolean; serie?: string }) {
  okFila(await supabase.from('tipo_encargo').update(patch).eq('id', id).select('id'))
}
export async function listarEtapasDe(tipoId: string) {
  return ok(await supabase.from('etapa').select('*').eq('tipo_encargo_id', tipoId).order('orden')) as Etapa[]
}
export async function crearEtapa(tiendaId: string, tipoId: string, nombre: string, existentes: Etapa[]) {
  const orden = (existentes.reduce((m, e) => Math.max(m, e.orden), 0) || 0) + 10
  ok(await supabase.from('etapa').insert({
    tienda_id: tiendaId, tipo_encargo_id: tipoId, nombre: nombre.trim(), orden,
    clave: claveUnica(claveDe(nombre), existentes.map((e) => e.clave)),
  }))
}
export async function actualizarEtapa(id: string, patch: Partial<Pick<Etapa, 'nombre' | 'color' | 'rol_ejecuta' | 'visible_para_proveedor' | 'marca_proveedor' | 'es_final' | 'es_espera' | 'grupo' | 'es_produccion'>>) {
  okFila(await supabase.from('etapa').update(patch).eq('id', id).select('id'))
}
export async function reordenarEtapas(tipoId: string, ids: string[]) {
  ok(await supabase.rpc('reordenar_etapas', { p_tipo: tipoId, p_ids: ids }))
}
export async function borrarEtapa(id: string) {
  ok(await supabase.rpc('borrar_etapa', { p_etapa: id }))
}
export async function listarPuertas(etapaIds: string[]) {
  if (etapaIds.length === 0) return [] as PuertaDef[]
  // Orden estable (por fecha de creación): la lista no «salta» al guardar
  return ok(await supabase.from('puerta').select('id,etapa_destino_id,tipo,referencia,mensaje,dura,etiqueta').in('etapa_destino_id', etapaIds)
    .order('creado_en').order('id')) as PuertaDef[]
}
export async function crearPuerta(tiendaId: string, p: Omit<PuertaDef, 'id'>) {
  ok(await supabase.from('puerta').insert({ tienda_id: tiendaId, ...p }))
}
export async function actualizarPuerta(id: string, patch: Partial<Omit<PuertaDef, 'id' | 'etapa_destino_id'>>) {
  okFila(await supabase.from('puerta').update(patch).eq('id', id).select('id'))
}
export async function borrarPuerta(id: string) {
  ok(await supabase.from('puerta').delete().eq('id', id))
}

// ---------- Campos
/** Guarda la lista completa de campos de una entidad (y tipo de encargo, o null = todos). */
export async function guardarCampos(tiendaId: string, entidad: PlantillaCampos['entidad'], tipoId: string | null, campos: Campo[]) {
  let q = supabase.from('plantilla_campos').select('id').eq('tienda_id', tiendaId).eq('entidad', entidad)
  q = tipoId ? q.eq('tipo_encargo_id', tipoId) : q.is('tipo_encargo_id', null)
  const existe = ok(await q.maybeSingle()) as { id: string } | null
  const limpios = campos.map((c, i) => ({ ...c, orden: i + 1 }))
  if (existe) okFila(await supabase.from('plantilla_campos').update({ campos: limpios }).eq('id', existe.id).select('id'))
  else ok(await supabase.from('plantilla_campos').insert({ tienda_id: tiendaId, entidad, tipo_encargo_id: tipoId, campos: limpios }))
}

// ---------- Periodos
export interface PeriodoFila { id: string; nombre: string; activo: boolean; archivado: boolean; fecha_inicio: string | null; fecha_fin: string | null; ajustes?: Record<string, unknown> }
export async function listarPeriodos(tiendaId: string) {
  return ok(await supabase.from('periodo').select('id,nombre,activo,archivado,fecha_inicio,fecha_fin,ajustes').eq('tienda_id', tiendaId).order('nombre', { ascending: false })) as PeriodoFila[]
}
/** Cambia una clave de los ajustes propios del periodo (null = quitar y usar lo de la tienda) */
export async function ponerAjustePeriodo(id: string, clave: string, valor: unknown) {
  const actual = ok(await supabase.from('periodo').select('ajustes').eq('id', id).single()) as { ajustes: Record<string, unknown> | null }
  const aj = { ...(actual.ajustes ?? {}) }
  if (valor == null) delete aj[clave]; else aj[clave] = valor
  okFila(await supabase.from('periodo').update({ ajustes: aj }).eq('id', id).select('id'))
}
export async function crearPeriodo(tiendaId: string, nombre: string, inicio: string | null, fin: string | null) {
  ok(await supabase.from('periodo').insert({ tienda_id: tiendaId, nombre: nombre.trim(), fecha_inicio: inicio || null, fecha_fin: fin || null }))
}
export async function actualizarPeriodo(id: string, patch: { nombre?: string; fecha_inicio?: string | null; fecha_fin?: string | null }) {
  okFila(await supabase.from('periodo').update(patch).eq('id', id).select('id'))
}
export async function activarPeriodo(id: string) {
  ok(await supabase.rpc('activar_periodo', { p_periodo: id }))
}

// ---------- Invitación (pantalla pública)
export async function verInvitacion(token: string) {
  const d = ok(await supabase.rpc('ver_invitacion', { p_token: token })) as { tienda: string; rol: Rol; email: string | null; valida: boolean; tienda_id?: string; roles?: Record<string, string> }[]
  return d?.[0] ?? null
}
export async function aceptarInvitacion(token: string) {
  return ok(await supabase.rpc('aceptar_invitacion', { p_token: token })) as string
}
export async function archivarPeriodo(id: string, archivar: boolean) {
  ok(await supabase.rpc('archivar_periodo', { p_periodo: id, p_archivar: archivar }))
}

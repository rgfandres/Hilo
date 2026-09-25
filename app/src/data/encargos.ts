import { plano } from '@/lib/texto'
import { min, rolesDe, vocabDe, type Vocab } from '@/lib/vocab'
import { supabase } from '@/lib/supabase'
import { num3 } from '@/lib/utils'
import type { Comentario, EncargoEstado, Etapa, Hito, TipoHito } from '@/lib/types'

/**
 * Encargos de la tienda. Con periodo: los de ese periodo y, además, todo lo que sigue abierto
 * de periodos anteriores (lo abierto se ve siempre; el periodo solo filtra lo terminado).
 */
/** Ajuste de la tienda: ver solo lo del periodo activo (también lo abierto de otros periodos queda oculto) */
let soloPeriodoActivo = false
export function fijarSoloPeriodoActivo(v: boolean) { soloPeriodoActivo = v }
export function esSoloPeriodoActivo() { return soloPeriodoActivo }

export async function listarEncargos(
  tiendaId: string,
  opts: { periodoId?: string | null; estado?: 'ACTIVO' | 'ANULADO' } = {},
): Promise<EncargoEstado[]> {
  const consulta = () => {
    let q = supabase
      .from('v_encargo_estado')
      .select('*')
      .eq('tienda_id', tiendaId)
      .eq('estado', opts.estado ?? 'ACTIVO')
    // Lo abierto se ve siempre; lo terminado y lo anulado, solo el de su periodo (o si no tiene ninguno)
    // Con «solo la temporada activa», lo que no tiene temporada también se ve (si no, desaparecería de todas partes)
    if (opts.periodoId) q = (opts.estado ?? 'ACTIVO') === 'ANULADO' ? q.or(`periodo_id.eq.${opts.periodoId},periodo_id.is.null`)
      : soloPeriodoActivo ? q.or(`periodo_id.eq.${opts.periodoId},periodo_id.is.null`)
      : q.or(`periodo_id.eq.${opts.periodoId},periodo_id.is.null,es_final.is.null,es_final.eq.false`)
    return q.order('numero', { ascending: false }).order('id')
  }
  // El servidor devuelve como mucho 1000 filas por vez: se piden por páginas hasta tenerlas todas
  const PAG = 1000
  const out: EncargoEstado[] = []
  for (let desde = 0; ; desde += PAG) {
    const { data, error } = await consulta().range(desde, desde + PAG - 1)
    if (error) throw error
    out.push(...((data ?? []) as EncargoEstado[]))
    if (!data || data.length < PAG) break
  }
  return out
}

export interface Anulacion { encargo_id: string; fecha: string; motivo: string | null; recuperado_en: string | null
  /** Qué se hizo con el material: true volvió al stock, false se dio por usado (queda para reaprovechar), null no había */
  material_devuelto?: boolean | null }
export async function listarAnulaciones(encargoIds: string[]): Promise<Record<string, Anulacion>> {
  if (encargoIds.length === 0) return {}
  const { data, error } = await supabase.from('anulacion')
    .select('encargo_id,fecha,motivo,recuperado_en,material_devuelto').in('encargo_id', encargoIds)
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

/** Deshace el paso indicado (si ya no es el último, el servidor lo rechaza: no se borra el de otro) */
export async function deshacerUltimoHito(encargoId: string, hitoId?: string | null) {
  const { error } = await supabase.rpc('deshacer_ultimo_hito', { p_encargo: encargoId, p_hito: hitoId ?? null })
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
  if (/El rol \w+ no puede marcar la etapa/.test(m)) return 'Tu rol no puede marcar esa etapa. Lo marca otra persona del equipo.'
  if (/timeout|timed out|canceling statement/i.test(m)) return 'El servidor tarda demasiado en responder. Comprueba la conexión y pulsa «Reintentar» o recarga la página.'
  if (/JWT expired|invalid JWT|refresh token/i.test(m)) return 'Tu sesión ha caducado. Vuelve a entrar.'
  if (/Proveedor no válido o inactivo/i.test(m)) return 'Ese proveedor no es válido o está desactivado. (Si eres tú el proveedor: pide a la tienda que te active.)'
  if (/YA_EN_CAMINO/.test(m)) return 'Ya ha pasado del paso que pide el material: para devolverlo, vuelve a un paso anterior desde «Pasos» (allí se pregunta si vuelve al stock).'
  if (/SIN_CANTIDAD/.test(m)) return 'Pon antes la cantidad: sin cantidad no se puede dar por recibido.'
  const sinStock = m.match(/SIN_STOCK:([\d.]+):([\d.]+)/)
  if (sinStock) return `No hay suficiente en stock (hay ${Number(sinStock[1]).toLocaleString('es-ES')} y hacen falta ${Number(sinStock[2]).toLocaleString('es-ES')}). Si ha llegado por otra vía, apúntalo con «Ha llegado por otra vía…»; si el stock está mal, corrígelo en el catálogo.`
  if (/ELEGIR_MATERIAL/.test(m)) return 'Elige qué pasa con el material ya recibido (vuelve al stock o se da por usado).'
  const prod = m.match(/SALTO_PRODUCCION:(.*)$/)
  if (prod) return `No se puede saltar «${prod[1]}»: hay que marcarlo (crea la orden de producción).`
  if (/duplicate key|unique constraint/i.test(m)) return 'Ya existe uno igual (mismo nombre o número).'
  if (/NO_REVERTIR_STOCK/.test(m)) return 'No se puede revertir: parte de lo recibido ya se ha usado y el stock quedaría en negativo. Corrige el stock a mano si hace falta.'
  if (/PRIMERA_ETAPA/.test(m)) return 'En la primera etapa las condiciones solo pueden avisar: si bloquearan, no se podría crear ninguno.'
  if (/SIN_ETAPAS/.test(m)) return 'Este tipo todavía no tiene etapas. Créalas en Ajustes → Tipos y etapas.'
  if (/PASO_ATRAS/.test(m)) return 'Ese paso ya está hecho o es anterior al actual. Recarga para ver el estado real.'
  if (/VOLVER_ADELANTE/.test(m)) return 'Solo se puede volver a una etapa anterior a la actual.'
  if (/INCIDENCIA_ABIERTA/.test(m)) return 'Hay una incidencia abierta: resuélvela antes de avanzar.'
  if (/YA_NO_ES_ULTIMO/.test(m)) return 'Ya no se puede deshacer: alguien ha hecho otro paso después.'
  if (/NO_DESHACER_ALTA/.test(m)) return 'El primer paso no se puede deshacer. Si sobra, anúlalo.'
  if (/SIN_PERMISO_IMPORTAR/.test(m)) return 'Solo administración puede importar o deshacer importaciones.'
  if (/IMPORT_EN_USO/.test(m)) return 'No se puede deshacer: algo de lo importado ya se está usando (por ejemplo, un cliente con encargos). Corrígelo a mano.'
  if (/IMPORT_YA_DESHECHA/.test(m)) return 'Esa importación ya estaba deshecha.'
  if (/IMPORT_DEMASIADAS/.test(m)) return 'Demasiadas filas: el máximo son 2000 por archivo.'
  if (/IMPORT_VACIO/.test(m)) return 'El archivo no tiene filas.'
  if (/IMPORT_SIN_MODULO/.test(m)) return 'Activa antes el módulo de materiales.'
  if (/IMPORT_FORMATO/.test(m)) return 'El archivo no tiene el formato de la plantilla.'
  if (/SIN_PERMISO_DESHACER/.test(m)) return 'Solo puedes deshacer tus propios pasos de los últimos minutos. Quien administra la tienda puede deshacer cualquiera.'
  if (/TIPO_SIN_FINAL/.test(m)) return 'El tipo necesita una etapa final para poder usarse. Marca antes otra como final o deja el tipo sin elegir.'
  if (/MIEMBRO_DESACTIVADO/.test(m)) return 'Tu acceso a esta tienda está desactivado. Pide a quien administra la tienda que te active.'
  const dom = m.match(/DOMINIO_(PUBLICO|AJENO):(.*)$/)
  if (dom) return dom[1] === 'PUBLICO' ? `«${dom[2]}» es un correo gratuito: entraría cualquiera. Usa el dominio propio de la tienda.` : `Solo puedes aprobar el dominio de tu propio correo (no «${dom[2]}»).`
  if (/OTRA_TIENDA/.test(m)) return 'Ese dato no es de esta tienda.'
  const salto = m.match(/SALTO_ETAPAS:(.*)$/)
  if (salto) return `Se saltaría «${salto[1].split(', ').join('», «')}». Solo quien administra la tienda puede saltar etapas.`
  const rol = m.match(/ROL_NO_MARCA:[^:]*:(.*)$/)
  if (rol) return `Tu rol no puede marcar «${rol[1]}». Lo marca otra persona del equipo.`
  if (/Etapa .* no existe para este tipo/.test(m)) return 'Esa etapa ya no existe en el flujo. Recarga la página.'
  return traducirServidor(m.replace(/^.*?Bloqueado:\s*/, 'No se puede: '))
}

// Contexto de la tienda para traducir los textos del servidor (vocabulario y nombres de rol)
let ctxErr: { vocab: Vocab; roles: Record<string, string> } = { vocab: vocabDe(null), roles: rolesDe(null) }
export function contextoErrores(ajustes: Record<string, unknown> | null | undefined) {
  ctxErr = { vocab: vocabDe(ajustes), roles: rolesDe(ajustes) }
}
/** Cambia códigos de rol y palabras fijas (encargo, cliente, proveedor) por las de la tienda */
function traducirServidor(m: string): string {
  const { vocab, roles } = ctxErr
  const conMay = (orig: string, nuevo: string) => orig[0] === orig[0].toUpperCase() ? nuevo.charAt(0).toUpperCase() + nuevo.slice(1) : min(nuevo)
  let r = m.replace(/Solo ADMIN\b/g, 'Solo administración')
  r = r.replace(/\b(ADMIN|OPERATIVO|ATENCION|LOGISTICA)\b/g, (k) => `«${roles[k as keyof typeof roles] ?? k}»`)
  r = r.replace(/encargo\(s\)/g, min(vocab.encargos))
  r = r.replace(/\b([Ee]ncargos|[Ee]ncargo|[Cc]lientes|[Cc]liente|[Pp]roveedores|[Pp]roveedor)\b/g, (w) => {
    const base = w.toLowerCase()
    const v = base === 'encargos' ? vocab.encargos : base === 'encargo' ? vocab.encargo
      : base === 'clientes' ? vocab.clientes : base === 'cliente' ? vocab.cliente : base === 'proveedores' ? vocab.proveedores : vocab.proveedor
    return conMay(w, v)
  })
  return r
}

export async function resolverIncidencia(encargoId: string, nota?: string) {
  const { error } = await supabase.rpc('resolver_incidencia', { p_encargo: encargoId, p_nota: nota ?? null })
  if (error) throw error
}

export async function cambiarFechaCheck(encargoId: string, clave: string, fecha: Date) {
  const { error } = await supabase.rpc('cambiar_fecha_check', { p_encargo: encargoId, p_clave: clave, p_fecha: fecha.toISOString() })
  if (error) throw error
}
export async function cambiarFechaHito(hitoId: string, fecha: Date) {
  const { error } = await supabase.rpc('cambiar_fecha_hito', { p_hito: hitoId, p_fecha: fecha.toISOString() })
  if (error) throw error
}

/** devolverMaterial: null = no hay material asignado; true = vuelve al stock; false = se da por usado */
export async function anularEncargo(encargoId: string, motivo: string, devolverMaterial: boolean | null = null) {
  const { error } = await supabase.rpc('anular_encargo', { p_encargo: encargoId, p_motivo: motivo, p_devolver_material: devolverMaterial })
  if (error) throw error
}

/** Volver a una etapa anterior, todo junto en el servidor: material (si se pide) y paso atrás. */
export async function volverAEtapa(encargoId: string, etapaClave: string, devolverMaterial: boolean, nota?: string) {
  const { data, error } = await supabase.rpc('volver_a_etapa', { p_encargo: encargoId, p_etapa_clave: etapaClave, p_devolver: devolverMaterial, p_nota: nota ?? null })
  if (error) throw error
  return data as string
}

/** Qué se hizo con el material al anular (true: volvió al stock; false: se dio por usado; null: no había) */
export async function materialAlAnular(encargoId: string): Promise<boolean | null> {
  const { data } = await supabase.from('anulacion').select('material_devuelto').eq('encargo_id', encargoId).is('recuperado_en', null).order('fecha', { ascending: false }).limit(1)
  return ((data ?? [])[0] as { material_devuelto: boolean | null } | undefined)?.material_devuelto ?? null
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

export async function actualizarEncargo(id: string, patch: { producto_id?: string | null; datos?: Record<string, unknown>; importe?: number | null; a_cuenta?: number; complementos?: string | null }) {
  const { error } = await supabase.from('encargo').update(patch).eq('id', id)
  if (error) throw error
}

/** Diferencia entre dos juegos de datos: lo que se pone y lo que se quita (vaciado) */
export function difDatos(antes: Record<string, string>, ahora: Record<string, string>): { set: Record<string, string>; quitar: string[] } {
  const set: Record<string, string> = {}; const quitar: string[] = []
  for (const k of new Set([...Object.keys(antes), ...Object.keys(ahora)])) {
    const a = antes[k] ?? '', b = ahora[k] ?? ''
    if (a === b) continue
    if (b === '') quitar.push(k); else set[k] = b
  }
  return { set, quitar }
}
/** Guarda solo las claves cambiadas: se fusionan en el servidor con lo que haya (no pisa lo que cambió otra persona) */
export async function cambiarDatos(tabla: 'encargo' | 'cliente', id: string, d: { set: Record<string, string>; quitar: string[] }) {
  if (!Object.keys(d.set).length && !d.quitar.length) return
  const { error } = tabla === 'encargo'
    ? await supabase.rpc('cambiar_datos_encargo', { p_encargo: id, p_set: d.set, p_quitar: d.quitar })
    : await supabase.rpc('cambiar_datos_cliente', { p_cliente: id, p_set: d.set, p_quitar: d.quitar })
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
    .or(filtroCliente(q))
    .order('nombre').limit(8)
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; telefono: string | null; email: string | null; datos: Record<string, unknown> }[]
}

/**
 * Con una ficha por encargo: fichas para copiar, la más reciente primero y sin repetir la misma persona,
 * con un resumen de su último encargo (Nº · producto · valor del campo · periodo).
 */
export async function buscarFichas(tiendaId: string, q: string, claveResumen?: string) {
  const { data, error } = await supabase.from('cliente')
    .select('id,nombre,telefono,email,datos,nombre_plano,telefono_digitos')
    .eq('tienda_id', tiendaId).or(filtroCliente(q))
    .order('creado_en', { ascending: false }).limit(40)
  if (error) throw error
  const vistos = new Set<string>()
  const cs = (data ?? []).filter((c) => {
    const k = `${c.nombre_plano ?? c.nombre.toLowerCase()}|${c.telefono_digitos ?? ''}`
    if (vistos.has(k)) return false
    vistos.add(k); return true
  }).slice(0, 8)
  const resumen: Record<string, string> = {}
  if (cs.length) {
    const { data: es } = await supabase.from('v_encargo_estado').select('cliente_id,numero,serie,producto_nombre,datos,periodo_id,creado_en')
      .in('cliente_id', cs.map((c) => c.id)).order('creado_en', { ascending: false })
    const pids = [...new Set((es ?? []).map((e) => e.periodo_id).filter(Boolean))] as string[]
    const { data: ps } = pids.length ? await supabase.from('periodo').select('id,nombre').in('id', pids) : { data: [] }
    const pn = Object.fromEntries((ps ?? []).map((p) => [p.id, p.nombre]))
    for (const e of es ?? []) {
      if (resumen[e.cliente_id]) continue
      const t = claveResumen ? (e.datos as Record<string, unknown> | null)?.[claveResumen] : null
      resumen[e.cliente_id] = [num3(e as { numero: number; serie: string }), e.producto_nombre, t ? String(t) : null, e.periodo_id ? pn[e.periodo_id] : null].filter(Boolean).join(' · ')
    }
  }
  return cs.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email, datos: c.datos as Record<string, unknown>, resumen: resumen[c.id] ?? '' }))
}

/** Nº previsto para un tipo de encargo (con su serie): «007», «S012». Orientativo: se fija al guardar. */
export async function siguienteNumero(tipoId: string, periodoId: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('siguiente_numero_tipo', { p_tipo: tipoId, p_periodo: periodoId })
  if (error) return null
  return data as string | null
}

export async function listarProveedores(tiendaId: string) {
  const { data, error } = await supabase.from('proveedor').select('id,nombre,activo,asignable').eq('tienda_id', tiendaId).neq('tipo', 'MATERIAL').order('nombre')
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; activo: boolean; asignable: boolean }[]
}

export async function listarProductos(tiendaId: string) {
  const { data, error } = await supabase.from('producto').select('id,nombre,activo,precio_base').eq('tienda_id', tiendaId).order('nombre')
  if (error) throw error
  return (data ?? []) as { id: string; nombre: string; activo: boolean; precio_base?: number | null }[]
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
export interface ImpactoAnular { proveedor: string | null; en_proveedor: boolean; importe: number | null; a_cuenta: number; n_mensajes: number; n_adjuntos: number; n_hitos: number
  material_recibido?: { material: string; cantidad: number; unidad?: string }[]; material_pedido?: number
  restos?: { material: string; cantidad: number; unidad?: string }[]; orden_impresa?: boolean }
export async function impactoAnular(encargoId: string): Promise<ImpactoAnular> {
  const { data, error } = await supabase.rpc('impacto_anular', { p_encargo: encargoId })
  if (error) throw error
  return data as ImpactoAnular
}

/** Búsqueda de clientes: nombre sin tildes y teléfono solo por dígitos (con o sin espacios) */
export function filtroCliente(q: string, conEmail = false) {
  const t = q.trim().replace(/[%,()]/g, ' ')
  const dig = t.replace(/\D/g, '')
  return [`nombre_plano.ilike.%${plano(t)}%`, dig.length >= 3 ? `telefono_digitos.ilike.%${dig}%` : null, conEmail ? `email.ilike.%${t}%` : null].filter(Boolean).join(',')
}

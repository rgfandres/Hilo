import type { EncargoEstado, Rol } from '@/lib/types'
import { generosDe, vocabDe } from '@/lib/vocab'

/**
 * Reglas de bandeja compartidas por la lista, el panel y los contadores del menú.
 * Un único cálculo por encargo: cada criterio es una función pura sobre la fila.
 */

export const bloqueado = (e: EncargoEstado) => (e.puertas_pendientes ?? []).some((p) => p.dura) || !!e.revisar_manual
export const activo = (e: EncargoEstado) => e.estado === 'ACTIVO' && !e.es_final

/**
 * ¿Un paso de este papel lo marca también este otro papel sin más? Cada uno marca lo suyo;
 * administración y operativo, además, lo de dentro de la tienda. Lo que hace logística (fuera de la
 * tienda) solo lo marca logística: los demás pueden hacerlo desde la ficha, pero confirmando.
 */
export const marcaDirecto = (rol: Rol | null, etapaRol: string | null | undefined) =>
  !!rol && (rol === etapaRol || ((rol === 'ADMIN' || rol === 'OPERATIVO') && etapaRol !== 'LOGISTICA'))

/** ¿Este rol puede marcar el siguiente paso desde las listas? */
export const puedeMarcar = (e: EncargoEstado, rol: Rol | null) => marcaDirecto(rol, e.etapa_siguiente_rol)

/** Motivo por el que está en «Revisar» (vacío = no lo está). */
export function motivosRevision(e: EncargoEstado, ajustes: Record<string, unknown>): string[] {
  const m: string[] = []
  if (e.en_revision) m.push('Incidencia abierta')
  const o = generosDe(ajustes, vocabDe(ajustes)).encargo === 'f' ? 'a' : 'o'
  if (e.revisar_manual) m.push(`Marcad${o} a mano` + (e.revisar_nota ? `: ${e.revisar_nota}` : ''))
  if (e.estancado) m.push(ajustes.estancado_por === 'pasos'
    ? `${e.dias_en_etapa} días sin marcar ningún paso (más de ${Number(ajustes.dias_estancado ?? 10)})`
    : `Sin cambios desde hace más de ${Number(ajustes.dias_estancado ?? 10)} días`)
  if (e.atascado) m.push(`${e.dias_en_etapa} días en «${e.etapa_actual_nombre}» (más de ${Number(ajustes.dias_atasco_proveedor ?? 15)})`)
  return m
}
export const enRevisar = (e: EncargoEstado) =>
  e.estado === 'ACTIVO' && (e.en_revision || e.revisar_manual || e.estancado || e.atascado)

/** Siguiente paso de mi rol (sin contar los bloqueados por una condición dura). */
export const miTrabajo = (e: EncargoEstado, rol: Rol | null) =>
  activo(e) && !!e.etapa_siguiente_id && e.etapa_siguiente_rol === rol && !bloqueado(e) && !e.en_revision

/** Listo para avanzar ahora mismo por quien mira (sin condiciones pendientes). */
export const listoParaMi = (e: EncargoEstado, rol: Rol | null) =>
  activo(e) && !!e.etapa_siguiente_id && puedeMarcar(e, rol) && (e.puertas_pendientes ?? []).length === 0 && !e.en_revision

export const listoParaEntregar = (e: EncargoEstado) => activo(e) && e.siguiente_es_final
export const enProveedor = (e: EncargoEstado) => activo(e) && e.en_proveedor

/** Pendientes para el contador del menú: mi trabajo + lo que hay que revisar (si puedo actuar). */
export function pendientesDe(rows: EncargoEstado[], rol: Rol | null): number {
  const revisa = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'
  return rows.filter((e) => miTrabajo(e, rol) || (revisa && enRevisar(e))).length
}

export const tope99 = (n: number) => (n > 99 ? '99+' : String(n))

import * as React from 'react'

/**
 * Estado de la conexión con el servidor: combina lo que dice el navegador (online/offline)
 * con el resultado real de las últimas peticiones (si fallan por red, «sin conexión»).
 */
type Estado = 'conectado' | 'sin-conexion'
let estado: Estado = typeof navigator !== 'undefined' && navigator.onLine === false ? 'sin-conexion' : 'conectado'
const oyentes = new Set<(e: Estado) => void>()
export function marcarConexion(e: Estado) {
  if (e === estado) return
  estado = e
  oyentes.forEach((f) => f(e))
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => marcarConexion('conectado'))
  window.addEventListener('offline', () => marcarConexion('sin-conexion'))
}
export function useConexion(): Estado {
  const [e, setE] = React.useState(estado)
  React.useEffect(() => { oyentes.add(setE); return () => { oyentes.delete(setE) } }, [])
  return e
}

/** Peticiones con tiempo máximo (45 s): si el servidor no responde, error claro en vez de esperar sin fin. */
export const ESPERA_MAXIMA_MS = 45000
export function fetchConEspera(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // Las subidas de archivos pueden tardar más: sin límite
  const sinLimite = /\/storage\/v1\/object/.test(url) && (init?.method ?? 'GET') !== 'GET'
  const ctrl = new AbortController()
  const t = sinLimite ? null : setTimeout(() => ctrl.abort(new DOMException('tiempo de espera agotado', 'TimeoutError')), ESPERA_MAXIMA_MS)
  if (init?.signal) init.signal.addEventListener('abort', () => ctrl.abort(init.signal!.reason))
  return fetch(input, { ...init, signal: ctrl.signal })
    .then((r) => { marcarConexion('conectado'); return r })
    .catch((e) => {
      if ((e as Error)?.name === 'TimeoutError' || ctrl.signal.reason?.name === 'TimeoutError') throw new Error('timeout: el servidor tarda demasiado')
      if (/Failed to fetch|NetworkError|Load failed/i.test(String((e as Error)?.message))) marcarConexion('sin-conexion')
      throw e
    })
    .finally(() => { if (t) clearTimeout(t) })
}

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY en .env')
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// ---------------------------------------------------------------------------
// Modo solo lectura («Ver como» un rol): la administración ve la app como otro
// rol y nada se puede cambiar. Se corta en el cliente, antes de llegar al servidor.
// ---------------------------------------------------------------------------
let soloLectura: string | null = null
export const setSoloLectura = (motivo: string | null) => { soloLectura = motivo }
export const enSoloLectura = () => soloLectura

/** RPC que solo leen (se permiten en modo solo lectura). */
const RPC_LECTURA = new Set(['portal_encargos', 'ver_invitacion', 'siguiente_numero'])

/** Sustituto de una consulta de escritura: encadenable y, al esperarla, devuelve el error. */
function bloqueada(): unknown {
  const error = { message: soloLectura ?? 'Solo lectura', code: 'SOLO_LECTURA' }
  const p: unknown = new Proxy(() => {}, {
    get: (_t, prop) => prop === 'then'
      ? (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: null, error }).then(ok, ko)
      : () => p,
    apply: () => p,
  })
  return p
}

const rpcOriginal = supabase.rpc.bind(supabase)
;(supabase as unknown as { rpc: unknown }).rpc = ((fn: string, ...args: unknown[]) =>
  soloLectura && !RPC_LECTURA.has(fn) ? bloqueada() : (rpcOriginal as (...a: unknown[]) => unknown)(fn, ...args)) as typeof supabase.rpc

const fromOriginal = supabase.from.bind(supabase)
;(supabase as unknown as { from: unknown }).from = ((tabla: string) => {
  const b = fromOriginal(tabla)
  if (!soloLectura) return b
  for (const m of ['insert', 'update', 'upsert', 'delete'] as const) (b as unknown as Record<string, unknown>)[m] = () => bloqueada()
  return b
}) as typeof supabase.from

const storageFrom = supabase.storage.from.bind(supabase.storage)
;(supabase.storage as unknown as { from: unknown }).from = ((bucket: string) => {
  const s = storageFrom(bucket)
  if (!soloLectura) return s
  for (const m of ['upload', 'remove', 'update', 'move'] as const) (s as unknown as Record<string, unknown>)[m] = () => bloqueada()
  return s
}) as typeof supabase.storage.from

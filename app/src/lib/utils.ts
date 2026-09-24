import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Formato local de la tienda (fechas y números). Lo fija la app al elegir tienda (Ajustes → Tienda). */
let LOCALE = 'es-ES'
export const locale = () => LOCALE
export const setLocale = (l: string | null | undefined) => { LOCALE = l || 'es-ES' }
/** Zona horaria de la tienda (Ajustes → Tienda): todas las fechas y horas se muestran en ella */
let ZONA: string | undefined = undefined
export const zona = () => ZONA
export const setZona = (z: string | null | undefined) => { try { new Intl.DateTimeFormat('es', { timeZone: z || undefined }); ZONA = z || undefined } catch { ZONA = undefined } }

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "hace 2 h", "ayer", "hace 5 d" */
export function relativo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const h = Math.floor(diff / 36e5)
  if (h < 1) return 'ahora'
  if (h < 24) return `hace ${h} h`
  const dias = Math.floor(h / 24)
  if (dias === 1) return 'ayer'
  return `hace ${dias} d`
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  // Con año solo si no es el actual (para no mezclar días de años distintos)
  const otroAno = d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString(locale(), { timeZone: zona(), day: 'numeric', month: 'short', ...(otroAno ? { year: 'numeric' } : {}) })
}

/** Nº de encargo con 3 cifras y, si lo tiene, el prefijo de su serie: «007», «S012». */
export function num3(n: number | { numero: number; serie?: string | null } | null | undefined): string {
  if (n == null) return '—'
  if (typeof n === 'number') return String(n).padStart(3, '0')
  return (n.serie ?? '') + String(n.numero).padStart(3, '0')
}

/** Importe en la moneda de la tienda («120,50 €»). */
export function dinero(n: number | null | undefined, moneda = 'EUR'): string {
  if (n == null) return '—'
  try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(n) } catch { return `${n} ${moneda}` }
}
/** Ajustes de dinero de la tienda: si usa importes y en qué moneda. */
export function ajustesDinero(aj: Record<string, unknown> | null | undefined) {
  return { usa: (aj?.usar_importe as boolean | undefined) !== false, moneda: String(aj?.moneda ?? 'EUR') }
}
/** Lo que falta por cobrar (null si no hay importe). */
export const pendiente = (e: { importe?: number | null; a_cuenta?: number | null }) =>
  e.importe == null ? null : Math.max(0, Number(e.importe) - Number(e.a_cuenta ?? 0))

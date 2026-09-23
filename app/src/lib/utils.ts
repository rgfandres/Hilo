import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Formato local de la tienda (fechas y números). Lo fija la app al elegir tienda (Ajustes → Tienda). */
let LOCALE = 'es-ES'
export const locale = () => LOCALE
export const setLocale = (l: string | null | undefined) => { LOCALE = l || 'es-ES' }

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
  return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
}

/** Nº de encargo con 3 cifras y, si lo tiene, el prefijo de su serie: «007», «S012». */
export function num3(n: number | { numero: number; serie?: string | null } | null | undefined): string {
  if (n == null) return '—'
  if (typeof n === 'number') return String(n).padStart(3, '0')
  return (n.serie ?? '') + String(n.numero).padStart(3, '0')
}

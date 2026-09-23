import * as React from 'react'
import { cn } from '@/lib/utils'

export type TagColor = 'gray' | 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'pink'

const colors: Record<TagColor, string> = {
  gray: 'bg-tag-gray-bg text-tag-gray-fg',
  amber: 'bg-tag-amber-bg text-tag-amber-fg',
  blue: 'bg-tag-blue-bg text-tag-blue-fg',
  purple: 'bg-tag-purple-bg text-tag-purple-fg',
  green: 'bg-tag-green-bg text-tag-green-fg',
  red: 'bg-tag-red-bg text-tag-red-fg',
  pink: 'bg-tag-pink-bg text-tag-pink-fg',
}

/** Convierte un hex de etapa (BD) en el color de etiqueta más cercano. */
export function tagColorFromHex(hex: string | null | undefined): TagColor {
  if (!hex) return 'gray'
  const h = hex.toLowerCase()
  if (h.startsWith('#c9') || h.startsWith('#b8') || h.startsWith('#8a5')) return 'amber'
  if (h.startsWith('#2') || h.startsWith('#1961')) return 'blue'
  if (h.startsWith('#7') || h.startsWith('#5')) return 'purple'
  if (h.startsWith('#1e') || h.startsWith('#17')) return 'green'
  if (h.startsWith('#c6') || h.startsWith('#a3')) return 'red'
  if (h.startsWith('#c2')) return 'pink'
  return 'gray'
}

export function Tag({ color = 'gray', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: TagColor }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 text-sm font-medium', colors[color], className)}
      {...props}
    />
  )
}

import type { Rol } from '@/lib/types'

/**
 * Qué pantallas ve cada papel (Ajustes → Qué ve cada papel). Sin configurar, cada papel ve lo de
 * siempre. Configurado, el menú, la barra del móvil y las direcciones se limitan a lo marcado.
 * Administración lo ve siempre todo.
 */
export type Pantalla = 'parahoy' | 'encargos' | 'nuevo' | 'clientes' | 'productos' | 'proveedores' | 'logistica' | 'produccion' | 'materiales' | 'pedidos' | 'informes'

export const PANTALLAS: { k: Pantalla; ruta: string }[] = [
  { k: 'parahoy', ruta: '/' },
  { k: 'logistica', ruta: '/logistica' },
  { k: 'encargos', ruta: '/encargos' },
  { k: 'nuevo', ruta: '/encargos/nuevo' },
  { k: 'clientes', ruta: '/clientes' },
  { k: 'productos', ruta: '/productos' },
  { k: 'proveedores', ruta: '/proveedores' },
  { k: 'produccion', ruta: '/produccion' },
  { k: 'materiales', ruta: '/materiales' },
  { k: 'pedidos', ruta: '/pedidos' },
  { k: 'informes', ruta: '/informes' },
]

/** Nombre propio de cada pantalla en el menú y la barra del móvil (Ajustes → Qué ve cada papel); si no hay, el de siempre */
export function nombreMenu(aj: Record<string, unknown> | null | undefined, k: Pantalla, defecto: string): string {
  const n = ((aj?.nombres_menu ?? {}) as Partial<Record<Pantalla, string>>)[k]
  return typeof n === 'string' && n.trim() ? n.trim() : defecto
}

/** Nombre que sale en el menú para cada pantalla cuando la tienda no le ha puesto uno propio */
export function menuPorDefecto(v: { encargos: string; clientes: string; productos: string; proveedores: string; materiales: string; logistica: string; hoja: string }): Record<Pantalla, string> {
  return { parahoy: 'Para hoy', encargos: v.encargos, nuevo: '', clientes: v.clientes, productos: v.productos, proveedores: v.proveedores,
    logistica: v.logistica, produccion: v.hoja, materiales: v.materiales, pedidos: 'Pedidos', informes: 'Informes' }
}

export const PAPELES_CONFIGURABLES: Rol[] = ['OPERATIVO', 'ATENCION', 'LOGISTICA']

/** Pantallas visibles para este papel, o null si usa las de siempre */
export function pantallasDe(aj: Record<string, unknown> | null | undefined, rol: Rol | null): Set<Pantalla> | null {
  if (!rol || rol === 'ADMIN') return null
  const cfg = (aj?.pantallas ?? {}) as Partial<Record<Rol, Pantalla[]>>
  const l = cfg[rol]
  return Array.isArray(l) ? new Set(l) : null
}

/** Pantalla a la que pertenece una dirección (solo las listas: las fichas sueltas se abren siempre) */
export function pantallaDeRuta(pathname: string): Pantalla | null {
  if (pathname === '/' || pathname === '/para-hoy') return 'parahoy'
  if (pathname === '/encargos') return 'encargos'
  if (pathname === '/encargos/nuevo') return 'nuevo'
  for (const p of PANTALLAS) if (p.ruta !== '/' && p.ruta !== '/encargos' && p.ruta !== '/encargos/nuevo' && pathname === p.ruta) return p.k
  return null
}

/** Primera pantalla visible (a donde se entra) */
export function inicioDe(p: Set<Pantalla>): string {
  const x = PANTALLAS.find((q) => p.has(q.k))
  return x ? x.ruta : '/ajustes/cuenta'
}

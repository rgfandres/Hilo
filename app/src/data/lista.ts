import type { EncargoEstado } from '@/lib/types'
import { formatearValor, type Campo } from '@/data/config'
import { coincide } from '@/lib/texto'
import { num3 } from '@/lib/utils'

/**
 * Una «dimensión» es cualquier cosa por la que se puede filtrar o agrupar la lista:
 * etapa, proveedor, producto, tipo y los campos configurables del encargo.
 * El valor vacío se representa con '' y se muestra como «Sin X».
 */
export interface Dimension {
  clave: string
  etiqueta: string
  vacio: string
  valor: (e: EncargoEstado) => string
  /** Orden de los grupos (por defecto alfabético, vacío al final) */
  orden?: (a: string, b: string) => number
}

export function dimensiones(opts: {
  vocab: { producto: string; proveedor: string }
  sinProveedor: string; sinProducto: string
  campos: Campo[]
  ordenEtapa: Map<string, number>
  variosTipos: boolean
  /** La tienda usa importes: se puede filtrar por cobro */
  cobro?: boolean
}): Dimension[] {
  const { vocab, campos, ordenEtapa } = opts
  const d: Dimension[] = [
    {
      clave: 'etapa', etiqueta: 'Etapa', vacio: 'Sin empezar',
      valor: (e) => e.etapa_actual_nombre ?? '',
      orden: (a, b) => (a === '' ? -1 : b === '' ? 1 : (ordenEtapa.get(a) ?? 0) - (ordenEtapa.get(b) ?? 0)),
    },
    { clave: 'proveedor', etiqueta: vocab.proveedor, vacio: opts.sinProveedor, valor: (e) => e.proveedor_nombre ?? '' },
    { clave: 'producto', etiqueta: vocab.producto, vacio: opts.sinProducto, valor: (e) => e.producto_nombre ?? '' },
  ]
  if (opts.cobro) d.push({
    clave: 'cobro', etiqueta: 'Cobro', vacio: 'Sin importe',
    valor: (e) => e.importe == null ? '' : Number(e.importe) - Number(e.a_cuenta ?? 0) > 0 ? 'Pendiente de cobro' : 'Pagado',
  })
  if (opts.variosTipos) d.push({ clave: 'tipo', etiqueta: 'Tipo', vacio: 'Sin tipo', valor: (e) => e.tipo_nombre ?? '' })
  for (const c of campos) {
    const num = c.tipo === 'numero', fecha = c.tipo === 'fecha'
    d.push({
      clave: 'c:' + c.clave, etiqueta: c.etiqueta, vacio: `Sin ${c.etiqueta.toLowerCase()}`,
      valor: (e) => {
        const v = e.datos?.[c.clave]
        if (v == null || v === '') return ''
        return fecha ? String(v).slice(0, 10) : Array.isArray(v) ? v.join(', ') : String(v)
      },
      orden: num ? (a, b) => (a === '' ? 1 : b === '' ? -1 : Number(a) - Number(b))
        : fecha ? (a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)) : undefined,
    })
  }
  return d
}

/** Texto que se enseña para un valor de una dimensión (las fechas, en corto). */
export function etiquetaValor(d: Dimension, v: string, campos: Campo[]): string {
  if (v === '') return d.vacio
  if (d.clave.startsWith('c:')) {
    const c = campos.find((x) => 'c:' + x.clave === d.clave)
    if (c?.tipo === 'fecha') return formatearValor(c, v)
  }
  return v
}

export function ordenar(d: Dimension, vals: string[]): string[] {
  const f = d.orden ?? ((a: string, b: string) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')))
  return [...vals].sort(f)
}

export type Filtros = Record<string, string[]>

/** Aplica búsqueda y filtros. Dentro de un filtro, cualquier valor vale (O); entre filtros, todos (Y). */
export function filtrar(rows: EncargoEstado[], q: string, filtros: Filtros, dims: Dimension[]): EncargoEstado[] {
  const activos = Object.entries(filtros).filter(([, v]) => v.length)
  return rows.filter((e) => {
    for (const [k, vals] of activos) {
      const d = dims.find((x) => x.clave === k)
      if (d && !vals.includes(d.valor(e))) return false
    }
    if (!q.trim()) return true
    return coincide(q, [
      num3(e.numero), e.numero, e.cliente_nombre, e.cliente_telefono, e.producto_nombre, e.proveedor_nombre,
      e.etapa_actual_nombre, ...Object.values(e.datos ?? {}).map((v) => (Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? '' : String(v))),
    ])
  })
}

/** Filtros en la URL: «etapa:Recibido|En taller;proveedor:» (vacío = sin valor) */
export function filtrosDeUrl(s: string | null): Filtros {
  const f: Filtros = {}
  if (!s) return f
  for (const parte of s.split(';')) {
    const i = parte.indexOf(':')
    if (i < 0) continue
    f[decodeURIComponent(parte.slice(0, i))] = parte.slice(i + 1).split('|').map(decodeURIComponent)
  }
  return f
}
export function filtrosAUrl(f: Filtros): string {
  return Object.entries(f).filter(([, v]) => v.length)
    .map(([k, v]) => `${encodeURIComponent(k)}:${v.map(encodeURIComponent).join('|')}`).join(';')
}

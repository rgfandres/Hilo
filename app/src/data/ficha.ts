import { supabase } from '@/lib/supabase'
import { formatearValor, type Campo } from '@/data/config'
import { num3, locale, zona } from '@/lib/utils'
import type { Vocab } from '@/lib/vocab'

/**
 * Ficha imprimible: una plantilla de texto por tienda con marcadores.
 *  - Líneas «# …» título y «## …» sección; el resto, párrafos.
 *  - Marcadores sueltos en una línea que se expanden a bloques:
 *      {campos_encargo} {campos_cliente} {hilo} {lineas}
 *  - Marcadores de texto: {tienda} {numero} {nombre} {telefono} {email} {producto}
 *      {proveedor} {etapa} {fecha} {fecha_alta} {año} {complementos} {notas} {tipo}
 *      y la clave de cualquier campo.
 *  - Tablas de dos columnas, como en un documento: líneas seguidas «| Etiqueta | {marcador} |».
 *      Una fila con la segunda celda vacía hace de cabecera de la tabla.
 *  - «@archivo …» (no se imprime): nombre del PDF, p. ej. «@archivo {año}_{numero}_{nombre}».
 */
export const BLOQUES_FICHA = ['campos_encargo', 'campos_cliente', 'hilo', 'lineas'] as const
export const MARCADORES_FICHA: { k: string; ayuda: string }[] = [
  { k: 'tienda', ayuda: 'Nombre de la tienda' }, { k: 'numero', ayuda: 'Número' }, { k: 'nombre', ayuda: 'Cliente' },
  { k: 'telefono', ayuda: 'Teléfono del cliente' }, { k: 'email', ayuda: 'Correo del cliente' }, { k: 'producto', ayuda: 'Producto' },
  { k: 'proveedor', ayuda: 'Proveedor asignado' }, { k: 'etapa', ayuda: 'Etapa actual' }, { k: 'tipo', ayuda: 'Tipo de encargo' },
  { k: 'fecha', ayuda: 'Fecha de impresión' }, { k: 'fecha_alta', ayuda: 'Fecha de alta' }, { k: 'año', ayuda: 'Año de alta' },
  { k: 'complementos', ayuda: 'Complementos de este encargo' }, { k: 'notas', ayuda: 'Notas del cliente' },
  { k: 'campos_encargo', ayuda: 'Bloque: todos los campos del encargo (los vacíos quedan para rellenar a mano)' },
  { k: 'campos_cliente', ayuda: 'Bloque: los campos del cliente' },
  { k: 'hilo', ayuda: 'Bloque: pasos con su fecha' }, { k: 'lineas', ayuda: 'Bloque: renglones en blanco para notas' },
]

export function plantillaDefecto(v: Vocab): string {
  return [
    '# {tienda}',
    `## ${v.encargo} {numero} · {nombre}`,
    `Etapa: {etapa} · ${v.proveedor}: {proveedor} · Impreso el {fecha}`,
    `${v.producto}: {producto}`,
    '## Datos',
    '{campos_encargo}',
    `## ${v.cliente}`,
    'Teléfono: {telefono} · Correo: {email}',
    '{campos_cliente}',
    '## Pasos',
    '{hilo}',
    '## Notas',
    '{lineas}',
  ].join('\n')
}

export async function obtenerPlantillaFicha(tiendaId: string): Promise<string | null> {
  const { data, error } = await supabase.from('plantilla_ficha').select('html').eq('tienda_id', tiendaId).maybeSingle()
  if (error) throw error
  return (data as { html: string } | null)?.html ?? null
}
export async function guardarPlantillaFicha(tiendaId: string, texto: string | null) {
  const r = texto == null
    ? await supabase.from('plantilla_ficha').delete().eq('tienda_id', tiendaId)
    : await supabase.from('plantilla_ficha').upsert({ tienda_id: tiendaId, html: texto, actualizado_en: new Date().toISOString() })
  if (r.error) throw r.error
}

export interface DatosFicha {
  tienda: string; numero: number; serie?: string | null; nombre: string; telefono: string | null; email: string | null
  producto: string | null; proveedor: string | null; etapa: string | null; tipo: string | null
  camposEncargo: Campo[]; datosEncargo: Record<string, unknown>
  camposCliente: Campo[]; datosCliente: Record<string, unknown>
  hilo: { etapa: string; fecha: string; nota?: string | null }[]
  /** Fecha de alta del encargo, sus complementos y las notas del cliente */
  creado?: string | null; complementos?: string | null; notasCliente?: string | null
  /** Logo de la tienda (URL pública) */
  logo?: string | null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString(locale(), { timeZone: zona(), day: 'numeric', month: 'short', year: 'numeric' })

function textos(d: DatosFicha): Record<string, string> {
  const t: Record<string, string> = {
    tienda: d.tienda, numero: num3({ numero: d.numero, serie: d.serie }), nombre: d.nombre, telefono: d.telefono ?? '', email: d.email ?? '',
    producto: d.producto ?? '', proveedor: d.proveedor ?? '', etapa: d.etapa ?? '', tipo: d.tipo ?? '',
    fecha: new Date().toLocaleDateString(locale(), { timeZone: zona() }),
    fecha_alta: d.creado ? new Date(d.creado).toLocaleDateString(locale(), { timeZone: zona() }) : '',
    año: d.creado ? String(new Date(d.creado).getFullYear()) : String(new Date().getFullYear()),
    complementos: d.complementos ?? '', notas: d.notasCliente ?? '',
  }
  for (const c of [...d.camposCliente, ...d.camposEncargo]) {
    const src = d.camposEncargo.includes(c) ? d.datosEncargo : d.datosCliente
    const v = formatearValor(c, src?.[c.clave])
    t[c.clave] = v === '—' ? '' : v
  }
  return t
}
const rellenarLinea = (l: string, t: Record<string, string>) =>
  l.replace(/\{([a-z0-9_ñ]+)\}/gi, (m, k: string) => (k in t ? t[k] : m))

/** Celdas de una fila «| a | b |» (sin las barras de los extremos) */
const celdas = (l: string) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim().replace(/^\*\*(.*)\*\*$/, '$1'))
const esFila = (l: string) => /^\|.*\|$/.test(l.trim())

/** Nombre del archivo al guardar como PDF (línea «@archivo …» de la plantilla) */
export function archivoFicha(plantilla: string, d: DatosFicha): string {
  const l = plantilla.split('\n').map((x) => x.trim()).find((x) => x.startsWith('@archivo '))
  const t = textos(d)
  return (l ? rellenarLinea(l.slice(9), t) : `${t.numero} · ${d.nombre}`).trim() || t.numero
}

/** HTML completo (página A4) listo para imprimir o para una vista previa. */
export function fichaHTML(plantilla: string, d: DatosFicha): string {
  const t = textos(d)
  const tablaCampos = (cs: Campo[], datos: Record<string, unknown>) => cs.length === 0 ? '' :
    `<table class="campos">${cs.map((c) => {
      const v = formatearValor(c, datos?.[c.clave])
      return `<tr><th>${esc(c.etiqueta)}</th><td${v === '—' ? ' class="vacio"' : ''}>${v === '—' ? '' : esc(v)}</td></tr>`
    }).join('')}</table>`
  const bloques: Record<string, string> = {
    campos_encargo: tablaCampos(d.camposEncargo, d.datosEncargo),
    campos_cliente: tablaCampos(d.camposCliente, d.datosCliente),
    hilo: d.hilo.length ? `<table class="hilo">${d.hilo.map((h) => `<tr><td>${esc(fechaLarga(h.fecha))}</td><td>${esc(h.etapa)}${h.nota ? ` · <span class="nota">${esc(h.nota)}</span>` : ''}</td></tr>`).join('')}</table>` : '<p class="gris">Sin pasos todavía.</p>',
    lineas: '<div class="lineas">' + '<div></div>'.repeat(6) + '</div>',
  }
  // Las filas «| a | b |» seguidas forman una tabla como la de un documento
  const lineas = plantilla.split('\n').filter((x) => !x.trim().startsWith('@archivo '))
  const grupos: (string | string[])[] = []
  for (const raw of lineas) {
    if (esFila(raw)) { const u = grupos[grupos.length - 1]; if (Array.isArray(u)) u.push(raw.trim()); else grupos.push([raw.trim()]) }
    else grupos.push(raw)
  }
  const cuerpo = grupos.map((g) => {
    if (Array.isArray(g)) {
      return `<table class="doc">${g.map((f) => {
        const [a = '', b = ''] = celdas(f).map((c) => rellenarLinea(c, t))
        if (!b && !/\{/.test(celdas(f)[1] ?? '')) return `<tr><th colspan="2" class="cab">${esc(a)}</th></tr>`
        return `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`
      }).join('')}</table>`
    }
    const l = g.trim()
    const solo = l.match(/^\{([a-z_]+)\}$/i)
    if (solo && solo[1] in bloques) return bloques[solo[1]]
    if (!l) return ''
    if (l.startsWith('## ')) return `<h2>${esc(rellenarLinea(l.slice(3), t))}</h2>`
    if (l.startsWith('# ')) return `<h1>${esc(rellenarLinea(l.slice(2), t))}</h1>`
    return `<p>${esc(rellenarLinea(l, t))}</p>`
  }).join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(archivoFicha(plantilla, d))}</title><style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 12px; color: #222; margin: 0; padding: 18px; line-height: 1.45; }
    h1 { font-size: 18px; margin: 0 0 6px; } h2 { font-size: 13px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ccc; text-transform: uppercase; letter-spacing: .03em; color: #555; }
    p { margin: 2px 0; } .gris { color: #888; }
    table { width: 100%; border-collapse: collapse; } tr { break-inside: avoid; }
    .campos th { text-align: left; font-weight: 500; color: #666; width: 34%; padding: 4px 8px 4px 0; vertical-align: top; }
    .campos td { padding: 4px 0; border-bottom: 1px solid #eee; } .campos td.vacio { border-bottom: 1px solid #bbb; }
    .hilo td { padding: 3px 8px 3px 0; border-bottom: 1px solid #f0f0f0; } .hilo td:first-child { width: 110px; color: #666; white-space: nowrap; }
    .nota { color: #666; } .lineas div { height: 26px; border-bottom: 1px solid #bbb; }
    table.doc { margin: 10px 0 16px; border: 1px solid #999; } .doc th, .doc td { border: 1px solid #999; padding: 5px 8px; text-align: center; font-weight: 700; }
    .doc th { width: 50%; } .doc th.cab { background: #f2f2f2; letter-spacing: .03em; }
  </style></head><body>${d.logo && /^https:\/\//.test(d.logo) ? `<img src="${esc(d.logo)}" alt="" style="height:40px;max-width:180px;object-fit:contain;float:right">` : ''}${cuerpo}</body></html>`
}

/** La misma ficha en texto, para pegarla en WhatsApp o en un correo. */
export function fichaTexto(plantilla: string, d: DatosFicha): string {
  const t = textos(d)
  const campos = (cs: Campo[], datos: Record<string, unknown>) => cs.map((c) => {
    const v = formatearValor(c, datos?.[c.clave]); return v === '—' ? null : `${c.etiqueta}: ${v}`
  }).filter(Boolean).join('\n')
  const bloques: Record<string, string> = {
    campos_encargo: campos(d.camposEncargo, d.datosEncargo),
    campos_cliente: campos(d.camposCliente, d.datosCliente),
    hilo: d.hilo.map((h) => `${fechaLarga(h.fecha)} · ${h.etapa}${h.nota ? ` (${h.nota})` : ''}`).join('\n'),
    lineas: '',
  }
  return plantilla.split('\n').filter((x) => !x.trim().startsWith('@archivo ')).map((raw) => {
    const l = raw.trim()
    if (esFila(l)) {
      const [a = '', b = ''] = celdas(l).map((c) => rellenarLinea(c, t))
      return b ? `${a.replace(/:$/, '')}: ${b}` : !/\{/.test(celdas(l)[1] ?? '') ? `\n— ${a} —` : ''
    }
    const solo = l.match(/^\{([a-z_]+)\}$/i)
    if (solo && solo[1] in bloques) return bloques[solo[1]]
    if (l.startsWith('## ')) return `\n— ${rellenarLinea(l.slice(3), t)} —`
    if (l.startsWith('# ')) return rellenarLinea(l.slice(2), t).toUpperCase()
    return rellenarLinea(l, t)
  }).filter((l) => l !== '').join('\n').replace(/\n— [^\n]* —(?=\n+— |\s*$)/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

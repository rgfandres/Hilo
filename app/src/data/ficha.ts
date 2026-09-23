import { supabase } from '@/lib/supabase'
import { formatearValor, type Campo } from '@/data/config'
import { num3, locale } from '@/lib/utils'
import type { Vocab } from '@/lib/vocab'

/**
 * Ficha imprimible: una plantilla de texto por tienda con marcadores.
 *  - Líneas «# …» título y «## …» sección; el resto, párrafos.
 *  - Marcadores sueltos en una línea que se expanden a bloques:
 *      {campos_encargo} {campos_cliente} {hilo} {lineas}
 *  - Marcadores de texto: {tienda} {numero} {nombre} {telefono} {email} {producto}
 *      {proveedor} {etapa} {fecha} {tipo} y la clave de cualquier campo.
 */
export const BLOQUES_FICHA = ['campos_encargo', 'campos_cliente', 'hilo', 'lineas'] as const
export const MARCADORES_FICHA: { k: string; ayuda: string }[] = [
  { k: 'tienda', ayuda: 'Nombre de la tienda' }, { k: 'numero', ayuda: 'Número' }, { k: 'nombre', ayuda: 'Cliente' },
  { k: 'telefono', ayuda: 'Teléfono del cliente' }, { k: 'email', ayuda: 'Correo del cliente' }, { k: 'producto', ayuda: 'Producto' },
  { k: 'proveedor', ayuda: 'Proveedor asignado' }, { k: 'etapa', ayuda: 'Etapa actual' }, { k: 'tipo', ayuda: 'Tipo de encargo' },
  { k: 'fecha', ayuda: 'Fecha de impresión' },
  { k: 'campos_encargo', ayuda: 'Bloque: todos los campos del encargo (los vacíos quedan para rellenar a mano)' },
  { k: 'campos_cliente', ayuda: 'Bloque: los campos del cliente (medidas, etc.)' },
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
  /** Logo de la tienda (URL pública) */
  logo?: string | null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })

function textos(d: DatosFicha): Record<string, string> {
  const t: Record<string, string> = {
    tienda: d.tienda, numero: num3({ numero: d.numero, serie: d.serie }), nombre: d.nombre, telefono: d.telefono ?? '', email: d.email ?? '',
    producto: d.producto ?? '', proveedor: d.proveedor ?? '', etapa: d.etapa ?? '', tipo: d.tipo ?? '',
    fecha: new Date().toLocaleDateString(locale()),
  }
  for (const c of [...d.camposCliente, ...d.camposEncargo]) {
    const src = d.camposEncargo.includes(c) ? d.datosEncargo : d.datosCliente
    const v = formatearValor(c, src?.[c.clave])
    t[c.clave] = v === '—' ? '' : v
  }
  return t
}
const rellenarLinea = (l: string, t: Record<string, string>) =>
  l.replace(/\{([a-z0-9_]+)\}/gi, (m, k: string) => (k in t ? t[k] : m))

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
  const cuerpo = plantilla.split('\n').map((raw) => {
    const l = raw.trim()
    const solo = l.match(/^\{([a-z_]+)\}$/i)
    if (solo && solo[1] in bloques) return bloques[solo[1]]
    if (!l) return ''
    if (l.startsWith('## ')) return `<h2>${esc(rellenarLinea(l.slice(3), t))}</h2>`
    if (l.startsWith('# ')) return `<h1>${esc(rellenarLinea(l.slice(2), t))}</h1>`
    return `<p>${esc(rellenarLinea(l, t))}</p>`
  }).join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(`${num3({ numero: d.numero, serie: d.serie })} · ${d.nombre}`)}</title><style>
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
  return plantilla.split('\n').map((raw) => {
    const l = raw.trim()
    const solo = l.match(/^\{([a-z_]+)\}$/i)
    if (solo && solo[1] in bloques) return bloques[solo[1]]
    if (l.startsWith('## ')) return `\n— ${rellenarLinea(l.slice(3), t)} —`
    if (l.startsWith('# ')) return rellenarLinea(l.slice(2), t).toUpperCase()
    return rellenarLinea(l, t)
  }).filter((l) => l !== '').join('\n').replace(/\n— [^\n]* —\n(?=\n— |$)/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

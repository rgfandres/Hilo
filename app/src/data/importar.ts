import { supabase } from '@/lib/supabase'
import type { Campo } from '@/data/config'
import { crearLibro, fechaExcel, leerLibro, type Celda } from '@/lib/xlsx'
import { plano } from '@/lib/texto'

/**
 * Importar con plantilla: solo se acepta NUESTRA plantilla (mismas columnas).
 * La pantalla lee el Excel y lo enseña; quien decide es el servidor (importar),
 * que revisa todo otra vez y guarda todo o nada.
 */
export type Entidad = 'CLIENTE' | 'PRODUCTO' | 'PROVEEDOR' | 'MATERIAL'
export interface Columna { titulo: string; clave: string; obligatoria?: boolean; ayuda: string; ejemplo?: string; tipo?: Campo['tipo']; dato?: boolean }

export const MAX_FILAS = 2000
export const MAX_BYTES = 5 * 1024 * 1024
const VERSION = '1'

/** Columnas de la plantilla de cada cosa (las de datos propios salen de Ajustes → Datos que guardáis) */
export function columnas(entidad: Entidad, ctx: { campos: Campo[]; materiales: boolean; construcciones: string[]; vocab: Record<string, string> }): Columna[] {
  const v = ctx.vocab
  const base: Columna[] = entidad === 'CLIENTE' ? [
    { titulo: 'Nombre *', clave: 'nombre', obligatoria: true, ayuda: 'Nombre y apellidos.', ejemplo: 'Lucía Martín' },
    { titulo: 'Teléfono', clave: 'telefono', ayuda: 'Si ya hay alguien con este teléfono, se actualiza en vez de crear otro.', ejemplo: '611 222 333' },
    { titulo: 'Email', clave: 'email', ayuda: 'Si ya hay alguien con este email, se actualiza.', ejemplo: 'lucia@correo.es' },
    { titulo: 'Notas', clave: 'notas', ayuda: 'Texto libre.' },
  ] : entidad === 'PRODUCTO' ? [
    { titulo: 'Nombre *', clave: 'nombre', obligatoria: true, ayuda: `Si ya existe ${v.producto?.toLowerCase() ?? 'uno'} con este nombre, se actualiza.`, ejemplo: 'Anillo liso' },
    { titulo: 'Precio', clave: 'precio', ayuda: 'Número, sin símbolo: 120 o 120,50.', ejemplo: '120' },
    { titulo: 'Activo (Sí/No)', clave: 'activo', ayuda: 'Vacío = Sí.', ejemplo: 'Sí' },
    ...(ctx.materiales ? [
      { titulo: 'Material', clave: 'material', ayuda: `Tipo de ${v.material?.toLowerCase() ?? 'material'} que gasta (el mismo nombre que en el catálogo).` },
      { titulo: 'Consumo', clave: 'consumo', ayuda: 'Cuánto gasta una unidad, en la unidad de ese material.' },
    ] : []),
    ...(ctx.construcciones.length ? [{ titulo: 'Elaboración', clave: 'elaboracion', ayuda: `Una de estas: ${ctx.construcciones.join(', ')}.` }] : []),
  ] : entidad === 'PROVEEDOR' ? [
    { titulo: 'Nombre *', clave: 'nombre', obligatoria: true, ayuda: 'Si ya existe con este nombre, se actualiza.', ejemplo: 'Hermanos Ruiz' },
    { titulo: 'Teléfono', clave: 'telefono', ayuda: 'De contacto.' },
    { titulo: 'Email', clave: 'email', ayuda: 'De contacto (no le da acceso al portal).' },
    { titulo: 'Notas', clave: 'notas', ayuda: 'Texto libre.' },
  ] : [
    { titulo: 'Tipo *', clave: 'tipo', obligatoria: true, ayuda: 'Qué es: la familia del material.', ejemplo: 'Oro' },
    { titulo: 'Variante', clave: 'variante', ayuda: 'Color, referencia, grosor… Tipo + variante no se pueden repetir.', ejemplo: '18k' },
    { titulo: 'Unidad *', clave: 'unidad', obligatoria: true, ayuda: 'Cómo se cuenta: m, uds, g, kg, ct…', ejemplo: 'g' },
    { titulo: 'Proveedor', clave: 'proveedor', ayuda: 'Nombre exacto de uno que ya exista en la app.' },
    { titulo: 'Stock inicial', clave: 'stock', ayuda: 'Lo que hay ahora. Solo para materiales nuevos.', ejemplo: '25' },
    { titulo: 'Avisar con', clave: 'aviso', ayuda: 'Avisa de pedir cuando quede esto o menos.' },
    { titulo: 'Se compra de', clave: 'compra', ayuda: 'Lo que vende el proveedor de una vez (una caja de 100…).' },
    { titulo: 'Por encargo (Sí/No)', clave: 'por_encargo', ayuda: 'Sí = se pide uno para cada encargo y se gasta entero. Vacío = No.' },
    { titulo: 'Restos hasta', clave: 'resto_hasta', ayuda: 'Si sobra esto o menos, se ofrece guardarlo como resto.' },
    { titulo: 'Ubicación', clave: 'ubicacion', ayuda: 'Estantería, cajón…' },
    { titulo: 'Notas', clave: 'notas', ayuda: 'Texto libre.' },
  ]
  const usados = new Set(base.map((c) => normTitulo(c.titulo)))
  const propios = entidad === 'CLIENTE' || entidad === 'PRODUCTO'
    ? ctx.campos.filter((c) => !usados.has(normTitulo(c.etiqueta))).map((c): Columna => ({
      titulo: c.etiqueta + (c.obligatorio ? ' *' : ''), clave: c.clave, obligatoria: !!c.obligatorio, dato: true, tipo: c.tipo,
      ayuda: c.tipo === 'numero' ? `Número${c.unidad ? ` (${c.unidad})` : ''}.` : c.tipo === 'fecha' ? 'Fecha: 25/12/2026.' : c.tipo === 'opcion' ? `Una de estas: ${(c.opciones ?? []).join(', ')}.` : 'Texto.',
    }))
    : []
  return [...base, ...propios]
}

const normTitulo = (s: string) => plano(s.replace(/\*/g, '')).toLowerCase().replace(/\s+/g, ' ').trim()
export const NOMBRE_ENTIDAD: Record<Entidad, string> = { CLIENTE: 'clientes', PRODUCTO: 'productos', PROVEEDOR: 'proveedores', MATERIAL: 'materiales' }

/** La plantilla: hoja «Datos» con los títulos, hoja «Instrucciones» y una hoja oculta que la identifica */
export function plantilla(entidad: Entidad, cols: Columna[], nombreCosas: string): Blob {
  return crearLibro([
    { nombre: 'Datos', filas: [cols.map((c) => c.titulo)], anchos: cols.map((c) => Math.max(14, c.titulo.length + 4)), datos: true },
    { nombre: 'Instrucciones', anchos: [26, 90], filas: [
      ['Cómo rellenar esta plantilla', ''],
      ['', ''],
      ['1', `Escribe una fila por cada ${nombreCosas} en la hoja «Datos», empezando en la fila 2.`],
      ['2', 'No cambies, borres ni añadas títulos en la fila 1: si no coinciden, la app no aceptará el archivo.'],
      ['3', 'Las columnas con * son obligatorias. Las demás pueden quedar vacías.'],
      ['4', 'Si algo ya existe en la app, se actualiza con lo que escribas. Una celda vacía nunca borra lo que ya había.'],
      ['5', `Como mucho ${MAX_FILAS} filas. Guarda el archivo como Excel (.xlsx).`],
      ['6', 'Antes de guardar nada, la app te enseñará cada fila y te dirá si hay algo que corregir.'],
      ['', ''],
      ['Columna', 'Qué poner'],
      ...cols.map((c) => [c.titulo, c.ayuda + (c.ejemplo ? ` Ejemplo: ${c.ejemplo}` : '')]),
    ] },
    { nombre: '_hilo', oculta: true, filas: [['HILO', entidad, VERSION]] },
  ])
}

export interface FilaLeida { _fila: number; [k: string]: unknown }
export type Lectura = { ok: true; filas: FilaLeida[]; vacias: number } | { ok: false; error: string }

/** Lee el Excel subido y lo convierte a filas. Rechaza lo que no sea nuestra plantilla. */
export async function leerPlantilla(file: File, entidad: Entidad, cols: Columna[]): Promise<Lectura> {
  if (!/\.xlsx$/i.test(file.name)) {
    return { ok: false, error: /\.(xls|csv|ods|numbers)$/i.test(file.name)
      ? 'Solo vale la plantilla de Hilo en formato Excel (.xlsx). Ábrela y usa «Guardar como… → Libro de Excel (.xlsx)».'
      : 'Ese archivo no es la plantilla de Hilo. Descárgala arriba, rellénala y súbela.' }
  }
  if (file.size > MAX_BYTES) return { ok: false, error: 'El archivo pesa demasiado (máximo 5 MB). ¿Seguro que es la plantilla?' }
  let libro
  try { libro = await leerLibro(await file.arrayBuffer(), MAX_FILAS + 50) } catch {
    return { ok: false, error: 'No se ha podido abrir el archivo. Guárdalo de nuevo como Excel (.xlsx) y vuelve a subirlo.' }
  }
  const marca = libro.hojas.find((h) => h.nombre === '_hilo')?.filas[0]
  if (marca && String(marca[0]) === 'HILO' && String(marca[1]) !== entidad) {
    const otra = NOMBRE_ENTIDAD[String(marca[1]) as Entidad] ?? 'otra cosa'
    return { ok: false, error: `Esta es la plantilla de ${otra}, no la de ${NOMBRE_ENTIDAD[entidad]}. Elige arriba lo que quieres importar.` }
  }
  const hoja = libro.hojas.find((h) => h.nombre === 'Datos') ?? libro.hojas.find((h) => !h.oculta)
  if (!hoja || !hoja.filas.length) return { ok: false, error: 'La hoja «Datos» está vacía.' }
  // Títulos: los de la plantilla, sin columnas desconocidas
  const titulos = (hoja.filas[0] ?? []).map((x) => (x == null ? '' : String(x)))
  const porTitulo = new Map(cols.map((c) => [normTitulo(c.titulo), c]))
  const mapa: (Columna | null)[] = []
  const raras: string[] = []
  titulos.forEach((t, i) => {
    if (!t.trim()) { mapa[i] = null; return }
    const c = porTitulo.get(normTitulo(t))
    if (!c) raras.push(t.trim())
    mapa[i] = c ?? null
  })
  if (raras.length) return { ok: false, error: `Esta no es la plantilla de ${NOMBRE_ENTIDAD[entidad]} (o es antigua): no reconozco ${raras.length === 1 ? 'la columna' : 'las columnas'} ${raras.map((x) => `«${x}»`).join(', ')}. Descarga la plantilla de nuevo y copia tus datos en ella.` }
  const faltan = cols.filter((c) => c.obligatoria && !c.dato && !mapa.includes(c))
  if (faltan.length) return { ok: false, error: `Falta la columna ${faltan.map((c) => `«${c.titulo}»`).join(', ')}. No borres títulos de la plantilla.` }
  const repes = mapa.filter((c, i) => c && mapa.indexOf(c) !== i)
  if (repes.length) return { ok: false, error: `La columna «${repes[0]!.titulo}» está repetida.` }

  const filas: FilaLeida[] = []
  let vacias = 0
  for (let r = 1; r < hoja.filas.length; r++) {
    const celdas = hoja.filas[r] ?? []
    const f: FilaLeida = { _fila: r + 1 }
    const datos: Record<string, string> = {}
    let algo = false
    mapa.forEach((c, i) => {
      if (!c) return
      const s = celdaTexto(celdas[i], c)
      if (!s) return
      algo = true
      if (c.dato) datos[c.clave] = s; else f[c.clave] = s
    })
    if (!algo) { vacias++; continue }
    if (Object.keys(datos).length) f.datos = datos
    filas.push(f)
  }
  if (!filas.length) return { ok: false, error: 'La plantilla no tiene ninguna fila rellena (se empieza en la fila 2).' }
  if (filas.length > MAX_FILAS) return { ok: false, error: `Hay ${filas.length} filas y el máximo es ${MAX_FILAS}. Divide el archivo en varios.` }
  return { ok: true, filas, vacias }
}

function celdaTexto(v: Celda | undefined, c: Columna): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') {
    if (c.tipo === 'fecha') return fechaExcel(v)
    return String(Math.round(v * 1e6) / 1e6)
  }
  return v.replace(/\s+/g, ' ').trim()
}

export interface Informe {
  filas: { fila: number; estado: 'nuevo' | 'actualiza' | 'error'; errores: string[]; avisos: string[] }[]
  errores: number; nuevos: number; actualizados: number; importacion: string | null
}
export async function importar(tiendaId: string, entidad: Entidad, filas: FilaLeida[], confirmar: boolean): Promise<Informe> {
  const { data, error } = await supabase.rpc('importar', { p_tienda: tiendaId, p_entidad: entidad, p_filas: filas, p_confirmar: confirmar })
  if (error) throw error
  return data as Informe
}

export interface Importacion { id: string; entidad: Entidad; creado_en: string; nuevos: number; actualizados: number; deshecha_en: string | null }
export async function listarImportaciones(tiendaId: string): Promise<Importacion[]> {
  const { data, error } = await supabase.from('importacion').select('id,entidad,creado_en,nuevos,actualizados,deshecha_en').eq('tienda_id', tiendaId).order('creado_en', { ascending: false }).limit(10)
  if (error) throw error
  return (data ?? []) as Importacion[]
}
export async function deshacerImportacion(id: string) {
  const { error } = await supabase.rpc('deshacer_importacion', { p_imp: id })
  if (error) throw error
}

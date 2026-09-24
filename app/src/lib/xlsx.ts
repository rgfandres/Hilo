/**
 * Excel (.xlsx) mínimo, sin librerías: escribir una plantilla y leer la hoja que vuelve.
 * Un .xlsx es un zip con XML dentro. Escribimos sin comprimir; al leer, descomprimimos
 * con DecompressionStream (navegadores actuales).
 */

/* ------------------------------ zip ------------------------------ */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(b: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(ficheros: { nombre: string; texto: string }[]): Blob {
  const enc = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of ficheros) {
    const nombre = enc.encode(f.nombre), datos = enc.encode(f.texto), crc = crc32(datos)
    const loc = new DataView(new ArrayBuffer(30))
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true)
    loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true); loc.setUint16(26, nombre.length, true)
    partes.push(new Uint8Array(loc.buffer), nombre, datos)
    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true)
    cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true); cen.setUint16(28, nombre.length, true)
    cen.setUint32(42, offset, true)
    central.push(new Uint8Array(cen.buffer), nombre)
    offset += 30 + nombre.length + datos.length
  }
  const tamCentral = central.reduce((a, b) => a + b.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, ficheros.length, true); fin.setUint16(10, ficheros.length, true)
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true)
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf), u = new Uint8Array(buf), dec = new TextDecoder()
  let fin = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break }
  if (fin < 0) throw new Error('NO_ZIP')
  const n = v.getUint16(fin + 10, true)
  let p = v.getUint32(fin + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('NO_ZIP')
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true)
    const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), loc = v.getUint32(p + 42, true)
    const nombre = dec.decode(u.subarray(p + 46, p + 46 + ln))
    p += 46 + ln + le + lc
    // Solo interesan los XML de la hoja
    if (!/^(xl\/|\[Content_Types\])/.test(nombre) || !nombre.endsWith('.xml') && !nombre.endsWith('.rels')) continue
    const ini = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true)
    const datos = u.subarray(ini, ini + tam)
    if (metodo === 0) out.set(nombre, datos)
    else if (metodo === 8) {
      const s = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      out.set(nombre, new Uint8Array(await new Response(s).arrayBuffer()))
    } else throw new Error('NO_ZIP')
  }
  return out
}

/* ------------------------------ escribir ------------------------------ */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const colLetra = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }

function hojaXML(filas: string[][], opts: { anchos?: number[]; negritaPrimera?: boolean; texto?: boolean } = {}) {
  const cols = opts.anchos?.length
    ? `<cols>${opts.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${opts.texto ? ' style="2"' : ''}/>`).join('')}</cols>` : ''
  const rows = filas.map((f, r) => `<row r="${r + 1}">${f.map((c, i) =>
    `<c r="${colLetra(i)}${r + 1}" t="inlineStr"${r === 0 && opts.negritaPrimera ? ' s="1"' : opts.texto ? ' s="2"' : ''}><is><t xml:space="preserve">${esc(c)}</t></is></c>`).join('')}</row>`).join('')
  const panel = opts.negritaPrimera ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${panel}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

/** Libro con varias hojas (la última puede ir oculta). Las columnas de la primera van en formato texto. */
export function crearLibro(hojas: { nombre: string; filas: string[][]; anchos?: number[]; oculta?: boolean; datos?: boolean }[]): Blob {
  const ns = 'http://schemas.openxmlformats.org/'
  const ficheros = [
    { nombre: '[Content_Types].xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nombre: '_rels/.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}"${h.oculta ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="${ns}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: 'xl/styles.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hojaXML(h.filas, { anchos: h.anchos, negritaPrimera: h.datos, texto: h.datos }) })),
  ]
  return zip(ficheros)
}

/* ------------------------------ leer ------------------------------ */
export type Celda = string | number | boolean | null
export interface Libro { hojas: { nombre: string; oculta: boolean; filas: Celda[][] }[] }

const porTag = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag))
const colIndice = (ref: string) => { const m = /^([A-Z]+)/.exec(ref); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1 }

/** Lee todas las hojas de un .xlsx. Lanza NO_ZIP si no es un Excel moderno. */
export async function leerLibro(buf: ArrayBuffer, maxFilas = 5000): Promise<Libro> {
  const files = await unzip(buf)
  const dec = new TextDecoder(), xml = (n: string) => { const b = files.get(n); return b ? new DOMParser().parseFromString(dec.decode(b), 'application/xml') : null }
  const wb = xml('xl/workbook.xml'), rels = xml('xl/_rels/workbook.xml.rels')
  if (!wb || !rels) throw new Error('NO_ZIP')
  const destino = new Map(porTag(rels, 'Relationship').map((r) => [r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '']))
  const ss = xml('xl/sharedStrings.xml')
  const compartidas = ss ? porTag(ss, 'si').map((si) => porTag(si, 't').filter((t) => (t.parentElement?.localName ?? '') !== 'rPh').map((t) => t.textContent ?? '').join('')) : []
  const hojas: Libro['hojas'] = []
  for (const s of porTag(wb, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id') ?? ''
    let t = destino.get(rid) ?? ''
    t = t.startsWith('/') ? t.slice(1) : `xl/${t}`
    const doc = xml(t)
    const filas: Celda[][] = []
    if (doc) {
      for (const row of porTag(doc, 'row')) {
        const r = Number(row.getAttribute('r') ?? filas.length + 1) - 1
        if (r >= maxFilas) break
        const fila: Celda[] = []
        for (const c of porTag(row, 'c')) {
          const i = colIndice(c.getAttribute('r') ?? '')
          if (i < 0 || i > 200) continue
          const tipo = c.getAttribute('t'), v = porTag(c, 'v')[0]?.textContent ?? null
          let val: Celda = null
          if (tipo === 's') val = v != null ? compartidas[Number(v)] ?? '' : ''
          else if (tipo === 'inlineStr') val = porTag(c, 't').map((x) => x.textContent ?? '').join('')
          else if (tipo === 'str') val = v ?? ''
          else if (tipo === 'b') val = v === '1'
          else if (tipo === 'e') val = null
          else val = v == null || v === '' ? null : Number(v)
          fila[i] = val
        }
        filas[r] = fila
      }
    }
    hojas.push({ nombre: s.getAttribute('name') ?? '', oculta: (s.getAttribute('state') ?? 'visible') !== 'visible', filas: Array.from(filas, (f) => f ?? []) })
  }
  return { hojas }
}

/** Fecha de Excel (número de días desde 1899-12-30) → AAAA-MM-DD */
export function fechaExcel(n: number) {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000))
  return d.toISOString().slice(0, 10)
}

/** Descargar un Blob con nombre */
export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

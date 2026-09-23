// Detecta vocabulario de un sector concreto en el código de la app.
// Todo lo visible debe salir de configuración (tienda.ajustes.vocab, plantilla_campos, etapas, puertas).
// Uso: npm run fugas   (falla si encuentra algo)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PROHIBIDAS = /\b(clientas?|modelos?|talleres?|taller|trajes?|talla|tela|adornos?|cortador|feria|sastr\w*|tejido|prenda)\b/i
const EXCLUIR = [
  /plantillas-sector[\\/]/,        // plantillas de sector: datos de partida, no interfaz
]

const hallazgos = []
const recorrer = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f)
  if (statSync(p).isDirectory()) return recorrer(p)
  if (!/\.(tsx?|css)$/.test(p) || EXCLUIR.some((r) => r.test(p))) return
  readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
    const sinComentario = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    const m = sinComentario.match(PROHIBIDAS)
    if (m) hallazgos.push(`${p}:${i + 1}  «${m[0]}»  ${l.trim().slice(0, 90)}`)
  })
})
recorrer('src')
if (hallazgos.length) {
  console.error(`Fugas de sector (${hallazgos.length}):\n` + hallazgos.join('\n'))
  process.exit(1)
}
console.log('Sin fugas de sector.')

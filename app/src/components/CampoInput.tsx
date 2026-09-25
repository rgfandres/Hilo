import * as React from 'react'
import { formatearValor, leerNumero, type Campo } from '@/data/config'
import { Field, FormRow, Input, Select } from '@/ui'

/** Control para un campo configurable (texto, número, fecha, opción). */
export function CampoInput({ campo, value, onChange }: { campo: Campo; value: string; onChange: (v: string) => void }) {
  return (
    <FormRow label={campo.etiqueta + (campo.obligatorio ? ' *' : '')} ayuda={campo.ayuda}>
      {campo.tipo === 'opcion' ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(campo.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          {value && !(campo.opciones ?? []).includes(value) && <option value={value}>{value}</option>}
        </Select>
      ) : campo.tipo === 'numero' ? (
        <NumeroInput value={value} onChange={onChange} />
      ) : (
        <Input
          className="h-7"
          type={campo.tipo === 'fecha' ? 'date' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FormRow>
  )
}

/** Normaliza el JSON guardado a strings para los controles. */
export function aTexto(d: Record<string, unknown> | null | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(d ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]))
}

/** Quita las claves vacías antes de guardar (una fecha vaciada se guarda vacía). */
export function limpiar(d: Record<string, string>, base: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(d)) {
    if (v === '' || v == null) delete out[k]
    else out[k] = v
  }
  return out
}

/**
 * Número con coma decimal: el valor se actualiza mientras se escribe (así «Guardar» se activa y
 * Intro guarda lo escrito) y al salir se normaliza (1234.5) y se ve «1234,5».
 */
export function NumeroInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const aVista = (v: string) => (v === '' ? '' : v.replace('.', ','))
  const [txt, setTxt] = React.useState(aVista(value))
  const [mal, setMal] = React.useState(false)
  // Solo se reescribe el texto si el valor cambia desde fuera (no al teclear «12,» por ejemplo)
  React.useEffect(() => {
    const n = txt.trim() === '' ? '' : leerNumero(txt)
    if (String(n ?? '') !== value) setTxt(aVista(value))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Input className={mal ? 'h-7 border-danger' : 'h-7'} inputMode="decimal" value={txt} aria-invalid={mal || undefined}
      title={mal ? 'No es un número' : undefined}
      onChange={(e) => {
        const t = e.target.value
        setTxt(t); setMal(false)
        if (t.trim() === '') { if (value !== '') onChange(''); return }
        const n = leerNumero(t)
        if (n != null && String(n) !== value) onChange(String(n))
      }}
      onBlur={() => {
        if (txt.trim() === '') { onChange(''); return }
        const n = leerNumero(txt)
        if (n == null) { setMal(true); return }
        onChange(String(n)); setTxt(aVista(String(n)))
      }} />
  )
}

/**
 * Formulario de campos configurables: primero los destacados, luego los normales y los
 * secundarios plegados en «Más datos». Con `pegar`, permite pegar un texto («Pecho: 92,
 * Cintura 70…») y ver qué se va a rellenar antes de aplicarlo.
 */
export function CamposForm({ campos, valores, onCambio, pegar }: {
  campos: Campo[]; valores: Record<string, string>; onCambio: (clave: string, v: string) => void; pegar?: boolean
}) {
  const [abrirPegar, setAbrirPegar] = React.useState(false)
  const [texto, setTexto] = React.useState('')
  // Al escribir, las medidas se ven todas (se toman de una vez); plegadas solo al consultar la ficha
  const plegado = (c: Campo) => !!c.secundario && !c.destacado && !c.medida
  const dest = campos.filter((c) => c.destacado)
  const normales = campos.filter((c) => !c.destacado && !plegado(c))
  const sec = campos.filter(plegado)
  const rellenosSec = sec.filter((c) => valores[c.clave]).length
  const propuesta = React.useMemo(() => leerPegado(texto, campos), [texto, campos])
  const pinta = (c: Campo) => <CampoInput key={c.clave} campo={c} value={valores[c.clave] ?? ''} onChange={(v) => onCambio(c.clave, v)} />
  return (
    <div className="flex flex-col gap-1">
      {dest.length > 0 && <div className="flex flex-col gap-1 rounded-sm bg-bg-2 p-1.5 [&_input]:font-semibold">{dest.map(pinta)}</div>}
      {normales.map(pinta)}
      {sec.length > 0 && (
        <details className="group">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-1 text-sm text-fg-2 hover:text-fg">
            <span className="transition-transform group-open:rotate-90">▸</span> Más datos ({sec.length}{rellenosSec ? `, ${rellenosSec} rellenos` : ''})
          </summary>
          <div className="flex flex-col gap-1 pt-1">{sec.map(pinta)}</div>
        </details>
      )}
      {pegar && campos.length > 0 && (
        abrirPegar ? (
          <div className="mt-1 flex flex-col gap-1.5 rounded-sm border border-border p-2">
            <span className="text-sm text-fg-2">Pega el texto (por ejemplo, un mensaje con las medidas). Se reconocen las líneas «Nombre del campo: valor».</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="w-full rounded-sm border border-border bg-bg p-2 text-base" aria-label="Texto a pegar" />
            {propuesta.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
                {propuesta.map((p) => <li key={p.c.clave}><span className="text-fg-3">{p.c.etiqueta}:</span> <b className="font-medium">{p.v}</b>{valores[p.c.clave] && valores[p.c.clave] !== p.v ? <span className="text-warn-fg"> (sustituye «{valores[p.c.clave]}»)</span> : null}</li>)}
              </ul>
            )}
            <div className="flex gap-1.5">
              <button type="button" disabled={!propuesta.length} onClick={() => { propuesta.forEach((p) => onCambio(p.c.clave, p.v)); setTexto(''); setAbrirPegar(false) }}
                className="h-7 rounded-sm bg-inverted px-2.5 text-inverted-fg disabled:opacity-50">Rellenar {propuesta.length || ''}</button>
              <button type="button" onClick={() => { setTexto(''); setAbrirPegar(false) }} className="h-7 px-2 text-fg-2">Cancelar</button>
            </div>
          </div>
        ) : <button type="button" onClick={() => setAbrirPegar(true)} className="self-start text-sm text-fg-3 hover:text-fg">Pegar datos desde un texto…</button>
      )}
    </div>
  )
}

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
/** «Pecho: 92», «cintura 70 cm», «Largo manga - 60»: el campo cuya etiqueta abre la línea (la más larga que encaje). */
export function leerPegado(texto: string, campos: Campo[]): { c: Campo; v: string }[] {
  const out = new Map<string, { c: Campo; v: string }>()
  const orden = [...campos].sort((a, b) => b.etiqueta.length - a.etiqueta.length)
  const empiezaCampo = (t: string) => { const n = sinTildes(t); return orden.some((x) => { const e = sinTildes(x.etiqueta); return e && (n === e || n.startsWith(e + ' ')) }) }
  // Líneas y «;»; las comas solo separan si lo siguiente empieza por el nombre de un campo
  const trozos: string[] = []
  for (const linea of texto.split(/[\n;]+/)) {
    for (const parte of linea.split(/,(?!\d)/)) {
      if (trozos.length && !empiezaCampo(parte) && linea.includes(trozos[trozos.length - 1].trim())) trozos[trozos.length - 1] += ',' + parte
      else trozos.push(parte)
    }
  }
  for (const trozo of trozos) {
    const l = trozo.trim()
    if (!l) continue
    const n = sinTildes(l)
    const c = orden.find((x) => { const e = sinTildes(x.etiqueta); return e && (n === e || n.startsWith(e + ' ')) })
    if (!c || out.has(c.clave)) continue
    let v = l.slice(l.search(/[:=\-–]/) + 1 || 0).trim()
    if (!/[:=\-–]/.test(l)) v = l.split(/\s+/).slice(c.etiqueta.trim().split(/\s+/).length).join(' ')
    if (c.tipo === 'numero') { const m = v.match(/-?\d+(?:[.,]\d+)?/); if (!m) continue; const n2 = leerNumero(m[0]); if (n2 == null) continue; v = String(n2) }
    if (c.tipo === 'opcion') { const op = (c.opciones ?? []).find((o) => sinTildes(o) === sinTildes(v)); if (!op) continue; v = op }
    if (v) out.set(c.clave, { c, v })
  }
  return [...out.values()]
}

/** Campos en modo lectura: destacados arriba en grande, secundarios plegados. `soloRellenos` oculta los vacíos. */
export function CamposVista({ campos, datos, soloRellenos, extra }: {
  campos: Campo[]; datos: Record<string, unknown> | null | undefined; soloRellenos?: boolean
  /** Algo junto al valor de cada campo (p. ej. la nota 💬) */
  extra?: (c: Campo) => React.ReactNode
}) {
  const vis = campos.filter((c) => !soloRellenos || (datos?.[c.clave] != null && datos?.[c.clave] !== ''))
  const dest = vis.filter((c) => c.destacado)
  const normales = vis.filter((c) => !c.destacado && !c.secundario)
  const sec = vis.filter((c) => c.secundario && !c.destacado)
  const valor = (c: Campo) => {
    const t = formatearValor(c, datos?.[c.clave])
    // Un enlace (p. ej. a la ficha de medidas en otro sitio) se puede abrir
    return /^https?:\/\/\S+$/.test(t)
      ? <a href={t} target="_blank" rel="noopener noreferrer" className="break-all underline decoration-border-strong underline-offset-2 hover:decoration-fg">{t}</a>
      : t
  }
  const fila = (c: Campo, grande?: boolean) => (
    <Field key={c.clave} label={c.etiqueta} className="group/campo">
      <span className="inline-flex max-w-full items-start gap-1">
        {grande ? <span className="text-md font-semibold">{valor(c)}</span> : <span className="min-w-0">{valor(c)}</span>}
        {extra?.(c)}
      </span>
    </Field>
  )
  return (
    <>
      {dest.map((c) => fila(c, true))}
      {normales.map((c) => fila(c))}
      {sec.length > 0 && (
        <details className="group">
          <summary className="flex h-7 cursor-pointer list-none items-center gap-1 text-sm text-fg-3 hover:text-fg">
            <span className="transition-transform group-open:rotate-90">▸</span> Más datos ({sec.length})
          </summary>
          {sec.map((c) => fila(c))}
        </details>
      )}
    </>
  )
}

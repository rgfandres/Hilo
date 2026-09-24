import { plantillas } from '@/data/config'
import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { ajustesFicha, subirFoto } from '@/data/catalogos'
import { guardarTienda } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { Button, FormRow, Input, Select } from '@/ui'
import { ROLES, VOCAB_DEFECTO, ayudaRoles, generoAuto, generosDe, gramatica, rolesDe, vocabDe, type ClaveVocab, type Genero, type Vocab } from '@/lib/vocab'
import { Link } from 'react-router-dom'
import { Avanzado, BarraGuardar, Info, Interruptor, Pagina } from './Ajustes'

const PALABRAS: { k: ClaveVocab; kp: keyof Vocab; ayuda: string }[] = [
  { k: 'encargo', kp: 'encargos', ayuda: 'Lo que la tienda hace por encargo' },
  { k: 'cliente', kp: 'clientes', ayuda: 'Quien lo encarga' },
  { k: 'producto', kp: 'productos', ayuda: 'Lo que se ofrece (catálogo)' },
  { k: 'proveedor', kp: 'proveedores', ayuda: 'Quien fabrica o transforma fuera' },
  { k: 'material', kp: 'materiales', ayuda: 'Lo que se gasta en cada encargo (si usas el módulo)' },
]
const ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Lima', 'America/New_York']
const COLORES = ['#333333', '#1F3A5F', '#2B4C9B', '#5A3E96', '#9C1049', '#C2185B', '#A32E24', '#8A5A00', '#1E6B3C', '#0F766E']

/**
 * Formulario común de los ajustes que viven en tienda.ajustes. Cada página enseña solo su parte,
 * pero se guarda todo junto (lo que no se ve se guarda tal cual estaba).
 */
function useFormTienda() {
  const { tienda, recargar } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const inicial = React.useMemo(() => ({
    nombre: tienda?.nombre ?? '',
    color: (aj.color_primario as string) ?? '#333333',
    logo: (aj.logo_url as string) ?? '',
    vocab: vocabDe(aj),
    generos: generosDe(aj, vocabDe(aj)),
    generosFijados: ((aj.vocab_generos ?? {}) as Partial<Record<ClaveVocab, Genero>>),
    roles: rolesDe(aj),
    dias: String(aj.dias_estancado ?? 10),
    atasco: String(aj.dias_atasco_proveedor ?? 15),
    deshacer: String(aj.segundos_deshacer ?? 8),
    toque: String(aj.segundos_doble_toque ?? 3.5),
    pagina: String(aj.tamano_pagina ?? 50),
    reinicia: aj.numeracion_reinicia_por_periodo !== false,
    zona: (aj.zona_horaria as string) ?? 'Europe/Madrid',
    locale: (aj.locale as string) ?? 'es-ES',
    moneda: (aj.moneda as string) ?? 'EUR',
    importe: aj.usar_importe !== false,
    normalizar: aj.normalizar_nombres === true,
    materiales: ((aj.modulos as Record<string, boolean> | undefined)?.materiales) === true,
    unidadMat: String(aj.material_unidad ?? 'm'),
    umbralMat: String(aj.umbral_material_defecto ?? 10),
    porEncargo: String(aj.unidad_por_encargo_max ?? 10),
    umbralResto: String(aj.umbral_resto ?? 5),
    etiqComp: String(aj.etiqueta_complementos ?? 'Complementos'),
    usaComp: ajustesFicha(aj).usaComplementos,
    construcciones: ((aj.tipos_construccion as string[] | undefined) ?? []).join(', '),
    produccion: ((aj.modulos as Record<string, boolean> | undefined)?.produccion) === true,
    logistica: ((aj.modulos as Record<string, boolean> | undefined)?.logistica) === true,
    diasHist: String(aj.logistica_dias_historico ?? 30),
    hojaNombre: String(aj.hoja_nombre ?? 'Hoja de producción'),
    hojaCol: String(aj.hoja_campo_col ?? ''),
    hojaCurva: ((aj.hoja_curva as string[] | undefined) ?? []).join(', '),
    resena: (aj.enlace_resena as string) ?? '',
    prefijo: String(aj.prefijo_telefono ?? '34'),
    verCliente: ((aj.proveedor as Record<string, string> | undefined)?.ver_cliente) ?? 'nombre',
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tienda])
  const [f, setF] = React.useState(inicial)
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [subiendo, setSubiendo] = React.useState(false)
  React.useEffect(() => setF(inicial), [inicial])
  const sucio = JSON.stringify(f) !== JSON.stringify(inicial)
  const AYUDA = ayudaRoles(f.vocab)
  const [camposEnc, setCamposEnc] = React.useState<{ clave: string; etiqueta: string; tipo: string; opciones: string[] }[]>([])
  React.useEffect(() => {
    if (!tienda) return
    plantillas(tienda.id).then((ps) => {
      const m = new Map<string, { clave: string; etiqueta: string; tipo: string; opciones: string[] }>()
      for (const p of ps) if (p.entidad === 'ENCARGO') for (const c of p.campos) if (!m.has(c.clave)) m.set(c.clave, { clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, opciones: c.opciones ?? [] })
      setCamposEnc([...m.values()])
    }).catch(() => {})
  }, [tienda])

  async function guardar() {
    if (!tienda) return
    if (!f.nombre.trim()) { setErr('La tienda necesita un nombre'); return }
    const dias = parseInt(f.dias, 10)
    if (!(dias >= 1 && dias <= 365)) { setErr('Los días para «estancado» deben estar entre 1 y 365'); return }
    const atasco = parseInt(f.atasco, 10)
    if (!(atasco >= 1 && atasco <= 365)) { setErr('Los días para «atascado» deben estar entre 1 y 365'); return }
    const deshacer = parseInt(f.deshacer, 10), toque = Number(f.toque.replace(',', '.')), pagina = parseInt(f.pagina, 10)
    if (!(deshacer >= 3 && deshacer <= 60)) { setErr('El tiempo para deshacer debe estar entre 3 y 60 segundos'); return }
    if (!(toque >= 1 && toque <= 10)) { setErr('El doble toque debe estar entre 1 y 10 segundos'); return }
    if (!(pagina >= 10 && pagina <= 500)) { setErr('Las filas por página deben estar entre 10 y 500'); return }
    if (f.resena.trim() && !/^https:\/\/[^\s]+\.[^\s]+/.test(f.resena.trim())) { setErr('El enlace de reseña debe empezar por https:// (cópialo de tu ficha de Google o similar)'); return }
    // Números de materiales y logística: sin texto ni negativos
    const numOk = (s: string, min = 0) => { const t = s.trim().replace(',', '.'); return t === '' || (Number.isFinite(Number(t)) && Number(t) >= min) }
    if (f.materiales && !numOk(f.umbralMat)) { setErr('El umbral de material debe ser un número (0 o más)'); return }
    if (f.materiales && !numOk(f.porEncargo)) { setErr(`«Pedido por ${f.vocab.encargo.toLowerCase()}» debe ser un número (0 o más)`); return }
    if (f.materiales && !numOk(f.umbralResto)) { setErr('El umbral de resto debe ser un número (0 o más)'); return }
    if (f.logistica && !(numOk(f.diasHist, 1) && /^\d*$/.test(f.diasHist.trim()))) { setErr('El histórico de logística debe ser un número entero de días (1 o más)'); return }
    // Nombres de rol: ni vacíos ni repetidos; moneda: código de 3 letras (EUR, USD…)
    const nombresR = Object.values(f.roles).map((v) => v.trim().toLowerCase())
    if (nombresR.some((v) => !v)) { setErr('Ningún rol puede quedar sin nombre'); return }
    if (new Set(nombresR).size !== nombresR.length) { setErr('Dos roles no pueden llamarse igual'); return }
    const mon = f.moneda.trim().toUpperCase().replace('€', 'EUR').replace('$', 'USD') || 'EUR'
    try { if (!/^[A-Z]{3}$/.test(mon)) throw 0; new Intl.NumberFormat('es-ES', { style: 'currency', currency: mon }) } catch { setErr('La moneda va con su código de 3 letras: EUR, USD, MXN…'); return }
    const vacias = Object.entries(f.vocab).filter(([, v]) => !v.trim())
    if (vacias.length) { setErr('Ninguna palabra del vocabulario puede quedar vacía'); return }
    setBusy(true); setErr(null); setOk(null)
    try {
      await guardarTienda(tienda.id, f.nombre.trim(), {
        ...aj,
        color_primario: f.color,
        logo_url: f.logo || null,
        vocab: Object.fromEntries(Object.entries(f.vocab).map(([k, v]) => [k, v.trim()])),
        vocab_generos: f.generosFijados,
        roles: Object.fromEntries(Object.entries(f.roles).map(([k, v]) => [k, v.trim() || k])),
        dias_estancado: dias,
        dias_atasco_proveedor: atasco,
        segundos_deshacer: deshacer,
        segundos_doble_toque: toque,
        tamano_pagina: pagina,
        numeracion_reinicia_por_periodo: f.reinicia,
        zona_horaria: f.zona,
        locale: f.locale,
        moneda: mon || 'EUR',
        usar_importe: f.importe,
        normalizar_nombres: f.normalizar,
        modulos: { ...((aj.modulos as object) ?? {}), materiales: f.materiales, produccion: f.produccion, logistica: f.logistica },
        logistica_dias_historico: Math.max(1, parseInt(f.diasHist, 10) || 30),
        hoja_nombre: f.hojaNombre.trim() || 'Hoja de producción',
        hoja_campo_col: f.hojaCol || null,
        hoja_col_etiqueta: camposEnc.find((c) => c.clave === f.hojaCol)?.etiqueta ?? null,
        hoja_curva: f.hojaCurva.split(',').map((x) => x.trim()).filter(Boolean),
        material_unidad: f.unidadMat.trim() || 'm',
        umbral_material_defecto: Number(f.umbralMat.replace(',', '.')) || 0,
        unidad_por_encargo_max: Number(f.porEncargo.replace(',', '.')) || 0,
        umbral_resto: Number(f.umbralResto.replace(',', '.')) || 0,
        etiqueta_complementos: f.etiqComp.trim() || 'Complementos',
        usar_complementos: f.usaComp,
        tipos_construccion: [...new Set(f.construcciones.split(',').map((x) => x.trim()).filter(Boolean))],
        enlace_resena: f.resena.trim() || null,
        prefijo_telefono: f.prefijo.replace(/\D/g, '') || '34',
        proveedor: { ...((aj.proveedor as object) ?? {}), ver_cliente: f.verCliente },
      })
      await recargar()
      setOk('Guardado')
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  const setVocab = (k: keyof Vocab, v: string) => setF((s) => {
    const vocab = { ...s.vocab, [k]: v }
    return { ...s, vocab, generos: { ...s.generos, ...(k in s.generos && !s.generosFijados[k as ClaveVocab] ? { [k]: generoAuto(v) } : {}) } }
  })
  const setGenero = (k: ClaveVocab, g: Genero) => setF((s) => ({ ...s, generos: { ...s.generos, [k]: g }, generosFijados: { ...s.generosFijados, [k]: g } }))
  return { tienda, aj, inicial, f, setF, ok, err, setErr, busy, subiendo, setSubiendo, sucio, AYUDA, camposEnc, guardar, setVocab, setGenero }
}
type FT = ReturnType<typeof useFormTienda>
const Pie = ({ t }: { t: FT }) => <BarraGuardar sucio={t.sucio} busy={t.busy} ok={t.ok} err={t.err} onGuardar={t.guardar} onDescartar={() => { t.setF(t.inicial); t.setErr(null) }} />

/** Ajustes → Datos de la tienda */
export function AjustesTienda() {
  const t = useFormTienda()
  const { tienda, f, setF, setErr, subiendo, setSubiendo } = t
  return (
    <>
      <Pagina titulo="Datos de la tienda" ayuda="Nombre, color y logo que se ven en la app y en lo que imprimes." mas="El color se usa en el logo mientras no subas uno. El enlace de reseña se ofrece al cliente al entregar (Google, redes…)." />
        <div className="flex flex-col gap-1">
          <FormRow label="Nombre"><Input className="h-7" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></FormRow>
          <FormRow label="Color">
            <div className="flex flex-wrap items-center gap-1.5">
              {COLORES.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, color: c })}
                  className="h-5 w-5 rounded-sm ring-offset-2 ring-offset-bg" style={{ background: c, boxShadow: f.color === c ? '0 0 0 2px #fff, 0 0 0 4px #333' : undefined }} />
              ))}
              <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-5 w-7 cursor-pointer rounded-sm border border-border bg-bg" title="Otro color" />
            </div>
          </FormRow>
          <FormRow label="Logo" ayuda="Mejor cuadrado o apaisado, con fondo claro.">
            <div className="flex flex-wrap items-center gap-2">
              {f.logo
                ? <img src={f.logo} alt="Logo" className="h-10 max-w-[160px] rounded-sm border border-border object-contain p-0.5" onError={() => setErr('El logo no carga: súbelo de nuevo')} />
                : <span className="text-fg-3">Sin logo (se usa el color)</span>}
              <label className="inline-flex h-7 cursor-pointer items-center rounded-sm border border-border px-2.5 hover:bg-bg-3">
                {subiendo ? 'Subiendo…' : f.logo ? 'Cambiar' : 'Subir imagen'}
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; e.target.value = ''
                  if (!file || !tienda) return
                  setSubiendo(true); setErr(null)
                  try { const url = await subirFoto(tienda.id, file); setF((s) => ({ ...s, logo: url })) }
                  catch (x) { setErr(mensajeError(x)) } finally { setSubiendo(false) }
                }} />
              </label>
              {f.logo && <Button variant="ghost" size="sm" onClick={() => setF({ ...f, logo: '' })}>Quitar</Button>}
            </div>
          </FormRow>
                  <FormRow label="Enlace de reseña">
            <Input className="h-7" type="url" placeholder="https://… (se ofrece al entregar)" value={f.resena} onChange={(e) => setF({ ...f, resena: e.target.value })} />
          </FormRow>
        </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Idioma y región */
export function AjustesRegion() {
  const t = useFormTienda()
  const { f, setF } = t
  return (
    <>
      <Pagina titulo="Idioma y región" ayuda="Cómo se escriben fechas, horas, precios y teléfonos." />
      <div className="flex flex-col gap-1">
          <FormRow label="Formato" ayuda={`Cómo se escriben fechas y números: hoy es ${new Date().toLocaleDateString(f.locale, { day: 'numeric', month: 'long', year: 'numeric' })}; un número, ${(1234.5).toLocaleString(f.locale)}`}>
            <Select className="w-[260px]" value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })}>
              {[['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['es-AR', 'Español (Argentina)'], ['es-CO', 'Español (Colombia)'], ['es-CL', 'Español (Chile)'],
                ['ca-ES', 'Català'], ['gl-ES', 'Galego'], ['eu-ES', 'Euskara'], ['pt-PT', 'Português (Portugal)'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)']]
                .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Zona horaria">
            <Select className="w-[260px]" value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })}>
              {[...new Set([f.zona, ...ZONAS])].map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Moneda"><Input className="h-7 w-20" value={f.moneda} maxLength={3} onChange={(e) => setF({ ...f, moneda: e.target.value })} /></FormRow>
          <FormRow label="Prefijo del país">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-fg-3">+</span>
              <Input className="h-7 w-20" inputMode="numeric" value={f.prefijo} onChange={(e) => setF({ ...f, prefijo: e.target.value })} />
              <span className="text-fg-3">se añade a los teléfonos sin prefijo al abrir WhatsApp</span>
            </div>
          </FormRow>
      </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Cómo lo llamáis (vocabulario) */
export function AjustesPalabras() {
  const t = useFormTienda()
  const { f, setVocab, setGenero } = t
  return (
    <>
      <Pagina titulo="Cómo lo llamáis" ayuda="Las palabras de tu negocio: la app las usa en menús, botones y mensajes." mas="Si en tu tienda decís «pedido» en vez de «encargo», cámbialo aquí y toda la app lo dirá así. «Se dice» sirve para que las frases salgan bien (el / la)." />
        <div className="grid grid-cols-[1fr_1fr_1fr_80px] items-center gap-x-3 gap-y-1.5">
          <span className="text-sm text-fg-3">Qué es</span><span className="text-sm text-fg-3">Singular</span><span className="text-sm text-fg-3">Plural</span><span className="text-sm text-fg-3">Se dice</span>
          {PALABRAS.map((p) => (
            <React.Fragment key={p.k}>
              <span className="text-fg-2">{p.ayuda}</span>
              <Input className="h-7" value={f.vocab[p.k]} placeholder={VOCAB_DEFECTO[p.k]} onChange={(e) => setVocab(p.k, e.target.value)} />
              <Input className="h-7" value={f.vocab[p.kp]} placeholder={VOCAB_DEFECTO[p.kp]} onChange={(e) => setVocab(p.kp, e.target.value)} />
              <Select value={f.generos[p.k]} onChange={(e) => setGenero(p.k, e.target.value as Genero)} aria-label={`Género de ${f.vocab[p.k]}`}>
                <option value="m">el</option><option value="f">la</option>
              </Select>
            </React.Fragment>
          ))}
        </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Nombres de los papeles (roles) */
export function AjustesPapeles() {
  const t = useFormTienda()
  const { f, setF, AYUDA } = t
  return (
    <>
      <Pagina titulo="Nombres de los papeles" ayuda="Cómo llamáis a cada papel del equipo. Cambiar el nombre no cambia lo que puede hacer." />
        <div className="flex flex-col gap-1">
          {ROLES.map((r) => (
            <FormRow key={r} label={r === 'ADMIN' ? 'Administración' : r === 'OPERATIVO' ? 'Operativo' : r === 'ATENCION' ? 'Atención' : 'Logística'}>
              <div className="flex items-center gap-3">
                <Input className="h-7 w-[200px]" value={f.roles[r]} onChange={(e) => setF({ ...f, roles: { ...f.roles, [r]: e.target.value } })} />
                <span className="truncate text-sm text-fg-3">{AYUDA[r]}</span>
              </div>
            </FormRow>
          ))}
        </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Avisos y reglas */
export function AjustesReglas() {
  const t = useFormTienda()
  const { f, setF } = t
  return (
    <>
      <Pagina titulo="Avisos y reglas" ayuda="Cuándo algo se da por parado y pasa a «Revisar», y cómo se numera." />
      <div className="flex flex-col gap-1">
          <FormRow label="Estancado">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-7 w-20" type="number" min={1} max={365} value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} />
              <span className="text-fg-3">días sin cambios → pasa a «Revisar»</span>
            </div>
          </FormRow>
          <FormRow label="Atascado">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-7 w-20" type="number" min={1} max={365} value={f.atasco} onChange={(e) => setF({ ...f, atasco: e.target.value })} />
              <span className="text-fg-3">días en una etapa de espera (p. ej. fuera, en {f.vocab.proveedor.toLowerCase()}) → pasa a «Revisar»</span>
            </div>
          </FormRow>
          <FormRow label="Numeración">
            <Interruptor checked={f.reinicia} onChange={(v) => setF({ ...f, reinicia: v })} label="Empieza en 001 en cada periodo" />
          </FormRow>
          <FormRow label="Nombres" ayuda="Se aplica a lo nuevo y a lo que se edite. Buscar ignora las tildes siempre.">
            <Interruptor checked={f.normalizar} onChange={(v) => setF({ ...f, normalizar: v })} label="Guardar en mayúsculas y sin tildes" />
          </FormRow>
      </div>
      <Avanzado resumen="Deshacer, doble toque y filas por página">
        <div className="flex flex-col gap-1">
          <FormRow label="Deshacer">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-7 w-20" type="number" min={3} max={60} value={f.deshacer} onChange={(e) => setF({ ...f, deshacer: e.target.value })} />
              <span className="text-fg-3">segundos para deshacer un paso</span>
            </div>
          </FormRow>
          <FormRow label="Doble toque">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-7 w-20" inputMode="decimal" value={f.toque} onChange={(e) => setF({ ...f, toque: e.target.value })} />
              <span className="text-fg-3">segundos que espera el segundo toque en el móvil</span>
            </div>
          </FormRow>
          <FormRow label="Filas por página">
            <Input className="h-7 w-20" type="number" min={10} max={500} value={f.pagina} onChange={(e) => setF({ ...f, pagina: e.target.value })} />
          </FormRow>
        </div>
      </Avanzado>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Módulos → Materiales */
export function AjustesMateriales() {
  const t = useFormTienda()
  const { f, setF } = t
  return (
    <>
      <Pagina titulo={f.vocab.materiales} ayuda="Cómo se cuenta y cuándo avisa de pedir." />
      {!f.materiales && <Apagado />}
        <div className="flex flex-col gap-1">
          {f.materiales && <>
            <FormRow label="Unidad" ayuda="Cómo se cuenta: m, uds, kg…"><Input className="h-7 w-20" value={f.unidadMat} maxLength={6} onChange={(e) => setF({ ...f, unidadMat: e.target.value })} /></FormRow>
            <FormRow label="Umbral por defecto" ayuda="Por debajo de esto se avisa de pedir (cada material puede tener el suyo)."><Input className="h-7 w-20" inputMode="decimal" value={f.umbralMat} onChange={(e) => setF({ ...f, umbralMat: e.target.value })} /></FormRow>
            <FormRow label={`Pedido por ${f.vocab.encargo.toLowerCase()}`} ayuda={`Si la unidad de pedido es esta o menos, se pide una unidad por ${f.vocab.encargo.toLowerCase()} y se consume entera al recibirla.`}><Input className="h-7 w-20" inputMode="decimal" value={f.porEncargo} onChange={(e) => setF({ ...f, porEncargo: e.target.value })} /></FormRow>
            <FormRow label="Restos hasta" ayuda="Si lo que queda no llega a una unidad de pedido y es esto o menos, se ofrece guardarlo como resto."><Input className="h-7 w-20" inputMode="decimal" value={f.umbralResto} onChange={(e) => setF({ ...f, umbralResto: e.target.value })} /></FormRow>
          </>}
        </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Módulos → Hoja de producción */
export function AjustesHoja() {
  const t = useFormTienda()
  const { f, setF, camposEnc } = t
  return (
    <>
      <Pagina titulo={f.hojaNombre || 'Hoja de producción'} ayuda={`Hoja con los ${f.vocab.encargos.toLowerCase()} para enviar a quien los fabrica. Qué etapa la envía se elige en Tipos y etapas.`} />
      {!f.produccion && <Apagado />}
        <div className="flex flex-col gap-1">
          {f.produccion && <>
            <FormRow label="Nombre"><Input className="h-7 w-[260px]" value={f.hojaNombre} onChange={(e) => setF({ ...f, hojaNombre: e.target.value })} /></FormRow>
            <FormRow label="Campo en columnas" ayuda="Si lo eliges, la hoja marca el valor de cada línea en columnas (una por valor).">
              <Select className="w-[260px]" value={f.hojaCol} onChange={(e) => setF({ ...f, hojaCol: e.target.value })}>
                <option value="">— ninguno —</option>
                {camposEnc.filter((c) => c.tipo === 'opcion' || c.clave === f.hojaCol).map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}{c.tipo !== 'opcion' ? ' (no es de opción)' : ''}</option>)}
              </Select>
            </FormRow>
            {camposEnc.length > 0 && !camposEnc.some((c) => c.tipo === 'opcion') && <span className="pl-[128px] text-sm text-fg-3 max-md:pl-0">Solo valen campos de opción (Ajustes → Datos que guardáis).</span>}
            {f.hojaCol && (() => {
              const col = camposEnc.find((c) => c.clave === f.hojaCol)
              const elegidas = f.hojaCurva.split(',').map((x) => x.trim()).filter(Boolean)
              if (!col?.opciones.length) return <FormRow label="Valores de las columnas" ayuda="Separados por comas, en orden. Vacío = se escribe el valor tal cual."><Input className="h-7" value={f.hojaCurva} placeholder="Por ejemplo: A, B, C…" onChange={(e) => setF({ ...f, hojaCurva: e.target.value })} /></FormRow>
              return (
                <FormRow label="Columnas" ayuda="Las opciones que salen como columna, en el orden del campo. Ninguna marcada = una sola columna con el valor escrito.">
                  <div className="flex flex-wrap gap-1">
                    {col.opciones.map((o) => {
                      const on = elegidas.includes(o)
                      return <button key={o} type="button" aria-pressed={on}
                        onClick={() => { const n = on ? elegidas.filter((x) => x !== o) : col.opciones.filter((x) => x === o || elegidas.includes(x)); setF({ ...f, hojaCurva: n.join(', ') }) }}
                        className={`h-7 rounded-sm border px-2 text-sm ${on ? 'border-gray-12 bg-bg-4 font-medium' : 'border-border text-fg-2'}`}>{o}</button>
                    })}
                  </div>
                </FormRow>
              )
            })()}
          </>}
        </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Módulos → Logística */
export function AjustesLogistica() {
  const t = useFormTienda()
  const { f, setF } = t
  return (
    <>
      <Pagina titulo={`Pantalla de ${f.roles.LOGISTICA}`} ayuda={`Sus tareas son las etapas que marca «${f.roles.LOGISTICA}» en Tipos y etapas.`} />
      {!f.logistica && <Apagado />}
        <div className="flex flex-col gap-1">
          {f.logistica && <FormRow label="Histórico (días)" ayuda="Cuántos días atrás se ve lo ya hecho."><Input className="h-7 w-20" inputMode="numeric" value={f.diasHist} onChange={(e) => setF({ ...f, diasHist: e.target.value })} /></FormRow>}
        </div>
      <Pie t={t} />
    </>
  )
}

/** Ajustes → Módulos → Ficha técnica y complementos */
export function AjustesFichaTecnica() {
  const t = useFormTienda()
  const { f, setF } = t
  return (
    <>
      <Pagina titulo="Ficha técnica" ayuda={`Lo que lleva cada ${f.vocab.producto.toLowerCase()} y los extras que se añaden a ${gramatica(f.vocab, f.generos).con('encargo', 'un')}.`} />
        <div className="flex flex-col gap-1">
          <FormRow label="Tipos de elaboración" ayuda="Separados por comas (a medida, de serie…). Vacío = no se pregunta."><Input className="h-7" value={f.construcciones} placeholder="Por ejemplo: A medida, Estándar" onChange={(e) => setF({ ...f, construcciones: e.target.value })} /></FormRow>
          <FormRow label="Complementos" ayuda={`Lo que se añade a cada ${f.vocab.encargo.toLowerCase()} (acabados, extras…): un campo de texto en el alta y en la ficha.`}><Interruptor checked={f.usaComp} onChange={(v) => setF({ ...f, usaComp: v })} label="Usar complementos" /></FormRow>
          {f.usaComp && <FormRow label="Cómo los llamáis"><Input className="h-7 w-[220px]" value={f.etiqComp} onChange={(e) => setF({ ...f, etiqComp: e.target.value })} /></FormRow>}
        </div>
      <Pie t={t} />
    </>
  )
}

const Apagado = () => (
  <p className="m-0 rounded-sm bg-warn-bg px-2.5 py-1.5 text-sm text-warn-fg">Este módulo está apagado. <Link to="/ajustes/modulos" className="underline">Actívalo en Módulos</Link>.</p>
)

/** Tarjeta de un módulo: nombre, «i» con la explicación larga, interruptor y una línea. */
function Modulo({ nombre, linea, info, on, onChange, config, aviso }: {
  nombre: string; linea: string; info: string; on?: boolean; onChange?: (v: boolean) => void; config?: string; aviso?: string
}) {
  const siempre = onChange === undefined
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-bg p-3.5">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{nombre}</span>
        <Info titulo={nombre}>{info}</Info>
        <span className="flex-1" />
        {!siempre && <Interruptor checked={!!on} onChange={onChange} />}
      </div>
      <p className="m-0 text-fg-2">{linea}</p>
      {aviso && <p className="m-0 text-sm text-warn-fg">{aviso}</p>}
      <div className="mt-auto pt-1 text-sm">
        {config && (siempre || on)
          ? <Link to={config} className="text-fg-2 underline underline-offset-2 hover:text-fg">Configurar</Link>
          : !siempre && <span className="text-fg-3">{on ? 'Activo' : 'Apagado'}</span>}
      </div>
    </div>
  )
}

/** Ajustes → Módulos: encender y apagar lo opcional. Apagar no borra datos. */
export function AjustesModulos() {
  const t = useFormTienda()
  const { f, setF, inicial } = t
  const v = f.vocab, g = gramatica(f.vocab, f.generos)
  const m = (s: string) => s.toLowerCase()
  return (
    <>
      <Pagina titulo="Módulos" ayuda="Enciende solo lo que uses. Apagar un módulo no borra nada." mas="Cada módulo añade pantallas o datos a la app. Si lo apagas, desaparecen de la vista pero lo guardado se conserva: al volver a encenderlo, todo sigue ahí. Pulsa la «i» de cada uno para ver qué hace." />
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Modulo nombre="Cobros" on={f.importe} onChange={(x) => setF({ ...f, importe: x })}
          linea="Apunta el precio, lo pagado a cuenta y lo que falta por cobrar."
          info={`Cada ${m(v.encargo)} tendrá su importe y lo entregado a cuenta. Verás lo pendiente de cobro, podrás filtrar por ello y saldrá en Informes.`} />
        <Modulo nombre={v.materiales} on={f.materiales} onChange={(x) => setF({ ...f, materiales: x })} config="/ajustes/materiales"
          linea={`Controla ${g.con('material', 'el')} que tienes y lo que pides a ${m(v.proveedores)}.`}
          info={`Catálogo de ${m(v.materiales)} con su stock, aviso cuando queda poco, pedidos a ${m(v.proveedores)}, lo que gasta cada ${m(v.encargo)} y los restos que sobran.`}
          aviso={!f.materiales && inicial.materiales ? `Al apagarlo, las etapas dejan de exigir «tener ${m(v.material)} recibido» (se conserva por si lo vuelves a encender).` : undefined} />
        <Modulo nombre={f.hojaNombre || 'Hoja de producción'} on={f.produccion} onChange={(x) => setF({ ...f, produccion: x })} config="/ajustes/hoja"
          linea={`Hoja con los ${m(v.encargos)} para enviar a quien los fabrica o prepara.`}
          info={`Junta por ${m(v.producto)} los ${m(v.encargos)} que una etapa manda a producción, lista para imprimir o enviar a quien los fabrica o prepara (${m(v.proveedor)}, equipo de producción…). Qué etapa la envía se elige en Tipos y etapas.`} />
        <Modulo nombre="Logística" on={f.logistica} onChange={(x) => setF({ ...f, logistica: x })} config="/ajustes/logistica"
          linea={`Pantalla para quien hace los recados: recoger ${m(v.material)}, llevar y traer de ${m(v.proveedores)}.`}
          info={`Para la persona de tu equipo que se mueve fuera de la tienda (papel «${f.roles.LOGISTICA}»). Ve en el móvil qué tiene que recoger o llevar y a dónde, y marca cuándo lo ha hecho. Sus tareas son las etapas que marca «${f.roles.LOGISTICA}» en Tipos y etapas. No puede escribir a los clientes.`} />
        <Modulo nombre="Guía de medidas" config="/ajustes/guia"
          linea={`Sugiere un valor a partir de las medidas ${g.con('cliente', 'del')}.`}
          info={`Una tabla de referencia: al apuntar las medidas ${g.con('cliente', 'del')}, la app propone el valor que mejor encaja y avisa si alguna medida se sale. Se activa y se rellena dentro de su página.`} />
        <Modulo nombre="Ficha técnica y complementos" config="/ajustes/ficha-tecnica"
          linea={`Datos técnicos de cada ${m(v.producto)} y extras que se añaden.`}
          info={`Lo que lleva cada ${m(v.producto)} (${m(v.material)}, consumo, elaboración) y los complementos que se añaden a ${g.con('encargo', 'un')} (acabados, extras…).`} />
      </div>
      <Pie t={t} />
    </>
  )
}

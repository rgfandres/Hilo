import { leerNumero, plantillas } from '@/data/config'
import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { ajustesFicha, subirFoto } from '@/data/catalogos'
import { actualizarTipo, guardarTienda, listarEtapasDe, listarPuertas, listarTipos, renombrarEtapa, type PuertaDef, type TipoEncargo } from '@/data/ajustes'
import { PANTALLAS, menuPorDefecto, type Pantalla } from '@/lib/pantallas'
import { ajustesHoja } from '@/data/produccion'
import { ajustesLogistica, bandejasLogistica, type ConfigBandeja, type ConfigLogistica } from '@/data/logistica'
import { listarEtapas } from '@/data/encargos'
import type { Etapa } from '@/lib/types'
import { mensajeError } from '@/data/encargos'
import { Button, FormRow, Input, Select } from '@/ui'
import { ROLES, ROLES_DEFECTO, VOCAB_DEFECTO, ayudaRoles, generoAuto, generosDe, gramatica, rolesDe, vocabDe, type ClaveVocab, type Genero, type Vocab } from '@/lib/vocab'
import { Link } from 'react-router-dom'
import { Avanzado, BarraGuardar, Bloque, FilaForm, Info, Interruptor, ListaTextos, Pagina } from './Ajustes'

const PALABRAS: { k: ClaveVocab; kp: keyof Vocab; ayuda: string }[] = [
  { k: 'encargo', kp: 'encargos', ayuda: 'Lo que la tienda hace por encargo' },
  { k: 'cliente', kp: 'clientes', ayuda: 'Quien lo encarga' },
  { k: 'producto', kp: 'productos', ayuda: 'Lo que se ofrece (catálogo)' },
  { k: 'proveedor', kp: 'proveedores', ayuda: 'Quien fabrica o transforma fuera' },
  { k: 'material', kp: 'materiales', ayuda: 'Lo que se gasta en cada encargo (si usas el módulo)' },
]
const ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Lima', 'America/New_York']
const COLORES = ['#333333', '#1F3A5F', '#2B4C9B', '#5A3E96', '#9C1049', '#C2185B', '#A32E24', '#8A5A00', '#1E6B3C', '#0F766E']

const limpia = (xs: string[]) => [...new Map(xs.map((x) => x.trim()).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()]

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
    estPasos: aj.estancado_por === 'pasos',
    estEspera: aj.estancado_en_espera === true,
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
    fichaPorEncargo: aj.cliente_por_encargo === true,
    materiales: ((aj.modulos as Record<string, boolean> | undefined)?.materiales) === true,
    unidadMat: String(aj.material_unidad ?? 'uds'),
    umbralMat: String(aj.umbral_material_defecto ?? 0),
    menuPedidos: aj.material_menu_pedidos === true,
    contadorMat: String(aj.material_contador ?? 'pedir'),
    pedirMat: aj.material_pedir === 'falta' ? 'falta' : 'umbral',
    etiqComp: String(aj.etiqueta_complementos ?? 'Complementos'),
    usaComp: ajustesFicha(aj).usaComplementos,
    construcciones: (aj.tipos_construccion as string[] | undefined) ?? [],
    produccion: ((aj.modulos as Record<string, boolean> | undefined)?.produccion) === true,
    logistica: ((aj.modulos as Record<string, boolean> | undefined)?.logistica) === true,
    diasHist: String(aj.logistica_dias_historico ?? 30),
    logis: ajustesLogistica(aj).cfg,
    hojaNombre: String(aj.hoja_nombre ?? 'Hoja de producción'),
    hojaCol: String(aj.hoja_campo_col ?? ''),
    hojaCurva: (aj.hoja_curva as string[] | undefined) ?? [],
    impCliente: aj.hoja_imp_cliente !== false,
    impCantidad: aj.hoja_imp_cantidad !== false,
    impNota: aj.hoja_imp_nota !== false,
    impMarca: String(aj.hoja_imp_marca ?? '●'),
    impCabecera: aj.hoja_imp_cabecera === 'producto',
    resena: (aj.enlace_resena as string) ?? '',
    prefijo: String(aj.prefijo_telefono ?? '34'),
    verCliente: ((aj.proveedor as Record<string, string> | undefined)?.ver_cliente) ?? 'nombre',
    menu: ((aj.nombres_menu ?? {}) as Partial<Record<Pantalla, string>>),
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

  async function guardar(despues?: () => Promise<void>) {
    if (!tienda) return
    if (!f.nombre.trim()) { setErr('La tienda necesita un nombre'); return }
    const dias = parseInt(f.dias, 10)
    if (!(dias >= 1 && dias <= 365)) { setErr('Los días para «estancado» deben estar entre 1 y 365'); return }
    const atasco = parseInt(f.atasco, 10)
    if (!(atasco >= 1 && atasco <= 365)) { setErr('Los días para «atascado» deben estar entre 1 y 365'); return }
    const deshacer = parseInt(f.deshacer, 10), toque = leerNumero(f.toque) ?? NaN, pagina = parseInt(f.pagina, 10)
    if (!(deshacer >= 3 && deshacer <= 60)) { setErr('El tiempo para deshacer debe estar entre 3 y 60 segundos'); return }
    if (!(toque >= 1 && toque <= 10)) { setErr('El doble toque debe estar entre 1 y 10 segundos'); return }
    if (!(pagina >= 10 && pagina <= 500)) { setErr('Las filas por página deben estar entre 10 y 500'); return }
    if (f.resena.trim() && !/^https:\/\/[^\s]+\.[^\s]+/.test(f.resena.trim())) { setErr('El enlace de reseña debe empezar por https:// (cópialo de tu ficha de Google o similar)'); return }
    // Números de materiales y logística: sin texto ni negativos
    const numOk = (s: string, min = 0) => { const t = s.trim(); const v = leerNumero(t); return t === '' || (v != null && v >= min) }
    if (f.materiales && !numOk(f.umbralMat)) { setErr('El umbral de material debe ser un número (0 o más)'); return }
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
        estancado_por: f.estPasos ? 'pasos' : null,
        estancado_en_espera: f.estEspera || null,
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
        cliente_por_encargo: f.fichaPorEncargo || null,
        modulos: { ...((aj.modulos as object) ?? {}), materiales: f.materiales, produccion: f.produccion, logistica: f.logistica },
        logistica_dias_historico: Math.max(1, parseInt(f.diasHist, 10) || 30),
        logistica: limpiaLogis(f.logis),
        hoja_nombre: f.hojaNombre.trim() || 'Hoja de producción',
        hoja_campo_col: f.hojaCol || null,
        hoja_col_etiqueta: camposEnc.find((c) => c.clave === f.hojaCol)?.etiqueta ?? null,
        hoja_curva: f.hojaCol ? limpia(f.hojaCurva) : [],
        hoja_imp_cliente: f.impCliente ? null : false,
        hoja_imp_cantidad: f.impCantidad ? null : false,
        hoja_imp_nota: f.impNota ? null : false,
        hoja_imp_marca: f.impMarca === '●' ? null : f.impMarca,
        hoja_imp_cabecera: f.impCabecera ? 'producto' : null,
        material_unidad: f.unidadMat.trim() || 'uds',
        umbral_material_defecto: leerNumero(f.umbralMat) ?? 0,
        material_menu_pedidos: f.menuPedidos,
        material_contador: f.contadorMat === 'pedir' ? null : f.contadorMat,
        material_pedir: f.pedirMat === 'falta' ? 'falta' : null,
        etiqueta_complementos: f.etiqComp.trim() || 'Complementos',
        usar_complementos: f.usaComp,
        tipos_construccion: limpia(f.construcciones),
        enlace_resena: f.resena.trim() || null,
        prefijo_telefono: f.prefijo.replace(/\D/g, '') || '34',
        proveedor: { ...((aj.proveedor as object) ?? {}), ver_cliente: f.verCliente },
        nombres_menu: (() => { const m = Object.fromEntries(Object.entries(f.menu).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v)); return Object.keys(m).length ? m : null })(),
      })
      if (despues) await despues()
      await recargar()
      setOk('Guardado')
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  const setVocab = (k: keyof Vocab, v: string) => setF((s) => {
    const vocab = { ...s.vocab, [k]: v }
    return { ...s, vocab, generos: { ...s.generos, ...(k in s.generos && !s.generosFijados[k as ClaveVocab] ? { [k]: generoAuto(v) } : {}) } }
  })
  const setGenero = (k: ClaveVocab, g: Genero) => setF((s) => ({ ...s, generos: { ...s.generos, [k]: g }, generosFijados: { ...s.generosFijados, [k]: g } }))
  return { tienda, aj, inicial, f, setF, ok, setOk, recargar, err, setErr, busy, subiendo, setSubiendo, sucio, AYUDA, camposEnc, guardar, setVocab, setGenero }
}
type FT = ReturnType<typeof useFormTienda>
const Pie = ({ t }: { t: FT }) => <BarraGuardar sucio={t.sucio} busy={t.busy} ok={t.ok} err={t.err} onGuardar={() => t.guardar()} onDescartar={() => { t.setF(t.inicial); t.setErr(null) }} />

/** Ajustes → Datos de la tienda */
export function AjustesTienda() {
  const t = useFormTienda()
  const { tienda, f, setF, setErr, subiendo, setSubiendo } = t
  return (
    <>
      <Pagina titulo="Datos de la tienda" ayuda="Nombre, color y logo que se ven en la app y en lo que imprimes." mas="El color se usa en el logo mientras no subas uno. El enlace de reseña se ofrece al cliente al entregar (Google, redes…)."
        acciones={<Link to="/ajustes/asistente" className="text-sm text-fg-3 underline underline-offset-2 hover:text-fg">Asistente de configuración</Link>} />
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

/**
 * Ajustes → Nombres: TODO lo que tiene nombre, en una página (palabras, tipos y etapas, papeles y menú).
 * Se cambia escribiendo encima y se guarda de una vez. Al renombrar una etapa, sus bandejas, tarjetas,
 * frases y la pantalla de logística la siguen.
 */
export function AjustesNombres() {
  const t = useFormTienda()
  const { f, setF, setVocab, setGenero, AYUDA, tienda, aj } = t
  const [tipos, setTipos] = React.useState<(TipoEncargo & { etapas: Etapa[] })[]>([])
  const [nomT, setNomT] = React.useState<Record<string, string>>({})
  const [nomE, setNomE] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const ts = (await listarTipos(tienda.id)).filter((x) => x.activo)
    const conEt = await Promise.all(ts.map(async (x) => ({ ...x, etapas: await listarEtapasDe(x.id) })))
    setTipos(conEt); setNomT({}); setNomE({})
  }, [tienda])
  React.useEffect(() => { cargar().catch(() => {}) }, [cargar])
  const cambiosFlujo = Object.keys(nomT).length + Object.keys(nomE).length
  const sucio = t.sucio || cambiosFlujo > 0
  const mod = (k: string) => ((aj.modulos as Record<string, boolean> | undefined)?.[k]) === true
  const defecto = menuPorDefecto({ encargos: f.vocab.encargos, clientes: f.vocab.clientes, productos: f.vocab.productos, proveedores: f.vocab.proveedores,
    materiales: f.vocab.materiales, logistica: 'Logística', hoja: ajustesHoja(aj).nombre })
  const menuVisible = PANTALLAS.filter((p) => p.k !== 'nuevo' && (p.k !== 'logistica' || mod('logistica')) && (p.k !== 'produccion' || mod('produccion'))
    && ((p.k !== 'materiales' && p.k !== 'pedidos') || mod('materiales')))
  const art = (k: ClaveVocab) => (f.generos[k] === 'f' ? 'la' : 'el')

  async function guardarTodo() {
    // Nombres repetidos dentro de un mismo tipo: no
    for (const tp of tipos) {
      const ns = tp.etapas.map((e) => (nomE[e.id] ?? e.nombre).trim().toLowerCase())
      if (ns.some((x) => !x)) { t.setErr(`Hay una etapa sin nombre en «${tp.nombre}»`); return }
      if (new Set(ns).size !== ns.length) { t.setErr(`Dos etapas de «${nomT[tp.id] ?? tp.nombre}» se llaman igual`); return }
      if (nomT[tp.id] != null && !nomT[tp.id].trim()) { t.setErr('Un tipo no puede quedar sin nombre'); return }
    }
    setBusy(true)
    const flujo = async () => {
      if (!tienda) return
      for (const [id, v] of Object.entries(nomT)) await actualizarTipo(id, { nombre: v.trim() })
      for (const [id, v] of Object.entries(nomE)) await renombrarEtapa(tienda.id, id, v)
      await cargar()
    }
    try {
      if (t.sucio) await t.guardar(flujo)
      else { await flujo(); await t.recargar(); t.setOk('Guardado') }
    } catch (x) { t.setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <>
      <Pagina titulo="Nombres" ayuda="Todo lo que tiene nombre en la app, en un solo sitio. Escribe encima y pulsa Guardar." />

      <Bloque titulo="Las palabras de tu negocio" ayuda={`Así se verá: «${f.vocab.encargo} nuev${f.generos.encargo === 'f' ? 'a' : 'o'}», «3 ${f.vocab.encargos.toLowerCase()}», «${art('cliente')} ${f.vocab.cliente.toLowerCase()}», «${art('proveedor')} ${f.vocab.proveedor.toLowerCase()}».`}>
        <div className="grid grid-cols-[1fr_1fr_1fr_70px] items-center gap-x-3 gap-y-1.5 max-md:grid-cols-[1fr_1fr_60px]">
          <span className="text-sm text-fg-3 max-md:hidden">Qué es</span><span className="text-sm text-fg-3">Uno</span><span className="text-sm text-fg-3">Varios</span><span className="text-sm text-fg-3">Se dice</span>
          {PALABRAS.filter((p) => p.k !== 'material' || mod('materiales')).map((p) => (
            <React.Fragment key={p.k}>
              <span className="text-fg-2 max-md:col-span-3 max-md:pt-1 max-md:text-sm">{p.ayuda}</span>
              <Input className="h-7" aria-label={`${p.ayuda}: singular`} value={f.vocab[p.k]} placeholder={VOCAB_DEFECTO[p.k]} onChange={(e) => setVocab(p.k, e.target.value)} />
              <Input className="h-7" aria-label={`${p.ayuda}: plural`} value={f.vocab[p.kp]} placeholder={VOCAB_DEFECTO[p.kp]} onChange={(e) => setVocab(p.kp, e.target.value)} />
              <Select value={f.generos[p.k]} onChange={(e) => setGenero(p.k, e.target.value as Genero)} aria-label={`Género de ${f.vocab[p.k]}`}>
                <option value="m">el</option><option value="f">la</option>
              </Select>
            </React.Fragment>
          ))}
        </div>
      </Bloque>

      <Bloque titulo={`Tipos de ${f.vocab.encargo.toLowerCase()} y sus etapas`} ayuda="El nombre de cada tipo (sale en el menú si tiene menú propio) y el de cada paso. Para añadir, quitar u ordenar etapas: Tipos y etapas.">
        {tipos.map((tp) => (
          <div key={tp.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="w-[70px] shrink-0 text-sm text-fg-3">Tipo</span>
              <Input className="h-7 max-w-[280px] font-medium" aria-label={`Nombre del tipo ${tp.nombre}`} value={nomT[tp.id] ?? tp.nombre}
                onChange={(e) => setNomT((s) => { const n = { ...s }; if (e.target.value === tp.nombre) delete n[tp.id]; else n[tp.id] = e.target.value; return n })} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-[78px] max-md:pl-0">
              {tp.etapas.map((e, i) => (
                <React.Fragment key={e.id}>
                  {i > 0 && <span className="text-fg-3">→</span>}
                  <Input className="h-7 w-[170px]" aria-label={`Etapa ${i + 1} de ${tp.nombre}`} value={nomE[e.id] ?? e.nombre}
                    onChange={(ev) => setNomE((s) => { const n = { ...s }; if (ev.target.value === e.nombre) delete n[e.id]; else n[e.id] = ev.target.value; return n })} />
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
        <Link to="/ajustes/flujos" className="self-start text-sm text-fg-3 underline underline-offset-2 hover:text-fg">Añadir o quitar etapas, colores y condiciones →</Link>
      </Bloque>

      <Bloque titulo="Los papeles del equipo" ayuda="Cómo llamáis a cada papel. Cambiar el nombre no cambia lo que puede hacer.">
        <div className="flex flex-col gap-1">
          {ROLES.map((r) => (
            <FormRow key={r} label={ROLES_DEFECTO[r]}>
              <div className="flex items-center gap-3">
                <Input className="h-7 w-[200px]" value={f.roles[r]} onChange={(e) => setF({ ...f, roles: { ...f.roles, [r]: e.target.value } })} />
                <span className="truncate text-sm text-fg-3 max-md:hidden">{AYUDA[r]}</span>
              </div>
            </FormRow>
          ))}
        </div>
      </Bloque>

      <Bloque titulo="El menú" ayuda="Si quieres que una pantalla salga con otro nombre en el menú y en la barra del móvil. Vacío = el de siempre.">
        <div className="flex flex-col gap-1">
          {menuVisible.map((p) => (
            <FormRow key={p.k} label={defecto[p.k]}>
              <Input className="h-7 w-[220px]" placeholder={defecto[p.k]} aria-label={`Nombre en el menú de ${defecto[p.k]}`} maxLength={40} value={f.menu[p.k] ?? ''}
                onChange={(e) => setF({ ...f, menu: { ...f.menu, [p.k]: e.target.value } })} />
            </FormRow>
          ))}
        </div>
      </Bloque>

      <BarraGuardar sucio={sucio} busy={busy || t.busy} ok={t.ok} err={t.err} onGuardar={guardarTodo}
        onDescartar={() => { t.setF(t.inicial); setNomT({}); setNomE({}); t.setErr(null) }} />
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
              <span className="text-fg-3">días {f.estPasos ? 'sin marcar ningún paso' : 'sin cambios'} → pasa a «Revisar»</span>
            </div>
          </FormRow>
          <FormRow label="" ayuda="«Desde el último paso» cuenta desde la fecha del último paso marcado, aunque se haya editado después (útil si pasas datos de antes).">
            <div className="flex flex-col gap-1">
              <Interruptor checked={f.estPasos} onChange={(v) => setF({ ...f, estPasos: v })} label="Contar desde el último paso (no desde el último cambio)" />
              <Interruptor checked={f.estEspera} onChange={(v) => setF({ ...f, estEspera: v })} label="También en las etapas de espera" />
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
          <FormRow label={`Fichas de ${f.vocab.clientes.toLowerCase()}`} ayuda={`Con «una por ${f.vocab.encargo.toLowerCase()}», cada ${f.vocab.encargo.toLowerCase()} tiene su propia ficha aunque sea de la misma persona: al hacer otro se crea una ficha nueva copiando sus datos (nombre, teléfono, correo y medidas).`}>
            <Interruptor checked={f.fichaPorEncargo} onChange={(v) => setF({ ...f, fichaPorEncargo: v })} label={`Una ficha por ${f.vocab.encargo.toLowerCase()}`} />
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
      <Pagina titulo={f.vocab.materiales} ayuda={`Lo que se propone al crear ${gramatica(f.vocab, f.generos).con('material', 'un')} nuevo.`}
        mas={<>Cada {f.vocab.material.toLowerCase()} tiene su propia unidad (m, uds, g…), su aviso de pedir, si se pide uno por {f.vocab.encargo.toLowerCase()} y cuánto sobrante se guarda como resto. Se cambia en su ficha, en <Link to="/materiales" className="underline">{f.vocab.materiales}</Link>.</>} />
      {!f.materiales && <Apagado />}
        <div className="flex flex-col gap-1">
          {f.materiales && <>
            <FormRow label="Unidad habitual" ayuda="La que más usáis. Cada uno puede tener la suya."><Input className="h-7 w-24" list="unidades-habituales" value={f.unidadMat} maxLength={12} onChange={(e) => setF({ ...f, unidadMat: e.target.value })} /></FormRow>
            <datalist id="unidades-habituales">{['uds', 'm', 'cm', 'g', 'kg', 'ml', 'l', 'ct'].map((x) => <option key={x} value={x} />)}</datalist>
            <FormRow label="Aviso de pedir" ayuda="Para los que no tengan uno propio: avisa cuando quede esto o menos."><Input className="h-7 w-24" inputMode="decimal" value={f.umbralMat} onChange={(e) => setF({ ...f, umbralMat: e.target.value })} /></FormRow>
            <FormRow label="Qué se propone pedir" ayuda="Siempre redondeado a lo que vende de una vez el proveedor (su pedido mínimo).">
              <Select className="w-[260px]" value={f.pedirMat} onChange={(e) => setF({ ...f, pedirMat: e.target.value })}>
                <option value="umbral">Lo que falta y además el aviso de pedir</option>
                <option value="falta">Solo lo que esperan los encargos (si queda al límite, una unidad)</option>
              </Select>
            </FormRow>
            <FormRow label="Número del menú" ayuda={`Lo que cuenta el número rojo junto a ${f.vocab.materiales} en el menú.`}>
              <Select className="w-[260px]" value={f.contadorMat} onChange={(e) => setF({ ...f, contadorMat: e.target.value })}>
                <option value="pedir">Los que hay que pedir</option>
                <option value="restos">Los que tienen un resto por guardar</option>
                <option value="ninguno">Ninguno</option>
              </Select>
            </FormRow>
            <FormRow label="Pedidos en el menú" ayuda="Una entrada propia «Pedidos» para recibir lo que llega, con el número de pedidos abiertos. Quién la ve se elige en Qué ve cada papel.">
              <Interruptor checked={f.menuPedidos} onChange={(v) => setF({ ...f, menuPedidos: v })} label={f.menuPedidos ? 'Sí' : 'No'} />
            </FormRow>
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
      <Pagina titulo={f.hojaNombre || 'Hoja de producción'} ayuda={`Hoja con ${gramatica(f.vocab, f.generos).con('encargo', 'los')} para enviar a quien l${f.generos.encargo === 'f' ? 'as' : 'os'} fabrica. Qué etapa la envía se elige en Tipos y etapas.`} />
      {!f.produccion && <Apagado />}
        <div className="flex flex-col gap-1">
          {f.produccion && <>
            <FormRow label="Nombre"><Input className="h-7 w-[260px]" value={f.hojaNombre} onChange={(e) => setF({ ...f, hojaNombre: e.target.value })} /></FormRow>
            <FormRow label="Dato extra" ayuda={`Un dato de cada ${f.vocab.encargo.toLowerCase()} que quieras ver en la hoja (por ejemplo, el tamaño).`}>
              <Select className="w-[260px]" value={f.hojaCol} onChange={(e) => setF({ ...f, hojaCol: e.target.value, hojaCurva: [] })}>
                <option value="">— ninguno —</option>
                {camposEnc.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </Select>
            </FormRow>
            {f.hojaCol && (() => {
              const col = camposEnc.find((c) => c.clave === f.hojaCol)
              const rejilla = f.hojaCurva.length > 0
              const nombre = col?.etiqueta ?? 'el dato'
              return <>
                <FilaForm label="Cómo se ve">
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2"><input type="radio" name="hoja-modo" checked={!rejilla} onChange={() => setF({ ...f, hojaCurva: [] })} /> Una columna «{nombre}» con lo escrito</label>
                    <label className="flex items-center gap-2"><input type="radio" name="hoja-modo" checked={rejilla} onChange={() => setF({ ...f, hojaCurva: col?.opciones.length ? [...col.opciones] : [''] })} /> Una columna por cada valor, marcando con ● el de cada línea</label>
                  </div>
                </FilaForm>
                {rejilla && (col?.opciones.length
                  ? <FilaForm label="Columnas" ayuda="Las opciones que salen como columna. Pulsa para quitar o poner.">
                      <div className="flex flex-wrap gap-1">
                        {col.opciones.map((o) => {
                          const on = f.hojaCurva.includes(o)
                          return <button key={o} type="button" aria-pressed={on}
                            onClick={() => { const n = on ? f.hojaCurva.filter((x) => x !== o) : col.opciones.filter((x) => x === o || f.hojaCurva.includes(x)); setF({ ...f, hojaCurva: n.length ? n : [] }) }}
                            className={`h-7 rounded-sm border px-2 text-sm ${on ? 'border-gray-12 bg-bg-4 font-medium' : 'border-border text-fg-2'}`}>{o}</button>
                        })}
                      </div>
                    </FilaForm>
                  : <FilaForm label="Columnas" ayuda="Escribe cada valor tal y como se apunta en la ficha, en el orden en que quieres las columnas.">
                      <ListaTextos nombre="Columna" valores={f.hojaCurva} placeholder="Valor" anadir="+ Añadir columna" onChange={(v) => setF({ ...f, hojaCurva: v.length ? v : [''] })} />
                    </FilaForm>)}
              </>
            })()}
            <FilaForm label="Hoja impresa" ayuda="Lo que sale al imprimir. En pantalla se ve todo.">
              <div className="flex flex-col gap-1.5">
                <Interruptor checked={f.impCliente} onChange={(v) => setF({ ...f, impCliente: v })} label={`Con el nombre ${gramatica(f.vocab, f.generos).con('cliente', 'del')}`} />
                {f.materiales && <Interruptor checked={f.impCantidad} onChange={(v) => setF({ ...f, impCantidad: v })} label={`${f.vocab.material} con cantidad y estado (si no, solo el nombre)`} />}
                <Interruptor checked={f.impNota} onChange={(v) => setF({ ...f, impNota: v })} label="Con la columna Nota" />
                <Interruptor checked={f.impCabecera} onChange={(v) => setF({ ...f, impCabecera: v })} label={`Cabecera en grande: «${f.vocab.producto.toUpperCase()} X» y «${(f.hojaNombre || 'Hoja').toUpperCase()}» debajo`} />
                {f.hojaCurva.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">Marca en la rejilla
                    <Select className="w-[90px]" value={f.impMarca} onChange={(e) => setF({ ...f, impMarca: e.target.value })}>
                      <option value="●">●</option><option value="X">X</option><option value="✓">✓</option>
                    </Select>
                  </label>
                )}
              </div>
            </FilaForm>
          </>}
        </div>
      <Pie t={t} />
    </>
  )
}

/** Quita lo vacío para no guardar textos en blanco */
function limpiaLogis(c: ConfigLogistica): ConfigLogistica {
  const bandejas: Record<string, ConfigBandeja> = {}
  for (const [k, b] of Object.entries(c.bandejas ?? {})) {
    const x = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== '' && v !== 'auto').map(([kk, v]) => [kk, typeof v === 'string' ? v.trim() : v])) as ConfigBandeja
    if (Object.keys(x).length) bandejas[k] = x
  }
  return { ...c, bandejas }
}

/** Ajustes → Módulos → Logística: bandejas (nombre, botón, textos) y cómo se ve la pantalla */
export function AjustesLogistica() {
  const t = useFormTienda()
  const { f, setF, tienda, camposEnc } = t
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [puertas, setPuertas] = React.useState<PuertaDef[]>([])
  const [etCargadas, setEtCargadas] = React.useState(false)
  React.useEffect(() => {
    if (!tienda) return
    listarEtapas(tienda.id).then(async (et) => {
      setEtapas(et)
      setPuertas(await listarPuertas(et.filter((x) => x.rol_ejecuta === 'LOGISTICA').map((x) => x.id)))
      setEtCargadas(true)
    }).catch(() => {})
  }, [tienda])
  const L = f.logis
  const setL = (p: Partial<ConfigLogistica>) => setF({ ...f, logis: { ...L, ...p } })
  const setB = (k: string, p: Partial<ConfigBandeja>) => setL({ bandejas: { ...L.bandejas, [k]: { ...(L.bandejas[k] ?? {}), ...p } } })
  const bandejas = bandejasLogistica(etapas, puertas, parseInt(f.diasHist, 10) || 30, !!L.historico_periodo)
  const quien = f.roles.LOGISTICA
  return (
    <>
      <Pagina titulo="Pantalla de logística" ayuda={`La pantalla de quien lleva y trae (papel «${quien}»). Sus bandejas salen de las etapas que marca «${quien}» en Tipos y etapas (y de las comprobaciones obligatorias antes de ellas). Aquí cambias cómo se llaman y qué dicen.`} />
      {!f.logistica && <Apagado />}
      {f.logistica && <>
        <div className="flex flex-col gap-1">
          <FormRow label="Histórico">
            <div className="flex flex-wrap items-center gap-3">
              <Interruptor checked={!!L.historico_periodo} onChange={(v) => setL({ historico_periodo: v })} label="Todo el periodo" />
              {!L.historico_periodo && <span className="inline-flex items-center gap-1.5"><Input className="h-7 w-20" inputMode="numeric" value={f.diasHist} onChange={(e) => setF({ ...f, diasHist: e.target.value })} /> días atrás</span>}
            </div>
          </FormRow>
          <FormRow label="Al entrar"><Interruptor checked={!!L.abrir_primera} onChange={(v) => setL({ abrir_primera: v })} label="Abrir siempre la primera bandeja" /></FormRow>
          <FormRow label="Doble toque" ayuda="Para no marcar nada sin querer: el primer toque prepara y el segundo confirma."><Interruptor checked={!!L.doble_siempre} onChange={(v) => setL({ doble_siempre: v })} label="También en el ordenador" /></FormRow>
          <FormRow label="Línea de pasos"><Interruptor checked={!!L.ocultar_futuros} onChange={(v) => setL({ ocultar_futuros: v })} label="Solo los pasos ya dados" /></FormRow>
          <FormRow label={`${f.vocab.materiales} en camino`}><Interruptor checked={!L.ocultar_llegadas} onChange={(v) => setL({ ocultar_llegadas: !v })} label={L.ocultar_llegadas ? 'No se enseña' : 'Se enseña arriba'} /></FormRow>
          <FormRow label="En cada tarjeta" ayuda={`Datos ${gr0(f)} que se ven bajo ${f.vocab.producto.toLowerCase()}. Sin marcar ninguno: el de la hoja de producción y la primera fecha.`}>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {camposEnc.map((c) => (
                <label key={c.clave} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="accent-gray-12" checked={(L.campos_tarjeta ?? []).includes(c.clave)}
                    onChange={(e) => setL({ campos_tarjeta: e.target.checked ? [...(L.campos_tarjeta ?? []), c.clave] : (L.campos_tarjeta ?? []).filter((x) => x !== c.clave) })} />
                  {c.etiqueta}
                </label>
              ))}
            </div>
          </FormRow>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-medium">Bandejas</span>
          {etCargadas && bandejas.length <= 1 && <p className="m-0 text-sm text-fg-3">Ninguna etapa la marca «{quien}» todavía.</p>}
          {bandejas.map((b, i) => {
            const c = L.bandejas[b.key] ?? {}
            return (
              <Avanzado key={b.key} titulo={`${i + 1}. ${c.nombre?.trim() || b.nombreDefecto}`}
                resumen={b.tipo === 'check' ? 'comprobación' : b.tipo === 'historico' ? 'solo lectura' : `marca «${b.etapas.map((x) => x.nombre).join(' / ')}»`}>
                <div className="flex flex-col gap-1">
                  <FormRow label="Nombre"><Input className="h-7" placeholder={b.nombreDefecto} value={c.nombre ?? ''} onChange={(e) => setB(b.key, { nombre: e.target.value })} /></FormRow>
                  <FormRow label="Qué hay aquí"><Input className="h-7" placeholder={b.subtituloDefecto} value={c.subtitulo ?? ''} onChange={(e) => setB(b.key, { subtitulo: e.target.value })} /></FormRow>
                  {b.tipo !== 'historico' && <FormRow label="Botón"><Input className="h-7" placeholder={b.botonDefecto} value={c.boton ?? ''} onChange={(e) => setB(b.key, { boton: e.target.value })} /></FormRow>}
                  <FormRow label="Días" ayuda="{n} es el número de días. Ejemplo: «{n} días en el coche»."><Input className="h-7" placeholder="{n} días en «etapa»" value={c.dias ?? ''} onChange={(e) => setB(b.key, { dias: e.target.value })} /></FormRow>
                  <FormRow label="Si está vacía"><Input className="h-7" placeholder="Nada pendiente en esta bandeja." value={c.vacio ?? ''} onChange={(e) => setB(b.key, { vacio: e.target.value })} /></FormRow>
                  {b.tipo === 'etapa' && <>
                    <FormRow label={`Elegir ${f.vocab.proveedor.toLowerCase()}`} ayuda="Un desplegable en cada tarjeta; se guarda al momento.">
                      <Select className="w-[220px]" value={c.proveedor === true ? 'si' : c.proveedor === false ? 'no' : ''} onChange={(e) => setB(b.key, { proveedor: e.target.value === 'si' ? true : e.target.value === 'no' ? false : undefined })}>
                        <option value="">Solo si hace falta</option><option value="si">Siempre</option><option value="no">Nunca</option>
                      </Select>
                    </FormRow>
                    <FormRow label="Marcar todos">
                      <div className="flex flex-wrap items-center gap-2">
                        <Interruptor checked={!!c.todos} onChange={(v) => setB(b.key, { todos: v || undefined })} label={c.todos ? 'Sí' : 'No'} />
                        {c.todos && <Input className="h-7 w-[260px]" placeholder="Marcar todos" value={c.todos_texto ?? ''} onChange={(e) => setB(b.key, { todos_texto: e.target.value })} />}
                      </div>
                    </FormRow>
                  </>}
                  <FormRow label={`Carpetas por ${f.vocab.proveedor.toLowerCase()}`}>
                    <Select className="w-[220px]" value={c.carpetas ?? 'auto'} onChange={(e) => setB(b.key, { carpetas: e.target.value as ConfigBandeja['carpetas'] })}>
                      <option value="auto">Automático</option><option value="siempre">Siempre</option><option value="nunca">Nunca</option>
                    </Select>
                  </FormRow>
                  <FormRow label={`Filtro por ${f.vocab.producto.toLowerCase()}`}>
                    <Select className="w-[220px]" value={c.filtro ?? 'auto'} onChange={(e) => setB(b.key, { filtro: e.target.value as ConfigBandeja['filtro'] })}>
                      <option value="auto">Si hay más de uno</option><option value="siempre">Siempre</option><option value="nunca">Nunca</option>
                    </Select>
                  </FormRow>
                </div>
              </Avanzado>
            )
          })}
        </div>
      </>}
      <Pie t={t} />
    </>
  )
}
const gr0 = (f: { vocab: Vocab; generos: Record<ClaveVocab, Genero> }) => gramatica(f.vocab, f.generos).con('encargo', 'del')

/** Ajustes → Módulos → Ficha técnica y complementos */
export function AjustesFichaTecnica() {
  const t = useFormTienda()
  const { f, setF } = t
  return (
    <>
      <Pagina titulo="Ficha técnica" ayuda={`Lo que lleva cada ${f.vocab.producto.toLowerCase()} y los extras que se añaden a ${gramatica(f.vocab, f.generos).con('encargo', 'un')}.`} />
        <div className="flex flex-col gap-1">
          <FilaForm label="Tipos de elaboración" ayuda={`Se elige uno en la ficha de cada ${f.vocab.producto.toLowerCase()}. Sin ninguno, no se pregunta.`}>
            <ListaTextos nombre="Tipo de elaboración" valores={f.construcciones} placeholder="Por ejemplo: A medida" anadir="+ Añadir tipo" onChange={(v) => setF({ ...f, construcciones: v })} />
          </FilaForm>
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

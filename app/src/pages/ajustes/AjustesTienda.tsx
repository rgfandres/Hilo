import { plantillas } from '@/data/config'
import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { subirFoto } from '@/data/catalogos'
import { guardarTienda } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { Button, FormRow, Input, Select } from '@/ui'
import { ROLES, VOCAB_DEFECTO, ayudaRoles, generoAuto, generosDe, gramatica, rolesDe, vocabDe, type ClaveVocab, type Genero, type Vocab } from '@/lib/vocab'
import { Bloque, Estado, Interruptor } from './Ajustes'

const PALABRAS: { k: ClaveVocab; kp: keyof Vocab; ayuda: string }[] = [
  { k: 'encargo', kp: 'encargos', ayuda: 'Lo que la tienda hace por encargo' },
  { k: 'cliente', kp: 'clientes', ayuda: 'Quien lo encarga' },
  { k: 'producto', kp: 'productos', ayuda: 'Lo que se ofrece (catálogo)' },
  { k: 'proveedor', kp: 'proveedores', ayuda: 'Quien fabrica o transforma fuera' },
  { k: 'material', kp: 'materiales', ayuda: 'Lo que se gasta en cada encargo (si usas el módulo)' },
]
const ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Lima', 'America/New_York']
const COLORES = ['#333333', '#1F3A5F', '#2B4C9B', '#5A3E96', '#9C1049', '#C2185B', '#A32E24', '#8A5A00', '#1E6B3C', '#0F766E']

/** Ajustes → Tienda: identidad, vocabulario, roles y reglas generales. */
export function AjustesTienda() {
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
    materiales: ((aj.modulos as Record<string, boolean> | undefined)?.materiales) === true,
    unidadMat: String(aj.material_unidad ?? 'm'),
    umbralMat: String(aj.umbral_material_defecto ?? 10),
    porEncargo: String(aj.unidad_por_encargo_max ?? 10),
    umbralResto: String(aj.umbral_resto ?? 5),
    etiqComp: String(aj.etiqueta_complementos ?? 'Complementos'),
    construcciones: ((aj.tipos_construccion as string[] | undefined) ?? []).join(', '),
    produccion: ((aj.modulos as Record<string, boolean> | undefined)?.produccion) === true,
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
  const [camposEnc, setCamposEnc] = React.useState<{ clave: string; etiqueta: string }[]>([])
  React.useEffect(() => {
    if (!tienda) return
    plantillas(tienda.id).then((ps) => {
      const m = new Map<string, string>()
      for (const p of ps) if (p.entidad === 'ENCARGO') for (const c of p.campos) if (!m.has(c.clave)) m.set(c.clave, c.etiqueta)
      setCamposEnc([...m.entries()].map(([clave, etiqueta]) => ({ clave, etiqueta })))
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
        moneda: f.moneda.trim().toUpperCase() || 'EUR',
        usar_importe: f.importe,
        modulos: { ...((aj.modulos as object) ?? {}), materiales: f.materiales, produccion: f.produccion },
        hoja_nombre: f.hojaNombre.trim() || 'Hoja de producción',
        hoja_campo_col: f.hojaCol || null,
        hoja_col_etiqueta: camposEnc.find((c) => c.clave === f.hojaCol)?.etiqueta ?? null,
        hoja_curva: f.hojaCurva.split(',').map((x) => x.trim()).filter(Boolean),
        material_unidad: f.unidadMat.trim() || 'm',
        umbral_material_defecto: Number(f.umbralMat.replace(',', '.')) || 0,
        unidad_por_encargo_max: Number(f.porEncargo.replace(',', '.')) || 0,
        umbral_resto: Number(f.umbralResto.replace(',', '.')) || 0,
        etiqueta_complementos: f.etiqComp.trim() || 'Complementos',
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

  return (
    <>
      <Bloque titulo="Tienda" ayuda="Nombre y color que se ven en la app. El color solo marca el logo.">
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
          <FormRow label="Logo" ayuda="Sale en el menú, en la ficha imprimible y en los informes. Mejor cuadrado o apaisado, con fondo claro.">
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
                  try { setF((s) => ({ ...s, logo: '' })); const url = await subirFoto(tienda.id, file); setF((s) => ({ ...s, logo: url })) }
                  catch (x) { setErr(mensajeError(x)) } finally { setSubiendo(false) }
                }} />
              </label>
              {f.logo && <Button variant="ghost" size="sm" onClick={() => setF({ ...f, logo: '' })}>Quitar</Button>}
            </div>
          </FormRow>
        </div>
      </Bloque>

      <Bloque titulo="Vocabulario" ayuda="Cómo llama tu tienda a cada cosa. Se usa en toda la app: menú, botones y mensajes.">
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
      </Bloque>

      <Bloque titulo="Nombres de los roles" ayuda="El permiso lo da el rol; aquí solo cambias cómo se llama en tu tienda.">
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
      </Bloque>

      <Bloque titulo="Reglas generales">
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
          <FormRow label="Numeración">
            <Interruptor checked={f.reinicia} onChange={(v) => setF({ ...f, reinicia: v })} label="Empieza en 001 en cada periodo" />
          </FormRow>
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
          <FormRow label="Importes" ayuda="Importe pactado y lo entregado a cuenta en cada encargo; se ve lo pendiente de cobro y se puede filtrar.">
            <Interruptor checked={f.importe} onChange={(v) => setF({ ...f, importe: v })} label="Usar importe y cobros" />
          </FormRow>
          <FormRow label="Prefijo del país">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-fg-3">+</span>
              <Input className="h-7 w-20" inputMode="numeric" value={f.prefijo} onChange={(e) => setF({ ...f, prefijo: e.target.value })} />
              <span className="text-fg-3">se añade a los teléfonos sin prefijo al abrir WhatsApp</span>
            </div>
          </FormRow>
          <FormRow label="Enlace de reseña">
            <Input className="h-7" type="url" placeholder="https://… (se ofrece al entregar)" value={f.resena} onChange={(e) => setF({ ...f, resena: e.target.value })} />
          </FormRow>
        </div>
      </Bloque>

      <Bloque titulo={f.vocab.materiales} ayuda={`Catálogo de ${f.vocab.materiales.toLowerCase()} con stock, pedidos a ${f.vocab.proveedores.toLowerCase()}, consumo por ${f.vocab.encargo.toLowerCase()} y restos.`}>
        <div className="flex flex-col gap-1">
          <FormRow label="Módulo"><Interruptor checked={f.materiales} onChange={(v) => setF({ ...f, materiales: v })} label={`Usar ${f.vocab.materiales.toLowerCase()} y compras`} /></FormRow>
          {f.materiales && <>
            <FormRow label="Unidad" ayuda="Cómo se cuenta: m, uds, kg…"><Input className="h-7 w-20" value={f.unidadMat} maxLength={6} onChange={(e) => setF({ ...f, unidadMat: e.target.value })} /></FormRow>
            <FormRow label="Umbral por defecto" ayuda="Por debajo de esto se avisa de pedir (cada material puede tener el suyo)."><Input className="h-7 w-20" inputMode="decimal" value={f.umbralMat} onChange={(e) => setF({ ...f, umbralMat: e.target.value })} /></FormRow>
            <FormRow label={`Pedido por ${f.vocab.encargo.toLowerCase()}`} ayuda={`Si la unidad de pedido es esta o menos, se pide una unidad por ${f.vocab.encargo.toLowerCase()} y se consume entera al recibirla.`}><Input className="h-7 w-20" inputMode="decimal" value={f.porEncargo} onChange={(e) => setF({ ...f, porEncargo: e.target.value })} /></FormRow>
            <FormRow label="Restos hasta" ayuda="Si lo que queda no llega a una unidad de pedido y es esto o menos, se ofrece guardarlo como resto."><Input className="h-7 w-20" inputMode="decimal" value={f.umbralResto} onChange={(e) => setF({ ...f, umbralResto: e.target.value })} /></FormRow>
          </>}
        </div>
      </Bloque>

      <Bloque titulo="Ficha técnica" ayuda={`Lo que cada ${f.vocab.producto.toLowerCase()} lleva: se rellena en su ficha del catálogo y se ve como resumen en cada ${f.vocab.encargo.toLowerCase()}.`}>
        <div className="flex flex-col gap-1">
          <FormRow label="Tipos de construcción" ayuda="Separados por comas. Vacío = no se pregunta."><Input className="h-7" value={f.construcciones} placeholder="Por ejemplo: A medida, Estándar" onChange={(e) => setF({ ...f, construcciones: e.target.value })} /></FormRow>
          <FormRow label="Nombre de los complementos" ayuda={`Cómo llamáis a lo que se añade a cada ${f.vocab.encargo.toLowerCase()} (acabados, extras…).`}><Input className="h-7 w-[220px]" value={f.etiqComp} onChange={(e) => setF({ ...f, etiqComp: e.target.value })} /></FormRow>
        </div>
      </Bloque>

      <Bloque titulo={f.hojaNombre || 'Hoja de producción'} ayuda={`Una hoja por ${f.vocab.producto.toLowerCase()} con los ${f.vocab.encargos.toLowerCase()} enviados a producción, lista para imprimir. Qué etapa envía se marca en Ajustes → Flujos.`}>
        <div className="flex flex-col gap-1">
          <FormRow label="Módulo"><Interruptor checked={f.produccion} onChange={(v) => setF({ ...f, produccion: v })} label="Usar la hoja de producción" /></FormRow>
          {f.produccion && <>
            <FormRow label="Nombre"><Input className="h-7 w-[260px]" value={f.hojaNombre} onChange={(e) => setF({ ...f, hojaNombre: e.target.value })} /></FormRow>
            <FormRow label="Campo en columnas" ayuda="Si lo eliges, la hoja marca el valor de cada línea en columnas (una por valor).">
              <Select className="w-[260px]" value={f.hojaCol} onChange={(e) => setF({ ...f, hojaCol: e.target.value })}>
                <option value="">— ninguno —</option>
                {camposEnc.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </Select>
            </FormRow>
            {f.hojaCol && <FormRow label="Valores de las columnas" ayuda="Separados por comas, en orden. Vacío = se escribe el valor tal cual."><Input className="h-7" value={f.hojaCurva} placeholder="S, M, L, XL…" onChange={(e) => setF({ ...f, hojaCurva: e.target.value })} /></FormRow>}
          </>}
        </div>
      </Bloque>

      <Bloque titulo={`Qué ve ${gramatica(f.vocab, f.generos).con('proveedor', 'el')}`} ayuda={`Teléfono y correo ${gramatica(f.vocab, f.generos).con('cliente', 'del')} nunca se muestran. Qué campos ve se elige en Ajustes → Campos.`}>
        <FormRow label={`Nombre ${gramatica(f.vocab, f.generos).con('cliente', 'del')}`}>
          <Select className="w-[260px]" value={f.verCliente} onChange={(e) => setF({ ...f, verCliente: e.target.value })}>
            <option value="nombre">Nombre completo</option>
            <option value="iniciales">Solo iniciales</option>
            <option value="no">Nada (solo el número)</option>
          </Select>
        </FormRow>
      </Bloque>

      <div className="sticky bottom-0 -mx-8 flex items-center gap-3 border-t border-border bg-bg px-8 py-3 max-md:-mx-4 max-md:px-4">
        <Estado ok={ok} err={err} />
        <div className="flex-1" />
        <Button variant="ghost" disabled={!sucio || busy} onClick={() => { setF(inicial); setErr(null) }}>Descartar</Button>
        <Button variant="primary" disabled={!sucio || busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </>
  )
}

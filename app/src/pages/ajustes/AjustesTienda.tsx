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

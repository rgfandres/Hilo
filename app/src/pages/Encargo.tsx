import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as RTabs from '@radix-ui/react-tabs'
import { useAuth } from '@/auth/AuthProvider'
import {
  anularEncargo, cambiarFechaHito, comentar, crearHito, deshacerUltimoHito, listarAnulaciones, listarComentarios,
  editarNotaHito, impactoAnular, type ImpactoAnular, listarNotasCampo, ponerNotaCampo, type NotaCampo as TNota, listarEtapas, listarHitos, marcarCheck, marcarRevisar, mensajeError, obtenerEncargo, quitarRevisar, recuperarEncargo, resolverIncidencia,
  type Anulacion,
} from '@/data/encargos'
import { supabase } from '@/lib/supabase'
import type { Cliente, Comentario, EncargoEstado, Etapa, Hito } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { motivosRevision } from '@/lib/bandejas'
import { Adjuntos } from '@/components/Adjuntos'
import { CamposVista } from '@/components/CampoInput'
import { NotaCampo } from '@/components/NotaCampo'
import { ArregloPuerta } from '@/components/ArregloPuerta'
import { useTiempoReal } from '@/lib/tiempoReal'
import { FichaImprimible } from '@/components/FichaImprimible'
import { fichaHTML, fichaTexto, obtenerPlantillaFicha, plantillaDefecto } from '@/data/ficha'
import { listarEquipo } from '@/data/ajustes'
import { MaterialesEncargo } from '@/components/Material'
import { MedidasDelEncargo } from '@/components/HistorialMedidas'
import { ajustesFicha, fichaProducto, tieneFicha, type FichaTecnica } from '@/data/catalogos'
import { resumenFicha } from '@/pages/Productos'
import { ajustesMaterial, liberarMaterial } from '@/data/materiales'
import { Button, Dialog, Tag, Field, SectionLabel, Input, Select, Textarea, UndoBar, tagColorFromHex, useAvisos } from '@/ui'
import { cn, fechaCorta, num3, locale, dinero, ajustesDinero, pendiente, zona } from '@/lib/utils'
import { camposDe, checksDelFlujo, plantillas, type Campo, type CheckDef } from '@/data/config'
import { min } from '@/lib/vocab'
import { EditarEncargo } from '@/components/EditarEncargo'
import { EnviarMensaje } from '@/components/EnviarMensaje'
import { listarEnvios, listarPlantillas, type MensajeEnviado, type PlantillaMensaje } from '@/data/mensajes'

const TAB = 'flex h-9 items-center gap-1.5 px-1 mr-4 text-base font-medium text-fg-2 data-[state=active]:text-fg data-[state=active]:shadow-[inset_0_-1px_0_var(--color-gray-12)]'

type Modal = null | 'incidencia' | 'resolver' | 'volver' | 'anular' | 'recuperar' | 'revisar' | 'final' | { fecha: Hito } | { nota: Hito }

const hora = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { timeZone: zona(), hour: '2-digit', minute: '2-digit' })
/** Días de calendario entre dos momentos (20 → 23 = 3), en hora local */
const dias = (a: string, b: string | Date) => {
  const d0 = new Date(a); d0.setHours(0, 0, 0, 0)
  const d1 = new Date(b); d1.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((d1.getTime() - d0.getTime()) / 864e5))
}
/** yyyy-MM-ddTHH:mm en hora local, para <input type="datetime-local"> */
const aLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

export function Encargo() {
  const { id } = useParams()
  const nav = useNavigate()
  const { rol, vocab, tienda, gr, session } = useAuth()
  const avisar = useAvisos()
  const din = ajustesDinero(tienda?.ajustes as Record<string, unknown>)
  const [impacto, setImpacto] = React.useState<ImpactoAnular | null>(null)
  const [devolverMat, setDevolverMat] = React.useState(true)
  const ajMat = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const conMaterial = ajMat.activo
  const recibidoMat = impacto?.material_recibido ?? []

  const [e, setE] = React.useState<EncargoEstado | null>(null)
  const fic = ajustesFicha(tienda?.ajustes as Record<string, unknown>)
  // Ficha técnica y complementos: solo si la tienda los usa; el aviso de «sin ficha», solo a quien puede crearla
  const ajT = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const usaComplementos = fic.usaComplementos
  const usaFichas = fic.construcciones.length > 0 || conMaterial
  const puedeEditarProd = rol === 'ADMIN' || rol === 'OPERATIVO'
  const [fichaT, setFichaT] = React.useState<(FichaTecnica & { nombre: string }) | null>(null)
  const productoId = e?.producto_id
  React.useEffect(() => { setFichaT(null); if (productoId) fichaProducto(productoId).then(setFichaT).catch(() => {}) }, [productoId])
  const [cli, setCli] = React.useState<Cliente | null>(null)
  const [hitos, setHitos] = React.useState<Hito[]>([])
  const [coms, setComs] = React.useState<Comentario[]>([])
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [anul, setAnul] = React.useState<Anulacion | null>(null)
  const [checks, setChecks] = React.useState<Record<string, boolean>>({})
  const [defChecks, setDefChecks] = React.useState<CheckDef[]>([])
  const [camposEnc, setCamposEnc] = React.useState<Campo[]>([])
  const [camposCli, setCamposCli] = React.useState<Campo[]>([])
  const [texto, setTexto] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [undo, setUndo] = React.useState<{ msg: string; hito: string } | null>(null)
  const [editar, setEditar] = React.useState(false)
  const [modal, setModal] = React.useState<Modal>(null)
  const [nota, setNota] = React.useState('')
  const [destino, setDestino] = React.useState('')
  const [fecha, setFecha] = React.useState('')
  const [modalErr, setModalErr] = React.useState<string | null>(null)
  const [plantillasMsg, setPlantillasMsg] = React.useState<PlantillaMensaje[]>([])
  const [envios, setEnvios] = React.useState<MensajeEnviado[]>([])
  const [mensaje, setMensaje] = React.useState<{ inicial: string | null } | null>(null)
  /** Sugerencia de aviso tras pasar a una etapa que tiene plantilla */
  const [sugerencia, setSugerencia] = React.useState<PlantillaMensaje | null>(null)
  const [ficha, setFicha] = React.useState<{ html: string; texto: string } | null>(null)
  const [autores, setAutores] = React.useState<Record<string, string>>({})
  const [notas, setNotas] = React.useState<Record<string, TNota>>({})

  const cargar = React.useCallback(async () => {
    if (!id) return
    const enc = await obtenerEncargo(id)
    setE(enc)
    if (!enc) return
    const [h, c, cl, ck, dc, ps, et, an, pm, ev] = await Promise.all([
      listarHitos(id), listarComentarios(id),
      supabase.from('cliente').select('*').eq('id', enc.cliente_id).maybeSingle(),
      supabase.from('check_encargo').select('clave,marcado').eq('encargo_id', id),
      checksDelFlujo(enc.tipo_encargo_id),
      plantillas(enc.tienda_id),
      listarEtapas(enc.tienda_id),
      enc.estado === 'ANULADO' ? listarAnulaciones([enc.id]) : Promise.resolve({} as Record<string, Anulacion>),
      listarPlantillas(enc.tienda_id).catch(() => [] as PlantillaMensaje[]),
      listarEnvios(id).catch(() => [] as MensajeEnviado[]),
    ])
    setPlantillasMsg(pm); setEnvios(ev)
    setDefChecks(dc)
    setCamposEnc(camposDe(ps, 'ENCARGO', enc.tipo_encargo_id))
    setCamposCli(camposDe(ps, 'CLIENTE'))
    setEtapas(et.filter((x) => x.tipo_encargo_id === enc.tipo_encargo_id))
    setAnul(an[enc.id] ?? null)
    setHitos(h); setComs(c); setCli((cl.data as Cliente) ?? null)
    listarNotasCampo(id).then(setNotas).catch(() => {})
    // Nombres de quien escribe (si se puede leer el equipo)
    listarEquipo(enc.tienda_id).then((eq) => setAutores(Object.fromEntries(eq.map((m) => [m.user_id, m.email.split('@')[0]])))).catch(() => {})
    setChecks(Object.fromEntries(((ck.data ?? []) as { clave: string; marcado: boolean }[]).map((x) => [x.clave, x.marcado])))
  }, [id, tienda])

  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])
  // Si otra persona avanza o comenta este encargo, se ve al momento
  const { ultima } = useTiempoReal(tienda?.id, () => cargar().catch(() => {}), (f) => f.encargo_id === id || f.id === id)

  /** Lo que la app no puede deshacer sola al anular: se avisa antes y se deja apuntado después. */
  function pendientesAlAnular(i: ImpactoAnular | null): string[] {
    if (!i) return []
    const out: string[] = []
    if (i.proveedor && i.en_proveedor) out.push(`avisar a ${i.proveedor} de que pare el trabajo`)
    if (Number(i.a_cuenta) > 0) out.push(`decidir qué hacer con ${dinero(i.a_cuenta, din.moneda)} entregados a cuenta`)
    if (i.material_pedido) out.push(`${min(vocab.material)} pedid${gr.o('material')} para ${gr.con('encargo', 'este')} (${i.material_pedido}): llegará igual y quedará en stock`)
    if (i.n_mensajes > 0) out.push(`avisar ${gr.con('cliente', 'al')} (ya se le escribió ${i.n_mensajes} ${i.n_mensajes === 1 ? 'vez' : 'veces'})`)
    return out
  }
  function abrir(m: Modal) {
    if (m === 'anular' && e) { setImpacto(null); impactoAnular(e.id).then(setImpacto).catch(() => setImpacto(null)) }
    setModal(m); setNota(''); setModalErr(null)
    if (m && typeof m === 'object' && 'fecha' in m) setFecha(aLocal(m.fecha.fecha))
    if (m && typeof m === 'object' && 'nota' in m) setNota(m.nota.nota ?? '')
    if (m === 'volver') setDestino('')
  }
  /** Ejecuta la acción del diálogo; si falla, el error se queda dentro del diálogo. */
  async function hacer(fn: () => Promise<unknown>, despues?: () => void) {
    setModalErr(null)
    try { await fn(); setModal(null); if (despues) despues(); else await cargar() } catch (x) { setModalErr(mensajeError(x)) }
  }

  async function avanzar(confirmado = false) {
    if (!e?.etapa_siguiente_clave) return
    // Entrar en la etapa final se confirma: se ve a quién, qué y con qué número
    if (e.siguiente_es_final && !confirmado) { abrir('final'); return }
    setModal(null)
    setErr(null)
    try {
      // Los avisos (puertas blandas) ya están a la vista encima del botón: continuar es aceptarlos
      const hayAvisos = (e.puertas_pendientes ?? []).some((p) => !p.dura)
      const hito = await crearHito(e.id, e.etapa_siguiente_clave, { forzarBlandas: hayAvisos })
      setUndo({ msg: `${num3(e)} · ${e.etapa_siguiente_nombre}`, hito })
      setSugerencia(plantillasMsg.find((p) => p.etapa_id === e.etapa_siguiente_id) ?? null)
      await cargar()
    } catch (x) { setErr(mensajeError(x)) }
  }
  async function abrirFicha() {
    if (!e || !tienda) return
    try {
      // La ficha propia del periodo del encargo, si la tiene; si no, la de la tienda
      const pf = e.periodo_id ? ((await supabase.from('periodo').select('ajustes').eq('id', e.periodo_id).maybeSingle()).data?.ajustes as Record<string, unknown> | undefined)?.ficha as string | undefined : undefined
      const plantilla = pf ?? (await obtenerPlantillaFicha(tienda.id)) ?? plantillaDefecto(vocab)
      const d = {
        tienda: tienda.nombre, logo: (tienda.ajustes as Record<string, unknown>)?.logo_url as string | undefined, numero: e.numero, serie: e.serie, nombre: e.cliente_nombre ?? '', telefono: cli?.telefono ?? null, email: cli?.email ?? null,
        producto: e.producto_nombre, proveedor: e.proveedor_nombre, etapa: e.etapa_actual_nombre, tipo: e.tipo_nombre,
        camposEncargo: camposEnc, datosEncargo: e.datos ?? {}, camposCliente: camposCli, datosCliente: cli?.datos ?? {},
        hilo: hitos.filter((h) => !h.deshecho_en && h.tipo !== 'INCIDENCIA').sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((h) => ({ etapa: h.etapa?.nombre ?? '', fecha: h.fecha, nota: h.nota })),
      }
      setFicha({ html: fichaHTML(plantilla, d), texto: fichaTexto(plantilla, d) })
    } catch (x) { setErr(mensajeError(x)) }
  }
  async function deshacer() {
    if (!e) return
    try { await deshacerUltimoHito(e.id, undo?.hito); setUndo(null); setSugerencia(null); await cargar() } catch (x) { setErr(mensajeError(x)) }
  }
  async function toggleCheck(clave: string) {
    if (!e) return
    const v = !checks[clave]
    setChecks((c) => ({ ...c, [clave]: v }))
    try { await marcarCheck(e.id, clave, v); await cargar() } catch (x) { setErr(mensajeError(x)) }
  }
  async function enviarComentario(ev: React.SyntheticEvent) {
    ev.preventDefault()
    if (!e || !texto.trim()) return
    try { await comentar(e.id, texto.trim()); setTexto(''); setComs(await listarComentarios(e.id)) } catch (x) { setErr(mensajeError(x)) }
  }

  if (!e) return <div className="p-8 text-fg-3">{err ?? 'Cargando…'}</div>

  const anulado = e.estado === 'ANULADO'
  const gestion = rol === 'ADMIN' || rol === 'OPERATIVO'
  const puedeRevisar = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'
  // Escribir al cliente (y dejarlo anotado) es cosa de administración, operativo y atención
  const puedeAvisar = puedeRevisar
  const motivos = motivosRevision(e, (tienda?.ajustes ?? {}) as Record<string, unknown>).filter((m) => !m.startsWith('Incidencia'))
  const puedeEditar = !anulado && (gestion || rol === 'ATENCION' || rol === 'LOGISTICA')
  const datos = e.datos ?? {}
  const medidas = cli?.datos ?? {}
  const puedeMarcar = gestion || rol === e.etapa_siguiente_rol
  const duras = e.puertas_pendientes?.filter((p) => p.dura) ?? []
  const blandas = e.puertas_pendientes?.filter((p) => !p.dura) ?? []
  const vigentes = hitos.filter((h) => !h.deshecho_en)
  const incAbierta = e.en_revision ? vigentes.find((h) => h.tipo === 'INCIDENCIA' && !h.resuelto_en) : undefined
  const plantillaEtapa = plantillasMsg.find((p) => p.etapa_id === e.etapa_actual_id)
  const anteriores = etapas.filter((x) => e.etapa_actual_orden != null && x.orden < e.etapa_actual_orden)

  // Días en cada etapa: desde un paso hasta el siguiente paso vigente (o hasta hoy si es el actual)
  const pasos = vigentes.filter((h) => h.tipo !== 'INCIDENCIA').sort((a, b) => a.fecha.localeCompare(b.fecha))
  const diasDe = new Map<string, { n: number; hoy: boolean }>()
  pasos.forEach((h, i) => {
    const sig = pasos[i + 1]
    if (sig) diasDe.set(h.id, { n: dias(h.fecha, sig.fecha), hoy: false })
    else if (!e.es_final && !anulado) diasDe.set(h.id, { n: dias(h.fecha, new Date()), hoy: true })
  })

  // Hilo: hitos y comentarios mezclados por fecha, agrupados por día
  const eventos = [
    ...hitos.map((h) => ({ tipo: 'hito' as const, fecha: h.fecha, h })),
    ...coms.map((c) => ({ tipo: 'com' as const, fecha: c.fecha, c })),
    ...envios.map((m) => ({ tipo: 'msg' as const, fecha: m.fecha, m })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const porDia = new Map<string, typeof eventos>()
  for (const ev of eventos) { const k = fechaCorta(ev.fecha); porDia.set(k, [...(porDia.get(k) ?? []), ev]) }

  return (
    <>
      <PageHeader title={<span><Link to="/encargos" className="text-fg-3">{vocab.encargos}</Link><span className="mx-2 text-border-strong">/</span>{num3(e)} · {e.cliente_nombre}</span>}>
        {!anulado && puedeAvisar && <Button variant="ghost" onClick={() => setMensaje({ inicial: plantillaEtapa?.id ?? null })}>Avisar {gr.con('cliente', 'al')}</Button>}
        {puedeEditar && <Button variant="ghost" onClick={() => setEditar(true)}>Editar</Button>}
        {!anulado && rol !== 'LOGISTICA' && (
          <Button variant="ghost" asChild><Link to={`/encargos/nuevo?cliente=${e.cliente_id}`}>+ {vocab.encargo} para {gr.con('cliente', 'este')}</Link></Button>
        )}
        <Button variant="ghost" onClick={abrirFicha}>Imprimir ficha</Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-auto border-r border-border p-5 max-md:w-full max-md:overflow-visible max-md:border-b max-md:border-r-0 max-md:p-4">
          <div className="flex flex-col gap-1.5">
            <Link to={`/clientes/${e.cliente_id}`} className="text-xl font-semibold tracking-tight hover:underline">{e.cliente_nombre}</Link>
            <div className="flex items-center gap-2 text-fg-2">
              <span>{vocab.encargo} {num3(e)}</span><span className="text-border-strong">·</span>
              {anulado ? <Tag color="gray">Anulad{gr.o('encargo')}</Tag>
                : e.en_revision ? <Tag color="red">Incidencia</Tag>
                : <Tag color="gray">{e.etapa_actual_nombre ?? 'Sin empezar'}</Tag>}
            </div>
          </div>

          {anulado && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-2 p-3">
              <span className="font-medium">Anulado {anul ? `el ${fechaCorta(anul.fecha)}` : ''}</span>
              {anul?.motivo && <span className="text-sm text-fg-2">Motivo: {anul.motivo}</span>}
              <span className="text-sm text-fg-3">El número {num3(e)} no se reutiliza.</span>
              {rol === 'ADMIN' && <div><Button onClick={() => abrir('recuperar')}>Recuperar</Button></div>}
            </div>
          )}

          {!anulado && puedeAvisar && sugerencia && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <span className="text-sm text-fg-2">¿Avisar a {e.cliente_nombre}?</span>
              <span className="font-medium">{sugerencia.nombre}</span>
              <div className="flex gap-1.5">
                <Button variant="primary" onClick={() => { setMensaje({ inicial: sugerencia.id }); setSugerencia(null) }}>Preparar mensaje</Button>
                <Button variant="ghost" onClick={() => setSugerencia(null)}>Ahora no</Button>
              </div>
            </div>
          )}

          {!anulado && motivos.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-warn-bg bg-warn-bg/40 p-3">
              <span className="text-sm font-medium text-warn-fg">En «Revisar» por:</span>
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-sm text-fg-2">{motivos.map((m) => <li key={m}>{m}</li>)}</ul>
              <span className="text-sm text-fg-3">Última modificación: {fechaCorta(e.actualizado_en)}</span>
              {e.revisar_manual && puedeRevisar && (
                <div><Button size="sm" onClick={() => quitarRevisar(e.id).then(cargar).catch((x) => setErr(mensajeError(x)))}>Quitar marca: ya está revisado</Button></div>
              )}
            </div>
          )}

          {!anulado && incAbierta && (
            <div className="flex flex-col gap-2 rounded-md border border-danger-bg p-3">
              <span className="text-sm text-danger-fg">Incidencia en {incAbierta.etapa?.nombre} · {fechaCorta(incAbierta.fecha)}</span>
              {incAbierta.nota && <span>{incAbierta.nota}</span>}
              <div><Button onClick={() => abrir('resolver')}>Resolver</Button></div>
            </div>
          )}

          {!anulado && !e.es_final && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-2 p-3">
              <span className="text-sm text-fg-2">Siguiente paso</span>
              <span className="font-medium">{e.etapa_siguiente_nombre}</span>
              {[...duras, ...blandas].map((p, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className={cn('text-sm', p.dura ? 'text-danger-fg' : 'text-warn-fg')}>{p.dura ? '' : 'Aviso: '}{p.mensaje}</span>
                  <ArregloPuerta e={e} p={p} onHecho={() => cargar().catch((x) => setErr(mensajeError(x)))} onCompletar={() => setEditar(true)} />
                </div>
              ))}
              {err && <span className="text-sm text-danger-fg">{err}</span>}
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {e.etapa_actual_clave && !incAbierta && <Button onClick={() => abrir('incidencia')}>Incidencia</Button>}
                {puedeMarcar && <Button variant="primary" disabled={duras.length > 0} onClick={() => avanzar()}>{blandas.length > 0 && duras.length === 0 ? `${e.etapa_siguiente_nombre} igualmente` : e.etapa_siguiente_nombre}</Button>}
              </div>
            </div>
          )}
          {!anulado && !e.es_final && puedeRevisar && !e.revisar_manual && (
            <button onClick={() => abrir('revisar')} className="-mt-2 self-start text-sm text-fg-3 hover:text-fg">Marcar para revisar…</button>
          )}
          {!anulado && gestion && anteriores.length > 0 && (
            <button onClick={() => abrir('volver')} className="-mt-2 self-start text-sm text-fg-3 hover:text-fg">Volver a una etapa anterior…</button>
          )}

          <div className="flex flex-col">
            <Field label={vocab.producto}>{e.producto_nombre ?? '—'}</Field>
            {e.producto_id && fichaT && (tieneFicha(fichaT)
              ? <div className="mb-1 ml-[128px] rounded-sm bg-bg-3 px-2 py-1 text-sm text-fg-2 max-md:ml-0" title="Ficha técnica">{resumenFicha(fichaT, tienda?.ajustes as Record<string, unknown>)}</div>
              : puedeEditarProd && usaFichas && <Link to={`/productos?q=${encodeURIComponent(fichaT.nombre)}`} className="mb-1 ml-[128px] self-start rounded-sm bg-warn-bg px-2 py-0.5 text-sm text-warn-fg hover:underline max-md:ml-0">{gr.Con('producto', 'este')} no tiene ficha técnica: créala</Link>)}
            {(e.complementos || usaComplementos) && <Field label={fic.etiqueta}>{e.complementos || '—'}</Field>}
            <CamposVista campos={camposEnc} datos={datos} extra={(c) => (
              <NotaCampo etiqueta={c.etiqueta} nota={notas[c.clave]} autor={notas[c.clave]?.usuario_id ? autores[notas[c.clave].usuario_id!] : undefined}
                editable={!anulado} onGuardar={async (t) => { await ponerNotaCampo(e.id, c.clave, t); setNotas(await listarNotasCampo(e.id)) }} />
            )} />
            <Field label={vocab.proveedor}>{e.proveedor_id ? <Link to={`/proveedores/${e.proveedor_id}`} className="hover:underline">{e.proveedor_nombre}</Link> : '—'}</Field>
            {din.usa && (
              <Field label="Importe">
                {e.importe == null ? <span className="text-fg-3">Sin importe{Number(e.a_cuenta) > 0 && <span className="text-warn-fg"> · {dinero(e.a_cuenta, din.moneda)} entregados a cuenta</span>}</span> : <>
                  {dinero(e.importe, din.moneda)}
                  {Number(e.a_cuenta) > 0 && <span className="text-fg-3"> · {dinero(e.a_cuenta, din.moneda)} a cuenta</span>}
                  {pendiente(e)! > 0 ? <span className="text-warn-fg"> · faltan {dinero(pendiente(e), din.moneda)}</span> : <span className="text-ok-fg"> · pagado</span>}
                </>}
              </Field>
            )}
            <Field label="Creado">{fechaCorta(e.creado_en)}</Field>
          </div>

          {cli && (
            <div className="flex flex-col gap-1">
              <SectionLabel>{vocab.cliente}</SectionLabel>
              <Field label="Teléfono">{cli.telefono ?? '—'}</Field>
              <Field label="Correo">{cli.email ?? '—'}</Field>
              <CamposVista soloRellenos campos={camposCli} datos={medidas} />
              {!anulado && !e.es_final && <MedidasDelEncargo encargoId={e.id} campos={camposCli} actuales={cli.datos} />}
            </div>
          )}

          {defChecks.length > 0 && (
            <div className="flex flex-col gap-1">
              <SectionLabel>Comprobaciones</SectionLabel>
              {defChecks.map((c) => (
                <label key={c.clave} className={cn('flex h-7 items-center gap-2', anulado ? 'opacity-60' : 'cursor-pointer')}>
                  <input type="checkbox" disabled={anulado} checked={!!checks[c.clave]} onChange={() => toggleCheck(c.clave)} className="h-3.5 w-3.5 accent-gray-12" />
                  <span>{c.etiqueta}</span>
                  {!c.dura && <span className="ml-auto text-sm text-fg-3">recomendado</span>}
                </label>
              ))}
            </div>
          )}
          {conMaterial && <MaterialesEncargo sugerido={fichaT ? { tipo: fichaT.material_tipo, consumo: fichaT.consumo } : null} refresco={ultima} encargo={e} editable={rol !== 'LOGISTICA'} onCambio={() => cargar().catch(() => {})} />}
          <div className="flex-1" />
          {rol === 'ADMIN' && !anulado && <Button variant="danger" className="self-start" onClick={() => abrir('anular')}>Anular {min(vocab.encargo)}</Button>}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col max-md:min-h-[70vh]">
          <RTabs.Root defaultValue="hilo" className="flex min-h-0 flex-1 flex-col">
            <RTabs.List className="flex h-9 items-center border-b border-border px-5">
              <RTabs.Trigger value="hilo" className={TAB}>Hilo</RTabs.Trigger>
              <RTabs.Trigger value="comentarios" className={TAB}>Comentarios <span className="text-fg-3">{coms.length}</span></RTabs.Trigger>
              <RTabs.Trigger value="mensajes" className={TAB}>Mensajes</RTabs.Trigger>
              <RTabs.Trigger value="adjuntos" className={TAB}>Adjuntos</RTabs.Trigger>
            </RTabs.List>
            <RTabs.Content value="hilo" className="flex max-w-[640px] flex-col gap-1 overflow-auto p-5">
              {!anulado && (
                <form onSubmit={enviarComentario} className="mb-3 flex flex-col gap-1">
                  <label htmlFor="nuevo-comentario"><SectionLabel>Añadir comentario</SectionLabel></label>
                  <Textarea id="nuevo-comentario" rows={2} value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="Escribe algo para el equipo…"
                    onKeyDown={(k) => { if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) { k.preventDefault(); enviarComentario(k) } }} />
                  <div className="flex items-center justify-end gap-2"><span className="text-xs text-fg-3 max-md:hidden">Ctrl/⌘ + Intro para enviar</span><Button size="sm" type="submit" disabled={!texto.trim()}>Enviar</Button></div>
                </form>
              )}
              {[...porDia.entries()].map(([dia, evs]) => (
                <React.Fragment key={dia}>
                  <SectionLabel className="pb-1 pt-3">{dia}</SectionLabel>
                  {evs.map((ev) => {
                    if (ev.tipo === 'msg') return (
                      <div key={ev.m.id} className="flex items-start gap-2.5 py-1.5">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-gray-8 bg-bg" />
                        <div className="flex flex-col gap-0.5">
                          <div>Mensaje · <span className="font-medium">{ev.m.nombre ?? 'Mensaje'}</span></div>
                          <span className="text-sm text-fg-3">{hora(ev.m.fecha)} · {ev.m.canal === 'WHATSAPP' ? 'WhatsApp' : 'Correo'}</span>
                        </div>
                      </div>
                    )
                    if (ev.tipo === 'com') return (
                      <div key={ev.c.id} className="flex items-start gap-2.5 py-1.5">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-6" />
                        <div className="flex flex-col gap-0.5"><div>Comentario{ev.c.usuario_id && autores[ev.c.usuario_id] ? <span className="text-fg-3"> · {autores[ev.c.usuario_id]} · {hora(ev.c.fecha)}</span> : <span className="text-fg-3"> · {hora(ev.c.fecha)}</span>}</div><span className="whitespace-pre-wrap text-sm text-fg-2">{ev.c.texto}</span></div>
                      </div>
                    )
                    const h = ev.h
                    const inc = h.tipo === 'INCIDENCIA'
                    const d = diasDe.get(h.id)
                    const editable = gestion && !anulado && !h.deshecho_en
                    return (
                      <div key={h.id} className="flex items-start gap-2.5 py-1.5">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-6', inc && !h.resuelto_en && 'bg-danger')}
                          style={!inc && h.etapa?.color ? { background: h.etapa.color } : undefined} />
                        <div className="flex flex-col gap-0.5">
                          <div className={cn(h.deshecho_en && 'line-through text-fg-3')}>
                            {inc ? 'Incidencia en ' : h.tipo === 'REENTRADA' ? 'Vuelve a ' : ''}<span className="font-medium">{h.etapa?.nombre}</span>
                            {inc && <Tag color={h.resuelto_en ? 'gray' : tagColorFromHex('#c6')} className="ml-2">{h.resuelto_en ? 'resuelta' : 'incidencia'}</Tag>}
                          </div>
                          <span className="text-sm text-fg-3">
                            {editable
                              ? <button className="underline decoration-dotted underline-offset-2 hover:text-fg" title="Cambiar fecha" onClick={() => abrir({ fecha: h })}>{hora(h.fecha)}</button>
                              : hora(h.fecha)}
                            {h.nota ? ` · ${h.nota}` : ''}
                            {!anulado && !h.deshecho_en && (gestion || rol === 'ATENCION' || h.usuario_id === session?.user.id) && (
                              <button className="ml-1.5 underline decoration-dotted underline-offset-2 hover:text-fg" onClick={() => abrir({ nota: h })}>{h.nota ? 'editar nota' : 'añadir nota'}</button>
                            )}
                            {h.deshecho_en ? ' · deshecho' : ''}
                            {d ? ` · ${d.n} ${d.n === 1 ? 'día' : 'días'}${d.hoy ? ' hasta hoy' : ''}` : ''}
                          </span>
                          {inc && h.resuelto_en && (
                            <span className="text-sm text-fg-3">Resuelta el {fechaCorta(h.resuelto_en)}{h.resolucion ? ` · ${h.resolucion}` : ''}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </RTabs.Content>
            <RTabs.Content value="comentarios" className="flex max-w-[640px] flex-col gap-3 overflow-auto p-5">
              {!anulado && (
                <form onSubmit={enviarComentario} className="flex flex-col gap-1">
                  <Textarea aria-label="Nuevo comentario" rows={2} value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="Escribe algo para el equipo…"
                    onKeyDown={(k) => { if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) { k.preventDefault(); enviarComentario(k) } }} />
                  <div className="flex items-center justify-end gap-2"><span className="text-xs text-fg-3 max-md:hidden">Ctrl/⌘ + Intro para enviar</span><Button size="sm" type="submit" disabled={!texto.trim()}>Enviar</Button></div>
                </form>
              )}
              {coms.length === 0 && <span className="text-fg-3">Sin comentarios.</span>}
              {[...coms].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((c) => (
                <div key={c.id} className="flex flex-col gap-0.5 border-b border-border-light pb-2">
                  <span className="text-sm text-fg-3">{(c.usuario_id && autores[c.usuario_id]) || 'Alguien del equipo'} · {fechaCorta(c.fecha)} {hora(c.fecha)}</span>
                  <span className="whitespace-pre-wrap">{c.texto}</span>
                </div>
              ))}
            </RTabs.Content>
            <RTabs.Content value="mensajes" className="flex max-w-[640px] flex-col gap-3 overflow-auto p-5">
              {!anulado && puedeAvisar && <div><Button onClick={() => setMensaje({ inicial: plantillaEtapa?.id ?? null })}>Nuevo mensaje</Button></div>}
              {envios.length === 0 && <span className="text-fg-3">Todavía no se ha avisado {gr.con('cliente', 'al')} desde aquí.</span>}
              {envios.map((m) => (
                <div key={m.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-sm text-fg-3">
                    <span className="font-medium text-fg">{m.nombre ?? 'Mensaje'}</span>
                    <span>· {m.canal === 'WHATSAPP' ? 'WhatsApp' : 'Correo'} · {fechaCorta(m.fecha)} {hora(m.fecha)}</span>
                  </div>
                  {m.texto && <p className="whitespace-pre-wrap text-fg-2">{m.texto}</p>}
                </div>
              ))}
            </RTabs.Content>
            <RTabs.Content value="adjuntos" className="flex max-w-[760px] flex-col overflow-auto p-5">
              <Adjuntos entidad="encargo" entidadId={e.id} soloLectura={anulado || rol === 'LOGISTICA'} />
            </RTabs.Content>
          </RTabs.Root>
        </section>
      </div>

      {undo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center">
          <UndoBar className="pointer-events-auto w-[420px] max-w-full" seconds={Number((tienda?.ajustes as Record<string, unknown> | undefined)?.segundos_deshacer ?? 8)} message={undo.msg} onUndo={deshacer} onExpire={() => setUndo(null)} />
        </div>
      )}

      <EnviarMensaje open={!!mensaje} onOpenChange={(o) => !o && setMensaje(null)} encargo={e} cliente={cli}
        plantillas={plantillasMsg} inicial={mensaje?.inicial} campos={[...camposEnc, ...camposCli]}
        onEnviado={() => listarEnvios(e.id).then(setEnvios).catch(() => {})} />

      <EditarEncargo open={editar} onOpenChange={setEditar} encargo={e} cliente={cli} camposEnc={camposEnc} camposCli={camposCli}
        onSaved={() => cargar().catch((x) => setErr(mensajeError(x)))} />

      <Dialog open={!!modal && typeof modal === 'object' && 'nota' in modal} onOpenChange={() => setModal(null)} error={modalErr}
        title={modal && typeof modal === 'object' && 'nota' in modal ? `Nota de «${modal.nota.etapa?.nombre ?? ''}»` : 'Nota'}
        actions={[{ label: 'Guardar', onClick: () => hacer(() => editarNotaHito((modal as { nota: Hito }).nota.id, nota)) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Nota de este paso (vacío = sin nota)" />
      </Dialog>

      {ficha && <FichaImprimible open={!!ficha} onOpenChange={(o) => !o && setFicha(null)} html={ficha.html} texto={ficha.texto} titulo={`Ficha ${num3(e)} · ${e.cliente_nombre}`} />}

      <Dialog open={modal === 'revisar'} onOpenChange={() => setModal(null)} error={modalErr}
        title="Marcar para revisar"
        description={`${gr.Con('encargo', 'el')} no cambia de etapa: entra en la bandeja «Revisar» hasta que alguien quite la marca.`}
        actions={[{ label: 'Marcar', onClick: () => hacer(() => marcarRevisar(e.id, nota)) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="¿Qué hay que revisar? (opcional)" />
      </Dialog>

      <Dialog open={modal === 'final'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`${e.etapa_siguiente_nombre}: ${num3(e)} · ${e.cliente_nombre}`}
        description={`${e.producto_nombre ? `${gr.Con('producto', 'el')} «${e.producto_nombre}» ` : `${gr.Con('encargo', 'el')} `}pasa a «${e.etapa_siguiente_nombre}» y sale de la lista de trabajo. Se puede deshacer justo después.`}
        actions={[{ label: e.etapa_siguiente_nombre ?? 'Confirmar', variant: 'primary', onClick: () => avanzar(true) }]} />

      <Dialog open={modal === 'incidencia'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`Incidencia en ${e.etapa_actual_nombre ?? ''}`}
        description={`${gr.Con('encargo', 'el')} se queda en esta etapa y pasa a «Revisar» hasta que se resuelva.`}
        actions={[{ label: 'Registrar incidencia', variant: 'danger', disabled: !nota.trim(),
          onClick: () => hacer(() => crearHito(e.id, e.etapa_actual_clave!, { tipo: 'INCIDENCIA', nota: nota.trim() })) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="¿Qué ha pasado?" />
      </Dialog>

      <Dialog open={modal === 'resolver'} onOpenChange={() => setModal(null)} error={modalErr}
        title="Resolver incidencia" description={`${gr.Con('encargo', 'el')} sigue en ${e.etapa_actual_nombre} y sale de «Revisar».`}
        actions={[{ label: 'Resolver', onClick: () => hacer(() => resolverIncidencia(e.id, nota)) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Cómo se ha resuelto (opcional)" />
      </Dialog>

      <Dialog open={modal === 'volver'} onOpenChange={() => setModal(null)} error={modalErr}
        title="Volver a una etapa anterior"
        description="Para arreglos o repeticiones. Las etapas posteriores tendrán que marcarse otra vez; el hilo conserva lo anterior."
        actions={[{ label: 'Volver', disabled: !destino, onClick: () => hacer(() => crearHito(e.id, destino, { tipo: 'REENTRADA', nota: nota.trim() || undefined })) }]}>
        <Select value={destino} onChange={(x) => setDestino(x.target.value)}>
          <option value="">Elige la etapa…</option>
          {anteriores.map((x) => <option key={x.id} value={x.clave}>{x.nombre}</option>)}
        </Select>
        <Input value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Motivo (opcional)" />
      </Dialog>

      <Dialog open={modal === 'anular'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`Anular ${min(vocab.encargo)} ${num3(e)}`}
        description={`No se borra: queda en «Anulados» con una copia de cómo estaba y se puede recuperar. El número ${num3(e)} no se reutiliza.`}
        actions={[{ label: 'Anular', variant: 'danger', onClick: () => hacer(async () => {
          if (recibidoMat.length) await liberarMaterial(e.id, devolverMat)
          await anularEncargo(e.id, nota)
        }, () => {
          const manual = pendientesAlAnular(impacto)
          if (manual.length) avisar({ tipo: 'aviso', persistente: true, texto: `${num3(e)} anulado. Queda por hacer a mano: ${manual.join(' · ')}` })
          nav('/encargos')
        }) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Motivo (opcional)" />
        {recibidoMat.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 rounded-sm bg-bg-3 px-3 py-2 text-sm">
            <div className="font-medium">{vocab.material} ya asignad{gr.o('material')}: {recibidoMat.map((x) => `${x.material} (${x.cantidad} ${ajMat.unidad})`).join(', ')}</div>
            <label className="flex items-center gap-2"><input type="radio" checked={devolverMat} onChange={() => setDevolverMat(true)} /> Devolverl{gr.o('material')} al stock (no se ha usado)</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!devolverMat} onChange={() => setDevolverMat(false)} /> Darl{gr.o('material')} por usad{gr.o('material')} y marcar {gr.con('encargo', 'el')} para reaprovechar</label>
          </div>
        )}
        {impacto && pendientesAlAnular(impacto).length > 0 && (
          <div className="mt-2 rounded-sm bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <div className="mb-1 font-medium">Después tendrás que hacer a mano:</div>
            <ul className="m-0 pl-4">{pendientesAlAnular(impacto).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
      </Dialog>

      <Dialog open={modal === 'recuperar'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`Recuperar ${min(vocab.encargo)} ${num3(e)}`}
        description="Puede volver tal como estaba o empezar el flujo desde la primera etapa (el hilo anterior se conserva tachado)."
        actions={[
          { label: 'Empezar de nuevo', variant: 'default', onClick: () => hacer(() => recuperarEncargo(e.id, true)) },
          { label: 'Tal como estaba', onClick: () => hacer(() => recuperarEncargo(e.id, false)) },
        ]} />

      <Dialog open={!!modal && typeof modal === 'object' && 'fecha' in modal} onOpenChange={() => setModal(null)} error={modalErr}
        title="Cambiar fecha"
        description={modal && typeof modal === 'object' && 'fecha' in modal ? `${modal.fecha.tipo === 'INCIDENCIA' ? 'Incidencia en ' : ''}${modal.fecha.etapa?.nombre}. No puede ser futura ni saltarse el paso anterior o el siguiente.` : ''}
        actions={[{ label: 'Guardar', disabled: !fecha, onClick: () => hacer(() => cambiarFechaHito((modal as { fecha: Hito }).fecha.id, new Date(fecha))) }]}>
        <Input type="datetime-local" value={fecha} max={aLocal(new Date().toISOString())} onChange={(x) => setFecha(x.target.value)} />
      </Dialog>
    </>
  )
}

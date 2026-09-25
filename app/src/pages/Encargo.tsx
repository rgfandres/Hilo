import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as RTabs from '@radix-ui/react-tabs'
import { useAuth } from '@/auth/AuthProvider'
import {
  anularEncargo, cambiarFechaCheck, cambiarFechaHito, comentar, crearHito, deshacerUltimoHito, listarAnulaciones, listarComentarios,
  editarNotaHito, impactoAnular, type ImpactoAnular, listarNotasCampo, ponerNotaCampo, type NotaCampo as TNota, listarEtapas, listarHitos, marcarCheck, marcarRevisar, mensajeError, obtenerEncargo, quitarRevisar, recuperarEncargo, resolverIncidencia,
  type Anulacion,
} from '@/data/encargos'
import { supabase } from '@/lib/supabase'
import type { Cliente, Comentario, EncargoEstado, Etapa, Hito } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { marcaDirecto, motivosRevision } from '@/lib/bandejas'
import { Adjuntos } from '@/components/Adjuntos'
import { CamposVista } from '@/components/CampoInput'
import { NotaCampo } from '@/components/NotaCampo'
import { ArregloPuerta } from '@/components/ArregloPuerta'
import { useTiempoReal } from '@/lib/tiempoReal'
import { FichaImprimible } from '@/components/FichaImprimible'
import { esPlantillaAntigua, fichaHTML, fichaTexto, obtenerPlantillaFicha, plantillaDefecto } from '@/data/ficha'
import { listarEquipo, listarPuertas, type PuertaDef } from '@/data/ajustes'
import { MaterialesEncargo } from '@/components/Material'
import { MedidasDelEncargo } from '@/components/HistorialMedidas'
import { ajustesFicha, fichaProducto, tieneFicha, type FichaTecnica } from '@/data/catalogos'
import { resumenFicha } from '@/pages/Productos'
import { ajustesMaterial, desasignarMaterial, lineasDeEncargo } from '@/data/materiales'
import { Button, Dialog, Tag, Field, SectionLabel, Input, Textarea, UndoBar, tagColorFromHex, useAvisos } from '@/ui'
import { cn, fechaCorta, num3, locale, dinero, ajustesDinero, pendiente, zona, aHoraTienda, deHoraTienda, diasEntre } from '@/lib/utils'
import { camposDe, checksDelFlujo, plantillas, type Campo, type CheckDef } from '@/data/config'
import { min } from '@/lib/vocab'
import { EditarEncargo } from '@/components/EditarEncargo'
import { tiposAparte } from '@/lib/listaBandejas'
import { EnviarMensaje } from '@/components/EnviarMensaje'
import { listarEnvios, listarPlantillas, type MensajeEnviado, type PlantillaMensaje } from '@/data/mensajes'

const TAB = 'flex h-9 items-center gap-1.5 px-1 mr-4 text-base font-medium text-fg-2 data-[state=active]:text-fg data-[state=active]:shadow-[inset_0_-1px_0_var(--color-gray-12)]'

type Modal = null | 'incidencia' | 'resolver' | 'volver' | 'anular' | 'recuperar' | 'revisar' | 'final' | { fecha: Hito } | { nota: Hito }

const hora = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { timeZone: zona(), hour: '2-digit', minute: '2-digit' })
/** Días de calendario entre dos momentos (20 → 23 = 3), en hora local */
const dias = (a: string, b: string | Date) => diasEntre(a, b)
/** yyyy-MM-ddTHH:mm en la hora de la tienda, para <input type="datetime-local"> */
const aLocal = (iso: string) => aHoraTienda(iso)

export function Encargo() {
  const { id } = useParams()
  const [spA, setSpA] = useSearchParams()
  const nav = useNavigate()
  const { rol, vocab, tienda, gr, session, nombresRol } = useAuth()
  const avisar = useAvisos()
  const din = ajustesDinero(tienda?.ajustes as Record<string, unknown>)
  const [impacto, setImpacto] = React.useState<ImpactoAnular | null>(null)
  const [impactoErr, setImpactoErr] = React.useState(false)
  const [devolverMat, setDevolverMat] = React.useState(true)
  const ajMat = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const conMaterial = ajMat.activo
  const recibidoMat = impacto?.material_recibido ?? []

  const [e, setE] = React.useState<EncargoEstado | null>(null)
  const fic = ajustesFicha(tienda?.ajustes as Record<string, unknown>)
  // Ficha técnica y complementos: solo si la tienda los usa; el aviso de «sin ficha», solo a quien puede crearla
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
  const [puertasTipo, setPuertasTipo] = React.useState<PuertaDef[]>([])
  // Volver atrás: si hay que decidir qué pasa con el material recibido
  const [matVolver, setMatVolver] = React.useState<{ ids: string[] } | null>(null)
  const [devolver, setDevolver] = React.useState<'si' | 'no'>('si')
  const [confirmarMarcar, setConfirmarMarcar] = React.useState(false)
  const [filtroHilo, setFiltroHilo] = React.useState<'todo' | 'pasos' | 'com' | 'msg'>('todo')
  const [anul, setAnul] = React.useState<Anulacion | null>(null)
  const [checks, setChecks] = React.useState<Record<string, boolean>>({})
  const [fechasCheck, setFechasCheck] = React.useState<Record<string, string | null>>({})
  const [fechaCheck, setFechaCheck] = React.useState<{ clave: string; etiqueta: string; valor: string } | null>(null)
  const [errFechaCheck, setErrFechaCheck] = React.useState<string | null>(null)
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
  const [noExiste, setNoExiste] = React.useState(false)

  const cargar = React.useCallback(async () => {
    if (!id) return
    const enc = await obtenerEncargo(id)
    setE(enc)
    if (!enc) { setNoExiste(true); return }
    setNoExiste(false)
    const [h, c, cl, ck, dc, ps, et, an, pm, ev] = await Promise.all([
      listarHitos(id), listarComentarios(id),
      supabase.from('cliente').select('*').eq('id', enc.cliente_id).maybeSingle(),
      supabase.from('check_encargo').select('clave,marcado,fecha').eq('encargo_id', id),
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
    const delTipo = et.filter((x) => x.tipo_encargo_id === enc.tipo_encargo_id)
    setEtapas(delTipo)
    listarPuertas(delTipo.map((x) => x.id)).then(setPuertasTipo).catch(() => {})
    setAnul(an[enc.id] ?? null)
    setHitos(h); setComs(c); setCli((cl.data as Cliente) ?? null)
    listarNotasCampo(id).then(setNotas).catch(() => {})
    // Nombres de quien escribe (si se puede leer el equipo)
    listarEquipo(enc.tienda_id).then((eq) => setAutores(Object.fromEntries(eq.map((m) => [m.user_id, m.email.split('@')[0]])))).catch(() => {})
    setChecks(Object.fromEntries(((ck.data ?? []) as { clave: string; marcado: boolean }[]).map((x) => [x.clave, x.marcado])))
    setFechasCheck(Object.fromEntries(((ck.data ?? []) as { clave: string; fecha: string | null }[]).map((x) => [x.clave, x.fecha])))
  }, [id, tienda])

  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])
  // Desde la lista: «Preparar mensaje» llega con ?avisar=<plantilla>
  const avisarPid = spA.get('avisar')
  React.useEffect(() => {
    if (!avisarPid || !e || !plantillasMsg.length) return
    setMensaje({ inicial: avisarPid })
    setSpA((s) => { s.delete('avisar'); return s }, { replace: true })
  }, [avisarPid, e, plantillasMsg, setSpA])
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
    if (m === 'anular' && e) { setImpacto(null); setImpactoErr(false); impactoAnular(e.id).then(setImpacto).catch(() => setImpactoErr(true)) }
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
  /** Volver a un paso hecho: si se vuelve antes del paso que exige el material, se pregunta qué hacer con lo recibido */
  async function abrirVolver(x: Etapa) {
    if (!e) return
    setDestino(x.clave); setNota(''); setModalErr(null); setMatVolver(null); setDevolver('si')
    const conMat = etapas.filter((y) => puertasTipo.some((pu) => pu.etapa_destino_id === y.id && pu.tipo === 'MATERIAL'))
    const primeraMat = conMat.length ? Math.min(...conMat.map((y) => y.orden)) : null
    if (primeraMat != null && x.orden < primeraMat) {
      const ls = await lineasDeEncargo(e.id).catch(() => [])
      const rec = ls.filter((l) => l.estado === 'RECIBIDO').map((l) => l.id)
      if (rec.length) setMatVolver({ ids: rec })
    }
    setModal('volver')
  }
  async function abrirFicha() {
    if (!e || !tienda) return
    try {
      // La ficha propia del periodo del encargo, si la tiene; si no, la de la tienda
      const pf = e.periodo_id ? ((await supabase.from('periodo').select('ajustes').eq('id', e.periodo_id).maybeSingle()).data?.ajustes as Record<string, unknown> | undefined)?.ficha as string | undefined : undefined
      const plantilla = (pf && !esPlantillaAntigua(pf) ? pf : null) ?? (await obtenerPlantillaFicha(tienda.id)) ?? plantillaDefecto(vocab)
      const d = {
        tienda: tienda.nombre, logo: (tienda.ajustes as Record<string, unknown>)?.logo_url as string | undefined, numero: e.numero, serie: e.serie, nombre: e.cliente_nombre ?? '', telefono: cli?.telefono ?? null, email: cli?.email ?? null,
        producto: e.producto_nombre, proveedor: e.proveedor_nombre, etapa: e.etapa_actual_nombre, tipo: e.tipo_nombre,
        camposEncargo: camposEnc, datosEncargo: e.datos ?? {}, camposCliente: camposCli, datosCliente: cli?.datos ?? {},
        hilo: hitos.filter((h) => !h.deshecho_en && h.tipo !== 'INCIDENCIA').sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((h) => ({ etapa: h.etapa?.nombre ?? '', fecha: h.fecha, nota: h.nota })),
        creado: e.creado_en, complementos: e.complementos ?? null, notasCliente: (cli as { notas?: string | null } | null)?.notas ?? null,
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
    try { await marcarCheck(e.id, clave, v); await cargar() } catch (x) { setChecks((c) => ({ ...c, [clave]: !v })); setErr(mensajeError(x)) }
  }
  async function enviarComentario(ev: React.SyntheticEvent) {
    ev.preventDefault()
    if (!e || !texto.trim()) return
    try { await comentar(e.id, texto.trim()); setTexto(''); setComs(await listarComentarios(e.id)) } catch (x) { setErr(mensajeError(x)) }
  }

  if (!e) return (
    <div className="flex flex-col items-start gap-2 p-8 text-fg-3">
      <span>{noExiste ? `${gr.Con('encargo', 'este')} no existe o no tienes acceso.` : err ?? 'Cargando…'}</span>
      {(noExiste || err) && <Link to="/encargos" className="underline">Volver a {min(vocab.encargos)}</Link>}
    </div>
  )

  const anulado = e.estado === 'ANULADO'
  const gestion = rol === 'ADMIN' || rol === 'OPERATIVO'
  const puedeRevisar = rol === 'ADMIN' || rol === 'OPERATIVO' || rol === 'ATENCION'
  // Escribir al cliente (y dejarlo anotado) es cosa de administración, operativo y atención
  const puedeAvisar = puedeRevisar
  const motivos = motivosRevision(e, (tienda?.ajustes ?? {}) as Record<string, unknown>).filter((m) => !m.startsWith('Incidencia'))
  const puedeEditar = !anulado && (gestion || rol === 'ATENCION' || rol === 'LOGISTICA')
  const datos = e.datos ?? {}
  const medidas = cli?.datos ?? {}
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
  ].filter((ev) => filtroHilo === 'todo' || (filtroHilo === 'pasos' ? ev.tipo === 'hito' : ev.tipo === filtroHilo))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const porDia = new Map<string, typeof eventos>()
  for (const ev of eventos) { const k = fechaCorta(ev.fecha); porDia.set(k, [...(porDia.get(k) ?? []), ev]) }

  return (
    <>
      <PageHeader title={<span><Link to={tiposAparte(tienda?.ajustes as Record<string, unknown> | undefined).includes(e.tipo_encargo_id) ? `/encargos?t=${e.tipo_encargo_id}` : '/encargos'} className="text-fg-3">{tiposAparte(tienda?.ajustes as Record<string, unknown> | undefined).includes(e.tipo_encargo_id) ? e.tipo_nombre ?? vocab.encargos : vocab.encargos}</Link><span className="mx-2 text-border-strong">/</span>{num3(e)} · {e.cliente_nombre}</span>}>
        {!anulado && puedeAvisar && <Button variant="ghost" onClick={() => setMensaje({ inicial: plantillaEtapa?.id ?? null })}>Avisar {gr.con('cliente', 'al')}</Button>}
        {puedeEditar && <Button variant="ghost" onClick={() => setEditar(true)}>Editar</Button>}
        {!anulado && rol !== 'LOGISTICA' && (
          <Button variant="ghost" asChild><Link to={`/encargos/nuevo?cliente=${e.cliente_id}&desde=${e.id}`}>{(tienda?.ajustes as Record<string, unknown> | undefined)?.cliente_por_encargo === true ? `+ Otr${gr.o('encargo')} ${min(vocab.encargo)}` : `+ ${vocab.encargo} para ${gr.con('cliente', 'este')}`}</Link></Button>
        )}
        <Button variant="ghost" onClick={abrirFicha}>Ver ficha</Button>
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
              <span className="font-medium">Anulad{gr.o('encargo')} {anul ? `el ${fechaCorta(anul.fecha)}` : ''}</span>
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

          {err && <div className="flex items-start gap-2 rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg"><span className="flex-1">{err}</span><button className="underline" onClick={() => setErr(null)}>Cerrar</button></div>}
          {!anulado && motivos.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-warn-bg bg-warn-bg/40 p-3">
              <span className="text-sm font-medium text-warn-fg">En «Revisar» por:</span>
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-sm text-fg-2">{motivos.map((m) => <li key={m}>{m}</li>)}</ul>
              <span className="text-sm text-fg-3">Última modificación: {fechaCorta(e.actualizado_en)}</span>
              {e.revisar_manual && puedeRevisar && (
                <div><Button size="sm" onClick={() => quitarRevisar(e.id).then(cargar).catch((x) => setErr(mensajeError(x)))}>Quitar marca: ya está revisad{gr.o('encargo')}</Button></div>
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

          {!anulado && (
            <div className="flex flex-col rounded-md border border-border p-3">
              <SectionLabel className="pb-1.5">Pasos</SectionLabel>
              {etapas.map((x) => {
                const hecho = e.etapa_actual_orden != null && x.orden <= e.etapa_actual_orden
                const actual = x.id === e.etapa_actual_id
                const siguiente = x.id === e.etapa_siguiente_id
                const fechaPaso = hecho ? pasos.filter((h) => h.etapa_id === x.id).map((h) => h.fecha).sort().pop() : undefined
                const quien = nombresRol[x.rol_ejecuta as keyof typeof nombresRol] ?? x.rol_ejecuta
                const suyo = marcaDirecto(rol, x.rol_ejecuta)
                const puedeVolver = gestion && hecho && !actual
                return (
                  <div key={x.id} className="flex gap-2.5">
                    <div className="flex w-4 shrink-0 flex-col items-center">
                      <span className={cn('mt-1 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none',
                        hecho ? 'border-transparent text-white' : siguiente ? 'border-gray-12 bg-bg' : 'border-border bg-bg')}
                        style={hecho ? { background: x.color ?? 'var(--color-gray-11)' } : undefined}>{hecho ? '✓' : ''}</span>
                      {x !== etapas[etapas.length - 1] && <span className={cn('w-px flex-1', hecho && !actual ? 'bg-gray-8' : 'bg-border')} />}
                    </div>
                    <div className={cn('flex min-w-0 flex-1 flex-col gap-1 pb-2.5', !hecho && !siguiente && 'text-fg-3')}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        {puedeVolver
                          ? <button className="text-left font-medium hover:underline" title={`Volver a «${x.nombre}»`} onClick={() => abrirVolver(x)}>{x.nombre}</button>
                          : <span className={cn(actual || siguiente ? 'font-medium' : '')}>{x.nombre}</span>}
                        {actual && <Tag color="gray">ahora</Tag>}
                        {fechaPaso && <span className="text-sm text-fg-3">{fechaCorta(fechaPaso)}</span>}
                        {!hecho && <span className="text-sm text-fg-3">lo marca {quien}</span>}
                      </div>
                      {siguiente && !e.es_final && (
                        <div className="flex flex-col gap-1.5">
                          {[...duras, ...blandas].map((pu, i) => (
                            <div key={i} className="flex flex-col gap-1">
                              <span className={cn('text-sm', pu.dura ? 'text-danger-fg' : 'text-warn-fg')}>{pu.dura ? '' : 'Aviso: '}{pu.mensaje}</span>
                              {(suyo || gestion) && <ArregloPuerta e={e} p={pu} onHecho={() => cargar().catch((z) => setErr(mensajeError(z)))} onCompletar={() => setEditar(true)} />}
                            </div>
                          ))}
                          {incAbierta && <span className="text-sm text-danger-fg">Hay una incidencia abierta: resuélvela para poder avanzar.</span>}
                          <div className="flex flex-wrap gap-1.5">
                            {suyo && <Button size="sm" variant="primary" disabled={duras.length > 0 || !!incAbierta} onClick={() => avanzar()}>{blandas.length > 0 && duras.length === 0 ? `Marcar «${x.nombre}» igualmente` : `Marcar «${x.nombre}»`}</Button>}
                            {!suyo && gestion && <Button size="sm" disabled={duras.length > 0 || !!incAbierta} onClick={() => setConfirmarMarcar(true)}>Marcar en nombre de {quien}…</Button>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-sm">
                {!e.es_final && e.etapa_actual_clave && !incAbierta && <button onClick={() => abrir('incidencia')} className="text-fg-3 hover:text-fg">Registrar incidencia…</button>}
                {!e.es_final && puedeRevisar && !e.revisar_manual && <button onClick={() => abrir('revisar')} className="text-fg-3 hover:text-fg">Marcar para revisar…</button>}
                {gestion && anteriores.length > 0 && <span className="text-fg-3">Pulsa un paso hecho para volver a él.</span>}
              </div>
            </div>
          )}

          <div className="flex flex-col">
            <Field label={vocab.producto}>{e.producto_nombre ?? '—'}</Field>
            {e.producto_id && fichaT && (tieneFicha(fichaT)
              ? <div className="mb-1 ml-[128px] rounded-sm bg-bg-3 px-2 py-1 text-sm text-fg-2 max-md:ml-0" title="Ficha técnica">{resumenFicha(fichaT, tienda?.ajustes as Record<string, unknown>)}</div>
              : puedeEditarProd && usaFichas && <Link to={`/productos?q=${encodeURIComponent(fichaT.nombre)}`} className="mb-1 ml-[128px] self-start rounded-sm bg-warn-bg px-2 py-0.5 text-sm text-warn-fg hover:underline max-md:ml-0">{gr.Con('producto', 'este')} no tiene ficha técnica: créala</Link>)}
            {(e.complementos || usaComplementos) && <Field label={fic.etiqueta}>{e.complementos || '—'}</Field>}
            {defChecks.map((c) => {
              const hecho = !!checks[c.clave]
              const et = etapas.find((x) => x.id === c.etapa_destino_id)
              const quien = et ? nombresRol[et.rol_ejecuta as keyof typeof nombresRol] ?? et.rol_ejecuta : null
              return (
                <Field key={c.clave} label={c.etiqueta}>
                  <span className="flex flex-wrap items-center gap-x-2">
                    {hecho ? <span className="text-ok-fg">✓ Hecho</span> : <span className="text-fg-3">Pendiente{quien ? ` · lo marca ${quien}` : ''}</span>}
                    {hecho && fechasCheck[c.clave] && (rol === 'ADMIN' && !anulado
                      ? <button type="button" className="text-sm text-fg-3 underline decoration-dotted underline-offset-2 hover:text-fg" title="Cambiar la fecha"
                          onClick={() => { setErrFechaCheck(null); setFechaCheck({ clave: c.clave, etiqueta: c.etiqueta, valor: aLocal(fechasCheck[c.clave]!) }) }}>{fechaCorta(fechasCheck[c.clave]!)}</button>
                      : <span className="text-sm text-fg-3">{fechaCorta(fechasCheck[c.clave]!)}</span>)}
                    {rol === 'ADMIN' && !anulado && <button type="button" className="text-sm text-fg-3 hover:text-fg hover:underline" onClick={() => toggleCheck(c.clave)}>{hecho ? 'desmarcar' : 'marcar'}</button>}
                  </span>
                </Field>
              )
            })}
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
            <Field label={`Cread${gr.o('encargo')}`}>{fechaCorta(e.creado_en)}</Field>
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

          {conMaterial && <MaterialesEncargo sugerido={fichaT ? { tipo: fichaT.material_tipo, consumo: fichaT.consumo } : null} refresco={ultima} encargo={e} editable={rol !== 'LOGISTICA'} onCambio={() => cargar().catch(() => {})} />}
          <div className="flex-1" />
          {rol === 'ADMIN' && !anulado && <Button variant="danger" className="self-start" onClick={() => abrir('anular')}>Anular {min(vocab.encargo)}</Button>}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col max-md:min-h-[70vh]">
          <RTabs.Root defaultValue="hilo" className="flex min-h-0 flex-1 flex-col">
            <RTabs.List className="flex h-9 items-center border-b border-border px-5">
              <RTabs.Trigger value="hilo" className={TAB}>Hilo</RTabs.Trigger>
              <RTabs.Trigger value="adjuntos" className={TAB}>Adjuntos</RTabs.Trigger>
            </RTabs.List>
            <RTabs.Content value="hilo" className="flex max-w-[640px] flex-col gap-1 overflow-auto p-5">
              <div className="mb-1 flex flex-wrap gap-1">
                {([['todo', 'Todo'], ['pasos', 'Pasos'], ['com', `Comentarios (${coms.length})`], ['msg', `Mensajes al ${min(vocab.cliente)} (${envios.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFiltroHilo(k)} className={cn('h-7 rounded-sm px-2 text-sm', filtroHilo === k ? 'bg-gray-12 text-bg' : 'text-fg-2 hover:bg-bg-4')}>{l}</button>
                ))}
              </div>
              {filtroHilo === 'msg' && <p className="m-0 text-sm text-fg-3">Aquí sale cada aviso que se prepara con «Avisar {gr.con('cliente', 'al')}» y se envía por WhatsApp o correo desde la app. Lo que se escribe por fuera de la app no queda registrado.</p>}
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
                          {ev.m.texto && <span className="line-clamp-3 whitespace-pre-wrap text-sm text-fg-2" title={ev.m.texto}>{ev.m.texto}</span>}
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
              {!anulado && (
                <form onSubmit={enviarComentario} className="mt-3 flex flex-col gap-1 border-t border-border-light pt-3">
                  <label htmlFor="nuevo-comentario"><SectionLabel>Añadir comentario</SectionLabel></label>
                  <Textarea id="nuevo-comentario" rows={2} value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="Escribe algo para el equipo…"
                    onKeyDown={(k) => { if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) { k.preventDefault(); enviarComentario(k) } }} />
                  <div className="flex items-center justify-end gap-2"><span className="text-xs text-fg-3 max-md:hidden">Ctrl/⌘ + Intro para enviar</span><Button size="sm" type="submit" disabled={!texto.trim()}>Enviar</Button></div>
                </form>
              )}
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
        description={`${gr.Con('encargo', 'el')} ${num3(e)}${e.producto_nombre ? ` (${e.producto_nombre})` : ''} pasa a «${e.etapa_siguiente_nombre}» y sale de la lista de trabajo. Se puede deshacer justo después.`}
        actions={[{ label: e.etapa_siguiente_nombre ?? 'Confirmar', variant: 'primary', onClick: () => avanzar(true) }]} />

      <Dialog open={modal === 'incidencia'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`Incidencia en ${e.etapa_actual_nombre ?? ''}`}
        description={`${gr.Con('encargo', 'el')} se queda en esta etapa y pasa a «Revisar» hasta que se resuelva.`}
        actions={[{ label: 'Registrar incidencia', variant: 'danger', disabled: !nota.trim(),
          onClick: () => hacer(() => crearHito(e.id, e.etapa_actual_clave!, { tipo: 'INCIDENCIA', nota: nota.trim() }),
            async () => { setSugerencia(plantillasMsg.find((p) => p.al_incidencia) ?? null); await cargar() }) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="¿Qué ha pasado?" />
      </Dialog>

      <Dialog open={modal === 'resolver'} onOpenChange={() => setModal(null)} error={modalErr}
        title="Resolver incidencia" description={`${gr.Con('encargo', 'el')} sigue en ${e.etapa_actual_nombre} y sale de «Revisar».`}
        actions={[{ label: 'Resolver', onClick: () => hacer(() => resolverIncidencia(e.id, nota)) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Cómo se ha resuelto (opcional)" />
      </Dialog>

      <Dialog open={modal === 'volver'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`¿Volver a «${etapas.find((x) => x.clave === destino)?.nombre ?? ''}»?`}
        description="Los pasos de después quedan deshechos y habrá que marcarlos otra vez. El hilo conserva todo lo anterior."
        actions={[{ label: 'Volver', variant: 'danger', disabled: !destino, onClick: () => hacer(async () => {
          if (matVolver && devolver === 'si') for (const id of matVolver.ids) await desasignarMaterial(id)
          await crearHito(e.id, destino, { tipo: 'REENTRADA', nota: nota.trim() || undefined })
        }) }]}>
        {matVolver && (
          <div className="flex flex-col gap-1.5 rounded-md border border-warn-bg bg-warn-bg/40 p-3">
            <span className="text-sm font-medium text-warn-fg">{gr.Con('material', 'el')} ya se había recibido. ¿Qué hacemos?</span>
            <label className="flex items-center gap-2"><input type="radio" name="devolver" checked={devolver === 'si'} onChange={() => setDevolver('si')} />Vuelve al stock</label>
            <label className="flex items-center gap-2"><input type="radio" name="devolver" checked={devolver === 'no'} onChange={() => setDevolver('no')} />Se queda asignad{gr.o('material')} a {gr.con('encargo', 'este')}</label>
          </div>
        )}
        <Input value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Motivo (opcional)" />
      </Dialog>

      <Dialog open={confirmarMarcar} onOpenChange={setConfirmarMarcar} title={`¿Marcar «${e.etapa_siguiente_nombre ?? ''}»?`}
        description={`Este paso lo marca «${nombresRol[e.etapa_siguiente_rol as keyof typeof nombresRol] ?? e.etapa_siguiente_rol ?? ''}». Márcalo tú solo si ya está hecho de verdad (por ejemplo, para corregir un olvido).`}
        actions={[{ label: 'Marcar', onClick: async () => { setConfirmarMarcar(false); await avanzar() } }]} />

      <Dialog open={modal === 'anular'} onOpenChange={() => setModal(null)} error={modalErr}
        title={`Anular ${min(vocab.encargo)} ${num3(e)}`}
        description={`No se borra: queda en «Anulad${gr.o('encargo', true)}» con una copia de cómo estaba y se puede recuperar. El número ${num3(e)} no se reutiliza.`}
        actions={[{ label: impacto || impactoErr ? 'Anular' : 'Comprobando…', variant: 'danger', disabled: !impacto && !impactoErr, onClick: () => hacer(async () => {
          // Material y anulación en una sola operación del servidor (o todo o nada)
          await anularEncargo(e.id, nota, recibidoMat.length ? devolverMat : null)
        }, () => {
          const manual = pendientesAlAnular(impacto)
          if (manual.length) avisar({ tipo: 'aviso', persistente: true, texto: `${num3(e)} anulad${gr.o('encargo')}. Queda por hacer a mano: ${manual.join(' · ')}` })
          nav('/encargos')
        }) }]}>
        <Textarea autoFocus value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Motivo (opcional)" />
        {impactoErr && <p className="m-0 text-sm text-warn-fg">No se ha podido comprobar qué queda por hacer (material, cobros, avisos). Revísalo tú antes de anular.</p>}
        {recibidoMat.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 rounded-sm bg-bg-3 px-3 py-2 text-sm">
            <div className="font-medium">{vocab.material} ya asignad{gr.o('material')}: {recibidoMat.map((x) => `${x.material} (${x.cantidad} ${ajMat.unidad})`).join(', ')}</div>
            <label className="flex items-center gap-2"><input type="radio" checked={devolverMat} onChange={() => setDevolverMat(true)} /> Devolverl{gr.o('material')} al stock (no se ha usado), con los restos que dejó</label>
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

      <Dialog open={!!fechaCheck} onOpenChange={() => setFechaCheck(null)} error={errFechaCheck} title="Cambiar fecha"
        description={fechaCheck ? `${fechaCheck.etiqueta}. No puede ser futura.` : ''}
        actions={[{ label: 'Guardar', disabled: !fechaCheck?.valor, onClick: async () => {
          if (!fechaCheck) return
          try { await cambiarFechaCheck(e.id, fechaCheck.clave, deHoraTienda(fechaCheck.valor)); setFechaCheck(null); await cargar() } catch (x) { setErrFechaCheck(mensajeError(x)) }
        } }]}>
        <Input type="datetime-local" value={fechaCheck?.valor ?? ''} max={aLocal(new Date().toISOString())} onChange={(x) => setFechaCheck((f) => (f ? { ...f, valor: x.target.value } : f))} />
      </Dialog>
      <Dialog open={!!modal && typeof modal === 'object' && 'fecha' in modal} onOpenChange={() => setModal(null)} error={modalErr}
        title="Cambiar fecha"
        description={modal && typeof modal === 'object' && 'fecha' in modal ? `${modal.fecha.tipo === 'INCIDENCIA' ? 'Incidencia en ' : ''}${modal.fecha.etapa?.nombre}. No puede ser futura ni saltarse el paso anterior o el siguiente.` : ''}
        actions={[{ label: 'Guardar', disabled: !fecha, onClick: () => hacer(() => cambiarFechaHito((modal as { fecha: Hito }).fecha.id, deHoraTienda(fecha))) }]}>
        <Input type="datetime-local" value={fecha} max={aLocal(new Date().toISOString())} onChange={(x) => setFecha(x.target.value)} />
      </Dialog>
    </>
  )
}

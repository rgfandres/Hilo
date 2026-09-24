import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconClock, IconLayoutColumns, IconLayoutKanban, IconList, IconMessage, IconSearch, IconSquareCheck, IconX } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { asignarProveedor, crearHito, deshacerUltimoHito, listarAnulaciones, listarEncargos, listarEtapas, mensajeError, type Anulacion } from '@/data/encargos'
import { listarProveedoresCat, type ProveedorFila } from '@/data/catalogos'
import { LlegadasMaterial } from '@/pages/Logistica'
import { ajustesMaterial, avisoStock, lineasDeTienda, listarMateriales, nombreMaterial, type LineaMaterial, type MaterialEstado } from '@/data/materiales'
import { activo, bloqueado, enProveedor, enRevisar, listoParaEntregar, listoParaMi, miTrabajo, motivosRevision, puedeMarcar as puede } from '@/lib/bandejas'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { Button, Dialog, Input, OpcionCheck, Popover, Tag, Tabs, Table, Th, Td, Tr, tagColorFromHex, useAvisos } from '@/ui'
import { cn, num3, relativo } from '@/lib/utils'
import { camposDe, columnasTabla, formatearValor, plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { dimensiones, etiquetaValor, filtrar, filtrosAUrl, filtrosDeUrl, ordenar, type Dimension, type Filtros } from '@/data/lista'
import { FiltroMenu } from '@/components/FiltroMenu'
import { ArregloPuerta } from '@/components/ArregloPuerta'
import { AccionLote } from '@/components/AccionLote'
import { haceCuanto, useTiempoReal } from '@/lib/tiempoReal'
import { min, textosFin } from '@/lib/vocab'
import { useDobleToque } from '@/lib/movil'
import { bandejasLista, enEtapas, type BandejaLista } from '@/lib/listaBandejas'

type Vista = 'lista' | 'tablero'
const LS_COLS = 'hilo.columnas_ocultas'

function leerOcultas(tiendaId: string): string[] {
  try { return JSON.parse(localStorage.getItem(`${LS_COLS}.${tiendaId}`) ?? '[]') } catch { return [] }
}

export function Encargos() {
  const { tienda, rol, vocab, periodo, gr, nombresRol } = useAuth()
  const nav = useNavigate()
  const avisar = useAvisos()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = React.useState<EncargoEstado[]>([])
  const [anulados, setAnulados] = React.useState<EncargoEstado[]>([])
  const [motivos, setMotivos] = React.useState<Record<string, Anulacion>>({})
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  // Confirmación al avanzar desde la lista: etapa final o avisos pendientes (mismo criterio que la ficha)
  const [confirmar, setConfirmar] = React.useState<EncargoEstado | null>(null)
  /** Selección para acciones en lote (solo vista de lista) */
  const [sel, setSel] = React.useState<Set<string> | null>(null)
  const alternar = (id: string) => setSel((s) => { const n = new Set(s ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [err, setErr] = React.useState<string | null>(null)
  const [cargado, setCargado] = React.useState(false)
  const [plegados, setPlegados] = React.useState<Set<string>>(new Set())
  const [ocultas, setOcultas] = React.useState<string[]>([])
  const [colsOpen, setColsOpen] = React.useState(false)
  const [agrOpen, setAgrOpen] = React.useState(false)
  const [abrirFiltro, setAbrirFiltro] = React.useState<string | null>(null)
  const buscar = React.useRef<HTMLInputElement>(null)
  const alAbrirFiltro = React.useCallback(() => setAbrirFiltro(null), [])
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const toque = useDobleToque(Number(aj.segundos_doble_toque ?? 3.5))

  // Bandejas configuradas por la tienda (si no, las automáticas)
  const conf = React.useMemo(() => bandejasLista(tienda?.ajustes as Record<string, unknown> | undefined), [tienda?.ajustes])
  const primera = conf?.[0]?.key ?? 'todos'
  // Estado de la vista en la URL: se puede recargar, compartir y volver atrás sin perderlo
  const bandeja = params.get('b') ?? primera
  const q = params.get('q') ?? ''
  // Agrupar: lo elegido en la URL; si no, lo último que eligió esta persona (sin agrupar por defecto)
  const agrGuardado = (() => { try { return localStorage.getItem('hilo.agrupar') } catch { return null } })()
  const agrupar = params.get('g') ?? (bandeja === 'bloqueados' ? 'motivo' : agrGuardado ?? 'no')
  const desde = params.get('desde')
  const vista: Vista = params.get('v') === 'tablero' ? 'tablero' : 'lista'
  const filtros = React.useMemo(() => filtrosDeUrl(params.get('f')), [params])
  const setP = React.useCallback((cambios: Record<string, string | null>) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(cambios)) { if (v == null || v === '') n.delete(k); else n.set(k, v) }
      return n
    }, { replace: true })
  }, [setParams])
  const setFiltros = (f: Filtros) => setP({ f: filtrosAUrl(f) || null })
  // Cambiar de bandeja empieza limpio (sin búsqueda ni filtros)
  const setBandeja = (b: string) => setP({ b: b === primera ? null : b, q: null, f: null, desde: null, g: null, m: null })

  React.useEffect(() => { if (tienda) setOcultas(leerOcultas(tienda.id)) }, [tienda])
  function toggleColumna(k: string) {
    const n = ocultas.includes(k) ? ocultas.filter((x) => x !== k) : [...ocultas, k]
    setOcultas(n)
    try { if (tienda) localStorage.setItem(`${LS_COLS}.${tienda.id}`, JSON.stringify(n)) } catch { /* sin almacenamiento: solo en esta sesión */ }
  }

  const [lineasMat, setLineasMat] = React.useState<LineaMaterial[]>([])
  const [matsEst, setMatsEst] = React.useState<MaterialEstado[]>([])
  const filtroMat = params.get('m')
  // Cada lectura lleva número: si llega una más vieja después de otra más nueva, se descarta
  const nLectura = React.useRef(0)
  const recargar = React.useCallback(async () => {
    if (!tienda) return
    const n = ++nLectura.current
    const pid = periodo?.id ?? null
    const [r, a, e, p] = await Promise.all([
      listarEncargos(tienda.id, { periodoId: pid }),
      listarEncargos(tienda.id, { periodoId: pid, estado: 'ANULADO' }),
      listarEtapas(tienda.id), plantillas(tienda.id),
    ])
    if (n !== nLectura.current) return
    setRows(r); setAnulados(a); setEtapas(e); setPs(p); setCargado(true)
    if (ajustesMaterial(tienda.ajustes as Record<string, unknown>).activo) {
      const [l, m] = await Promise.all([lineasDeTienda(tienda.id).catch(() => []), listarMateriales(tienda.id).catch(() => [])])
      setLineasMat(l); setMatsEst(m)
    }
    setMotivos(await listarAnulaciones(a.map((x) => x.id)))
  }, [tienda, periodo])

  React.useEffect(() => { recargar().catch((e) => setErr(mensajeError(e))) }, [recargar])

  // «/» enfoca el buscador de la lista
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof Element && t.closest('input,textarea,select,[contenteditable]')) return
      if (e.key === '/') { e.preventDefault(); buscar.current?.focus() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const etapaMap = React.useMemo(() => Object.fromEntries(etapas.map((e) => [e.id, e])), [etapas])
  const activos = rows.filter(activo)
  const revisar = rows.filter(enRevisar)
  const mios = rows.filter((r) => miTrabajo(r, rol))
  const bloqueados = rows.filter((r) => activo(r) && bloqueado(r))
  // Materiales: sin pedir (hay que pedirlo) / pedidos al proveedor (esperando que llegue)
  const matPedir = React.useMemo(() => new Set(lineasMat.filter((l) => l.estado === 'PENDIENTE').map((l) => l.encargo_id)), [lineasMat])
  const matEspera = React.useMemo(() => new Set(lineasMat.filter((l) => l.estado === 'PEDIDO').map((l) => l.encargo_id)), [lineasMat])
  /** Atajo en la fila: «pedir» (material sin pedir) o «stock bajo · pedir»; abre la bandeja filtrada por ese material */
  const chipMat = (e: EncargoEstado) => {
    if (!activo(e)) return null
    const l = lineasMat.find((x) => x.encargo_id === e.id && x.estado === 'PENDIENTE')
    if (!l) return null
    const m = matsEst.find((x) => x.id === l.material_id)
    const bajo = m && avisoStock(m).nivel
    return (
      <button className={cn('inline-flex shrink-0 items-center rounded-sm px-1 text-xs font-normal', bajo ? 'bg-danger-bg text-danger-fg' : 'bg-warn-bg text-warn-fg')}
        title={`${nombreMaterial(m)}: ver ${min(vocab.encargos)} que lo esperan`}
        onClick={(x) => { x.stopPropagation(); setP({ b: 'mat-pedir', m: l.material_id, q: null, f: null }) }}>
        {bajo ? 'stock bajo · pedir' : 'pedir'}
      </button>
    )
  }

  // Bandejas: Mi trabajo · Todos · una por etapa (agrupadas por su grupo) · Revisar · Bloqueados · Entregados · Anulados
  const etapasTab = [...new Map(etapas.filter((e) => !e.es_final).map((e) => [e.nombre, e])).values()]
  const hayGrupos = etapasTab.some((e) => e.grupo)
  const finGrupo = hayGrupos ? ' ' : null
  const CRITERIO_REVISAR = `Incidencias abiertas, marcad${gr.o('encargo', true)} a mano, más de ${Number(aj.dias_estancado ?? 10)} días ${aj.estancado_por === 'pasos' ? 'sin marcar ningún paso' : 'sin cambios'}${aj.estancado_en_espera ? ' (en cualquier etapa)' : ''} y más de ${Number(aj.dias_atasco_proveedor ?? 15)} días en una etapa de espera`
  const fin = textosFin(etapas, gr)
  const EXTRA: Record<string, string> = { listos: fin.listos, proveedor: `En ${min(vocab.proveedor)}` }
  const pideYa = (r: EncargoEstado) => lineasMat.some((l) => l.encargo_id === r.id && l.estado === 'PENDIENTE' && !!avisoStock(matsEst.find((m) => m.id === l.material_id)).nivel)
  /** ¿Está este encargo en esta bandeja configurada? */
  const enConf = (b: BandejaLista, r: EncargoEstado): boolean => {
    switch (b.tipo) {
      case 'todos': return b.con_terminados ? r.estado === 'ACTIVO' : activo(r)
      case 'etapas': return enEtapas(b, r)
      case 'mio': return miTrabajo(r, rol)
      case 'pedir': return activo(r) && matPedir.has(r.id) && (!b.solo_falta || pideYa(r))
      case 'espera_material': return activo(r) && matEspera.has(r.id)
      case 'revisar': return enRevisar(r)
      case 'bloqueados': return activo(r) && bloqueado(r)
      case 'terminados': return !!r.es_final
      case 'anulados': return false
    }
  }
  const tabsConf = conf?.map((b) => {
    const n = b.tipo === 'anulados' ? anulados.length : rows.filter((r) => enConf(b, r)).length
    return { key: b.key, label: b.nombre, count: n, grupo: b.grupo?.trim() || null, aviso: !!b.accionable && n > 0,
      tone: b.accionable ? 'danger' as const : undefined, title: b.ayuda || (b.tipo === 'revisar' ? CRITERIO_REVISAR : undefined) }
  })
  const tabs = tabsConf ? [
    ...tabsConf,
    ...(EXTRA[bandeja] ? [{ key: bandeja, label: EXTRA[bandeja], count: rows.filter(bandeja === 'listos' ? listoParaEntregar : enProveedor).length, grupo: null }] : []),
  ] : [
    ...(mios.length || bandeja === 'mio' ? [{ key: 'mio', label: 'Mi trabajo', count: mios.length, aviso: mios.length > 0, title: 'Lo que te toca: el siguiente paso lo marca tu rol y nada lo bloquea' }] : []),
    { key: 'todos', label: `Tod${gr.o('encargo', true)}`, count: activos.length, title: 'Todo lo que está en curso' },
    ...etapasTab
      .map((e) => {
        const aqui = rows.filter((r) => r.etapa_actual_nombre === e.nombre && !r.es_final)
        return { key: 'n:' + e.nombre, label: e.nombre, count: aqui.length, grupo: e.grupo ?? null,
          aviso: !e.es_espera && aqui.some((r) => miTrabajo(r, rol)), title: `Ahora mismo en «${e.nombre}»${e.es_espera ? ' (espera)' : ''}` }
      })
      .filter((t) => t.count > 0 || bandeja === t.key),
    ...(matPedir.size || bandeja === 'mat-pedir' ? [{ key: 'mat-pedir', label: `Pedir ${min(vocab.material)}`, count: rows.filter((r) => activo(r) && matPedir.has(r.id)).length, aviso: rol === 'ADMIN' || rol === 'OPERATIVO', title: `Llevan ${min(vocab.material)} que aún no se ha pedido ni recibido`, grupo: finGrupo }] : []),
    ...(matEspera.size || bandeja === 'mat-espera' ? [{ key: 'mat-espera', label: `Esperando ${min(vocab.material)}`, count: rows.filter((r) => activo(r) && matEspera.has(r.id)).length, title: `${vocab.material} pedido al proveedor que aún no ha llegado`, grupo: finGrupo }] : []),
    { key: 'revisar', label: 'Revisar', count: revisar.length, tone: 'danger' as const, aviso: revisar.length > 0, title: CRITERIO_REVISAR, grupo: finGrupo },
    ...(bloqueados.length || bandeja === 'bloqueados' ? [{ key: 'bloqueados', label: `Bloquead${gr.o('encargo', true)}`, count: bloqueados.length, title: 'El siguiente paso tiene una condición que bloquea: se puede resolver desde aquí', grupo: finGrupo }] : []),
    { key: 'entregados', label: fin.terminados, count: rows.filter((r) => r.es_final).length, grupo: finGrupo },
    ...(anulados.length ? [{ key: 'anulados', label: `Anulad${gr.o('encargo', true)}`, count: anulados.length, grupo: finGrupo }] : []),
    ...(EXTRA[bandeja] ? [{ key: bandeja, label: EXTRA[bandeja], count: rows.filter(bandeja === 'listos' ? listoParaEntregar : enProveedor).length, grupo: finGrupo }] : []),
  ]

  // Conjunto de la bandeja (base de filtros y recuentos) y lo que se ve tras buscar y filtrar
  const defActual = conf?.find((b) => b.key === bandeja)
  const base = React.useMemo(() => bandeja === 'anulados' || defActual?.tipo === 'anulados' ? anulados : rows.filter((r) => {
    if (defActual) return enConf(defActual, r) && (!filtroMat || !['pedir', 'espera_material'].includes(defActual.tipo) || lineasMat.some((l) => l.encargo_id === r.id && l.material_id === filtroMat))
    switch (bandeja) {
      case 'todos': return !r.es_final
      case 'mio': return miTrabajo(r, rol)
      case 'revisar': return enRevisar(r)
      case 'bloqueados': return activo(r) && bloqueado(r)
      case 'entregados': return !!r.es_final
      case 'listos': return listoParaEntregar(r)
      case 'proveedor': return enProveedor(r)
      case 'mat-pedir': return activo(r) && matPedir.has(r.id) && (!filtroMat || lineasMat.some((l) => l.encargo_id === r.id && l.material_id === filtroMat))
      case 'mat-espera': return activo(r) && matEspera.has(r.id) && (!filtroMat || lineasMat.some((l) => l.encargo_id === r.id && l.material_id === filtroMat))
      default: return 'n:' + r.etapa_actual_nombre === bandeja && !r.es_final
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [bandeja, rows, anulados, rol, matPedir, matEspera, filtroMat, lineasMat, defActual, matsEst])

  // «Hoja de producción por producto»: los de esta bandeja cuyo siguiente paso los manda a la hoja
  const etProd = React.useMemo(() => new Set(etapas.filter((x) => x.es_produccion).map((x) => x.id)), [etapas])
  const porProductoHoja = React.useMemo((): [string, string, number][] => {
    if (!defActual?.lote_hoja) return []
    const m = new Map<string, [string, number]>()
    for (const e of base) if (activo(e) && e.etapa_siguiente_id && etProd.has(e.etapa_siguiente_id)) {
      const k = e.producto_id ?? '_'
      m.set(k, [e.producto_nombre ?? `Sin ${min(vocab.producto)}`, (m.get(k)?.[1] ?? 0) + 1])
    }
    return [...m.entries()].map(([k, [n, c]]) => [k, n, c] as [string, string, number]).sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [defActual, base, etProd, vocab.producto])
  // Proveedores para elegirlo en la fila (bandejas tipo «asignar»)
  const [provsCat, setProvsCat] = React.useState<ProveedorFila[]>([])
  React.useEffect(() => { if (tienda && defActual?.elegir_proveedor) listarProveedoresCat(tienda.id).then(setProvsCat).catch(() => {}) }, [tienda, defActual?.elegir_proveedor])
  async function elegirProv(e: EncargoEstado, v: string) {
    if (!v) return
    const antes = e.proveedor_id
    try {
      await asignarProveedor(e.id, v)
      avisar({ tipo: 'ok', texto: `${num3(e)} → ${provsCat.find((p) => p.id === v)?.nombre ?? ''}`, accion: { label: 'Deshacer', onClick: async () => {
        try { await asignarProveedor(e.id, antes); await recargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
      } } })
      await recargar()
    } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
  }

  const tiposEnPantalla = React.useMemo(() => [...new Set(base.map((v) => v.tipo_encargo_id))], [base])
  // Todos los campos del encargo de los tipos en pantalla (para filtrar y agrupar)
  const camposTodos = React.useMemo(() => {
    const vistos = new Set<string>()
    return tiposEnPantalla.flatMap((t) => camposDe(ps, 'ENCARGO', t))
      .filter((c) => !vistos.has(c.clave) && (vistos.add(c.clave), true))
  }, [ps, tiposEnPantalla])
  const ordenEtapa = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const e of etapas) if (!m.has(e.nombre)) m.set(e.nombre, m.size) // posición en el flujo
    return m
  }, [etapas])
  const SIN = `Sin ${min(vocab.proveedor)}`
  const variosTipos = React.useMemo(() => new Set(rows.map((r) => r.tipo_encargo_id)).size > 1, [rows])
  const dims = React.useMemo((): Dimension[] => {
    const d = dimensiones({ vocab, sinProveedor: SIN, sinProducto: `Sin ${min(vocab.producto)}`, campos: camposTodos, ordenEtapa, variosTipos, cobro: (tienda?.ajustes as Record<string, unknown> | undefined)?.usar_importe !== false })
    // En «Bloqueados» se agrupa por el motivo del bloqueo
    return bandeja === 'bloqueados'
      ? [{ clave: 'motivo', etiqueta: 'Motivo', vacio: 'Sin motivo', valor: (e) => e.puertas_pendientes.find((p) => p.dura)?.mensaje ?? '' }, ...d]
      : d
  }, [vocab, SIN, camposTodos, ordenEtapa, variosTipos, bandeja, tienda])

  const visibles = React.useMemo(() => filtrar(base, q, filtros, dims), [base, q, filtros, dims])
  const dimAgr = agrupar === 'no' ? null : dims.find((d) => d.clave === agrupar) ?? null

  // Paginación de la lista (tamaño en Ajustes → Tienda); se oculta si cabe todo en una página
  const porPagina = Math.max(10, Number(aj.tamano_pagina ?? 50))
  const nPaginas = Math.max(1, Math.ceil(visibles.length / porPagina))
  const [pagina, setPagina] = React.useState(0)
  React.useEffect(() => { setPagina(0) }, [bandeja, q, filtros, agrupar])
  const pag = Math.min(pagina, nPaginas - 1)
  // Al agrupar, se ordena por grupo ANTES de paginar (los recuentos son del total, no de la página)
  const totalGrupo = React.useMemo(() => {
    const m = new Map<string, number>()
    if (dimAgr) for (const r of visibles) { const k = dimAgr.valor(r); m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }, [visibles, dimAgr])
  const ordenados = React.useMemo(() => {
    if (!dimAgr) return visibles
    const orden = new Map(ordenar(dimAgr, [...totalGrupo.keys()]).map((k, i) => [k, i]))
    return [...visibles].sort((a, b) => (orden.get(dimAgr.valor(a)) ?? 0) - (orden.get(dimAgr.valor(b)) ?? 0))
  }, [visibles, dimAgr, totalGrupo])
  const enPagina = React.useMemo(() => ordenados.slice(pag * porPagina, pag * porPagina + porPagina), [ordenados, pag, porPagina])

  // «Todos» en la selección: los de la página que se ven (no los de grupos plegados)
  const seleccionables = dimAgr ? enPagina.filter((r) => !plegados.has(dimAgr.valor(r))) : enPagina
  const grupos = React.useMemo((): [string, EncargoEstado[]][] => {
    if (!dimAgr) return [['', enPagina]]
    const m = new Map<string, EncargoEstado[]>()
    for (const r of enPagina) { const k = dimAgr.valor(r); m.set(k, [...(m.get(k) ?? []), r]) }
    return [...m.entries()]
  }, [enPagina, dimAgr])

  // Cola de cambios: se aplican en el orden de los clics; la fila cambia al momento (optimista)
  const cola = React.useRef<Promise<unknown>>(Promise.resolve())
  // Mientras hay avances en cola no se recarga (pisaría lo que ya se ve); al vaciarse, una sola lectura
  const enCola = React.useRef(0)
  const { ultima, marcar } = useTiempoReal(tienda?.id, () => { if (enCola.current === 0) recargar().catch(() => {}) })
  const [, tic] = React.useState(0)
  React.useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 15000); return () => clearInterval(t) }, [])
  function siguiente(e: EncargoEstado, confirmado = false) {
    if (!e.etapa_siguiente_clave) return
    const avisos = (e.puertas_pendientes ?? []).some((p) => !p.dura)
    if (!confirmado && (avisos || e.siguiente_es_final)) { setConfirmar(e); return }
    setConfirmar(null)
    setErr(null)
    setRows((rs) => rs.map((r) => r.id === e.id ? { ...r, etapa_actual_nombre: e.etapa_siguiente_nombre, etapa_actual_id: e.etapa_siguiente_id, etapa_siguiente_nombre: null, etapa_siguiente_clave: null, puertas_pendientes: [], es_final: e.siguiente_es_final } : r))
    enCola.current++
    cola.current = cola.current.then(() => avanzarEnServidor(e))
  }
  async function avanzarEnServidor(e: EncargoEstado) {
    setBusy(e.id)
    try {
      const hito = await crearHito(e.id, e.etapa_siguiente_clave!, { forzarBlandas: (e.puertas_pendientes ?? []).some((p) => !p.dura) })
      avisar({ tipo: 'ok', texto: `${num3(e)} · ${e.cliente_nombre} → ${e.etapa_siguiente_nombre}`,
        accion: { label: 'Deshacer', onClick: () => { deshacerUltimoHito(e.id, hito).then(recargar).catch((x) => avisar({ tipo: 'error', texto: mensajeError(x) })) } } })
    } catch (ex) {
      // Si falla, la lectura de después devuelve la fila a su estado real
      avisar({ tipo: 'error', texto: mensajeError(ex) })
    } finally {
      setBusy(null); marcar()
      enCola.current--
      if (enCola.current === 0) await recargar().catch(() => {})
    }
  }

  const cols: Campo[] = columnasTabla(ps, tiposEnPantalla)
  const ver = (k: string) => !ocultas.includes(k)
  const colsFijas = [
    { k: 'producto', label: vocab.producto }, ...cols.map((c) => ({ k: 'c:' + c.clave, label: c.etiqueta })),
    { k: 'etapa', label: 'Etapa' }, { k: 'proveedor', label: vocab.proveedor }, { k: 'actualizado', label: 'Actualizado' },
  ]
  const NCOL = 3 + colsFijas.filter((c) => ver(c.k)).length
  const puedeMarcar = (e: EncargoEstado) => puede(e, rol)
  const chips = Object.entries(filtros).filter(([, v]) => v.length)
  const hayFiltro = chips.length > 0 || !!q

  /** Corregir en la propia fila lo que bloquea el siguiente paso */
  const arreglo = (e: EncargoEstado) => {
    const p = e.puertas_pendientes.find((x) => x.dura)
    if (!p || !puedeMarcar(e)) return null
    return <ArregloPuerta compacto e={e} p={p} onHecho={() => { avisar({ tipo: 'ok', texto: 'Hecho: el paso ya se puede avanzar' }); recargar() }}
      onCompletar={() => nav(`/encargos/${e.id}`)} />
  }
  const botonSiguiente = (e: EncargoEstado) => {
    const dura = e.puertas_pendientes?.some((p) => p.dura)
    if (dura && bandeja === 'bloqueados') {
      const motivoB = e.puertas_pendientes.filter((p) => p.dura).map((p) => p.mensaje).join(' · ')
      return (
        <span className="inline-flex flex-col items-start gap-0.5">
          {arreglo(e) ?? <Link to={`/encargos/${e.id}`} className="text-sm underline">{puedeMarcar(e) ? 'Abrir la ficha' : `Lo resuelve «${nombresRol[(e.etapa_siguiente_rol ?? 'OPERATIVO') as keyof typeof nombresRol]}»`}</Link>}
          <span className="max-w-[220px] truncate text-xs text-warn-fg" title={motivoB}>{motivoB}</span>
        </span>
      )
    }
    if (!(e.estado === 'ACTIVO' && e.etapa_siguiente_nombre && puedeMarcar(e))) return null
    const motivo = e.en_revision ? 'Incidencia abierta: resuélvela en la ficha' : dura ? e.puertas_pendientes.filter((p) => p.dura).map((p) => p.mensaje).join(' · ') : ''
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <Button size="sm" variant={toque.armado === e.id ? 'armed' : 'default'} disabled={busy === e.id || dura || e.en_revision} title={motivo || undefined}
          onClick={(ev) => { ev.stopPropagation(); if (toque.pulsar(e.id)) siguiente(e) }}>
          {toque.armado === e.id ? `¿${e.etapa_siguiente_nombre}? Toca otra vez` : e.etapa_siguiente_nombre}
        </Button>
        {motivo && <span className="max-w-[220px] truncate text-xs text-warn-fg" title={motivo}>{motivo}</span>}
      </span>
    )
  }
  const etapaTag = (e: EncargoEstado) => {
    const et = e.etapa_actual_id ? etapaMap[e.etapa_actual_id] : undefined
    return e.estado === 'ANULADO' ? <Tag color="gray">Anulad{gr.o('encargo')}</Tag>
      : e.en_revision ? <Tag color="red">Incidencia</Tag>
      : <Tag color={tagColorFromHex(et?.color)}>{e.etapa_actual_nombre ?? 'Sin empezar'}</Tag>
  }
  React.useEffect(() => {
    if (!sel) return
    const esc = (k: KeyboardEvent) => { if (k.key === 'Escape' && !document.querySelector('[role=dialog]')) setSel(null) }
    document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc)
  }, [sel])
  const plegar = (g: string) => setPlegados((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })

  return (
    <>
      <PageHeader title={vocab.encargos} subtitle={dimAgr ? `Por ${min(dimAgr.etiqueta)}` : undefined}>
        <div className="relative">
          <IconSearch size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-3" />
          <Input ref={buscar} value={q} onChange={(e) => setP({ q: e.target.value })} placeholder="Buscar nombre, Nº, teléfono…"
            className="h-7 w-36 pl-7 xl:w-[220px]" aria-label={`Buscar ${min(vocab.encargos)}`}
            onKeyDown={(e) => { if (e.key === 'Escape') { setP({ q: null }); (e.target as HTMLInputElement).blur() } }} />
        </div>
        <FiltroMenu dims={dims} campos={camposTodos} base={base} filtros={filtros} onChange={setFiltros}
          abrirEn={abrirFiltro} onAbierto={alAbrirFiltro} />
        {vista === 'lista' && <Popover open={agrOpen} onOpenChange={setAgrOpen} align="end" className="w-[220px]"
          trigger={({ toggle }) => <Button variant="ghost" onClick={toggle}>Agrupar</Button>}>
          <div className="px-2 py-1 text-xs text-fg-3">Agrupar por</div>
          {[{ clave: 'no', etiqueta: 'Sin agrupar' }, ...dims].map((d) => (
            <button key={d.clave} onClick={() => { setP({ g: d.clave }); if (bandeja !== 'bloqueados') { try { localStorage.setItem('hilo.agrupar', d.clave) } catch { /* sin almacenamiento */ } } setPlegados(new Set()); setAgrOpen(false) }}
              className={cn('flex h-7 w-full items-center rounded-sm px-2 text-left hover:bg-bg-4', (dimAgr?.clave ?? 'no') === d.clave && 'font-medium')}>
              {d.etiqueta}
            </button>
          ))}
        </Popover>}
        {vista === 'lista' && (
          <Popover open={colsOpen} onOpenChange={setColsOpen} align="end" className="w-[220px]"
            trigger={({ toggle }) => <Button variant="ghost" onClick={toggle}><IconLayoutColumns size={14} /><span className="hidden xl:inline">Columnas</span></Button>}>
            <div className="px-2 py-1 text-xs text-fg-3">Columnas visibles</div>
            {colsFijas.map((c) => <OpcionCheck key={c.k} checked={ver(c.k)} onChange={() => toggleColumna(c.k)}>{c.label}</OpcionCheck>)}
          </Popover>
        )}
        <div className="flex rounded-sm border border-border">
          <button title="Lista" aria-label="Vista de lista" onClick={() => setP({ v: null })}
            className={cn('flex h-[26px] w-7 items-center justify-center', vista === 'lista' ? 'bg-bg-4 text-fg' : 'text-fg-3 hover:text-fg')}><IconList size={14} /></button>
          <button title="Tablero" aria-label="Vista de tablero" onClick={() => setP({ v: 'tablero' })}
            className={cn('flex h-[26px] w-7 items-center justify-center border-l border-border', vista === 'tablero' ? 'bg-bg-4 text-fg' : 'text-fg-3 hover:text-fg')}><IconLayoutKanban size={14} /></button>
        </div>
        {vista === 'lista' && rol !== 'LOGISTICA' && (
          <Button variant={sel ? 'default' : 'ghost'} onClick={() => setSel(sel ? null : new Set())} title={`Seleccionar varios para pasarl${gr.o('encargo', true)} de etapa a la vez`}>
            <IconSquareCheck size={14} /><span className="hidden xl:inline">{sel ? 'Seleccionando' : 'Seleccionar'}</span>
          </Button>
        )}
        {rol !== 'LOGISTICA' && <Button variant="primary" asChild><Link to="/encargos/nuevo">+ {vocab.encargo}</Link></Button>}
      </PageHeader>
      <Tabs items={tabs} value={bandeja} onChange={setBandeja} />
      {filtroMat && (bandeja === 'mat-pedir' || bandeja === 'mat-espera') && (
        <div className="flex items-center gap-2 border-b border-border-light px-4 py-1.5 text-sm">
          <span className="text-fg-3">Solo con</span><b>{nombreMaterial(matsEst.find((m) => m.id === filtroMat))}</b>
          <button className="text-fg-3 underline hover:text-fg" onClick={() => setP({ m: null })}>Quitar filtro</button>
          <Link to="/materiales?v=pedidos" className="ml-auto text-fg-2 underline">Ir a pedidos</Link>
        </div>
      )}
      {defActual?.tipo === 'pedir' && (rol === 'ADMIN' || rol === 'OPERATIVO') && base.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-light bg-warn-bg/40 px-4 py-1.5 text-sm">
          <span>Hay {min(vocab.material)} que pedir para {base.length} {min(base.length === 1 ? vocab.encargo : vocab.encargos)}.</span>
          <Button size="sm" asChild><Link to="/materiales?v=pedidos">Generar pedido {gr.con('proveedor', 'al')}</Link></Button>
        </div>
      )}
      {defActual?.llegadas && <div className="border-b border-border-light px-4 py-2"><LlegadasMaterial refresco={ultima} /></div>}
      {defActual?.lote_hoja && (rol === 'ADMIN' || rol === 'OPERATIVO') && porProductoHoja.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-4 py-1.5 text-sm">
          <span className="text-fg-2">{String(aj.hoja_nombre ?? 'Hoja de producción')} por {min(vocab.producto)}:</span>
          {porProductoHoja.map(([id, nombre, n]) => (
            <Button key={id} size="sm" onClick={() => nav(`/produccion?p=${encodeURIComponent(id)}&enviar=1`)}>🖨️ {nombre} ({n})</Button>
          ))}
        </div>
      )}
      <div className="flex min-h-9 flex-wrap items-center gap-2 border-b border-border-light px-4 py-1 text-sm text-fg-3">
        <span className="tabular">{visibles.length} de {base.length}</span>
        <span className="text-fg-3">· actualizado {haceCuanto(ultima)}</span>
        <button className="text-fg-3 underline-offset-2 hover:text-fg hover:underline" onClick={() => recargar().then(marcar).catch((x) => setErr(mensajeError(x)))}>Actualizar</button>
        {chips.map(([k, vals]) => {
          const d = dims.find((x) => x.clave === k)
          if (!d) return null
          const txt = vals.slice(0, 3).map((v) => etiquetaValor(d, v, camposTodos)).join(', ') + (vals.length > 3 ? ` (+${vals.length - 3})` : '')
          return (
            <span key={k} className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-bg px-2 text-fg">
              <button onClick={() => setAbrirFiltro(k)} className="flex items-center gap-1">
                <span className="text-fg-2">{d.etiqueta}:</span><span className="font-medium">{txt}</span>
              </button>
              <button onClick={() => setFiltros({ ...filtros, [k]: [] })} aria-label={`Quitar filtro ${d.etiqueta}`} className="text-fg-3 hover:text-fg"><IconX size={12} stroke={2.5} /></button>
            </span>
          )
        })}
        {hayFiltro && <button onClick={() => setP({ q: null, f: null })} className="text-fg-3 underline-offset-2 hover:text-fg hover:underline">Limpiar todo</button>}
        {!periodo && <span>· sin periodo activo: se muestran todos</span>}
        {desde && (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-bg-4 px-2 text-fg-2">
            Desde el panel: <span className="font-medium text-fg">{desde}</span> ({visibles.length})
            <button onClick={() => setP({ b: null, f: null, q: null, desde: null, g: null })} className="text-fg-3 underline-offset-2 hover:text-fg hover:underline">Quitar filtro</button>
          </span>
        )}
        {bandeja === 'revisar' && <span className="text-fg-2">Aquí entran: {CRITERIO_REVISAR.charAt(0).toLowerCase() + CRITERIO_REVISAR.slice(1)}. Los días se cambian en Ajustes → Avisos y reglas.</span>}
        {bandeja === 'bloqueados' && <span className="text-fg-2">Resuelve lo que falta desde la fila (o desde la ficha) y el botón de avanzar vuelve a funcionar.</span>}
        {err && <span className="ml-2 inline-flex items-center gap-2 rounded-sm bg-danger-bg px-2 py-0.5 text-danger-fg">{err}<button className="font-medium underline" onClick={() => { setErr(null); recargar().catch((x) => setErr(mensajeError(x))) }}>Reintentar</button></span>}
      </div>

      {vista === 'tablero' ? (
        <Tablero visibles={visibles} etapas={etapas} tipos={tiposEnPantalla} etiqueta={etapaTag} boton={botonSiguiente}
          abrir={(e) => nav(`/encargos/${e.id}`)} sinProveedor={SIN} hayFiltro={hayFiltro} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <thead className="sticky top-0 z-20 bg-bg">
              <tr>
                <Th className="sticky left-0 z-20 w-10 bg-bg">{sel ? (
                  <input type="checkbox" aria-label="Seleccionar todos los visibles" checked={seleccionables.length > 0 && seleccionables.every((v) => sel.has(v.id))}
                    onChange={(x) => setSel(x.target.checked ? new Set(seleccionables.map((v) => v.id)) : new Set())} />
                ) : 'Nº'}</Th>
                <Th className="sticky left-10 z-20 w-[190px] bg-bg">{vocab.cliente}</Th>
                {ver('producto') && <Th className="w-[140px]">{vocab.producto}</Th>}
                {cols.filter((c) => ver('c:' + c.clave)).map((c) => <Th key={c.clave} className="w-[120px]">{c.etiqueta}</Th>)}
                {ver('etapa') && <Th className="w-[170px]">Etapa</Th>}
                {ver('proveedor') && <Th className="w-[120px]">{vocab.proveedor}</Th>}
                {ver('actualizado') && <Th className="w-[110px]">Actualizado</Th>}
                <Th>Siguiente</Th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(([g, list]) => {
                const plegado = plegados.has(g)
                return (
                  <React.Fragment key={g || '_'}>
                    {dimAgr && (
                      <tr>
                        <td colSpan={NCOL} className="h-8 border-b border-border-light bg-bg-2 px-2 text-sm font-medium text-fg-2">
                          <button className="flex items-center gap-1" onClick={() => plegar(g)} aria-expanded={!plegado}>
                            {plegado ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                            <span className={g === '' ? 'text-warn-fg' : undefined}>{etiquetaValor(dimAgr, g, camposTodos)}</span>
                            <span className="ml-1 text-fg-3">{totalGrupo.get(g) ?? list.length}</span>
                          </button>
                        </td>
                      </tr>
                    )}
                    {!plegado && list.map((e) => (
                      <Tr key={e.id} className={cn('group cursor-pointer', sel?.has(e.id) && 'bg-bg-4')} aria-selected={sel ? sel.has(e.id) : undefined} onClick={() => sel ? alternar(e.id) : nav(`/encargos/${e.id}`)}>
                        <Td className={cn('titular sticky left-0 z-10 bg-bg text-fg-3 tabular group-hover:bg-bg-2', e.atascado ? 'marca-atasco' : listoParaMi(e, rol) && 'marca-lista',
                          e.atascado ? 'shadow-[inset_3px_0_0_var(--color-danger)]' : listoParaMi(e, rol) && 'shadow-[inset_3px_0_0_var(--accent)]')}
                          title={e.atascado ? `${e.dias_en_etapa} días en «${e.etapa_actual_nombre}»` : listoParaMi(e, rol) ? `List${gr.o('encargo')} para el siguiente paso` : undefined}>
                          {sel ? <input type="checkbox" aria-label={`Seleccionar ${num3(e)}`} checked={sel.has(e.id)} onClick={(x) => x.stopPropagation()} onChange={() => alternar(e.id)} /> : num3(e)}
                        </Td>
                        <Td className="titular sticky left-10 z-10 max-w-[220px] bg-bg font-medium group-hover:bg-bg-2" title={[e.cliente_nombre, ...motivosRevision(e, aj)].join(' · ')}>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{e.cliente_nombre}</span>
                            {e.revisar_manual && <IconAlertTriangle size={13} className="shrink-0 text-warn-fg" aria-label={`Marcad${gr.o('encargo')} para revisar`} />}
                            {(e.estancado || e.atascado) && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-warn-bg px-1 text-xs font-normal text-warn-fg"><IconClock size={11} />{e.atascado ? e.dias_en_etapa : Math.floor((Date.now() - new Date(e.actualizado_en).getTime()) / 864e5)} d</span>}
                            {chipMat(e)}
                            {e.n_comentarios > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-normal text-fg-3" title={`${e.n_comentarios} comentario${e.n_comentarios === 1 ? '' : 's'}`}><IconMessage size={12} />{e.n_comentarios}</span>}
                          </span>
                          {/* Celda combinada: si la columna del producto está oculta, va debajo del nombre */}
                          {!ver('producto') && e.producto_nombre && <span className="block truncate text-sm font-normal text-fg-3">{e.producto_nombre}</span>}
                        </Td>
                        {ver('producto') && <Td className="max-w-[160px] truncate" title={e.producto_nombre ?? undefined}>{e.producto_nombre ?? <span className="text-fg-3">—</span>}</Td>}
                        {cols.filter((c) => ver('c:' + c.clave)).map((c) => {
                          const v = formatearValor(c, e.datos?.[c.clave])
                          return <Td key={c.clave} className={cn('max-w-[160px] truncate', v === '—' ? 'text-fg-3' : 'text-fg-2')} title={v}>{v}</Td>
                        })}
                        {ver('etapa') && (
                          <Td>
                            {etapaTag(e)}
                            {e.estado === 'ANULADO' && motivos[e.id]?.motivo && <span className="ml-1.5 text-sm text-fg-3">{motivos[e.id].motivo}</span>}
                            {e.estancado && <span className="ml-1.5 text-sm text-fg-3">{aj.estancado_por === 'pasos' ? `${e.dias_en_etapa ?? 0} d` : relativo(e.actualizado_en)}</span>}
                          </Td>
                        )}
                        {ver('proveedor') && (defActual?.elegir_proveedor && (rol === 'ADMIN' || rol === 'OPERATIVO') && activo(e)
                          ? <Td onClick={(ev) => ev.stopPropagation()}>
                              <select className="h-7 max-w-[170px] rounded-sm border border-border bg-bg px-1.5 text-sm" value={e.proveedor_id ?? ''} aria-label={vocab.proveedor}
                                onChange={(ev) => elegirProv(e, ev.target.value)}>
                                <option value="">— elegir —</option>
                                {provsCat.filter((p) => p.activo || p.id === e.proveedor_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                              </select>
                            </Td>
                          : <Td className="max-w-[160px] truncate" title={e.proveedor_nombre ?? undefined}>{e.proveedor_nombre ?? <span className="text-fg-3">—</span>}</Td>)}
                        {ver('actualizado') && <Td className="text-fg-3">{relativo(e.actualizado_en)}</Td>}
                        <Td className="accion" onClick={(ev) => ev.stopPropagation()}>{botonSiguiente(e)}</Td>
                      </Tr>
                    ))}
                  </React.Fragment>
                )
              })}
              {cargado && rows.length === 0 && anulados.length === 0 && (
                <tr><td colSpan={NCOL} className="h-24 text-center text-fg-3">Todavía no hay {min(vocab.encargos)}. Crea {gr.genero.encargo === 'f' ? 'la primera' : 'el primero'} con «+ {vocab.encargo}».</td></tr>
              )}
              {cargado && (rows.length > 0 || anulados.length > 0) && visibles.length === 0 && (
                <tr><td colSpan={NCOL} className="h-24 text-center text-fg-3">
                  {hayFiltro ? <>Nada coincide con la búsqueda o los filtros. <button className="underline" onClick={() => setP({ q: null, f: null })}>Limpiar todo</button></> : 'Esta bandeja está vacía.'}
                </td></tr>
              )}
            </tbody>
          </Table>
          {nPaginas > 1 && (
            <div className="sticky left-0 flex items-center gap-2 border-t border-border-light px-4 py-2 text-sm">
              <Button size="sm" variant="ghost" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>← Anterior</Button>
              <span className="tabular text-fg-2">Página {pag + 1} de {nPaginas}</span>
              <Button size="sm" variant="ghost" disabled={pag >= nPaginas - 1} onClick={() => setPagina(pag + 1)}>Siguiente →</Button>
            </div>
          )}
        </div>
      )}
      {sel && vista === 'lista' && (
        <AccionLote seleccion={visibles.filter((x) => sel.has(x.id))} etapas={etapas} rol={rol} vocabEncargo={vocab.encargo} vocabEncargos={vocab.encargos}
          onTodos={() => setSel(new Set(seleccionables.map((v) => v.id)))} onSalir={() => setSel(null)} onHecho={() => recargar().catch(() => {})} />
      )}
      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}
        title={confirmar ? `${confirmar.etapa_siguiente_nombre}: ${num3(confirmar)} · ${confirmar.cliente_nombre ?? ''}` : ''}
        description={confirmar?.siguiente_es_final ? `${gr.Con('encargo', 'el')} pasa a «${confirmar.etapa_siguiente_nombre}» y sale de la lista de trabajo. Se puede deshacer justo después.` : 'Hay avisos para este paso. Puedes seguir igualmente.'}
        actions={[{ label: confirmar?.etapa_siguiente_nombre ?? 'Confirmar', variant: 'primary', onClick: () => { if (confirmar) siguiente(confirmar, true) } }]}>
        {confirmar && confirmar.puertas_pendientes.some((p) => !p.dura) && (
          <ul className="m-0 flex flex-col gap-1 rounded-sm bg-warn-bg px-3 py-2 pl-7 text-sm text-warn-fg">
            {confirmar.puertas_pendientes.filter((p) => !p.dura).map((p, i) => <li key={i}>{p.mensaje}</li>)}
          </ul>
        )}
      </Dialog>
    </>
  )
}

/** Tablero: una columna por etapa (en el orden del flujo). */
function Tablero({ visibles, etapas, tipos, etiqueta, boton, abrir, sinProveedor, hayFiltro }: {
  visibles: EncargoEstado[]; etapas: Etapa[]; tipos: string[]
  etiqueta: (e: EncargoEstado) => React.ReactNode
  boton: (e: EncargoEstado) => React.ReactNode
  abrir: (e: EncargoEstado) => void
  sinProveedor: string; hayFiltro: boolean
}) {
  const columnas = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const e of etapas.filter((x) => tipos.includes(x.tipo_encargo_id))) if (!m.has(e.nombre)) m.set(e.nombre, e.orden)
    const lista = [...m.keys()]
    if (visibles.some((v) => !v.etapa_actual_nombre)) lista.unshift('')
    return lista.filter((n) => visibles.some((v) => (v.etapa_actual_nombre ?? '') === n))
  }, [etapas, tipos, visibles])

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-auto bg-bg-3 p-3">
      {columnas.map((n) => {
        const list = visibles.filter((v) => (v.etapa_actual_nombre ?? '') === n)
        return (
          <div key={n || '_'} className="flex w-[260px] shrink-0 flex-col gap-2">
            <div className="flex h-7 items-center gap-1.5 px-1 text-sm font-medium text-fg-2">
              {n || 'Sin empezar'}<span className="text-fg-3 tabular">{list.length}</span>
            </div>
            {list.map((e) => {
              const b = boton(e)
              return (
                <div key={e.id} role="button" tabIndex={0} onClick={() => abrir(e)} onKeyDown={(k) => { if (k.key === 'Enter') abrir(e) }}
                  className="flex cursor-pointer flex-col gap-1.5 rounded-md border border-border bg-bg p-2.5 hover:border-border-strong">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-fg-3 tabular">{num3(e)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{e.cliente_nombre}</span>
                  </div>
                  {e.producto_nombre && <div className="truncate text-fg-2">{e.producto_nombre}</div>}
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-3">
                    {(e.en_revision || e.estado === 'ANULADO') && etiqueta(e)}
                    <span className={cn('truncate', !e.proveedor_nombre && 'text-warn-fg')}>{e.proveedor_nombre ?? sinProveedor}</span>
                    {e.estancado && <span>· {relativo(e.actualizado_en)}</span>}
                  </div>
                  {b && <div onClick={(ev) => ev.stopPropagation()}>{b}</div>}
                </div>
              )
            })}
          </div>
        )
      })}
      {visibles.length === 0 && <div className="m-auto text-fg-3">{hayFiltro ? 'Nada coincide con la búsqueda o los filtros.' : 'Esta bandeja está vacía.'}</div>}
    </div>
  )
}

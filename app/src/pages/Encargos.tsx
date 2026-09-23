import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { IconAlertTriangle, IconChevronDown, IconChevronRight, IconClock, IconLayoutColumns, IconLayoutKanban, IconList, IconMessage, IconSearch, IconSquareCheck, IconX } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { crearHito, deshacerUltimoHito, listarAnulaciones, listarEncargos, listarEtapas, mensajeError, type Anulacion } from '@/data/encargos'
import { activo, bloqueado, enProveedor, enRevisar, listoParaEntregar, listoParaMi, miTrabajo, motivosRevision, puedeMarcar as puede } from '@/lib/bandejas'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { Button, Input, OpcionCheck, Popover, Tag, Tabs, Table, Th, Td, Tr, tagColorFromHex, useAvisos } from '@/ui'
import { cn, num3, relativo } from '@/lib/utils'
import { camposDe, columnasTabla, formatearValor, plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { dimensiones, etiquetaValor, filtrar, filtrosAUrl, filtrosDeUrl, ordenar, type Dimension, type Filtros } from '@/data/lista'
import { FiltroMenu } from '@/components/FiltroMenu'
import { ArregloPuerta } from '@/components/ArregloPuerta'
import { AccionLote } from '@/components/AccionLote'
import { haceCuanto, useTiempoReal } from '@/lib/tiempoReal'
import { min } from '@/lib/vocab'
import { useDobleToque } from '@/lib/movil'

type Vista = 'lista' | 'tablero'
const LS_COLS = 'hilo.columnas_ocultas'

function leerOcultas(tiendaId: string): string[] {
  try { return JSON.parse(localStorage.getItem(`${LS_COLS}.${tiendaId}`) ?? '[]') } catch { return [] }
}

export function Encargos() {
  const { tienda, rol, vocab, periodo, gr } = useAuth()
  const nav = useNavigate()
  const avisar = useAvisos()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = React.useState<EncargoEstado[]>([])
  const [anulados, setAnulados] = React.useState<EncargoEstado[]>([])
  const [motivos, setMotivos] = React.useState<Record<string, Anulacion>>({})
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
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

  // Estado de la vista en la URL: se puede recargar, compartir y volver atrás sin perderlo
  const bandeja = params.get('b') ?? 'todos'
  const q = params.get('q') ?? ''
  const agrupar = params.get('g') ?? (bandeja === 'bloqueados' ? 'motivo' : 'proveedor')
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
  const setBandeja = (b: string) => setP({ b: b === 'todos' ? null : b, q: null, f: null, desde: null, g: null })

  React.useEffect(() => { if (tienda) setOcultas(leerOcultas(tienda.id)) }, [tienda])
  function toggleColumna(k: string) {
    const n = ocultas.includes(k) ? ocultas.filter((x) => x !== k) : [...ocultas, k]
    setOcultas(n)
    try { if (tienda) localStorage.setItem(`${LS_COLS}.${tienda.id}`, JSON.stringify(n)) } catch { /* sin almacenamiento: solo en esta sesión */ }
  }

  const recargar = React.useCallback(async () => {
    if (!tienda) return
    const pid = periodo?.id ?? null
    const [r, a, e, p] = await Promise.all([
      listarEncargos(tienda.id, { periodoId: pid }),
      listarEncargos(tienda.id, { periodoId: pid, estado: 'ANULADO' }),
      listarEtapas(tienda.id), plantillas(tienda.id),
    ])
    setRows(r); setAnulados(a); setEtapas(e); setPs(p); setCargado(true)
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

  // Bandejas: Mi trabajo · Todos · una por etapa (agrupadas por su grupo) · Revisar · Bloqueados · Entregados · Anulados
  const etapasTab = [...new Map(etapas.filter((e) => !e.es_final).map((e) => [e.nombre, e])).values()]
  const hayGrupos = etapasTab.some((e) => e.grupo)
  const finGrupo = hayGrupos ? ' ' : null
  const CRITERIO_REVISAR = `Incidencias abiertas, marcados a mano, más de ${Number(aj.dias_estancado ?? 10)} días sin cambios y más de ${Number(aj.dias_atasco_proveedor ?? 15)} días en una etapa de espera`
  const EXTRA: Record<string, string> = { listos: 'Listos para entregar', proveedor: `En ${min(vocab.proveedor)}` }
  const tabs = [
    ...(mios.length || bandeja === 'mio' ? [{ key: 'mio', label: 'Mi trabajo', count: mios.length, aviso: mios.length > 0, title: 'Lo que te toca: el siguiente paso lo marca tu rol y nada lo bloquea' }] : []),
    { key: 'todos', label: 'Todos', count: activos.length, title: 'Todo lo que está en curso' },
    ...etapasTab
      .map((e) => {
        const aqui = rows.filter((r) => r.etapa_actual_nombre === e.nombre && !r.es_final)
        return { key: 'n:' + e.nombre, label: e.nombre, count: aqui.length, grupo: e.grupo ?? null,
          aviso: !e.es_espera && aqui.some((r) => listoParaMi(r, rol)), title: `Ahora mismo en «${e.nombre}»${e.es_espera ? ' (espera)' : ''}` }
      })
      .filter((t) => t.count > 0 || bandeja === t.key),
    { key: 'revisar', label: 'Revisar', count: revisar.length, tone: 'danger' as const, aviso: revisar.length > 0, title: CRITERIO_REVISAR, grupo: finGrupo },
    ...(bloqueados.length || bandeja === 'bloqueados' ? [{ key: 'bloqueados', label: 'Bloqueados', count: bloqueados.length, title: 'El siguiente paso tiene una condición que bloquea: se puede resolver desde aquí', grupo: finGrupo }] : []),
    { key: 'entregados', label: 'Entregados', count: rows.filter((r) => r.es_final).length, grupo: finGrupo },
    ...(anulados.length ? [{ key: 'anulados', label: 'Anulados', count: anulados.length, grupo: finGrupo }] : []),
    ...(EXTRA[bandeja] ? [{ key: bandeja, label: EXTRA[bandeja], count: rows.filter(bandeja === 'listos' ? listoParaEntregar : enProveedor).length, grupo: finGrupo }] : []),
  ]

  // Conjunto de la bandeja (base de filtros y recuentos) y lo que se ve tras buscar y filtrar
  const base = React.useMemo(() => bandeja === 'anulados' ? anulados : rows.filter((r) => {
    switch (bandeja) {
      case 'todos': return !r.es_final
      case 'mio': return miTrabajo(r, rol)
      case 'revisar': return enRevisar(r)
      case 'bloqueados': return activo(r) && bloqueado(r)
      case 'entregados': return !!r.es_final
      case 'listos': return listoParaEntregar(r)
      case 'proveedor': return enProveedor(r)
      default: return 'n:' + r.etapa_actual_nombre === bandeja && !r.es_final
    }
  }), [bandeja, rows, anulados, rol])

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

  const grupos = React.useMemo((): [string, EncargoEstado[]][] => {
    if (!dimAgr) return [['', visibles]]
    const m = new Map<string, EncargoEstado[]>()
    for (const r of visibles) { const k = dimAgr.valor(r); m.set(k, [...(m.get(k) ?? []), r]) }
    return ordenar(dimAgr, [...m.keys()]).map((k) => [k, m.get(k)!])
  }, [visibles, dimAgr])

  // Cola de cambios: se aplican en el orden de los clics; la fila cambia al momento (optimista)
  const cola = React.useRef<Promise<unknown>>(Promise.resolve())
  const { ultima, marcar } = useTiempoReal(tienda?.id, () => recargar().catch(() => {}))
  const [, tic] = React.useState(0)
  React.useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 15000); return () => clearInterval(t) }, [])
  function siguiente(e: EncargoEstado) {
    if (!e.etapa_siguiente_clave) return
    if ((e.puertas_pendientes ?? []).some((p) => !p.dura)) { nav(`/encargos/${e.id}`); return }
    setErr(null)
    setRows((rs) => rs.map((r) => r.id === e.id ? { ...r, etapa_actual_nombre: e.etapa_siguiente_nombre, etapa_actual_id: e.etapa_siguiente_id, etapa_siguiente_nombre: null, etapa_siguiente_clave: null, puertas_pendientes: [], es_final: e.siguiente_es_final } : r))
    cola.current = cola.current.then(() => avanzarEnServidor(e))
  }
  async function avanzarEnServidor(e: EncargoEstado) {
    setBusy(e.id)
    try {
      await crearHito(e.id, e.etapa_siguiente_clave!)
      avisar({ tipo: 'ok', texto: `${num3(e)} · ${e.cliente_nombre} → ${e.etapa_siguiente_nombre}`,
        accion: { label: 'Deshacer', onClick: () => { deshacerUltimoHito(e.id).then(recargar).catch((x) => avisar({ tipo: 'error', texto: mensajeError(x) })) } } })
      await recargar()
    } catch (ex) {
      // Si falla, se vuelve a leer todo: la fila recupera su estado real
      avisar({ tipo: 'error', texto: mensajeError(ex) }); await recargar().catch(() => {})
    } finally { setBusy(null); marcar() }
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
    if (dura && bandeja === 'bloqueados') return arreglo(e)
    return e.estado === 'ACTIVO' && e.etapa_siguiente_nombre && puedeMarcar(e) ? (
      <Button size="sm" variant={toque.armado === e.id ? 'armed' : 'default'} disabled={busy === e.id || dura} title={dura ? e.puertas_pendientes.filter((p) => p.dura).map((p) => p.mensaje).join(' · ') : undefined}
        onClick={(ev) => { ev.stopPropagation(); if (toque.pulsar(e.id)) siguiente(e) }}>
        {toque.armado === e.id ? `¿${e.etapa_siguiente_nombre}? Toca otra vez` : e.etapa_siguiente_nombre}
      </Button>
    ) : null
  }
  const etapaTag = (e: EncargoEstado) => {
    const et = e.etapa_actual_id ? etapaMap[e.etapa_actual_id] : undefined
    return e.estado === 'ANULADO' ? <Tag color="gray">Anulado</Tag>
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
        <Popover open={agrOpen} onOpenChange={setAgrOpen} align="end" className="w-[220px]"
          trigger={({ toggle }) => <Button variant="ghost" onClick={toggle}>Agrupar</Button>}>
          <div className="px-2 py-1 text-xs text-fg-3">Agrupar por</div>
          {[{ clave: 'no', etiqueta: 'Sin agrupar' }, ...dims].map((d) => (
            <button key={d.clave} onClick={() => { setP({ g: d.clave === 'proveedor' ? null : d.clave }); setPlegados(new Set()); setAgrOpen(false) }}
              className={cn('flex h-7 w-full items-center rounded-sm px-2 text-left hover:bg-bg-4', (dimAgr?.clave ?? 'no') === d.clave && 'font-medium')}>
              {d.etiqueta}
            </button>
          ))}
        </Popover>
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
          <Button variant={sel ? 'default' : 'ghost'} onClick={() => setSel(sel ? null : new Set())} title="Seleccionar varios para pasarlos de etapa a la vez">
            <IconSquareCheck size={14} /><span className="hidden xl:inline">{sel ? 'Seleccionando' : 'Seleccionar'}</span>
          </Button>
        )}
        {rol !== 'LOGISTICA' && <Button variant="primary" asChild><Link to="/encargos/nuevo">+ {vocab.encargo}</Link></Button>}
      </PageHeader>
      <Tabs items={tabs} value={bandeja} onChange={setBandeja} />
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
        {bandeja === 'revisar' && <span className="text-fg-2">Aquí entran: {CRITERIO_REVISAR.charAt(0).toLowerCase() + CRITERIO_REVISAR.slice(1)}. Los días se cambian en Ajustes → Tienda.</span>}
        {bandeja === 'bloqueados' && <span className="text-fg-2">Resuelve lo que falta en la propia fila y el botón de avanzar vuelve a funcionar.</span>}
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
                  <input type="checkbox" aria-label="Seleccionar todos los visibles" checked={visibles.length > 0 && visibles.every((v) => sel.has(v.id))}
                    onChange={(x) => setSel(x.target.checked ? new Set(visibles.map((v) => v.id)) : new Set())} />
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
                            <span className="ml-1 text-fg-3">{list.length}</span>
                          </button>
                        </td>
                      </tr>
                    )}
                    {!plegado && list.map((e) => (
                      <Tr key={e.id} className={cn('group cursor-pointer', sel?.has(e.id) && 'bg-bg-4')} aria-selected={sel ? sel.has(e.id) : undefined} onClick={() => sel ? alternar(e.id) : nav(`/encargos/${e.id}`)}>
                        <Td className={cn('titular sticky left-0 z-10 bg-bg text-fg-3 tabular group-hover:bg-bg-2', e.atascado ? 'marca-atasco' : listoParaMi(e, rol) && 'marca-lista',
                          e.atascado ? 'shadow-[inset_3px_0_0_var(--color-danger)]' : listoParaMi(e, rol) && 'shadow-[inset_3px_0_0_var(--accent)]')}
                          title={e.atascado ? `${e.dias_en_etapa} días en «${e.etapa_actual_nombre}»` : listoParaMi(e, rol) ? 'Listo para el siguiente paso' : undefined}>
                          {sel ? <input type="checkbox" aria-label={`Seleccionar ${num3(e)}`} checked={sel.has(e.id)} onClick={(x) => x.stopPropagation()} onChange={() => alternar(e.id)} /> : num3(e)}
                        </Td>
                        <Td className="titular sticky left-10 z-10 max-w-[220px] bg-bg font-medium group-hover:bg-bg-2" title={[e.cliente_nombre, ...motivosRevision(e, aj)].join(' · ')}>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{e.cliente_nombre}</span>
                            {e.revisar_manual && <IconAlertTriangle size={13} className="shrink-0 text-warn-fg" aria-label="Marcado para revisar" />}
                            {(e.estancado || e.atascado) && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-warn-bg px-1 text-xs font-normal text-warn-fg"><IconClock size={11} />{e.atascado ? e.dias_en_etapa : Math.floor((Date.now() - new Date(e.actualizado_en).getTime()) / 864e5)} d</span>}
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
                            {e.estancado && <span className="ml-1.5 text-sm text-fg-3">{relativo(e.actualizado_en)}</span>}
                          </Td>
                        )}
                        {ver('proveedor') && <Td className="max-w-[160px] truncate" title={e.proveedor_nombre ?? undefined}>{e.proveedor_nombre ?? <span className="text-fg-3">—</span>}</Td>}
                        {ver('actualizado') && <Td className="text-fg-3">{relativo(e.actualizado_en)}</Td>}
                        <Td className="accion" onClick={(ev) => ev.stopPropagation()}>{botonSiguiente(e)}</Td>
                      </Tr>
                    ))}
                  </React.Fragment>
                )
              })}
              {cargado && rows.length === 0 && (
                <tr><td colSpan={NCOL} className="h-24 text-center text-fg-3">Todavía no hay {min(vocab.encargos)}. Crea {gr.genero.encargo === 'f' ? 'la primera' : 'el primero'} con «+ {vocab.encargo}».</td></tr>
              )}
              {rows.length > 0 && visibles.length === 0 && (
                <tr><td colSpan={NCOL} className="h-24 text-center text-fg-3">
                  {hayFiltro ? <>Nada coincide con la búsqueda o los filtros. <button className="underline" onClick={() => setP({ q: null, f: null })}>Limpiar todo</button></> : 'Esta bandeja está vacía.'}
                </td></tr>
              )}
            </tbody>
          </Table>
        </div>
      )}
      {sel && vista === 'lista' && (
        <AccionLote seleccion={base.filter((x) => sel.has(x.id))} etapas={etapas} rol={rol} vocabEncargo={vocab.encargo} vocabEncargos={vocab.encargos}
          onTodos={() => setSel(new Set(visibles.map((v) => v.id)))} onSalir={() => setSel(null)} onHecho={() => recargar().catch(() => {})} />
      )}
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
      {visibles.length === 0 && <div className="m-auto text-fg-3">{hayFiltro ? 'Nada coincide con la búsqueda o los filtros.' : 'Nada que mostrar.'}</div>}
    </div>
  )
}

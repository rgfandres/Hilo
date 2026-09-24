import * as React from 'react'
import { Link } from 'react-router-dom'
import { IconChevronLeft, IconChevronRight, IconPrinter } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { listarEncargos, listarEtapas, listarProductos, listarProveedores, mensajeError } from '@/data/encargos'
import { camposDe, plantillas, type PlantillaCampos } from '@/data/config'
import {
  alcanzanEtapa, enviadosProveedor, hitosInforme, intervaloDe, mover, nuevos, plazos, porProveedor, rankingTerminados,
  terminados, ultimos, type HitoInforme, type Intervalo, type TipoIntervalo,
} from '@/data/informes'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { Button, Select, SectionLabel, Tag, tagColorFromHex } from '@/ui'
import { Facturacion, InformeMateriales } from '@/components/InformesExtra'
import { cn, locale, zona } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { activo } from '@/lib/bandejas'

const TIPOS: { k: TipoIntervalo; label: string }[] = [
  { k: 'semana', label: 'Semana' }, { k: 'quincena', label: 'Quincena' }, { k: 'mes', label: 'Mes' },
  { k: 'trimestre', label: 'Trimestre' }, { k: 'año', label: 'Año' }, { k: 'periodo', label: 'Periodo' },
]
const uno = (n: number | null) => (n == null ? '—' : n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

/** ▲ 3 / ▼ 2 / = comparado con el intervalo anterior (en absoluto). */
function Delta({ a, b }: { a: number; b: number | null }) {
  if (b == null) return null
  const d = a - b
  return <span className={cn('text-xs tabular', d > 0 ? 'text-ok-fg' : d < 0 ? 'text-danger-fg' : 'text-fg-3')} title={`Antes: ${b}`}>{d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '='}</span>
}

export function Informes() {
  const { tienda, vocab, periodo, gr } = useAuth()
  const os = gr.o('encargo', true)
  const [tipo, setTipo] = React.useState<TipoIntervalo>('mes')
  const [ref, setRef] = React.useState(() => new Date())
  const [hs, setHs] = React.useState<HitoInforme[] | null>(null)
  const [actuales, setActuales] = React.useState<EncargoEstado[]>([])
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [provs, setProvs] = React.useState<Map<string, string>>(new Map())
  const [prods, setProds] = React.useState<Map<string, string>>(new Map())
  const [campo, setCampo] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [tabla, setTabla] = React.useState(false)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    setErr(null); setHs(null)
    try {
      const [h, a, e, p, pv, pr] = await Promise.all([
        hitosInforme(tienda.id, null, null), listarEncargos(tienda.id, { periodoId: periodo?.id ?? null }),
        listarEtapas(tienda.id), plantillas(tienda.id), listarProveedores(tienda.id), listarProductos(tienda.id),
      ])
      setHs(h); setActuales(a); setEtapas(e); setPs(p)
      setProvs(new Map(pv.map((x) => [x.id, x.nombre]))); setProds(new Map(pr.map((x) => [x.id, x.nombre])))
    } catch (x) { setErr(mensajeError(x)) }
  }, [tienda, periodo])
  // Se recalcula siempre al entrar
  React.useEffect(() => { cargar() }, [cargar])

  // Intervalo actual (o el periodo activo completo)
  const hsVista = React.useMemo(() => (tipo === 'periodo' && periodo ? (hs ?? []).filter((h) => h.periodo_id === periodo.id) : hs ?? []), [hs, tipo, periodo])
  const iv: Intervalo = React.useMemo(() => {
    if (tipo !== 'periodo') return intervaloDe(tipo, ref)
    const primera = hsVista[0]?.fecha
    return { tipo, ini: primera ? new Date(primera) : new Date(), fin: new Date(Date.now() + 1000), titulo: periodo ? `Periodo ${periodo.nombre}` : 'Todo' }
  }, [tipo, ref, hsVista, periodo])
  const prev = mover(iv, -1)
  const sig = mover(iv, 1)

  // Etapas en orden del flujo (por nombre, sin repetir)
  const ordenEtapas = React.useMemo(() => {
    const m = new Map<string, Etapa>()
    for (const e of etapas) if (!m.has(e.nombre)) m.set(e.nombre, e)
    return [...m.values()]
  }, [etapas])

  const prod = React.useMemo(() => {
    const act = alcanzanEtapa(hsVista, iv), ant = prev ? alcanzanEtapa(hsVista, prev) : null
    return {
      nuevos: nuevos(hsVista, iv), nuevosAnt: prev ? nuevos(hsVista, prev) : null,
      etapas: ordenEtapas.map((e) => ({ e, n: act.get(e.nombre) ?? 0, ant: ant ? ant.get(e.nombre) ?? 0 : null })),
    }
  }, [hsVista, iv, prev, ordenEtapas])

  const evolucion = React.useMemo(() => {
    if (tipo === 'periodo') return []
    return ultimos(iv, tipo === 'año' ? 6 : 12).map((x) => ({
      i: x, nuevos: nuevos(hsVista, x), proveedor: enviadosProveedor(hsVista, x).size, terminados: terminados(hsVista, x).size,
    }))
  }, [hsVista, iv, tipo])

  const pz = React.useMemo(() => plazos(hsVista, iv), [hsVista, iv])
  const descartados = pz.reduce((n, p) => n + p.descartados, 0)
  const pp = React.useMemo(() => porProveedor(hsVista, iv), [hsVista, iv])
  const enCurso = actuales.filter(activo)
  const filasProv = React.useMemo(() => {
    const ids = new Set([...pp.map((x) => x.proveedor_id), ...enCurso.filter((e) => e.proveedor_id && e.en_proveedor).map((e) => e.proveedor_id!)])
    return [...ids].map((id) => {
      const r = pp.find((x) => x.proveedor_id === id)
      const ahora = enCurso.filter((e) => e.proveedor_id === id && e.en_proveedor)
      return { id, nombre: provs.get(id) ?? '—', enviados: r?.enviados ?? 0, recibidos: r?.recibidos ?? 0, dias: r?.diasMedios ?? null, enCurso: ahora.length, atascados: ahora.filter((e) => e.atascado).length }
    }).sort((a, b) => b.recibidos - a.recibidos || b.enCurso - a.enCurso)
  }, [pp, enCurso, provs])

  const camposEncargo = React.useMemo(() => {
    const vistos = new Set<string>()
    return [...new Set(etapas.map((e) => e.tipo_encargo_id))].flatMap((t) => camposDe(ps, 'ENCARGO', t))
      .filter((c) => c.tipo !== 'fecha' && !vistos.has(c.clave) && (vistos.add(c.clave), true))
  }, [ps, etapas])
  React.useEffect(() => { if (!campo && camposEncargo[0]) setCampo(camposEncargo[0].clave) }, [campo, camposEncargo])
  const topProducto = React.useMemo(() => rankingTerminados(hsVista, iv, (h) => (h.producto_id ? prods.get(h.producto_id) ?? null : null)).slice(0, 10), [hsVista, iv, prods])
  const topCampo = React.useMemo(() => campo ? rankingTerminados(hsVista, iv, (h) => { const v = h.datos?.[campo]; return v == null || v === '' ? null : String(v) }).slice(0, 10) : [], [hsVista, iv, campo])

  const cargando = hs == null && !err
  const ahora = new Date()

  return (
    <>
      <PageHeader title="Informes" subtitle={iv.titulo}>
        <div className="no-imprimir flex items-center gap-1">
          <Select className="h-7 w-[130px]" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoIntervalo); setRef(new Date()) }} aria-label="Intervalo">
            {TIPOS.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
          </Select>
          <Button variant="ghost" aria-label="Anterior" disabled={!prev} onClick={() => prev && setRef(prev.ini)}><IconChevronLeft size={14} /></Button>
          <Button variant="ghost" aria-label="Siguiente" disabled={!sig} onClick={() => sig && setRef(sig.ini)}><IconChevronRight size={14} /></Button>
          <Button variant="ghost" onClick={() => window.print()}><IconPrinter size={14} />Imprimir</Button>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="informe flex max-w-[1000px] flex-col gap-8 p-8 max-md:gap-6 max-md:p-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="m-0 flex items-center gap-3 text-xl font-semibold">
              {typeof (tienda?.ajustes as Record<string, unknown> | undefined)?.logo_url === 'string' && <img src={(tienda!.ajustes as Record<string, string>).logo_url} alt="" className="h-8 max-w-[140px] object-contain" />}
              {iv.titulo}
            </h1>
            <span className="text-sm text-fg-3">{tienda?.nombre} · generado el {ahora.toLocaleDateString(locale(), { timeZone: zona() })} a las {ahora.toLocaleTimeString(locale(), { timeZone: zona(), hour: '2-digit', minute: '2-digit' })}{prev ? ` · comparado con ${prev.titulo.toLowerCase()}` : ''}</span>
          </div>
          {err && <div className="flex items-center gap-2 rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}<Button size="sm" onClick={cargar}>↻ Reintentar</Button></div>}
          {cargando && <div className="text-fg-3">Calculando…</div>}

          {!cargando && !err && (
            <>
              <section className="flex flex-col gap-2">
                <SectionLabel>Producción · {min(vocab.encargos)} que llegan a cada etapa</SectionLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  <Tile titulo={`Nuev${os}`} n={prod.nuevos} ant={prod.nuevosAnt} />
                  {prod.etapas.map(({ e, n, ant }) => <Tile key={e.id} titulo={e.nombre} n={n} ant={ant} color={e.color} />)}
                </div>
              </section>

              {evolucion.length > 1 && (
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <SectionLabel className="flex-1">Evolución · últimos {evolucion.length} intervalos</SectionLabel>
                    <button className="no-imprimir text-sm text-fg-3 hover:text-fg" onClick={() => setTabla((t) => !t)}>{tabla ? 'Ver gráfico' : 'Ver como tabla'}</button>
                  </div>
                  {tabla ? (
                    <TablaSimple cabecera={['Intervalo', `Nuev${os}`, `A ${min(vocab.proveedor)}`, `Terminad${os}`]}
                      filas={evolucion.map((x) => [x.i.titulo, x.nuevos, x.proveedor, x.terminados])} />
                  ) : (
                    <Evolucion datos={evolucion} proveedor={min(vocab.proveedor)} os={os} />
                  )}
                </section>
              )}

              <section className="flex flex-col gap-2">
                <SectionLabel>Plazos medios (días)</SectionLabel>
                {pz.length === 0 ? <p className="m-0 text-fg-3">Nada ha pasado de una etapa a otra en este intervalo.</p> : (
                  <TablaSimple cabecera={['Tramo', 'Media', `Nº de ${min(vocab.encargos)}`]} alinear={[false, true, true]}
                    filas={pz.map((p) => [p.tramo, uno(p.media), p.n])} />
                )}
                {descartados > 0 && <p className="m-0 text-sm text-warn-fg">⚠ {descartados} {descartados === 1 ? 'tramo no se ha contado' : 'tramos no se han contado'} porque la fecha de llegada es anterior a la de salida. Revisa las fechas de esos pasos en el hilo {gr_de(vocab.encargo)}.</p>}
              </section>

              <Facturacion hs={hsVista} iv={iv} encargos={actuales} />

              <section className="flex flex-col gap-2">
                <SectionLabel>Dónde está cada {min(vocab.encargo)} ahora</SectionLabel>
                <Embudo actuales={enCurso} etapas={ordenEtapas} />
              </section>

              <InformeMateriales iv={iv} />

              <section className="flex flex-col gap-2">
                <SectionLabel>Por {min(vocab.proveedor)}</SectionLabel>
                {filasProv.length === 0 ? <p className="m-0 text-fg-3">Nada ha pasado por {min(vocab.proveedores)} en este intervalo.</p> : (
                  <TablaSimple cabecera={[vocab.proveedor, `Enviad${os}`, `Recibid${os}`, 'Días medios', 'En curso', `Atascad${os}`]} alinear={[false, true, true, true, true, true]}
                    filas={filasProv.map((r) => [<Link key={r.id} to={`/proveedores/${r.id}`} className="font-medium hover:underline">{r.nombre}</Link>, r.enviados, r.recibidos, uno(r.dias), r.enCurso,
                      r.atascados ? <span className="text-danger-fg">{r.atascados}</span> : 0])} />
                )}
              </section>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <section className="flex flex-col gap-2">
                  <SectionLabel>Terminad{os} por {min(vocab.producto)}</SectionLabel>
                  {topProducto.length === 0 ? <p className="m-0 text-fg-3">Nada terminado en este intervalo.</p>
                    : <TablaSimple cabecera={[vocab.producto, `Terminad${os}`]} alinear={[false, true]} filas={topProducto.map(([k, n]) => [k || <span className="text-warn-fg">Sin {min(vocab.producto)}</span>, n])} />}
                </section>
                {camposEncargo.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <SectionLabel className="flex-1">Terminad{os} por</SectionLabel>
                      <Select className="no-imprimir h-7 w-[180px]" value={campo} onChange={(e) => setCampo(e.target.value)} aria-label="Campo">
                        {camposEncargo.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
                      </Select>
                    </div>
                    {topCampo.length === 0 ? <p className="m-0 text-fg-3">Nada terminado en este intervalo.</p>
                      : <TablaSimple cabecera={[camposEncargo.find((c) => c.clave === campo)?.etiqueta ?? '', `Terminad${os}`]} alinear={[false, true]}
                          filas={topCampo.map(([k, n]) => [k || <span className="text-warn-fg">Sin dato</span>, n])} />}
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

const gr_de = (palabra: string) => `de cada ${min(palabra)}`

function Tile({ titulo, n, ant, color }: { titulo: string; n: number; ant: number | null; color?: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <span className="flex items-center gap-1.5 truncate text-sm text-fg-2">
        {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}{titulo}
      </span>
      <span className="flex items-baseline gap-2"><span className="text-xl font-semibold tabular">{n}</span><Delta a={n} b={ant} /></span>
    </div>
  )
}

function TablaSimple({ cabecera, filas, alinear }: { cabecera: React.ReactNode[]; filas: React.ReactNode[][]; alinear?: boolean[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-base">
        <thead><tr>{cabecera.map((c, i) => <th key={i} className={cn('h-8 border-b border-border bg-bg-2 px-3 text-left text-sm font-medium text-fg-2', alinear?.[i] && 'text-right')}>{c}</th>)}</tr></thead>
        <tbody>
          {filas.map((f, r) => (
            <tr key={r} className="border-b border-border-light last:border-0">
              {f.map((c, i) => <td key={i} className={cn('h-8 px-3', alinear?.[i] && 'text-right tabular')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Barra horizontal por etapa (en orden del flujo) con incidencias y atascados aparte. */
function Embudo({ actuales, etapas }: { actuales: EncargoEstado[]; etapas: Etapa[] }) {
  const n = new Map<string, number>()
  for (const e of actuales) { const k = e.etapa_actual_nombre ?? ''; n.set(k, (n.get(k) ?? 0) + 1) }
  const filas = [...(n.has('') ? [{ nombre: '', color: null as string | null }] : []), ...etapas.filter((e) => !e.es_final).map((e) => ({ nombre: e.nombre, color: e.color }))]
    .map((e) => ({ ...e, n: n.get(e.nombre) ?? 0 }))
  const max = Math.max(1, ...filas.map((f) => f.n))
  const inc = actuales.filter((e) => e.en_revision).length
  const atasc = actuales.filter((e) => e.atascado).length
  if (actuales.length === 0) return <p className="m-0 text-fg-3">No hay nada en curso.</p>
  return (
    <div className="flex flex-col gap-1.5">
      {filas.map((f) => (
        <div key={f.nombre || '_'} className="flex items-center gap-3">
          <span className="w-[180px] shrink-0 truncate max-md:w-[120px]"><Tag color={tagColorFromHex(f.color)}>{f.nombre || 'Sin empezar'}</Tag></span>
          <div className="h-3 min-w-0 flex-1">
            <div className="h-3 rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${(f.n / max) * 100}%`, minWidth: f.n ? 3 : 0 }} title={`${f.n}`} />
          </div>
          <span className="w-8 text-right tabular">{f.n}</span>
        </div>
      ))}
      <div className="mt-1 flex gap-4 text-sm text-fg-2">
        <span><Tag color="red">Incidencia</Tag> {inc}</span>
        <span className="text-danger-fg">Atascados: {atasc}</span>
      </div>
    </div>
  )
}

/** Tres series en el tiempo: líneas de 2 px, leyenda, etiqueta al final y tooltip por intervalo. */
function Evolucion({ datos, proveedor, os = 'os' }: { datos: { i: Intervalo; nuevos: number; proveedor: number; terminados: number }[]; proveedor: string; os?: string }) {
  const series = [
    { k: 'nuevos' as const, label: `Nuev${os}`, color: '#2a78d6' },
    { k: 'proveedor' as const, label: `A ${proveedor}`, color: '#eb6834' },
    { k: 'terminados' as const, label: `Terminad${os}`, color: '#1baf7a' },
  ]
  const [hover, setHover] = React.useState<number | null>(null)
  const W = 640, H = 200, PL = 28, PR = 84, PT = 10, PB = 26
  const max = Math.max(1, ...datos.flatMap((d) => series.map((s) => d[s.k])))
  const paso = Math.ceil(max / 4)
  const top = paso * 4
  const x = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, datos.length - 1)
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / top)
  const etiqueta = (i: Intervalo) => i.tipo === 'mes' ? i.titulo.slice(0, 3) : i.tipo === 'año' ? i.titulo : `${i.ini.getDate()}/${i.ini.getMonth() + 1}`
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4 text-sm text-fg-2">
        {series.map((s) => <span key={s.k} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolución por intervalo" onMouseLeave={() => setHover(null)}>
          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k}>
              <line x1={PL} x2={W - PR} y1={y(k * paso)} y2={y(k * paso)} stroke="var(--color-border-light)" />
              <text x={PL - 6} y={y(k * paso) + 3} textAnchor="end" fontSize="10" fill="var(--color-fg-3)">{k * paso}</text>
            </g>
          ))}
          {datos.map((d, i) => (i % Math.ceil(datos.length / 6) === 0 || i === datos.length - 1) && (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-fg-3)">{etiqueta(d.i)}</text>
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="var(--color-border-strong)" />}
          {series.map((s) => (
            <g key={s.k}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                points={datos.map((d, i) => `${x(i)},${y(d[s.k])}`).join(' ')} />
              {hover != null && <circle cx={x(hover)} cy={y(datos[hover][s.k])} r={4} fill={s.color} stroke="var(--color-bg)" strokeWidth={2} />}
              <text x={W - PR + 6} y={y(datos[datos.length - 1][s.k]) + 3} fontSize="10" fill="var(--color-fg-2)">{s.label}</text>
            </g>
          ))}
          {datos.map((_, i) => (
            <rect key={i} x={x(i) - (W - PL - PR) / Math.max(1, datos.length - 1) / 2} y={0} width={(W - PL - PR) / Math.max(1, datos.length - 1)} height={H}
              fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-0 rounded-sm border border-border bg-bg px-2 py-1 text-sm shadow-light"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > datos.length / 2 ? '-105%' : '5%'})` }}>
            <div className="font-medium">{datos[hover].i.titulo}</div>
            {series.map((s) => (
              <div key={s.k} className="flex items-center gap-1.5 text-fg-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}: <span className="text-fg tabular">{datos[hover][s.k]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

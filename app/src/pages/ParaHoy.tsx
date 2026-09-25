import * as React from 'react'
import { nombreMenu } from '@/lib/pantallas'
import { Link } from 'react-router-dom'
import { IconAdjustments } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { listarEncargos, listarEtapas, mensajeError } from '@/data/encargos'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { Button, OpcionCheck, Popover, Tag, SectionLabel, tagColorFromHex } from '@/ui'
import { cn, num3, locale, zona } from '@/lib/utils'
import { min, textosFin } from '@/lib/vocab'
import { filtrosAUrl } from '@/data/lista'
import { useTiempoReal } from '@/lib/tiempoReal'
import { activo, bloqueado, enProveedor, enRevisar, listoParaEntregar, miTrabajo, motivosRevision } from '@/lib/bandejas'
import { bandejasLista, cuentaBandeja, tarjetasInicio, tiposAparte } from '@/lib/listaBandejas'
import { ajustesMaterial, avisoStock, lineasDeTienda, listarMateriales, type LineaMaterial, type MaterialEstado } from '@/data/materiales'

type Bloque = 'indicadores' | 'mio' | 'atencion' | 'listos' | 'etapas' | 'proveedores'
const LS = 'hilo.para_hoy'

function Fila({ e, motivo }: { e: EncargoEstado; motivo: React.ReactNode }) {
  return (
    <Link to={`/encargos/${e.id}`} className="flex h-9 items-center gap-3 border-b border-border-light px-2 hover:bg-bg-2">
      <span className="w-9 shrink-0 text-fg-3 tabular">{num3(e)}</span>
      <span className="w-[160px] shrink-0 truncate font-medium max-md:w-auto max-md:max-w-[45%]">{e.cliente_nombre}</span>
      <span className="w-[140px] shrink-0 truncate text-fg-2 max-md:hidden">{e.producto_nombre ?? '—'}</span>
      <span className="min-w-0 flex-1 truncate text-fg-3">{motivo}</span>
    </Link>
  )
}

/** Enlace a la lista con la bandeja o el filtro ya puestos, y el aviso «Desde el panel». */
const aLista = (p: { b?: string; f?: Record<string, string[]>; s?: 'curso' | 'incidencias' | 'proveedor' | 'asignar'; desde: string }) => {
  const u = new URLSearchParams()
  if (p.b) u.set('b', p.b)
  if (p.s) u.set('s', p.s)
  if (p.f) u.set('f', filtrosAUrl(p.f))
  u.set('desde', p.desde)
  return `/encargos?${u}`
}

export function ParaHoy() {
  const { tienda, vocab, periodo, rol, gr } = useAuth()
  const [rows, setRows] = React.useState<EncargoEstado[]>([])
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const [cargado, setCargado] = React.useState(false)
  const [ocultos, setOcultos] = React.useState<Bloque[]>([])
  const [pers, setPers] = React.useState(false)
  const [lineasMat, setLineasMat] = React.useState<LineaMaterial[]>([])
  const [matsEst, setMatsEst] = React.useState<MaterialEstado[]>([])
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>

  const leer = React.useCallback(async () => {
    if (!tienda) return
    const [r, e] = await Promise.all([listarEncargos(tienda.id, { periodoId: periodo?.id ?? null }), listarEtapas(tienda.id)])
    // Los tipos que van aparte (con su propio menú) no cuentan aquí, igual que en la lista
    const aparte = tiposAparte(tienda.ajustes as Record<string, unknown>)
    setRows(aparte.length ? r.filter((x) => !aparte.includes(x.tipo_encargo_id)) : r); setEtapas(e); setCargado(true)
    // Tarjetas de «pedir» o «esperando material»: hacen falta las líneas de material
    const aj0 = (tienda.ajustes ?? {}) as Record<string, unknown>
    const conf0 = bandejasLista(aj0)
    if (ajustesMaterial(aj0).activo && tarjetasInicio(aj0)?.some((t) => { const b = conf0?.find((x) => x.key === t.bandeja); return b?.tipo === 'pedir' || b?.tipo === 'espera_material' })) {
      const [l, m] = await Promise.all([lineasDeTienda(tienda.id).catch(() => []), listarMateriales(tienda.id).catch(() => [])])
      setLineasMat(l); setMatsEst(m)
    }
  }, [tienda, periodo])
  React.useEffect(() => {
    if (!tienda) return
    try { setOcultos(JSON.parse(localStorage.getItem(`${LS}.${tienda.id}`) ?? '[]')) } catch { setOcultos([]) }
    leer().catch((e) => setErr(mensajeError(e)))
  }, [tienda, leer])
  useTiempoReal(tienda?.id, () => leer().catch(() => {}))

  function toggle(b: Bloque) {
    const n = ocultos.includes(b) ? ocultos.filter((x) => x !== b) : [...ocultos, b]
    setOcultos(n)
    try { if (tienda) localStorage.setItem(`${LS}.${tienda.id}`, JSON.stringify(n)) } catch { /* solo en esta sesión */ }
  }
  const ver = (b: Bloque) => !ocultos.includes(b)

  const enCurso = rows.filter(activo)
  const mios = rows.filter((r) => miTrabajo(r, rol))
  const revisar = rows.filter(enRevisar)
  const listos = rows.filter(listoParaEntregar)
  const fin = textosFin(etapas, gr)
  const fuera = rows.filter(enProveedor)
  const bloq = enCurso.filter(bloqueado)
  const hoy = new Date().toLocaleDateString(locale(), { timeZone: zona(), weekday: 'long', day: 'numeric', month: 'long' })
  const prov = min(vocab.proveedor)

  // Tarjetas elegidas por la tienda (si las hay) en lugar de las de siempre
  const conf = bandejasLista(aj)
  const tarjetas = tarjetasInicio(aj)
  // Bandeja «todos» de la lista (la tienda puede haber cambiado sus nombres)
  const bTodos = conf ? conf.find((x) => x.tipo === 'todos')?.key : 'todos'
  const indicadoresTienda = tarjetas?.map((t, i) => {
    if (t.que === 'incidencias') {
      const n = rows.filter((e) => activo(e) && e.en_revision).length
      return { k: `t${i}`, label: t.nombre, n, to: aLista({ b: 'revisar', s: 'incidencias', desde: t.nombre }), title: 'Con una incidencia abierta', tono: t.tono }
    }
    if (t.que === 'etapas') {
      const et = t.etapas ?? []
      return { k: `t${i}`, label: t.nombre, n: enCurso.filter((e) => et.includes(e.etapa_actual_nombre ?? '')).length, to: aLista({ f: { etapa: et }, b: bTodos, s: 'curso', desde: t.nombre }), title: et.join(' · '), tono: t.tono }
    }
    const b = conf?.find((x) => x.key === t.bandeja)
    const n = !b ? 0
      : b.tipo === 'pedir' ? rows.filter((e) => activo(e) && lineasMat.some((l) => l.encargo_id === e.id && l.estado === 'PENDIENTE'
          && (!b.solo_falta || !!avisoStock(matsEst.find((m) => m.id === l.material_id)).nivel))).length
      : b.tipo === 'espera_material' ? rows.filter((e) => activo(e) && lineasMat.some((l) => l.encargo_id === e.id && l.estado === 'PEDIDO')).length
      : cuentaBandeja(b, rows, { miTrabajo: (e) => miTrabajo(e, rol), revisar: enRevisar, bloqueado }) ?? 0
    return { k: `t${i}`, label: t.nombre, n, to: aLista({ b: t.bandeja, desde: t.nombre }), title: b?.ayuda ?? b?.nombre, tono: t.tono }
  })
  const indicadores = indicadoresTienda ?? [
    { k: 'curso', label: 'En curso', n: enCurso.length, to: aLista({ b: bTodos, s: 'curso', desde: 'En curso' }), title: 'Sin terminar' },
    { k: 'mio', label: 'Mi trabajo', n: mios.length, to: aLista({ b: 'mio', desde: 'Mi trabajo' }), title: 'El siguiente paso lo marca tu rol y nada lo bloquea' },
    { k: 'listos', label: fin.listos, n: listos.length, to: aLista({ b: 'listos', desde: fin.listos }), title: fin.listosTitulo, tono: 'ok' },
    { k: 'revisar', label: 'Revisar', n: revisar.length, to: aLista({ b: 'revisar', desde: 'Revisar' }), title: `Incidencias, marcad${gr.o('encargo', true)} a mano, estancad${gr.o('encargo', true)} y atascad${gr.o('encargo', true)}`, tono: 'danger' },
    { k: 'fuera', label: `En ${prov}`, n: fuera.length, to: aLista({ b: 'proveedor', desde: `En ${prov}` }), title: `En una etapa que ve ${gr.con('proveedor', 'el')}` },
    { k: 'bloq', label: `Bloquead${gr.o('encargo', true)}`, n: bloq.length, to: aLista({ b: 'bloqueados', desde: `Bloquead${gr.o('encargo', true)}` }), title: 'El siguiente paso tiene una condición que bloquea', tono: 'warn' },
  ]

  // Resumen por etapa (en orden del flujo) y por proveedor («Sin …» al final)
  const porEtapa = React.useMemo(() => {
    const orden = new Map<string, Etapa>()
    for (const e of etapas) if (!orden.has(e.nombre)) orden.set(e.nombre, e)
    const n = new Map<string, number>()
    for (const r of enCurso) { const k = r.etapa_actual_nombre ?? ''; n.set(k, (n.get(k) ?? 0) + 1) }
    const pos = new Map([...orden.keys()].map((k, i) => [k, i]))
    return [...n.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : (pos.get(a) ?? 0) - (pos.get(b) ?? 0)))
      .map(([k, c]) => ({ nombre: k, n: c, color: orden.get(k)?.color ?? null }))
  }, [enCurso, etapas])
  // Por proveedor: lo que tiene en su mano; «Sin …»: lo que espera que se le asigne uno para avanzar
  const esperaProveedor = (r: EncargoEstado) => !r.proveedor_id && (r.puertas_pendientes ?? []).some((p) => p.tipo === 'CAMPO_NO_VACIO' && p.referencia === 'proveedor_id')
  const porProveedor = React.useMemo(() => {
    const n = new Map<string, { n: number; atascados: number }>()
    for (const r of enCurso) {
      if (r.proveedor_id ? !enProveedor(r) : !esperaProveedor(r)) continue
      const k = r.proveedor_nombre ?? ''
      const v = n.get(k) ?? { n: 0, atascados: 0 }
      v.n++; if (r.atascado) v.atascados++
      n.set(k, v)
    }
    return [...n.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')))
  }, [enCurso])

  const BLOQUES: { k: Bloque; label: string }[] = [
    { k: 'indicadores', label: 'Indicadores' }, { k: 'mio', label: 'Mi trabajo' }, { k: 'atencion', label: 'Necesitan atención' },
    { k: 'listos', label: fin.listos }, { k: 'etapas', label: 'Por etapa' }, { k: 'proveedores', label: `Por ${prov}` },
  ]

  return (
    <>
      <PageHeader title={nombreMenu(tienda?.ajustes as Record<string, unknown>, 'parahoy', 'Para hoy')} subtitle={hoy}>
        <Popover open={pers} onOpenChange={setPers} align="end" className="w-[240px]"
          trigger={({ toggle: t }) => <Button variant="ghost" onClick={t}><IconAdjustments size={14} />Personalizar</Button>}>
          <div className="px-2 py-1 text-xs text-fg-3">Bloques que ves (en este dispositivo)</div>
          {BLOQUES.map((b) => <OpcionCheck key={b.k} checked={ver(b.k)} onChange={() => toggle(b.k)}>{b.label}</OpcionCheck>)}
        </Popover>
        {rol !== 'LOGISTICA' && <Button variant="primary" size="md" asChild><Link to="/encargos/nuevo">+ {vocab.encargo}</Link></Button>}
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex max-w-[980px] flex-col gap-7 p-8 max-md:gap-5 max-md:p-4">
          {err && <div className="rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</div>}
          {!cargado && !err && <p className="m-0 text-fg-3">Cargando…</p>}
          {cargado && <>
          <p className="m-0 leading-relaxed text-fg-2">
            Tienes <Link to={aLista({ b: bTodos, s: 'curso', desde: 'En curso' })} className="font-medium text-fg underline decoration-border-strong">{enCurso.length} {min(enCurso.length === 1 ? vocab.encargo : vocab.encargos)} en curso</Link>.
            {mios.length + revisar.length > 0
              ? ` ${mios.length ? `${mios.length} ${mios.length === 1 ? 'espera' : 'esperan'} un paso tuyo` : ''}${mios.length && revisar.length ? ' y ' : ''}${revisar.length ? `${revisar.length} ${revisar.length === 1 ? 'necesita' : 'necesitan'} revisión` : ''}.`
              : ` Ningun${gr.genero.encargo === 'f' ? 'a' : 'o'} necesita nada de ti ahora mismo.`}
          </p>

          {ver('indicadores') && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {indicadores.map((i) => (
                <Link key={i.k} to={i.to} title={i.title}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-bg p-3 hover:border-border-strong">
                  <span className={cn('text-xl font-semibold tabular',
                    i.n > 0 && i.tono === 'danger' && 'text-danger-fg', i.n > 0 && i.tono === 'warn' && 'text-warn-fg', i.n > 0 && i.tono === 'ok' && 'text-ok-fg')}>{i.n}</span>
                  <span className="truncate text-sm text-fg-2">{i.label}</span>
                </Link>
              ))}
            </div>
          )}

          {ver('mio') && mios.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionLabel className="px-2">Mi trabajo</SectionLabel>
              <div className="border-t border-border-light">
                {mios.slice(0, 10).map((e) => <Fila key={e.id} e={e} motivo={<>Siguiente: <span className="text-fg-2">{e.etapa_siguiente_nombre}</span></>} />)}
              </div>
              {mios.length > 10 && <Link to={aLista({ b: 'mio', desde: 'Mi trabajo' })} className="px-2 text-sm text-fg-3 hover:text-fg">Ver todo ({mios.length})</Link>}
            </section>
          )}

          {ver('atencion') && revisar.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionLabel className="px-2">Necesitan atención</SectionLabel>
              <div className="border-t border-border-light">
                {revisar.slice(0, 10).map((e) => (
                  <Fila key={e.id} e={e} motivo={<>{e.en_revision && <Tag color="red" className="mr-1.5">Incidencia</Tag>}{motivosRevision(e, aj).filter((m) => !m.startsWith('Incidencia')).join(' · ')}</>} />
                ))}
              </div>
              {revisar.length > 10 && <Link to={aLista({ b: 'revisar', desde: 'Revisar' })} className="px-2 text-sm text-fg-3 hover:text-fg">Ver todo ({revisar.length})</Link>}
            </section>
          )}

          {ver('listos') && listos.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionLabel className="px-2">{fin.listos}</SectionLabel>
              <div className="border-t border-border-light">
                {listos.slice(0, 10).map((e) => <Fila key={e.id} e={e} motivo={<Tag color={bloqueado(e) ? 'amber' : 'green'} title={bloqueado(e) ? [...e.puertas_pendientes.filter((p) => p.dura).map((p) => p.mensaje), ...(e.revisar_manual ? ['Marcado para revisar'] : [])].join(' · ') : undefined}>{bloqueado(e) ? `Bloquead${gr.o('encargo')}` : e.etapa_actual_nombre}</Tag>} />)}
              </div>
              {listos.length > 10 && <Link to={aLista({ b: 'listos', desde: fin.listos })} className="px-2 text-sm text-fg-3 hover:text-fg">Ver todo ({listos.length})</Link>}
            </section>
          )}

          {(ver('etapas') || ver('proveedores')) && enCurso.length > 0 && (
            <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
              {ver('etapas') && (
                <section className="flex flex-col gap-1.5">
                  <SectionLabel className="px-2">Por etapa</SectionLabel>
                  <div className="border-t border-border-light">
                    {porEtapa.map((x) => (
                      <Link key={x.nombre || '_'} to={aLista({ f: { etapa: [x.nombre] }, b: bTodos, s: 'curso', desde: `Etapa: ${x.nombre || 'Sin empezar'}` })}
                        className="flex h-9 items-center gap-2 border-b border-border-light px-2 hover:bg-bg-2">
                        <Tag color={tagColorFromHex(x.color)}>{x.nombre || 'Sin empezar'}</Tag>
                        <span className="flex-1" /><span className="tabular text-fg-2">{x.n}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {ver('proveedores') && (
                <section className="flex flex-col gap-1.5">
                  <SectionLabel className="px-2">Por {prov}</SectionLabel>
                  <div className="border-t border-border-light">
                    {porProveedor.map(([k, v]) => (
                      <Link key={k || '_'} to={aLista({ f: { proveedor: [k] }, b: bTodos, s: k ? 'proveedor' : 'asignar', desde: `${vocab.proveedor}: ${k || `Sin ${prov}`}` })}
                        className="flex h-9 items-center gap-2 border-b border-border-light px-2 hover:bg-bg-2">
                        <span className={cn('truncate', k ? 'font-medium' : 'text-warn-fg')}>{k || `Sin ${prov}`}</span>
                        <span className="flex-1" />
                        {v.atascados > 0 && <span className="rounded-sm bg-danger-bg px-1.5 text-xs text-danger-fg">{v.atascados} atascad{gr.o('encargo', v.atascados !== 1)}</span>}
                        <span className="tabular text-fg-2">{v.n}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          </>}
        </div>
      </div>
    </>
  )
}

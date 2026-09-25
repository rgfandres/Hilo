import * as React from 'react'
import { Link } from 'react-router-dom'
import { IconArrowLeft, IconClock, IconFolder, IconPhone } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { telefonoWhatsApp } from '@/data/mensajes'
import { asignarProveedor, crearHito, deshacerUltimoHito, listarEncargos, listarEtapas, marcarCheck, mensajeError, obtenerEncargo } from '@/data/encargos'
import { listarPuertas, type PuertaDef } from '@/data/ajustes'
import { listarProveedoresCat, haceEncargos, fichaProducto, tieneFicha, ajustesFicha, type ProveedorFila, type FichaTecnica } from '@/data/catalogos'
import { camposDe, formatearValor, plantillas, type PlantillaCampos } from '@/data/config'
import { ajustesLogistica, bandejasLogistica, hitosDe, type BandejaLogistica, type ConfigBandeja, type HitoMini } from '@/data/logistica'
import { ajustesHoja } from '@/data/produccion'
import { nombreMenu } from '@/lib/pantallas'
import { resumenFicha } from '@/pages/Productos'
import type { EncargoEstado, Etapa } from '@/lib/types'
import { PageHeader } from '@/layout/AppShell'
import { CamposVista } from '@/components/CampoInput'
import { Button, Dialog, Select, Sheet, Tabs, Tag, useAvisos } from '@/ui'
import { useDobleToque } from '@/lib/movil'
import { haceCuanto, useTiempoReal } from '@/lib/tiempoReal'
import { cn, fechaCorta, num3, locale, zona } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { ajustesMaterial, cant, listarPedidos, nombreMaterial, type LineaPedido } from '@/data/materiales'
import { DialogoRecibir } from '@/pages/Materiales'

/** Bandeja con los textos ya resueltos (los de la tienda o los de por defecto) */
interface Bandeja extends BandejaLogistica { label: string; subtitulo: string; boton: string; conf: ConfigBandeja }

/**
 * Logística: una bandeja por cada paso que marca este rol (y una por cada comprobación que
 * hace falta antes de él), más un histórico de solo lectura. Tarjetas pensadas para el móvil.
 */
export function Logistica() {
  const { tienda, vocab, rol, periodo, gr, nombresRol } = useAuth()
  const avisar = useAvisos()
  const aj = tienda?.ajustes as Record<string, unknown>
  const lg = ajustesLogistica(aj)
  const cfg = lg.cfg
  const toque = useDobleToque(Number(aj?.segundos_doble_toque ?? 3.5), !!cfg.doble_siempre)
  const [encs, setEncs] = React.useState<EncargoEstado[] | null>(null)
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [puertas, setPuertas] = React.useState<PuertaDef[]>([])
  const [provs, setProvs] = React.useState<ProveedorFila[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [hitos, setHitos] = React.useState<Record<string, HitoMini[]>>({})
  const [bandeja, setBandeja] = React.useState<string>('')
  const [carpeta, setCarpeta] = React.useState<string | null>(null)
  const [prod, setProd] = React.useState('')
  const [ocultos, setOcultos] = React.useState<Set<string>>(new Set())
  const [provSel, setProvSel] = React.useState<Record<string, string>>({})
  const [quitarProv, setQuitarProv] = React.useState<{ e: EncargoEstado; antes: string } | null>(null)
  const [ficha, setFicha] = React.useState<string | null>(null)
  const [todos, setTodos] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    const [e, et, pv, p] = await Promise.all([listarEncargos(tienda.id, { periodoId: periodo?.id ?? null }), listarEtapas(tienda.id), listarProveedoresCat(tienda.id), plantillas(tienda.id)])
    const logis = et.filter((x) => x.rol_ejecuta === 'LOGISTICA')
    const pu = await listarPuertas(logis.map((x) => x.id))
    setEncs(e); setEtapas(et); setProvs(pv.filter(haceEncargos)); setPs(p); setPuertas(pu); setOcultos(new Set())
    const ids = e.filter((x) => x.estado === 'ACTIVO').map((x) => x.id)
    setHitos(await hitosDe(ids))
  }, [tienda, periodo])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])
  const { ultima: ultimaLectura, marcar: marcarLectura } = useTiempoReal(tienda?.id, () => cargar().catch(() => {}))

  const logis = React.useMemo(() => etapas.filter((x) => x.rol_ejecuta === 'LOGISTICA'), [etapas])
  const logisIds = React.useMemo(() => new Set(logis.map((x) => x.id)), [logis])
  const etapaPorId = React.useMemo(() => Object.fromEntries(etapas.map((x) => [x.id, x])), [etapas])

  // Bandejas en el orden del flujo, con los nombres y textos que haya puesto la tienda
  const bandejas = React.useMemo((): Bandeja[] => bandejasLogistica(etapas, puertas, lg.diasHistorico, !!cfg.historico_periodo).map((b) => {
    const conf = cfg.bandejas[b.key] ?? {}
    return { ...b, conf, label: conf.nombre?.trim() || b.nombreDefecto, subtitulo: conf.subtitulo?.trim() || b.subtituloDefecto, boton: conf.boton?.trim() || b.botonDefecto || '' }
  }), [etapas, puertas, lg.diasHistorico, cfg])

  // A qué bandeja va cada encargo
  const reparto = React.useMemo(() => {
    const m = new Map<string, EncargoEstado[]>()
    for (const b of bandejas) m.set(b.key, [])
    const desde = cfg.historico_periodo ? 0 : Date.now() - lg.diasHistorico * 86400000
    for (const e of encs ?? []) {
      if (e.estado !== 'ACTIVO' || ocultos.has(e.id)) continue
      const sig = e.etapa_siguiente_id && !e.es_final ? etapaPorId[e.etapa_siguiente_id] : undefined
      if (sig && logisIds.has(sig.id)) {
        const checks = (e.puertas_pendientes ?? []).filter((p) => p.dura && p.tipo === 'CHECK')
        const b = checks.length ? bandejas.find((x) => x.key === 'c:' + checks[0].referencia) : bandejas.find((x) => x.key === 'e:' + sig.nombre)
        if (b) { m.get(b.key)!.push(e); continue }
      }
      if ((hitos[e.id] ?? []).some((h) => logisIds.has(h.etapa_id) && new Date(h.fecha).getTime() >= desde)) m.get('h')!.push(e)
    }
    return m
  }, [encs, bandejas, etapaPorId, logisIds, hitos, ocultos, lg.diasHistorico, cfg.historico_periodo])

  const actual = bandejas.find((b) => b.key === bandeja) ?? (cfg.abrir_primera ? undefined : bandejas.find((b) => (reparto.get(b.key)?.length ?? 0) > 0)) ?? bandejas[0]
  const enBandeja = actual ? reparto.get(actual.key) ?? [] : []
  const porProd = new Map<string, number>()
  for (const e of enBandeja) porProd.set(e.producto_nombre ?? '—', (porProd.get(e.producto_nombre ?? '—') ?? 0) + 1)
  // Si el modelo filtrado ya no está en la bandeja (se marcó el último), el filtro deja de aplicarse
  const prodVivo = prod && porProd.has(prod) ? prod : ''
  const filtrados = enBandeja.filter((e) => !prodVivo || (e.producto_nombre ?? '—') === prodVivo)
  const modoFiltro = actual?.conf.filtro ?? 'auto'
  const verFiltro = modoFiltro === 'siempre' ? enBandeja.length > 0 : modoFiltro === 'auto' && porProd.size > 1
  // Carpetas por proveedor si hay más de uno (o en el histórico), salvo que la tienda diga otra cosa
  const destinos = [...new Set(filtrados.map((e) => e.proveedor_nombre ?? ''))]
  const modoCarpetas = actual?.conf.carpetas ?? 'auto'
  const usarCarpetas = !!actual && (modoCarpetas === 'siempre' ? filtrados.length > 0
    : modoCarpetas === 'auto' && (actual.tipo === 'historico' || destinos.filter(Boolean).length > 1))
  React.useEffect(() => { if (carpeta !== null && !filtrados.some((e) => (e.proveedor_nombre ?? '') === carpeta)) setCarpeta(null) }, [filtrados, carpeta])
  const visibles = usarCarpetas && carpeta !== null ? filtrados.filter((e) => (e.proveedor_nombre ?? '') === carpeta) : filtrados

  const hoja = ajustesHoja(aj)
  const valorDe = (e: EncargoEstado) => hoja.activo && hoja.campoCol ? String((e.datos ?? {})[hoja.campoCol] ?? '') : ''
  const fechaCampo = (e: EncargoEstado) => {
    const c = camposDe(ps, 'ENCARGO', e.tipo_encargo_id).find((x) => x.tipo === 'fecha' && (e.datos ?? {})[x.clave])
    return c ? { etiqueta: c.etiqueta, valor: String((e.datos ?? {})[c.clave]) } : null
  }

  /** Lo que sale en la tarjeta bajo el producto: los campos elegidos en Ajustes o, si no, el de la hoja y la primera fecha */
  const lineasDe = (e: EncargoEstado): { etiqueta: string; valor: string }[] => {
    if (cfg.campos_tarjeta?.length) {
      const cs = camposDe(ps, 'ENCARGO', e.tipo_encargo_id)
      return cfg.campos_tarjeta.map((k) => cs.find((c) => c.clave === k)).filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => ({ etiqueta: c.etiqueta, valor: formatearValor(c, (e.datos ?? {})[c.clave]) })).filter((x) => x.valor !== '—')
    }
    const out: { etiqueta: string; valor: string }[] = []
    const v = valorDe(e); if (v) out.push({ etiqueta: hoja.etiquetaCol, valor: v })
    const f = fechaCampo(e); if (f) out.push({ etiqueta: `${f.etiqueta}:`, valor: fechaCorta(f.valor) })
    return out
  }
  const provDe = (e: EncargoEstado) => provSel[e.id] ?? e.proveedor_id ?? ''
  const verProvDe = (b: Bandeja, e: EncargoEstado) => b.tipo === 'etapa' && (b.conf.proveedor === true || (b.conf.proveedor !== false && necesitaProvDe(e)))
  /** Comprobaciones que se hacen en logística (p. ej. «Adorno comprado»), para la tarjeta y la ficha */
  const checksLogis = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const p of puertas) if (p.tipo === 'CHECK' && !m.has(p.referencia)) m.set(p.referencia, p.etiqueta || p.mensaje)
    return [...m.entries()].map(([ref, etiqueta]) => ({ ref, etiqueta }))
  }, [puertas])
  /** En la bandeja de una comprobación y en la del paso que la pide: si está hecha o no */
  const checkHechoDe = (b: Bandeja, e: EncargoEstado): { etiqueta: string; hecho: boolean } | null => {
    const ref = b.tipo === 'check' ? b.ref : puertas.find((p) => p.tipo === 'CHECK' && b.etapas.some((et) => et.id === p.etapa_destino_id))?.referencia
    if (!ref) return null
    const etiqueta = checksLogis.find((c) => c.ref === ref)?.etiqueta ?? ref
    return { etiqueta, hecho: b.tipo === 'check' ? false : !(e.puertas_pendientes ?? []).some((p) => p.tipo === 'CHECK' && p.referencia === ref) }
  }
  const necesitaProvDe = (e: EncargoEstado) => (e.puertas_pendientes ?? []).some((p) => p.dura && p.tipo === 'CAMPO_NO_VACIO' && p.referencia === 'proveedor_id')

  /** Cambiar el proveedor desde la tarjeta: se guarda al momento (con deshacer), sin marcar ningún paso */
  async function cambiarProv(e: EncargoEstado, v: string) {
    const antes = provDe(e)
    if (v === antes) return
    // Dejarlo vacío con uno ya guardado: se pregunta y, si se confirma, se quita de verdad
    // (antes no se guardaba nada y «Llevado» lo mandaba al anterior sin avisar)
    if (!v) { setQuitarProv({ e, antes }); return }
    setProvSel((s) => ({ ...s, [e.id]: v }))
    try {
      await asignarProveedor(e.id, v)
      avisar({ tipo: 'ok', texto: `${num3(e)} → ${provs.find((x) => x.id === v)?.nombre ?? ''}`, accion: { label: 'Deshacer', onClick: async () => {
        try { await asignarProveedor(e.id, antes || null); setProvSel((s) => { const n = { ...s }; delete n[e.id]; return n }); await cargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
      } } })
      cargar().catch(() => {})
    } catch (x) {
      setProvSel((s) => ({ ...s, [e.id]: antes }))
      avisar({ tipo: 'error', texto: mensajeError(x) })
    }
  }

  /** Marca el paso siguiente. Devuelve el hito creado (para deshacer) o null si no se pudo. */
  async function pasoSiguiente(e: EncargoEstado): Promise<string | null> {
    const sig = e.etapa_siguiente_id ? etapaPorId[e.etapa_siguiente_id] : undefined
    if (!sig) return null
    const prov = provDe(e)
    if (necesitaProvDe(e) && !prov) { avisar({ tipo: 'aviso', texto: `${num3(e)}: elige antes ${gr.con('proveedor', 'el')}` }); return null }
    if (prov && prov !== (e.proveedor_id ?? '')) await asignarProveedor(e.id, prov)
    return await crearHito(e.id, sig.clave, { forzarBlandas: true })
  }

  async function avanzar(e: EncargoEstado) {
    const sig = e.etapa_siguiente_id ? etapaPorId[e.etapa_siguiente_id] : undefined
    if (!sig) return
    if (necesitaProvDe(e) && !provDe(e)) {
      // El texto de la condición de la tienda («Elige un taller antes de marcar como llevado») si lo tiene
      const p = (e.puertas_pendientes ?? []).find((x) => x.dura && x.tipo === 'CAMPO_NO_VACIO' && x.referencia === 'proveedor_id')
      avisar({ tipo: 'aviso', texto: p?.mensaje || `Elige antes ${gr.con('proveedor', 'el')}` }); return
    }
    setOcultos((s) => new Set(s).add(e.id))
    try {
      const hito = await pasoSiguiente(e)
      const pn = provDe(e) ? provs.find((x) => x.id === provDe(e))?.nombre : null
      avisar({ tipo: 'ok', texto: `${num3(e)} · ${sig.nombre}${pn && e.proveedor_id !== provDe(e) ? ` · ${pn}` : ''}`, accion: { label: 'Deshacer', onClick: async () => {
        try { await deshacerUltimoHito(e.id, hito); await cargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
      } } })
      cargar().catch(() => {})
    } catch (x) {
      setOcultos((s) => { const n = new Set(s); n.delete(e.id); return n })
      avisar({ tipo: 'error', persistente: true, texto: `${num3(e)}: ${mensajeError(x)}` })
    }
  }

  /** «Marcar todos»: el paso de esta bandeja para todos los que se ven, con un solo deshacer */
  async function avanzarTodos(lista: EncargoEstado[]) {
    setTodos(false)
    setOcultos((s) => { const n = new Set(s); for (const e of lista) n.add(e.id); return n })
    const hechos: { e: EncargoEstado; h: string }[] = []
    const fallos: string[] = []
    for (const e of lista) {
      try { const h = await pasoSiguiente(e); if (h) hechos.push({ e, h }); else fallos.push(num3(e)) } catch (x) { fallos.push(`${num3(e)} (${mensajeError(x)})`) }
    }
    if (hechos.length) avisar({ tipo: 'ok', texto: `${hechos.length} marcad${gr.o('encargo', hechos.length !== 1)}`, accion: { label: 'Deshacer', onClick: async () => {
      for (const x of hechos) { try { await deshacerUltimoHito(x.e.id, x.h) } catch { /* sigue con el resto */ } }
      await cargar()
    } } })
    if (fallos.length) avisar({ tipo: 'error', persistente: true, texto: `No se pudo: ${fallos.join(', ')}` })
    cargar().catch(() => {})
  }

  async function marcar(e: EncargoEstado, ref: string, etiqueta: string) {
    setOcultos((s) => new Set(s).add(e.id))
    try {
      await marcarCheck(e.id, ref, true)
      avisar({ tipo: 'ok', texto: `${num3(e)} · ${etiqueta}`, accion: { label: 'Deshacer', onClick: async () => {
        try { await marcarCheck(e.id, ref, false); await cargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
      } } })
      cargar().catch(() => {})
    } catch (x) {
      setOcultos((s) => { const n = new Set(s); n.delete(e.id); return n })
      avisar({ tipo: 'error', texto: mensajeError(x) })
    }
  }

  if (!lg.activo) {
    return (
      <>
        <PageHeader title={nombreMenu(tienda?.ajustes as Record<string, unknown>, 'logistica', 'Logística')} />
        <div className="flex flex-col items-center gap-3 py-16 text-center text-fg-3">
          <span>La pantalla de logística está apagada.</span>
          {rol === 'ADMIN' && <Button asChild><Link to="/ajustes/modulos">Activarla en Ajustes → Módulos</Link></Button>}
        </div>
      </>
    )
  }

  const tabs = bandejas.map((b) => ({ key: b.key, label: b.label, count: reparto.get(b.key)?.length ?? 0, aviso: b.tipo !== 'historico' && (reparto.get(b.key)?.length ?? 0) > 0 }))
  const vacio = actual?.conf.vacio?.trim() || undefined
  const puedeTodos = !!actual && actual.tipo === 'etapa' && !!actual.conf.todos && visibles.length > 1
  const textoTodos = `${actual?.conf.todos_texto?.trim() || `Marcar ${gr.con('encargo', 'todos')}`} (${visibles.length})`
  return (
    <>
      <PageHeader title={nombreMenu(tienda?.ajustes as Record<string, unknown>, 'logistica', 'Logística')} subtitle={actual?.subtitulo} />
      {logis.length === 0 && encs && <p className="m-3 rounded-sm bg-warn-bg px-3 py-2 text-sm text-warn-fg">Ninguna etapa la marca «{nombresRol.LOGISTICA}». Asígnaselas en Ajustes → Tipos y etapas.</p>}
      {bandejas.length > 1 && <Tabs items={tabs} value={actual?.key ?? ''} onChange={(k) => { setBandeja(k); setCarpeta(null); setProd('') }} />}
      {err && <div className="m-3 rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">{err}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
        {encs === null ? <p className="text-fg-3">Cargando…</p> : (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-fg-2 lg:hidden">{actual?.subtitulo}</p>
            <div className="flex items-center gap-2 text-sm text-fg-3">
              <span>actualizado {haceCuanto(ultimaLectura)}</span>
              <button className="underline-offset-2 hover:text-fg hover:underline" onClick={() => cargar().then(marcarLectura).catch((x) => setErr(mensajeError(x)))}>Actualizar</button>
            </div>
            {!cfg.ocultar_llegadas && <LlegadasMaterial refresco={ultimaLectura} />}
            {verFiltro && (
              <div className="flex items-center gap-2">
                <Select className="w-auto max-w-full" value={prodVivo} onChange={(x) => setProd(x.target.value)} aria-label={vocab.producto}>
                  <option value="">{gr.genero.producto === 'f' ? 'Todas las' : 'Todos los'} {min(vocab.productos)} ({enBandeja.length})</option>
                  {[...porProd.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([n, c]) => <option key={n} value={n}>{n === '—' ? `Sin ${min(vocab.producto)}` : n} ({c})</option>)}
                </Select>
                {prodVivo && <span className="text-sm text-fg-3">{filtrados.length} de {enBandeja.length}</span>}
              </div>
            )}
            {puedeTodos && (!usarCarpetas || carpeta !== null) && (
              <Button size="touch" variant={toque.armado === 'todos' ? 'armed' : 'default'} className="self-start"
                onClick={() => { if (toque.pulsar('todos')) setTodos(true) }}>
                {toque.armado === 'todos' ? `¿${textoTodos}? Toca otra vez` : textoTodos}
              </Button>
            )}
            {usarCarpetas && carpeta === null ? (
              filtrados.length === 0 ? <Vacio texto={vacio} /> : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {destinos.sort((a, b) => a.localeCompare(b, 'es')).map((d) => (
                    <button key={d} onClick={() => setCarpeta(d)} className="flex items-center gap-2 rounded-md border border-border bg-bg p-3 text-left hover:border-border-strong">
                      <IconFolder size={22} className="shrink-0 text-fg-3" />
                      <span className="min-w-0 flex-1 truncate font-medium">{d || `Sin ${min(vocab.proveedor)}`}</span>
                      <span className="text-sm tabular text-fg-3">{filtrados.filter((e) => (e.proveedor_nombre ?? '') === d).length}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                {usarCarpetas && <button className="inline-flex items-center gap-1 self-start text-sm text-fg-2 hover:text-fg" onClick={() => setCarpeta(null)}><IconArrowLeft size={14} /> Volver a {min(vocab.proveedores)}{carpeta ? ` · ${carpeta}` : ''}</button>}
                {visibles.length === 0 ? <Vacio texto={vacio} /> : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {visibles.map((e) => (
                      <Tarjeta key={e.id} e={e} b={actual!} etapas={etapas} logisIds={logisIds} hitos={hitos[e.id] ?? []}
                        lineas={lineasDe(e)} ocultarProv={usarCarpetas} ocultarFuturos={!!cfg.ocultar_futuros}
                        provs={provs} prov={provDe(e)} verProv={verProvDe(actual!, e)} onProv={(v) => cambiarProv(e, v)}
                        checkHecho={checkHechoDe(actual!, e)}
                        armado={toque.armado === e.id} onAccion={() => {
                          if (!toque.pulsar(e.id)) return
                          if (actual!.tipo === 'check') marcar(e, actual!.ref!, actual!.label); else avanzar(e)
                        }} onAbrir={() => setFicha(e.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <Dialog open={!!quitarProv} onOpenChange={(o) => !o && setQuitarProv(null)}
        title={quitarProv ? `¿Quitar ${provs.find((x) => x.id === quitarProv.antes)?.nombre ?? gr.con('proveedor', 'el')} de ${num3(quitarProv.e)}?` : ''}
        description={`${gr.Con('encargo', 'el')} se queda sin ${min(vocab.proveedor)} hasta que elijas otro.`}
        actions={[{ label: 'Quitar', variant: 'danger', onClick: async () => {
          const q = quitarProv; setQuitarProv(null); if (!q) return
          try {
            await asignarProveedor(q.e.id, null)
            setProvSel((s) => { const n = { ...s }; delete n[q.e.id]; return n })
            avisar({ tipo: 'ok', texto: `${num3(q.e)} sin ${min(vocab.proveedor)}`, accion: { label: 'Deshacer', onClick: async () => {
              try { await asignarProveedor(q.e.id, q.antes); setProvSel((s) => { const n = { ...s }; delete n[q.e.id]; return n }); await cargar() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
            } } })
            await cargar()
          } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
        } }]} />
      <Dialog open={todos} onOpenChange={(o) => !o && setTodos(false)} title={`¿${textoTodos}?`}
        description={actual ? `Se marca «${actual.etapas[0]?.nombre ?? actual.label}» en ${visibles.length} ${min(visibles.length === 1 ? vocab.encargo : vocab.encargos)}. Se puede deshacer todo junto.` : ''}
        actions={[{ label: 'Marcar', onClick: () => avanzarTodos(visibles) }]} />
      <FichaLogistica id={ficha} provs={provs} ps={ps} checks={checksLogis} onClose={() => setFicha(null)} onCambio={cargar} />
    </>
  )
}

function Vacio({ texto }: { texto?: string }) {
  return <p className="py-10 text-center text-fg-3">{texto ?? 'Nada pendiente en esta bandeja.'}</p>
}

function Tarjeta({ e, b, etapas, logisIds, hitos, lineas, ocultarProv, ocultarFuturos, provs, prov, verProv, onProv, checkHecho, armado, onAccion, onAbrir }: {
  e: EncargoEstado; b: Bandeja; etapas: Etapa[]; logisIds: Set<string>; hitos: HitoMini[]
  lineas: { etiqueta: string; valor: string }[]; ocultarProv: boolean; ocultarFuturos: boolean
  provs: ProveedorFila[]; prov: string; verProv: boolean; onProv: (v: string) => void
  checkHecho: { etiqueta: string; hecho: boolean } | null
  armado: boolean; onAccion: () => void; onAbrir: () => void
}) {
  const { vocab, gr } = useAuth()
  const duras = (e.puertas_pendientes ?? []).filter((p) => p.dura)
  const bloqueo = b.tipo === 'etapa' ? duras.filter((p) => !(p.tipo === 'CAMPO_NO_VACIO' && p.referencia === 'proveedor_id')) : []
  const blandas = (e.puertas_pendientes ?? []).filter((p) => !p.dura && !(p.tipo === 'CHECK' && checkHecho))
  // Línea temporal: pasos de logística, los de producción, los que marca el proveedor y el final, en orden
  const actualOrden = e.etapa_actual_orden ?? -1
  const pasos = etapas.filter((x) => x.tipo_encargo_id === e.tipo_encargo_id && (logisIds.has(x.id) || x.es_produccion || x.marca_proveedor || x.es_final))
    .filter((x) => !ocultarFuturos || x.orden <= actualOrden).sort((a, z) => a.orden - z.orden)
  const dias = e.dias_en_etapa ?? 0
  const donde = e.en_proveedor && e.proveedor_nombre ? `en ${e.proveedor_nombre}` : `en «${e.etapa_actual_nombre ?? '—'}»`
  const frase = b.conf.dias?.trim() ? b.conf.dias.replace(/\{n\}/g, String(dias)).replace(/\{dias\}/g, `${dias} ${dias === 1 ? 'día' : 'días'}`) : `${dias} ${dias === 1 ? 'día' : 'días'} ${donde}`
  const final = b.tipo === 'historico'
  const texto = b.tipo === 'check' ? b.boton : b.conf.boton?.trim() || `✓ ${e.etapa_siguiente_nombre}`
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
      <button className="flex flex-col gap-0.5 text-left" onClick={onAbrir}>
        <span className="text-sm text-fg-3">{num3(e)} · {e.cliente_nombre}</span>
        <span className="text-[17px] font-semibold leading-tight">{e.producto_nombre ?? `Sin ${min(vocab.producto)}`}</span>
        <span className="flex flex-wrap gap-x-3 text-sm text-fg-2">
          {lineas.map((l) => <span key={l.etiqueta} className="font-medium">{l.etiqueta ? `${l.etiqueta} ` : ''}{l.valor}</span>)}
          {!ocultarProv && !verProv && e.proveedor_nombre && <Tag color="gray">{e.proveedor_nombre}</Tag>}
          {!checkHecho && e.complementos && <span>{e.complementos}</span>}
        </span>
      </button>
      {checkHecho && (
        <div className={cn('flex flex-col gap-0.5 rounded-sm px-2 py-1.5', b.tipo === 'check' ? 'bg-warn-bg' : 'bg-bg-3')}>
          {e.complementos && <span className={b.tipo === 'check' ? 'font-medium' : 'text-sm'}>{e.complementos}</span>}
          <span className="text-sm">{checkHecho.hecho ? '✅' : '⬜'} {checkHecho.etiqueta}: {checkHecho.hecho ? 'hecho' : 'pendiente'}</span>
        </div>
      )}
      <span className="inline-flex items-center gap-1 text-sm text-fg-2"><IconClock size={13} /> {frase}</span>
      {pasos.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {pasos.map((p) => {
            const pasado = p.orden <= actualOrden
            // Solo cuentan los pasos ya dados (si se volvió atrás, los posteriores no)
            const h = pasado ? [...hitos].reverse().find((x) => x.etapa_id === p.id) : undefined
            return (
              <span key={p.id} title={h ? new Date(h.fecha).toLocaleString(locale(), { timeZone: zona() }) : pasado ? 'Sin fecha' : 'Pendiente'}
                className={cn('rounded-sm px-1.5 py-0.5 text-xs', h ? 'bg-bg-4 text-fg' : pasado ? 'bg-bg-3 text-fg-3' : 'border border-dashed border-border text-fg-3')}>
                {p.nombre} {h ? fechaCorta(h.fecha) : pasado ? '(sin fecha)' : ''}
              </span>
            )
          })}
        </div>
      )}
      {final ? (
        <Tag color={e.es_final ? 'green' : 'amber'}>{e.etapa_actual_nombre ?? '—'}</Tag>
      ) : (
        <>
          {verProv && (
            <Select value={prov} onChange={(x) => onProv(x.target.value)} aria-label={vocab.proveedor}>
              <option value="">— elegir {min(vocab.proveedor)} —</option>
              {provs.filter((p) => p.activo || p.id === prov).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          )}
          {blandas.length > 0 && b.tipo === 'etapa' && <span className="text-xs text-warn-fg">Aviso: {blandas.map((p) => p.mensaje).join(' · ')}</span>}
          {bloqueo.length > 0
            ? <span className="rounded-sm bg-danger-bg px-2 py-1 text-sm text-danger-fg">Bloqueado: {bloqueo.map((p) => p.mensaje).join(' · ')}</span>
            : <Button size="touch" variant={armado ? 'armed' : b.tipo === 'check' ? 'default' : 'primary'} onClick={onAccion}
                className={b.tipo === 'check' ? 'justify-start gap-3 text-md' : ''}>
                {b.tipo === 'check' && <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-sm border-2', armado ? 'border-inverted-fg' : 'border-border-strong')}>{armado ? '✓' : ''}</span>}
                {armado ? `¿${texto}? Toca otra vez` : texto}
              </Button>}
          {b.tipo === 'check' && <span className="text-xs text-fg-3">Para desmarcarlo, desde la ficha {gr.con('encargo', 'del')}.</span>}
        </>
      )}
    </div>
  )
}

/** Ficha rápida en solo lectura (datos clave, contacto, ficha técnica) con cambio de proveedor. */
function FichaLogistica({ id, provs, ps, checks, onClose, onCambio }: {
  id: string | null; provs: ProveedorFila[]; ps: PlantillaCampos[]; checks: { ref: string; etiqueta: string }[]; onClose: () => void; onCambio: () => Promise<void>
}) {
  const { tienda, vocab, rol } = useAuth()
  const avisar = useAvisos()
  const [e, setE] = React.useState<EncargoEstado | null>(null)
  const [errFicha, setErrFicha] = React.useState<string | null>(null)
  const [intento, setIntento] = React.useState(0)
  const [ft, setFt] = React.useState<(FichaTecnica & { nombre: string }) | null>(null)
  const [prov, setProv] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [marcados, setMarcados] = React.useState<Record<string, { marcado: boolean; fecha: string | null }>>({})
  const [email, setEmail] = React.useState<string | null>(null)
  const leerChecks = React.useCallback(async (encId: string) => {
    const { data } = await supabase.from('check_encargo').select('clave,marcado,fecha').eq('encargo_id', encId)
    setMarcados(Object.fromEntries(((data ?? []) as { clave: string; marcado: boolean; fecha: string | null }[]).map((c) => [c.clave, { marcado: c.marcado, fecha: c.fecha }])))
  }, [])
  React.useEffect(() => {
    setE(null); setFt(null); setMarcados({}); setEmail(null); setErrFicha(null)
    if (!id) return
    // Siempre datos frescos al abrir
    obtenerEncargo(id).then((x) => {
      setE(x); setProv(x?.proveedor_id ?? '')
      if (x?.producto_id) fichaProducto(x.producto_id).then(setFt).catch(() => {})
      if (x) {
        leerChecks(x.id).catch(() => {})
        supabase.from('cliente').select('email').eq('id', x.cliente_id).maybeSingle().then(({ data }) => setEmail((data as { email?: string | null } | null)?.email ?? null))
      }
    }).catch((x) => setErrFicha(mensajeError(x)))
  }, [id, leerChecks, intento])
  const aj = tienda?.ajustes as Record<string, unknown>
  const campos = e ? camposDe(ps, 'ENCARGO', e.tipo_encargo_id) : []
  const wa = e ? telefonoWhatsApp(e.cliente_telefono, String(aj?.prefijo_telefono ?? '34')) : null
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} side="right" title={e ? `${vocab.encargo} ${num3(e)}` : vocab.encargo} className="flex flex-col gap-3">
      {!e ? (errFicha
        ? <div className="flex flex-col items-start gap-2"><p className="m-0 rounded-sm bg-danger-bg px-2.5 py-1.5 text-sm text-danger-fg">No se ha podido abrir: {errFicha}</p><Button size="sm" onClick={() => setIntento((n) => n + 1)}>Reintentar</Button></div>
        : <p className="text-fg-3">Cargando…</p>) : <>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-fg-3">{vocab.encargo} {num3(e)} · {e.etapa_actual_nombre}</span>
          <span className="text-lg font-semibold">{e.producto_nombre ?? '—'}</span>
          {ft && tieneFicha(ft) && <span className="text-sm text-fg-2">{resumenFicha(ft, aj)}</span>}
          {e.complementos && <span className="text-sm">{ajustesFicha(aj).etiqueta}: {e.complementos}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-medium">{e.cliente_nombre}</span>
          <div className="flex flex-wrap gap-1.5">
            {e.cliente_telefono && <Button size="sm" asChild><a href={`tel:${e.cliente_telefono.replace(/\s/g, '')}`}><IconPhone size={13} /> {e.cliente_telefono}</a></Button>}
            {wa && <Button size="sm" asChild><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>}
            {email && <Button size="sm" asChild><a href={`mailto:${email}`}>{email}</a></Button>}
          </div>
        </div>
        {checks.map((c) => {
          const m = marcados[c.ref]
          return (
            <div key={c.ref} className="flex flex-wrap items-center gap-2 rounded-sm bg-bg-3 px-2 py-1.5 text-sm">
              <span className="flex-1">{m?.marcado ? '✅' : '⬜'} {c.etiqueta}{m?.marcado && m.fecha ? ` · ${fechaCorta(m.fecha)}` : ''}</span>
              {rol !== 'ATENCION' && <Button size="sm" variant="ghost" onClick={async () => {
                try { await marcarCheck(e.id, c.ref, !m?.marcado); await leerChecks(e.id); await onCambio() } catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) }
              }}>{m?.marcado ? 'Desmarcar' : 'Marcar'}</Button>}
            </div>
          )
        })}
        <CamposVista soloRellenos campos={campos} datos={e.datos} />
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-3">{vocab.proveedor}</span>
          <div className="flex gap-1.5">
            <Select value={prov} onChange={(x) => setProv(x.target.value)} disabled={rol === 'ATENCION'}>
              <option value="">— sin {min(vocab.proveedor)} —</option>
              {provs.filter((p) => p.activo || p.id === prov).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
            <Button variant="primary" disabled={prov === (e.proveedor_id ?? '') || busy} cargando={busy} onClick={async () => {
              setBusy(true)
              try { await asignarProveedor(e.id, prov || null); avisar({ tipo: 'ok', texto: 'Guardado' }); await onCambio(); onClose() }
              catch (x) { avisar({ tipo: 'error', texto: mensajeError(x) }) } finally { setBusy(false) }
            }}>Guardar</Button>
          </div>
          <span className="text-xs text-fg-3">Cambiarlo no marca ningún paso ni fecha.</span>
        </div>
        <Link to={`/encargos/${e.id}`} className="text-sm text-fg-2 underline">Abrir la ficha completa</Link>
      </>}
    </Sheet>
  )
}

/** Material en camino: Logística registra lo que llega (sin entrar en Materiales). */
export function LlegadasMaterial({ refresco }: { refresco?: unknown }) {
  const { tienda, vocab } = useAuth()
  const am = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const [lineas, setLineas] = React.useState<LineaPedido[]>([])
  const [abierto, setAbierto] = React.useState(false)
  const [recibir, setRecibir] = React.useState<LineaPedido | null>(null)
  const cargar = React.useCallback(async () => {
    if (!tienda || !am.activo) return
    setLineas((await listarPedidos(tienda.id)).filter((l) => l.estado === 'PENDIENTE' || l.estado === 'PARCIAL'))
  }, [tienda, am.activo])
  React.useEffect(() => { cargar().catch(() => setLineas([])) }, [cargar, refresco])
  if (!am.activo || lineas.length === 0) return null
  return (
    <section className="rounded-md border border-border">
      <button className="flex h-9 w-full items-center gap-2 px-3 text-left font-medium" onClick={() => setAbierto((a) => !a)}>
        <span className="flex-1">{vocab.materiales} en camino</span>
        <Tag color="amber">{lineas.length}</Tag>
        <span className="text-sm text-fg-3">{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>
      {abierto && (
        <ul className="m-0 flex list-none flex-col border-t border-border p-0">
          {lineas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-border-light px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{nombreMaterial(l)}</div>
                <div className="text-sm text-fg-3">
                  {l.proveedor_nombre ?? `Sin ${min(vocab.proveedor)}`} · pedido {fechaCorta(l.fecha)} · faltan {cant(l.pendiente, l.unidad || am.unidad)}
                  {l.encargos.some((e) => e.activo !== false) && <> · para {l.encargos.filter((e) => e.activo !== false).map((e) => num3(e)).join(', ')}</>}
                </div>
              </div>
              <Button size="sm" onClick={() => setRecibir(l)}>He recibido…</Button>
            </li>
          ))}
        </ul>
      )}
      {/* Aquí no se ofrece guardar restos: eso se decide en Telas → Pedidos */}
      <DialogoRecibir linea={recibir} unidad={recibir?.unidad || am.unidad} onClose={() => setRecibir(null)} onHecho={async () => { await cargar() }} />
    </section>
  )
}

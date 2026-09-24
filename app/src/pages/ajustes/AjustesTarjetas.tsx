import * as React from 'react'
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { guardarTienda } from '@/data/ajustes'
import { listarEtapas, mensajeError } from '@/data/encargos'
import { tiposAparte, bandejasLista, tarjetasInicio, type TarjetaInicio } from '@/lib/listaBandejas'
import { min } from '@/lib/vocab'
import { Button, Input, Select } from '@/ui'
import { BarraGuardar, Pagina } from './Ajustes'

/** Ajustes → Tarjetas de Para hoy: qué números salen arriba en la pantalla de inicio. */
export function AjustesTarjetas() {
  const { tienda, recargar, vocab } = useAuth()
  const aj = React.useMemo(() => (tienda?.ajustes ?? {}) as Record<string, unknown>, [tienda?.ajustes])
  const inicial = React.useMemo(() => tarjetasInicio(aj) ?? [], [aj])
  const [ts, setTs] = React.useState<TarjetaInicio[]>(inicial)
  const [etapas, setEtapas] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => setTs(inicial), [inicial])
  React.useEffect(() => {
    if (!tienda) return
    const ap = tiposAparte(aj)
    listarEtapas(tienda.id).then((e) => setEtapas([...new Set(e.filter((x) => !ap.includes(x.tipo_encargo_id) && !x.es_final).sort((a, b) => a.orden - b.orden).map((x) => x.nombre))])).catch(() => {})
  }, [tienda, aj])
  const bandejas = bandejasLista(aj) ?? []
  const sucio = JSON.stringify(ts) !== JSON.stringify(inicial)
  const cambiar = (i: number, p: Partial<TarjetaInicio>) => setTs((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const mover = (i: number, d: -1 | 1) => setTs((xs) => { const n = [...xs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })

  async function guardar() {
    if (!tienda) return
    if (ts.some((t) => !t.nombre.trim())) { setErr('Cada tarjeta necesita un nombre'); return }
    if (ts.some((t) => t.que === 'bandeja' && !t.bandeja)) { setErr('Elige la bandeja de cada tarjeta'); return }
    if (ts.some((t) => t.que === 'etapas' && !(t.etapas ?? []).length)) { setErr('Marca al menos una etapa'); return }
    setBusy(true); setErr(null); setOk(null)
    try {
      const limpias = ts.map((t) => ({ nombre: t.nombre.trim(), que: t.que, ...(t.que === 'bandeja' ? { bandeja: t.bandeja } : {}), ...(t.que === 'etapas' ? { etapas: t.etapas } : {}), ...(t.tono ? { tono: t.tono } : {}) }))
      await guardarTienda(tienda.id, tienda.nombre, { ...aj, inicio_tarjetas: limpias.length ? limpias : null })
      await recargar(); setOk('Guardado')
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <>
      <Pagina titulo="Tarjetas de Para hoy" ayuda="Los números de arriba de la pantalla de inicio. Al pulsar uno se abre la lista con eso."
        mas={`Sin tarjetas propias salen las de siempre (En curso, Mi trabajo, Revisar…). Cada tarjeta cuenta una bandeja de la lista (Ajustes → Bandejas de la lista), unas etapas o las incidencias abiertas.`} />
      <div className="flex flex-col gap-2">
        {ts.length === 0 && <p className="m-0 text-fg-3">Salen las tarjetas de siempre.</p>}
        {ts.map((t, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-7 w-[220px]" value={t.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} aria-label="Nombre" placeholder="Nombre de la tarjeta" />
              <Select className="w-[200px]" value={t.que} onChange={(e) => cambiar(i, { que: e.target.value as TarjetaInicio['que'] })} aria-label="Qué cuenta">
                <option value="bandeja">Una bandeja de la lista</option>
                <option value="etapas">Unas etapas</option>
                <option value="incidencias">Incidencias abiertas</option>
              </Select>
              {t.que === 'bandeja' && (
                <Select className="w-[200px]" value={t.bandeja ?? ''} onChange={(e) => cambiar(i, { bandeja: e.target.value })} aria-label="Bandeja">
                  <option value="">— elige —</option>
                  {bandejas.map((b) => <option key={b.key} value={b.key}>{b.nombre}</option>)}
                </Select>
              )}
              <Select className="w-[130px]" value={t.tono ?? ''} onChange={(e) => cambiar(i, { tono: (e.target.value || undefined) as TarjetaInicio['tono'] })} aria-label="Color">
                <option value="">Sin color</option>
                <option value="ok">Verde</option>
                <option value="warn">Ámbar</option>
                <option value="danger">Rojo</option>
              </Select>
              <div className="flex-1" />
              <button aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="px-1 text-fg-3 hover:text-fg disabled:opacity-30"><IconArrowUp size={14} /></button>
              <button aria-label="Bajar" disabled={i === ts.length - 1} onClick={() => mover(i, 1)} className="px-1 text-fg-3 hover:text-fg disabled:opacity-30"><IconArrowDown size={14} /></button>
              <button aria-label="Quitar" onClick={() => setTs((xs) => xs.filter((_, j) => j !== i))} className="px-1 text-fg-3 hover:text-danger-fg"><IconTrash size={14} /></button>
            </div>
            {t.que === 'etapas' && (
              <div className="flex flex-wrap gap-1">
                {etapas.map((n) => {
                  const on = (t.etapas ?? []).includes(n)
                  return <button key={n} type="button" aria-pressed={on} onClick={() => cambiar(i, { etapas: on ? (t.etapas ?? []).filter((x) => x !== n) : [...(t.etapas ?? []), n] })}
                    className={`h-7 rounded-sm border px-2 text-sm ${on ? 'border-gray-12 bg-bg-4 font-medium' : 'border-border text-fg-2'}`}>{n}</button>
                })}
              </div>
            )}
            {t.que === 'bandeja' && !bandejas.length && <span className="text-sm text-warn-fg">La lista de {min(vocab.encargos)} usa las bandejas automáticas: configúralas antes en Bandejas de la lista.</span>}
          </div>
        ))}
        <div><Button onClick={() => setTs((xs) => [...xs, { nombre: '', que: 'bandeja' }])}>+ Tarjeta</Button></div>
      </div>
      <BarraGuardar sucio={sucio} busy={busy} ok={ok} err={err} onGuardar={guardar} onDescartar={() => { setTs(inicial); setErr(null) }} />
    </>
  )
}

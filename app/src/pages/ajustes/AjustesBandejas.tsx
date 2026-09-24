import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { guardarTienda } from '@/data/ajustes'
import { listarEtapas, mensajeError } from '@/data/encargos'
import type { Etapa } from '@/lib/types'
import { bandejasLista, bandejasPorDefecto, claveBandeja, TIPOS_BANDEJA, type BandejaLista, type EtapaEnBandeja, type TipoBandeja } from '@/lib/listaBandejas'
import { textosFin, min } from '@/lib/vocab'
import { Button, FormRow, Input, Select } from '@/ui'
import { Avanzado, BarraGuardar, Interruptor, Pagina } from './Ajustes'

/**
 * Ajustes → Bandejas de la lista: qué pestañas salen en la lista de encargos, en qué orden,
 * con qué nombre y qué entra en cada una (una o varias etapas, con o sin proveedor…).
 */
export function AjustesBandejas() {
  const { tienda, recargar, vocab, gr } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const inicial = React.useMemo(() => bandejasLista(tienda?.ajustes as Record<string, unknown> | undefined) ?? [], [tienda?.ajustes])
  const [bs, setBs] = React.useState<BandejaLista[]>(inicial)
  const [etapas, setEtapas] = React.useState<Etapa[]>([])
  const [busy, setBusy] = React.useState(false)
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => setBs(inicial), [inicial])
  React.useEffect(() => { if (tienda) listarEtapas(tienda.id).then(setEtapas).catch(() => {}) }, [tienda])
  const nombresEtapa = [...new Set([...etapas].sort((a, b) => a.orden - b.orden).filter((e) => !e.es_final).map((e) => e.nombre))]
  const sucio = JSON.stringify(bs) !== JSON.stringify(inicial)

  const cambiar = (i: number, p: Partial<BandejaLista>) => setBs((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const mover = (i: number, d: -1 | 1) => setBs((xs) => { const n = [...xs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })
  const nueva = () => setBs((xs) => [...xs, { key: claveBandeja({ tipo: 'etapas', nombre: 'Nueva bandeja' }, xs.map((x) => x.key)), nombre: 'Nueva bandeja', tipo: 'etapas', etapas: [] }])
  const proponer = () => {
    const fin = textosFin(etapas, gr)
    setBs(bandejasPorDefecto(etapas, { todos: `Tod${gr.o('encargo', true)}`, terminados: fin.terminados, anulados: `Anulad${gr.o('encargo', true)}`, pedir: `Pedir ${min(vocab.material)}`, espera: `Esperando ${min(vocab.material)}` }))
  }

  async function guardar() {
    if (!tienda) return
    if (bs.some((b) => !b.nombre.trim())) { setErr('Todas las bandejas necesitan un nombre'); return }
    if (bs.some((b) => b.tipo === 'etapas' && !(b.etapas ?? []).length)) { setErr('Una bandeja de etapas necesita al menos una etapa'); return }
    setBusy(true); setErr(null); setOk(null)
    try {
      // Claves: las fijas para los tipos de siempre; nunca repetidas
      const usadas: string[] = []
      const limpias = bs.map((b) => {
        const fija = TIPOS_BANDEJA.find((t) => t.v === b.tipo)?.key
        const key = b.key && !usadas.includes(b.key) && (!fija || b.key === fija) && (fija || b.key.startsWith('x-')) ? b.key : claveBandeja(b, usadas)
        usadas.push(key)
        return Object.fromEntries(Object.entries({ ...b, key, nombre: b.nombre.trim(), grupo: b.grupo?.trim() || undefined, ayuda: b.ayuda?.trim() || undefined })
          .filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length))) as unknown as BandejaLista
      })
      await guardarTienda(tienda.id, tienda.nombre, { ...aj, lista_bandejas: limpias.length ? limpias : null })
      await recargar(); setOk('Guardado')
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <>
      <Pagina titulo="Bandejas de la lista" ayuda={`Las pestañas de la lista de ${min(vocab.encargos)}: nombre, orden y qué entra en cada una.`}
        mas={`Sin configurar, sale una pestaña por etapa (solo si tiene algo). Configuradas, salen estas siempre y en este orden. Una bandeja puede juntar varias etapas y quedarse solo con los que ya tienen ${min(vocab.proveedor)} (o los que no).`}
        acciones={<div className="flex gap-2">
          {bs.length === 0 && <Button size="sm" onClick={proponer}>Empezar con las de ahora</Button>}
          {bs.length > 0 && <Button size="sm" variant="ghost" onClick={() => setBs([])}>Volver a las automáticas</Button>}
        </div>} />
      {bs.length === 0 && <p className="m-0 text-fg-3">Ahora mismo la lista usa las bandejas automáticas.</p>}
      <div className="flex flex-col gap-2">
        {bs.map((b, i) => (
          <Avanzado key={i} titulo={`${i + 1}. ${b.nombre || '(sin nombre)'}`}
            resumen={[TIPOS_BANDEJA.find((t) => t.v === b.tipo)?.l, b.tipo === 'etapas' && (b.etapas ?? []).map((x) => x.etapa + (x.proveedor === 'con' ? ` (con ${min(vocab.proveedor)})` : x.proveedor === 'sin' ? ` (sin ${min(vocab.proveedor)})` : '')).join(' + '), b.grupo && `grupo «${b.grupo}»`, b.accionable && 'en rojo'].filter(Boolean).join(' · ')}>
            <div className="flex flex-col gap-1">
              <FormRow label="Nombre"><Input className="h-7" value={b.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></FormRow>
              <FormRow label="Qué entra">
                <Select className="w-[260px]" value={b.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value as TipoBandeja })}>
                  {TIPOS_BANDEJA.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </Select>
              </FormRow>
              {b.tipo === 'etapas' && (
                <FormRow label="Etapas" ayuda={`Los que están ahora en alguna de estas etapas. Puedes quedarte solo con los que ya tienen ${min(vocab.proveedor)} o con los que no.`}>
                  <div className="flex flex-col gap-1">
                    {(b.etapas ?? []).map((x, j) => (
                      <div key={j} className="flex flex-wrap items-center gap-1.5">
                        <Select className="w-[220px]" value={x.etapa} onChange={(e) => cambiar(i, { etapas: (b.etapas ?? []).map((y, k) => (k === j ? { ...y, etapa: e.target.value } : y)) })}>
                          {[...new Set([x.etapa, ...nombresEtapa])].map((n) => <option key={n} value={n}>{n}</option>)}
                        </Select>
                        <Select className="w-[200px]" value={x.proveedor ?? ''} onChange={(e) => cambiar(i, { etapas: (b.etapas ?? []).map((y, k) => (k === j ? { ...y, proveedor: (e.target.value || undefined) as EtapaEnBandeja['proveedor'] } : y)) })}>
                          <option value="">Todos</option>
                          <option value="con">Con {min(vocab.proveedor)}</option>
                          <option value="sin">Sin {min(vocab.proveedor)}</option>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => cambiar(i, { etapas: (b.etapas ?? []).filter((_, k) => k !== j) })}>Quitar</Button>
                      </div>
                    ))}
                    <Button size="sm" className="self-start" disabled={!nombresEtapa.length} onClick={() => cambiar(i, { etapas: [...(b.etapas ?? []), { etapa: nombresEtapa[0] }] })}>+ Añadir etapa</Button>
                  </div>
                </FormRow>
              )}
              {b.tipo === 'todos' && <FormRow label="Terminados"><Interruptor checked={!!b.con_terminados} onChange={(v) => cambiar(i, { con_terminados: v })} label={b.con_terminados ? 'También los terminados' : 'Solo los que están en curso'} /></FormRow>}
              {b.tipo === 'pedir' && <FormRow label="Cuáles"><Interruptor checked={!!b.solo_falta} onChange={(v) => cambiar(i, { solo_falta: v })} label={b.solo_falta ? 'Solo si falta o queda por debajo del aviso' : `Todo ${min(vocab.material)} sin pedir`} /></FormRow>}
              {b.tipo === 'etapas' && <>
                <FormRow label={`Elegir ${min(vocab.proveedor)}`} ayuda="Un desplegable en cada fila; se guarda al momento."><Interruptor checked={!!b.elegir_proveedor} onChange={(v) => cambiar(i, { elegir_proveedor: v })} label={b.elegir_proveedor ? 'Sí' : 'No'} /></FormRow>
                <FormRow label={`${vocab.material} en camino`} ayuda="Arriba, lo pedido que aún no ha llegado, con «He recibido…»."><Interruptor checked={!!b.llegadas} onChange={(v) => cambiar(i, { llegadas: v })} label={b.llegadas ? 'Se enseña' : 'No'} /></FormRow>
                <FormRow label="Hoja por producto" ayuda={`Arriba, un botón por ${min(vocab.producto)} que manda a la hoja de producción los que están listos y los deja marcados para imprimir.`}><Interruptor checked={!!b.lote_hoja} onChange={(v) => cambiar(i, { lote_hoja: v })} label={b.lote_hoja ? 'Sí' : 'No'} /></FormRow>
              </>}
              <FormRow label="En rojo" ayuda="Se marca si tiene algo: es trabajo que hay que hacer."><Interruptor checked={!!b.accionable} onChange={(v) => cambiar(i, { accionable: v })} label={b.accionable ? 'Sí' : 'No'} /></FormRow>
              <FormRow label="Grupo" ayuda="Rótulo que junta pestañas seguidas (por ejemplo, las de una misma fase)."><Input className="h-7 w-[200px]" value={b.grupo ?? ''} onChange={(e) => cambiar(i, { grupo: e.target.value })} /></FormRow>
              <FormRow label="Ayuda"><Input className="h-7" placeholder="Se ve al pasar el ratón" value={b.ayuda ?? ''} onChange={(e) => cambiar(i, { ayuda: e.target.value })} /></FormRow>
              <div className="flex gap-1.5 pt-1">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => mover(i, -1)}>↑ Subir</Button>
                <Button size="sm" variant="ghost" disabled={i === bs.length - 1} onClick={() => mover(i, 1)}>↓ Bajar</Button>
                <Button size="sm" variant="ghost" onClick={() => setBs((xs) => xs.filter((_, j) => j !== i))}>Quitar bandeja</Button>
              </div>
            </div>
          </Avanzado>
        ))}
        {bs.length > 0 && <Button size="sm" className="self-start" onClick={nueva}>+ Nueva bandeja</Button>}
      </div>
      <BarraGuardar sucio={sucio} busy={busy} ok={ok} err={err} onGuardar={guardar} onDescartar={() => { setBs(inicial); setErr(null) }} />
    </>
  )
}

import * as React from 'react'
import { confirmarSalida } from '@/lib/salir'
import { IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/auth/AuthProvider'
import { guardarTienda, ponerAjustePeriodo } from '@/data/ajustes'
import { SelectorAmbito, useAmbito } from '@/components/Ambito'
import { mensajeError } from '@/data/encargos'
import { leerNumero, plantillas } from '@/data/config'
import { guiaDe, importarGuia, sugerir, type FilaGuia, type Guia } from '@/data/guia'
import { Button, Dialog, FormRow, Input, Select, Textarea } from '@/ui'
import { Avanzado, BarraGuardar, Bloque, Interruptor, Pagina } from './Ajustes'

type CampoMini = { clave: string; etiqueta: string; entidad: string; tipo: string; medida?: boolean; unidad?: string }

/** Ajustes → Guía de medidas: tabla de referencia, reglas de sugerencia e importación. */
export function AjustesGuia() {
  const { tienda, recargar, gr } = useAuth()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const amb = useAmbito('guia_medidas')
  // La del periodo elegido si la tiene; si no, se parte de la de la tienda
  const inicial = React.useMemo(() => guiaDe(aj, amb.propio != null ? { guia_medidas: amb.propio } : null), [tienda, amb.ambito, amb.propio]) // eslint-disable-line react-hooks/exhaustive-deps
  const [g, setG] = React.useState<Guia>(inicial)
  const [campos, setCampos] = React.useState<CampoMini[]>([])
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [importar, setImportar] = React.useState<string | null>(null)
  const [impErr, setImpErr] = React.useState<string | null>(null)
  const [quitarPropia, setQuitarPropia] = React.useState(false)
  const [gen, setGen] = React.useState<{ desde: string; hasta: string; paso: string; base: Record<string, string>; inc: Record<string, string> } | null>(null)
  const [prueba, setPrueba] = React.useState<Record<string, string>>({})
  React.useEffect(() => setG(inicial), [inicial])
  React.useEffect(() => {
    if (!tienda) return
    plantillas(tienda.id).then((ps) => {
      const m = new Map<string, CampoMini>()
      for (const p of ps) for (const c of p.campos) if (!m.has(c.clave)) m.set(c.clave, { clave: c.clave, etiqueta: c.etiqueta + (c.medida && c.unidad && !c.etiqueta.includes(`(${c.unidad})`) ? ` (${c.unidad})` : ''), entidad: p.entidad, tipo: c.tipo, medida: c.medida, unidad: c.unidad })
      setCampos([...m.values()])
    }).catch(() => {})
  }, [tienda])

  // Solo los campos marcados como medida en Ajustes → Datos que guardáis (nunca importes ni cantidades)
  const medidas = campos.filter((c) => (c.entidad === 'CLIENTE' || c.entidad === 'ENCARGO') && c.tipo === 'numero' && c.medida)
  const cols = [...new Set([...(g.principal ? [g.principal] : []), ...g.validan])]
  const et = Object.fromEntries(campos.map((c) => [c.clave, c.etiqueta]))
  const sucio = JSON.stringify(g) !== JSON.stringify(inicial)
  const setFila = (i: number, f: FilaGuia) => setG((s) => ({ ...s, filas: s.filas.map((x, j) => (j === i ? f : x)) }))
  const n = (s: string) => (s.trim() === '' ? null : leerNumero(s))

  async function guardar() {
    if (!tienda) return
    if (g.activa && (!g.destino || !g.principal)) { setErr('Elige el campo donde se guarda y la medida principal'); return }
    const [t1, t2] = g.tolerancias
    if (!(t1 >= 0 && t2 > t1)) { setErr('Tolerancias: la primera cifra debe ser 0 o más y la segunda, mayor que la primera'); return }
    const dup = g.filas.map((f) => f.etiqueta.trim()).filter((x, i, a) => x && a.indexOf(x) !== i)
    if (dup.length) { setErr(`Hay valores repetidos: ${dup.join(', ')}`); return }
    setBusy(true); setErr(null); setOk(null)
    try {
      const limpia = { ...g, filas: g.filas.filter((f) => f.etiqueta.trim()).map((f) => ({ ...f, etiqueta: f.etiqueta.trim() })) }
      if (amb.periodo) { await ponerAjustePeriodo(amb.periodo.id, 'guia_medidas', limpia); await amb.recargarPeriodos() }
      else await guardarTienda(tienda.id, tienda.nombre, { ...aj, guia_medidas: limpia })
      await recargar(); setOk(amb.periodo ? `Guardada como guía propia del periodo ${amb.periodo.nombre}` : 'Guardado')
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }
  const sug = sugerir(g, Object.fromEntries(Object.entries(prueba).map(([k, v]) => [k, v])), et)

  return (
    <>
      <Pagina titulo="Guía de medidas" ayuda={`Propone un valor a partir de las medidas guardadas, al crear o editar ${gr.con('encargo', 'un')}.`}
        mas="Se propone en vivo y siempre se puede elegir otro. La medida principal manda; las que validan la comprueban y, si se alejan demasiado (tolerancias), se avisa o se marca para revisar." />
      <div className="flex flex-wrap items-center gap-3">
        <SelectorAmbito periodos={amb.periodos} ambito={amb.ambito} onCambio={(a) => confirmarSalida(() => amb.setAmbito(a))} clave="guia_medidas" />
        {amb.periodo && (amb.propio == null
          ? <span className="text-sm text-fg-3">Este periodo usa la guía de la tienda. Si la cambias y guardas, tendrá la suya propia.</span>
          : <Button size="sm" variant="ghost" onClick={() => setQuitarPropia(true)}>Quitar la guía propia del periodo</Button>)}
      </div>
      <Bloque titulo="Cómo funciona">
        <div className="flex flex-col gap-1">
          <FormRow label="Usar la guía"><Interruptor checked={g.activa} onChange={(v) => setG({ ...g, activa: v })} label={g.activa ? 'Activa' : 'Apagada'} /></FormRow>
          <FormRow label="Se guarda en" ayuda={`Campo ${gr.con('encargo', 'del')} donde queda el valor elegido; sus opciones pasan a ser las de la guía.`}>
            <Select className="w-[260px]" value={g.destino ?? ''} onChange={(e) => setG({ ...g, destino: e.target.value || null })}>
              <option value="">— elegir —</option>
              {campos.filter((c) => c.entidad === 'ENCARGO' && (c.tipo === 'opcion' || c.tipo === 'texto') && c.clave !== g.principal && !g.validan.includes(c.clave)).map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Medida principal" ayuda="La que manda.">
            <Select className="w-[260px]" value={g.principal ?? ''} onChange={(e) => setG({ ...g, principal: e.target.value || null, validan: g.validan.filter((x) => x !== e.target.value) })}>
              <option value="">— elegir —</option>
              {medidas.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Cómo se elige" ayuda="Con la tabla de referencias: la primera fila que llega a la medida, o la más cercana.">
            <Select className="w-[260px]" value={g.modo ?? 'alcanza'} onChange={(e) => setG({ ...g, modo: e.target.value as 'alcanza' | 'cercana' })}>
              <option value="alcanza">La primera que alcanza la medida</option>
              <option value="cercana">La más cercana</option>
            </Select>
          </FormRow>
          <FormRow label="Medidas que validan" ayuda="Comprueban la principal; las demás no cuentan.">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {medidas.filter((c) => c.clave !== g.principal).map((c) => (
                <label key={c.clave} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={g.validan.includes(c.clave)} onChange={(e) => setG({ ...g, validan: e.target.checked ? [...g.validan, c.clave] : g.validan.filter((x) => x !== c.clave) })} />{c.etiqueta}
                </label>
              ))}
              {medidas.length === 0 && <span className="text-sm text-fg-3">Ningún campo está marcado como medida. En Ajustes → Datos que guardáis, en cada campo de número que sea una medida, activa «Es una medida».</span>}
            </div>
          </FormRow>
        </div>
        <Avanzado resumen={`tolerancias ${g.tolerancias[0]} y ${g.tolerancias[1]} · «${g.especial}»${g.responsable ? ` · consultar con ${g.responsable}` : ''}`}>
        <div className="flex flex-col gap-1">
          <FormRow label="Tolerancias" ayuda="Filas de diferencia permitidas: hasta la 1.ª cifra, vale la principal; hasta la 2.ª, avisa; más, se marca para revisar.">
            <div className="flex gap-1.5">
              {[0, 1].map((i) => <Input key={i} className="h-7 w-14" inputMode="numeric" value={String(g.tolerancias[i])}
                onChange={(e) => { const t = [...g.tolerancias] as [number, number, number]; t[i] = parseInt(e.target.value, 10) || 0; setG({ ...g, tolerancias: t }) }} />)}
            </div>
          </FormRow>
          <FormRow label="Valor «revisar»" ayuda="Opción especial para cuando no se puede decidir."><Input className="h-7 w-[160px]" value={g.especial} onChange={(e) => setG({ ...g, especial: e.target.value })} /></FormRow>
          <FormRow label="Consultar con" ayuda="Quién decide los casos dudosos (sale en el aviso y en el comentario automático)."><Input className="h-7 w-[220px]" value={g.responsable} onChange={(e) => setG({ ...g, responsable: e.target.value })} /></FormRow>
        </div>
        </Avanzado>
      </Bloque>

      <Bloque titulo="Tabla" ayuda="Una fila por valor, en orden. En cada medida, la referencia máxima de esa fila: se elige la primera fila que la alcanza."
        acciones={<div className="flex gap-1.5">
          <Button size="sm" onClick={() => setImportar('')}>Pegar desde hoja de cálculo</Button>
          <Button size="sm" onClick={() => setGen({ desde: '', hasta: '', paso: '2', base: {}, inc: {} })} disabled={!cols.length}>Generar</Button>
        </div>}>
        {!cols.length ? <p className="text-sm text-fg-3">Elige antes la medida principal.</p> : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr><th className="px-1 py-1 text-left font-medium text-fg-3">Valor</th>{cols.map((c) => <th key={c} className="px-1 py-1 text-left font-medium text-fg-3">{et[c] ?? c}</th>)}<th /></tr></thead>
              <tbody>
                {g.filas.map((f, i) => (
                  <tr key={i}>
                    <td className="px-1 py-0.5"><Input className="h-7 w-20" value={f.etiqueta} onChange={(e) => setFila(i, { ...f, etiqueta: e.target.value })} /></td>
                    {cols.map((c) => <td key={c} className="px-1 py-0.5"><Input className="h-7 w-20" inputMode="decimal" value={f.valores[c] == null ? '' : String(f.valores[c])} onChange={(e) => setFila(i, { ...f, valores: { ...f.valores, [c]: n(e.target.value) } })} /></td>)}
                    <td><button aria-label="Quitar fila" className="p-1 text-fg-3 hover:text-danger-fg" onClick={() => setG({ ...g, filas: g.filas.filter((_, j) => j !== i) })}><IconTrash size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => setG({ ...g, filas: [...g.filas, { etiqueta: '', valores: {} }] })}>+ Fila</Button>
          </div>
        )}
      </Bloque>

      {cols.length > 0 && g.filas.length > 0 && (
        <Bloque titulo="Probar" ayuda="Escribe unas medidas y mira qué propone.">
          <div className="flex flex-wrap items-end gap-2">
            {cols.map((c) => <label key={c} className="flex flex-col text-sm text-fg-3">{et[c] ?? c}<Input className="h-7 w-20" inputMode="decimal" value={prueba[c] ?? ''} onChange={(e) => setPrueba({ ...prueba, [c]: e.target.value })} /></label>)}
            <span className={`rounded-sm px-2 py-1 text-sm ${!sug ? 'text-fg-3' : sug.nivel === 'ok' ? 'bg-ok-bg text-ok-fg' : sug.nivel === 'aviso' ? 'bg-warn-bg text-warn-fg' : 'bg-danger-bg text-danger-fg'}`}>
              {sug ? `${sug.valor} · ${sug.motivo}` : 'Falta la medida principal'}
            </span>
          </div>
        </Bloque>
      )}

      <BarraGuardar sucio={sucio} busy={busy} ok={ok} err={err} onGuardar={guardar} onDescartar={() => { setG(inicial); setErr(null) }} />

      <Dialog open={quitarPropia} onOpenChange={setQuitarPropia} title="Quitar la guía propia del periodo"
        description="El periodo vuelve a usar la guía de la tienda y su tabla propia se borra."
        actions={[{ label: 'Quitar', variant: 'danger', onClick: async () => { setQuitarPropia(false); await ponerAjustePeriodo(amb.periodo!.id, 'guia_medidas', null); await amb.recargarPeriodos(); await recargar(); setOk('El periodo vuelve a usar la guía de la tienda') } }]} />
      <Dialog open={importar !== null} onOpenChange={(o) => { if (!o) { setImportar(null); setImpErr(null) } }} error={impErr} title="Pegar desde hoja de cálculo"
        description="Copia la tabla con su cabecera: una fila por valor y una columna por medida, o al revés. Los nombres de las medidas deben coincidir con los de Ajustes → Datos que guardáis."
        actions={[{ label: 'Importar', onClick: async () => {
          const r = importarGuia(importar ?? '', medidas)
          if (typeof r === 'string') { setImpErr(r); return }
          setImpErr(null)
          setG((s) => ({ ...s, filas: r.filas, principal: s.principal ?? r.columnas[0] ?? null, validan: [...new Set([...s.validan, ...r.columnas.filter((c) => c !== (s.principal ?? r.columnas[0]))])] }))
          setImportar(null); setOk(`${r.filas.length} filas importadas: revisa y guarda`)
        } }]}>
        <Textarea className="min-h-[160px] font-mono text-xs" value={importar ?? ''} onChange={(e) => setImportar(e.target.value)} placeholder={'Valor\tMedida A\tMedida B\n38\t88\t94\n40\t92\t98'} />
      </Dialog>
      <Dialog open={!!gen} onOpenChange={(o) => !o && setGen(null)} title="Generar la tabla"
        description="Valores numéricos del primero al último con un paso, y cada medida con su referencia inicial y lo que sube por fila."
        actions={[{ label: 'Generar', onClick: async () => {
          if (!gen) return
          const d = n(gen.desde), h = n(gen.hasta), p = n(gen.paso)
          if (d == null || h == null || !p || h < d) { setErr('Revisa desde, hasta y paso'); setGen(null); return }
          const filas: FilaGuia[] = []
          for (let v = d, k = 0; v <= h + 1e-9 && k < 60; v += p, k++)
            filas.push({ etiqueta: String(Math.round(v * 100) / 100), valores: Object.fromEntries(cols.map((c) => [c, n(gen.base[c] ?? '') == null ? null : Math.round((n(gen.base[c] ?? '')! + k * (n(gen.inc[c] ?? '') ?? 0)) * 100) / 100])) })
          setG((s) => ({ ...s, filas })); setGen(null); setOk(`${filas.length} filas generadas: revisa y guarda`)
        } }]}>
        {gen && <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <label className="flex flex-col text-sm text-fg-3">Desde<Input className="h-7 w-20" value={gen.desde} onChange={(e) => setGen({ ...gen, desde: e.target.value })} /></label>
            <label className="flex flex-col text-sm text-fg-3">Hasta<Input className="h-7 w-20" value={gen.hasta} onChange={(e) => setGen({ ...gen, hasta: e.target.value })} /></label>
            <label className="flex flex-col text-sm text-fg-3">Paso<Input className="h-7 w-20" value={gen.paso} onChange={(e) => setGen({ ...gen, paso: e.target.value })} /></label>
          </div>
          {cols.map((c) => (
            <div key={c} className="flex items-end gap-2">
              <span className="w-32 pb-1.5 text-sm">{et[c] ?? c}</span>
              <label className="flex flex-col text-sm text-fg-3">Primera<Input className="h-7 w-20" value={gen.base[c] ?? ''} onChange={(e) => setGen({ ...gen, base: { ...gen.base, [c]: e.target.value } })} /></label>
              <label className="flex flex-col text-sm text-fg-3">Sube por fila<Input className="h-7 w-20" value={gen.inc[c] ?? ''} onChange={(e) => setGen({ ...gen, inc: { ...gen.inc, [c]: e.target.value } })} /></label>
            </div>
          ))}
        </div>}
      </Dialog>
    </>
  )
}

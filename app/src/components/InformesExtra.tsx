import { supabase } from '@/lib/supabase'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { creadosEn, movimientosIntervalo, recibidosProveedor, terminados, type HitoInforme, type Intervalo } from '@/data/informes'
import { ajustesMaterial, avisoStock, bajoUmbral, cant, listarMateriales, nombreMaterial, unidadDe, type MaterialEstado } from '@/data/materiales'
import type { EncargoEstado } from '@/lib/types'
import { SectionLabel } from '@/ui'
import { ajustesDinero, dinero, pendiente } from '@/lib/utils'
import { min } from '@/lib/vocab'

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border p-3">
      <span className="text-sm text-fg-3">{titulo}</span>
      <span className="text-lg font-semibold tabular">{valor}</span>
      {nota && <span className="text-xs text-fg-3">{nota}</span>}
    </div>
  )
}

/** Facturación estimada con el importe real de cada encargo. */
export function Facturacion({ hs, iv, encargos }: { hs: HitoInforme[]; iv: Intervalo; encargos: EncargoEstado[] }) {
  const { tienda, vocab, gr } = useAuth()
  const din = ajustesDinero(tienda?.ajustes as Record<string, unknown>)
  // Importes de todos los encargos que salen en el informe (de cualquier periodo, también anulados)
  const [importes, setImportes] = React.useState<Map<string, { importe: number | null }>>(new Map())
  const ids = React.useMemo(() => [...new Set(hs.map((h) => h.encargo_id))], [hs])
  React.useEffect(() => {
    if (!din.usa || !ids.length) return
    let vivo = true
    ;(async () => {
      const m = new Map<string, { importe: number | null }>()
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('encargo').select('id,importe').in('id', ids.slice(i, i + 200))
        for (const x of (data ?? []) as { id: string; importe: number | null }[]) m.set(x.id, x)
      }
      if (vivo) setImportes(m)
    })().catch(() => {})
    return () => { vivo = false }
  }, [ids, din.usa])
  if (!din.usa) return null
  const porId = new Map<string, { importe: number | null }>([...importes, ...encargos.map((e) => [e.id, e] as [string, EncargoEstado])])
  const suma = (ids: Iterable<string>) => {
    let t = 0, sin = 0, n = 0
    for (const id of ids) { const e = porId.get(id); if (!e) continue; n++; if (e.importe == null) sin++; else t += Number(e.importe) }
    return { t, sin, n }
  }
  const nota = (x: { sin: number; n: number }) => `${x.n} ${x.n === 1 ? min(vocab.encargo) : min(vocab.encargos)}${x.sin ? ` · ${x.sin} sin importe` : ''}`
  const entrada = suma(creadosEn(hs, iv)), prod = suma(recibidosProveedor(hs, iv)), entregado = suma(terminados(hs, iv))
  const vivos = encargos.filter((e) => e.estado === 'ACTIVO' && !e.es_final)
  const cartera = suma(vivos.map((e) => e.id))
  const pendCobro = encargos.filter((e) => e.estado === 'ACTIVO' && (pendiente(e) ?? 0) > 0)
  const totalPend = pendCobro.reduce((a, e) => a + (pendiente(e) ?? 0), 0)
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Facturación estimada</SectionLabel>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Cifra titulo="Entrada" valor={dinero(entrada.t, din.moneda)} nota={nota(entrada)} />
        <Cifra titulo={`Vuelto de ${min(vocab.proveedor)}`} valor={dinero(prod.t, din.moneda)} nota={nota(prod)} />
        <Cifra titulo={`Terminad${gr.o('encargo', true)}`} valor={dinero(entregado.t, din.moneda)} nota={nota(entregado)} />
        <Cifra titulo="En curso (cartera)" valor={dinero(cartera.t, din.moneda)} nota={nota(cartera)} />
        <Cifra titulo="Pendiente de cobro" valor={dinero(totalPend, din.moneda)} nota={`${pendCobro.length} con algo pendiente`} />
      </div>
      <p className="m-0 text-xs text-fg-3">Con el importe pactado de cada {min(vocab.encargo)}. «En curso» y «pendiente de cobro» son de ahora mismo; el resto, del intervalo.</p>
    </section>
  )
}

/** Materiales en el intervalo: consumido, recibido y pedido; bajo umbral, sin stock y restos. */
export function InformeMateriales({ iv }: { iv: Intervalo }) {
  const { tienda, vocab } = useAuth()
  const aj = ajustesMaterial(tienda?.ajustes as Record<string, unknown>)
  const [mats, setMats] = React.useState<MaterialEstado[]>([])
  const [movs, setMovs] = React.useState<Awaited<ReturnType<typeof movimientosIntervalo>> | null>(null)
  const [por, setPor] = React.useState<'material' | 'proveedor'>('material')
  React.useEffect(() => {
    if (!tienda || !aj.activo) return
    Promise.all([listarMateriales(tienda.id), movimientosIntervalo(tienda.id, iv.ini, iv.fin)]).then(([m, v]) => { setMats(m); setMovs(v) }).catch(() => setMovs([]))
  }, [tienda, aj.activo, iv.ini, iv.fin])
  if (!aj.activo || !movs) return null
  const matPorId = new Map(mats.map((m) => [m.id, m]))
  // Por proveedor se separa por unidad: no se suman metros con unidades
  const acc = new Map<string, { nombre: string; ud: string; CONSUMO: number; RECEPCION: number; PEDIDO: number }>()
  for (const m of movs) {
    if (m.revertido || !['CONSUMO', 'RECEPCION', 'PEDIDO'].includes(m.tipo)) continue
    const mt = matPorId.get(m.material_id)
    const ud = unidadDe(mt, aj.unidad)
    const k = por === 'material' ? m.material_id : `${mt?.proveedor_id ?? ''}|${ud}`
    const nombre = por === 'material' ? nombreMaterial(mt) : mt?.proveedor_nombre ?? `Sin ${min(vocab.proveedor)}`
    const a = acc.get(k) ?? { nombre, ud, CONSUMO: 0, RECEPCION: 0, PEDIDO: 0 }
    a[m.tipo as 'CONSUMO'] += Number(m.cantidad)
    acc.set(k, a)
  }
  const filas = [...acc.values()].sort((a, b) => b.CONSUMO - a.CONSUMO || a.nombre.localeCompare(b.nombre, 'es'))
  const activos = mats.filter((m) => m.activo)
  const bajos = activos.filter(bajoUmbral).sort((a, b) => (Number(a.stock) - Number(a.umbral_efectivo)) - (Number(b.stock) - Number(b.umbral_efectivo))).slice(0, 12)
  const sinStock = activos.filter((m) => Number(m.stock) <= 0).length
  const conRestos = mats.filter((m) => Number(m.restos) > 0).length
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SectionLabel className="flex-1">{vocab.materiales}</SectionLabel>
        <select className="no-imprimir h-7 rounded-sm border border-border bg-bg px-2 text-sm" value={por} onChange={(e) => setPor(e.target.value as typeof por)} aria-label="Agrupar">
          <option value="material">Por {min(vocab.material)}</option><option value="proveedor">Por {min(vocab.proveedor)}</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cifra titulo="Bajo umbral" valor={String(activos.filter(bajoUmbral).length)} />
        <Cifra titulo="Sin stock" valor={String(sinStock)} />
        <Cifra titulo="Con restos" valor={String(conRestos)} />
      </div>
      {filas.length === 0 ? <p className="m-0 text-fg-3">Sin consumos, recepciones ni pedidos en este intervalo.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-fg-3"><th className="py-1 font-medium">{por === 'material' ? vocab.material : vocab.proveedor}</th><th className="py-1 text-right font-medium">Consumido</th><th className="py-1 text-right font-medium">Recibido</th><th className="py-1 text-right font-medium">Pedido</th></tr></thead>
          <tbody>{filas.map((f) => (
            <tr key={f.nombre + f.ud} className="border-t border-border-light"><td className="py-1">{f.nombre}</td><td className="py-1 text-right tabular">{cant(f.CONSUMO, f.ud)}</td><td className="py-1 text-right tabular">{cant(f.RECEPCION, f.ud)}</td><td className="py-1 text-right tabular">{cant(f.PEDIDO, f.ud)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {bajos.length > 0 && <>
        <span className="text-sm font-medium">Los más bajos respecto a su umbral</span>
        <table className="w-full text-sm"><tbody>{bajos.map((m) => {
          const av = avisoStock(m)
          return <tr key={m.id} className="border-t border-border-light"><td className="py-1"><Link to="/materiales" className="hover:underline">{nombreMaterial(m)}</Link></td><td className="py-1 text-right tabular">{cant(m.stock, m.unidad)}</td><td className="py-1 text-right text-fg-3">umbral {cant(m.umbral_efectivo, m.unidad)}</td><td className="py-1 text-right text-xs text-warn-fg">{av.nivel === 'falta' ? 'no alcanza' : ''}</td></tr>
        })}</tbody></table>
      </>}
      <p className="m-0 text-xs text-fg-3">Suma de movimientos del intervalo; los ajustes manuales y los restos no cuentan.</p>
    </section>
  )
}

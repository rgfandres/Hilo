import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { camposDe, plantillas, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import {
  MAX_FILAS, columnas, deshacerImportacion, importar, leerPlantilla, listarImportaciones, plantilla,
  type Entidad, type FilaLeida, type Importacion, type Informe,
} from '@/data/importar'
import { descargar } from '@/lib/xlsx'
import { fechaCorta } from '@/lib/utils'
import { Button, Dialog, Segmented, Tag, useAvisos } from '@/ui'
import { Bloque, FilaLista, Lista, Pagina } from './Ajustes'

type Paso = { tipo: 'subir' } | { tipo: 'revisar'; nombre: string; filas: FilaLeida[]; informe: Informe; vacias: number }

/**
 * Ajustes → Importar datos. Tres pasos: descargar la plantilla, subirla rellena y revisar.
 * Nada se guarda hasta pulsar «Importar», y solo si no queda ninguna fila con error.
 */
export function AjustesImportar() {
  const { tienda, vocab } = useAuth()
  const avisar = useAvisos()
  const aj = (tienda?.ajustes ?? {}) as Record<string, unknown>
  const conMat = (aj.modulos as Record<string, boolean> | undefined)?.materiales === true
  const [entidad, setEntidad] = React.useState<Entidad>('CLIENTE')
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [paso, setPaso] = React.useState<Paso>({ tipo: 'subir' })
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [soloErr, setSoloErr] = React.useState(false)
  const [hist, setHist] = React.useState<Importacion[]>([])
  const [deshacer, setDeshacer] = React.useState<Importacion | null>(null)
  const [dErr, setDErr] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)

  const cargarHist = React.useCallback(() => { if (tienda) listarImportaciones(tienda.id).then(setHist).catch(() => {}) }, [tienda])
  React.useEffect(() => { if (tienda) plantillas(tienda.id).then(setPs).catch((x) => setErr(mensajeError(x))) }, [tienda])
  React.useEffect(cargarHist, [cargarHist])

  const nombres: Record<Entidad, string> = { CLIENTE: vocab.clientes, PRODUCTO: vocab.productos, PROVEEDOR: vocab.proveedores, MATERIAL: vocab.materiales }
  const singular: Record<Entidad, string> = { CLIENTE: vocab.cliente, PRODUCTO: vocab.producto, PROVEEDOR: vocab.proveedor, MATERIAL: vocab.material }
  const cols = columnas(entidad, {
    campos: entidad === 'CLIENTE' || entidad === 'PRODUCTO' ? camposDe(ps, entidad) : [],
    materiales: conMat, construcciones: (aj.tipos_construccion as string[] | undefined) ?? [],
    vocab: vocab as unknown as Record<string, string>,
  })
  const elegir = (e: Entidad) => { setEntidad(e); setPaso({ tipo: 'subir' }); setErr(null) }

  async function subir(file: File) {
    if (!tienda) return
    setErr(null); setBusy('leer')
    try {
      const l = await leerPlantilla(file, entidad, cols)
      if (!l.ok) { setErr(l.error); return }
      const informe = await importar(tienda.id, entidad, l.filas, false)
      setPaso({ tipo: 'revisar', nombre: file.name, filas: l.filas, informe, vacias: l.vacias }); setSoloErr(informe.errores > 0)
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(null) }
  }
  async function descartarErrores() {
    if (!tienda || paso.tipo !== 'revisar') return
    const malas = new Set(paso.informe.filas.filter((f) => f.estado === 'error').map((f) => f.fila))
    const filas = paso.filas.filter((f) => !malas.has(f._fila))
    if (!filas.length) { setPaso({ tipo: 'subir' }); setErr('Todas las filas tenían errores: corrígelas en el Excel y vuelve a subirlo.'); return }
    setBusy('descartar')
    try { const informe = await importar(tienda.id, entidad, filas, false); setPaso({ ...paso, filas, informe }); setSoloErr(informe.errores > 0) }
    catch (x) { setErr(mensajeError(x)) } finally { setBusy(null) }
  }
  async function confirmar() {
    if (!tienda || paso.tipo !== 'revisar') return
    setBusy('importar'); setErr(null)
    try {
      const informe = await importar(tienda.id, entidad, paso.filas, true)
      if (!informe.importacion) { setPaso({ ...paso, informe }); setSoloErr(true); setErr('Algo cambió mientras revisabas: mira las filas marcadas.'); return }
      avisar({ tipo: 'ok', texto: `Importado: ${informe.nuevos} ${informe.nuevos === 1 ? 'nuevo' : 'nuevos'}${informe.actualizados ? ` y ${informe.actualizados} actualizados` : ''}` })
      setPaso({ tipo: 'subir' }); cargarHist()
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(null) }
  }

  const rev = paso.tipo === 'revisar' ? paso : null
  const titular = (f: FilaLeida) => entidad === 'MATERIAL' ? [f.tipo, f.variante].filter(Boolean).join(' / ') : String(f.nombre ?? '')
  const filasVista = rev ? rev.informe.filas.filter((f) => !soloErr || f.estado === 'error') : []
  const porFila = rev ? new Map(rev.filas.map((f) => [f._fila, f])) : new Map<number, FilaLeida>()

  return (
    <>
      <Pagina titulo="Importar datos" ayuda="Trae tus listas desde Excel usando nuestra plantilla. Nada se guarda hasta que lo confirmes."
        mas={<>Solo se acepta la plantilla de Hilo: si subes otro archivo, se rechaza sin tocar nada. Antes de guardar verás cada fila; si alguna tiene un error, no se importa nada hasta que la corrijas o la descartes. Si algo ya existe, se actualiza (una celda vacía nunca borra). Cada importación se puede deshacer mientras lo importado no se haya usado.</>} />

      <Segmented value={entidad} onChange={(k) => elegir(k as Entidad)}
        items={(['CLIENTE', 'PRODUCTO', 'PROVEEDOR', ...(conMat ? ['MATERIAL'] : [])] as Entidad[]).map((e) => ({ key: e, label: nombres[e] }))} />

      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        <Paso n={1} titulo="Descarga la plantilla" hecho={!!rev}>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => descargar(plantilla(entidad, cols, singular[entidad].toLowerCase()), `hilo_plantilla_${nombres[entidad].toLowerCase().replace(/\s+/g, '_')}.xlsx`)}>
              Descargar plantilla de {nombres[entidad].toLowerCase()}
            </Button>
            <span className="text-sm text-fg-3">Columnas: {cols.map((c) => c.titulo).join(' · ')}</span>
          </div>
        </Paso>
        <Paso n={2} titulo="Rellénala y súbela" hecho={!!rev}>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f) }} />
            <Button variant={rev ? 'ghost' : 'primary'} cargando={busy === 'leer'} onClick={() => input.current?.click()}>{rev ? 'Subir otro archivo' : 'Subir la plantilla rellena'}</Button>
            {rev && <span className="text-sm text-fg-2">{rev.nombre} · {rev.filas.length} filas{rev.vacias ? ` (${rev.vacias} vacías ignoradas)` : ''}</span>}
            {!rev && <span className="text-sm text-fg-3">Excel (.xlsx), hasta {MAX_FILAS} filas.</span>}
          </div>
        </Paso>
        {err && <p className="m-0 rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</p>}
        {rev && (
          <Paso n={3} titulo="Revisa y confirma">
            <div className="flex flex-wrap items-center gap-2">
              {rev.informe.nuevos > 0 && <Tag color="green">{rev.informe.nuevos} {rev.informe.nuevos === 1 ? 'nueva' : 'nuevas'}</Tag>}
              {rev.informe.actualizados > 0 && <Tag color="amber">{rev.informe.actualizados} {rev.informe.actualizados === 1 ? 'actualiza' : 'actualizan'} lo que ya hay</Tag>}
              {rev.informe.errores > 0 && <Tag color="red">{rev.informe.errores} con error</Tag>}
              <span className="flex-1" />
              {rev.informe.errores > 0 && (
                <label className="flex items-center gap-1.5 text-sm text-fg-2"><input type="checkbox" checked={soloErr} onChange={(e) => setSoloErr(e.target.checked)} /> Ver solo las filas con error</label>
              )}
            </div>
            <Lista>
              {filasVista.slice(0, 300).map((f) => (
                <FilaLista key={f.fila} className={f.estado === 'error' ? 'bg-danger-bg/40' : undefined}>
                  <span className="w-14 shrink-0 text-sm text-fg-3 tabular">Fila {f.fila}</span>
                  <span className="w-[200px] shrink-0 truncate font-medium">{titular(porFila.get(f.fila) ?? { _fila: 0 }) || '—'}</span>
                  <span className="flex min-w-0 flex-1 flex-col text-sm">
                    {f.estado === 'error'
                      ? f.errores.map((e, i) => <span key={i} className="text-danger-fg">{e}</span>)
                      : <span className={f.estado === 'nuevo' ? 'text-ok-fg' : 'text-warn-fg'}>{f.estado === 'nuevo' ? 'Nueva' : 'Ya existe: se actualiza'}</span>}
                    {f.avisos.map((a, i) => <span key={`a${i}`} className="text-warn-fg">{a}</span>)}
                  </span>
                </FilaLista>
              ))}
            </Lista>
            {filasVista.length > 300 && <span className="text-sm text-fg-3">Se muestran 300 de {filasVista.length}.</span>}
            <div className="flex flex-col gap-1 rounded-md bg-bg-3 px-3 py-2">
              <span className="font-medium">Aún no se ha guardado nada.</span>
              <span className="text-fg-2">{rev.informe.errores > 0
                ? 'Corrige las filas marcadas en tu Excel y vuelve a subirlo, o descártalas para importar solo las correctas.'
                : `Al importar se ${rev.informe.nuevos ? `crearán ${rev.informe.nuevos}` : ''}${rev.informe.nuevos && rev.informe.actualizados ? ' y se ' : ''}${rev.informe.actualizados ? `actualizarán ${rev.informe.actualizados}` : ''}. Podrás deshacerlo después.`}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => { setPaso({ tipo: 'subir' }); setErr(null) }}>Cancelar</Button>
              {rev.informe.errores > 0 && <Button cargando={busy === 'descartar'} onClick={descartarErrores}>Descartar las {rev.informe.errores} con error</Button>}
              <Button variant="primary" disabled={rev.informe.errores > 0} cargando={busy === 'importar'} onClick={confirmar}
                title={rev.informe.errores > 0 ? 'Primero corrige o descarta las filas con error' : undefined}>
                Importar {rev.filas.length} {rev.filas.length === 1 ? 'fila' : 'filas'}
              </Button>
            </div>
          </Paso>
        )}
      </ol>

      {hist.length > 0 && (
        <Bloque titulo="Últimas importaciones">
          <Lista>
            {hist.map((h) => (
              <FilaLista key={h.id}>
                <span className="flex-1">{nombres[h.entidad]} · {fechaCorta(h.creado_en)}</span>
                <span className="text-sm text-fg-3">{h.nuevos} nuevos{h.actualizados ? `, ${h.actualizados} actualizados` : ''}</span>
                {h.deshecha_en ? <Tag color="gray">Deshecha</Tag>
                  : <Button size="sm" variant="ghost" onClick={() => { setDeshacer(h); setDErr(null) }}>Deshacer</Button>}
              </FilaLista>
            ))}
          </Lista>
          <span className="text-sm text-fg-3">¿Ves algo raro en {vocab.clientes.toLowerCase()} o {vocab.productos.toLowerCase()}? Puedes revisarlo en <Link to="/clientes" className="underline">{vocab.clientes}</Link>.</span>
        </Bloque>
      )}

      <Dialog open={!!deshacer} onOpenChange={(o) => !o && setDeshacer(null)} title="Deshacer importación" error={dErr}
        description={deshacer ? `Se borrará lo que creó (${deshacer.nuevos}) y lo que actualizó (${deshacer.actualizados}) volverá a como estaba. Si algo ya se está usando, no se podrá deshacer.` : ''}
        actions={[{ label: 'Deshacer', variant: 'danger', onClick: async () => {
          if (!deshacer) return
          try { await deshacerImportacion(deshacer.id); setDeshacer(null); cargarHist(); avisar({ tipo: 'ok', texto: 'Importación deshecha' }) }
          catch (x) { setDErr(mensajeError(x)) }
        } }]} />
    </>
  )
}

function Paso({ n, titulo, hecho, children }: { n: number; titulo: string; hecho?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${hecho ? 'bg-ok-fg' : 'bg-gray-12'}`}>{hecho ? '✓' : n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-medium">{titulo}</span>
        {children}
      </div>
    </li>
  )
}

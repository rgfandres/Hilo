import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { camposDe, plantillas as leerCampos, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import { MARCADORES_FICHA, fichaHTML, guardarPlantillaFicha, obtenerPlantillaFicha, plantillaDefecto, type DatosFicha } from '@/data/ficha'
import { Button, Textarea } from '@/ui'
import { Bloque, Estado } from './Ajustes'
import { ponerAjustePeriodo } from '@/data/ajustes'
import { SelectorAmbito, useAmbito } from '@/components/Ambito'

/**
 * Ajustes → Ficha: la hoja que se imprime (o se guarda en PDF, o se copia como texto)
 * desde cada encargo. Texto con marcadores; vista previa al lado.
 */
export function AjustesFicha() {
  const { tienda, vocab } = useAuth()
  const [texto, setTexto] = React.useState('')
  const [guardado, setGuardado] = React.useState<string | null>(null)
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const defecto = plantillaDefecto(vocab)
  const amb = useAmbito('ficha')
  const [deTienda, setDeTienda] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!tienda) return
    Promise.all([obtenerPlantillaFicha(tienda.id), leerCampos(tienda.id)])
      .then(([t, p]) => { setDeTienda(t); setPs(p) })
      .catch((x) => setErr(mensajeError(x)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tienda])
  // Lo guardado para el ámbito elegido (el periodo sin ficha propia parte de la de la tienda)
  React.useEffect(() => {
    const g = amb.periodo ? ((amb.propio as string | undefined) ?? null) : deTienda
    setGuardado(g); setTexto(g ?? (amb.periodo ? deTienda ?? defecto : defecto))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deTienda, amb.ambito, amb.propio])

  const tipos = [...new Set(ps.filter((p) => p.tipo_encargo_id).map((p) => p.tipo_encargo_id!))]
  const camposEnc = camposDe(ps, 'ENCARGO', tipos[0] ?? null)
  const camposCli = camposDe(ps, 'CLIENTE')
  const ejemplo: DatosFicha = {
    tienda: tienda?.nombre ?? '', numero: 1, nombre: `${vocab.cliente} de ejemplo`, telefono: '600 000 000', email: null,
    producto: `${vocab.producto} de ejemplo`, proveedor: null, etapa: 'Primera etapa', tipo: null,
    camposEncargo: camposEnc, datosEncargo: {}, camposCliente: camposCli, datosCliente: {},
    hilo: [{ etapa: 'Primera etapa', fecha: new Date().toISOString(), nota: null }],
  }
  const vista = fichaHTML(texto, ejemplo)
  const campos = [...camposEnc, ...camposCli].filter((c, i, a) => a.findIndex((x) => x.clave === c.clave) === i)

  function insertar(k: string) {
    const t = area.current
    const m = `{${k}}`
    if (!t) { setTexto((s) => s + m); return }
    const a = t.selectionStart, b = t.selectionEnd
    const bloque = ['campos_encargo', 'campos_cliente', 'hilo', 'lineas'].includes(k)
    const ins = bloque ? `\n${m}\n` : m
    setTexto(texto.slice(0, a) + ins + texto.slice(b))
    requestAnimationFrame(() => { t.focus(); t.selectionStart = t.selectionEnd = a + ins.length })
  }
  async function guardar(valor: string | null) {
    if (!tienda) return
    setErr(null); setOk(null)
    try {
      if (amb.periodo) {
        await ponerAjustePeriodo(amb.periodo.id, 'ficha', valor); await amb.recargarPeriodos()
        setOk(valor == null ? 'El periodo vuelve a usar la ficha de la tienda' : `Guardada como ficha propia del periodo ${amb.periodo.nombre}`)
      } else {
        await guardarPlantillaFicha(tienda.id, valor); setDeTienda(valor)
        setGuardado(valor); if (valor == null) setTexto(defecto)
        setOk(valor == null ? 'Vuelve a usarse la ficha por defecto' : 'Guardado')
      }
    } catch (x) { setErr(mensajeError(x)) }
  }
  const sucio = texto !== (guardado ?? (amb.periodo ? deTienda ?? defecto : defecto))

  return (
    <Bloque titulo="Ficha imprimible" ayuda={`La hoja que sale con «Imprimir ficha» en cada ${vocab.encargo.toLowerCase()}. También se puede guardar en PDF o copiar como texto.`}>
      <SelectorAmbito periodos={amb.periodos} ambito={amb.ambito} onCambio={amb.setAmbito} clave="ficha" />
      {amb.periodo && amb.propio == null && <span className="text-sm text-fg-3">Este periodo usa la ficha de la tienda. Si la cambias y guardas, tendrá la suya propia.</span>}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-fg-3">«# » título · «## » sección · los bloques van solos en su línea. Pulsa un marcador para insertarlo.</span>
        <div className="flex flex-wrap gap-1">
          {MARCADORES_FICHA.map((m) => (
            <button key={m.k} title={m.ayuda} onClick={() => insertar(m.k)} className="rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono text-xs hover:border-border-strong">{`{${m.k}}`}</button>
          ))}
          {campos.map((c) => (
            <button key={c.clave} title={c.etiqueta} onClick={() => insertar(c.clave)} className="rounded-sm border border-dashed border-border bg-bg px-1.5 py-0.5 font-mono text-xs text-fg-2 hover:border-border-strong">{`{${c.clave}}`}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Textarea ref={area} value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[420px] font-mono text-sm" aria-label="Plantilla de la ficha" />
        <iframe title="Vista previa de la ficha" srcDoc={vista} className="min-h-[420px] w-full rounded-sm border border-border bg-white" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!sucio} onClick={() => guardar(texto)}>Guardar</Button>
        {guardado != null && <Button variant="ghost" onClick={() => guardar(null)}>{amb.periodo ? 'Quitar la ficha propia del periodo' : 'Volver a la ficha por defecto'}</Button>}
        <Estado ok={ok} err={err} />
      </div>
    </Bloque>
  )
}

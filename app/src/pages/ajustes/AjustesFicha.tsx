import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { camposDe, marcadorEtiqueta, plantillas as leerCampos, type Campo, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import { MARCADORES_FICHA, fichaHTML, guardarPlantillaFicha, obtenerPlantillaFicha, plantillaDefecto, type DatosFicha } from '@/data/ficha'
import { Button, Dialog, Select, Textarea } from '@/ui'
import { confirmarSalida } from '@/lib/salir'
import { ayudaMarcador } from '@/data/mensajes'
import { BarraGuardar, Bloque, Pagina } from './Ajustes'
import { listarTipos, ponerAjustePeriodo } from '@/data/ajustes'
import { SelectorAmbito, useAmbito } from '@/components/Ambito'

/**
 * Ajustes → Ficha: la hoja que se imprime (o se guarda en PDF, o se copia como texto)
 * desde cada encargo. Texto con marcadores; vista previa al lado.
 */
export function AjustesFicha() {
  const { tienda, vocab, gr } = useAuth()
  const [texto, setTexto] = React.useState('')
  const [guardado, setGuardado] = React.useState<string | null>(null)
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const defecto = plantillaDefecto(vocab)
  const amb = useAmbito('ficha')
  const [deTienda, setDeTienda] = React.useState<string | null>(null)
  const [tiposT, setTiposT] = React.useState<{ id: string; nombre: string }[]>([])
  const [tipoSel, setTipoSel] = React.useState('')

  React.useEffect(() => {
    if (!tienda) return
    Promise.all([obtenerPlantillaFicha(tienda.id), leerCampos(tienda.id), listarTipos(tienda.id)])
      .then(([t, p, ts]) => { setDeTienda(t); setPs(p); const act = ts.filter((x) => x.activo); setTiposT(act); setTipoSel((s) => s || act[0]?.id || '') })
      .catch((x) => setErr(mensajeError(x)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tienda])
  // Lo guardado para el ámbito elegido (el periodo sin ficha propia parte de la de la tienda)
  React.useEffect(() => {
    const g = amb.periodo ? ((amb.propio as string | undefined) ?? null) : deTienda
    setGuardado(g); setTexto(g ?? (amb.periodo ? deTienda ?? defecto : defecto))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deTienda, amb.ambito, amb.propio])

  // Vista previa con los campos del tipo elegido; los marcadores, de todos los tipos
  const camposEnc = camposDe(ps, 'ENCARGO', tipoSel || null)
  const camposTodos = tiposT.length ? tiposT.flatMap((t) => camposDe(ps, 'ENCARGO', t.id)) : camposEnc
  const camposCli = camposDe(ps, 'CLIENTE')
  const ejemplo: DatosFicha = {
    tienda: tienda?.nombre ?? '', numero: 1, nombre: `${vocab.cliente} de ejemplo`, telefono: '600 000 000', email: null,
    producto: `${vocab.producto} de ejemplo`, proveedor: null, etapa: 'Primera etapa', tipo: tiposT.find((t) => t.id === tipoSel)?.nombre ?? null,
    camposEncargo: camposEnc, datosEncargo: {}, camposCliente: camposCli, datosCliente: {},
    hilo: [{ etapa: 'Primera etapa', fecha: new Date().toISOString(), nota: null }],
    creado: new Date().toISOString(), complementos: 'Complementos de ejemplo', notasCliente: null,
  }
  const vista = fichaHTML(texto, ejemplo)
  const campos = [...camposTodos, ...camposCli].filter((c, i, a) => a.findIndex((x) => x.clave === c.clave) === i)
  // Con su nombre visible ({tipo_tela}); si choca con un marcador fijo, con su clave
  const aliasF = (c: Campo) => { const a = marcadorEtiqueta(c); return a && !MARCADORES_FICHA.some((m) => m.k === a) && !['fecha_alta', 'año', 'complementos', 'notas'].includes(a) ? a : c.clave }

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
  const [busy, setBusy] = React.useState(false)
  const [confirmarQuitar, setConfirmarQuitar] = React.useState(false)
  async function guardar(valor: string | null) {
    if (!tienda || busy) return
    setErr(null); setOk(null); setBusy(true)
    try {
      if (amb.periodo) {
        await ponerAjustePeriodo(amb.periodo.id, 'ficha', valor); await amb.recargarPeriodos()
        setOk(valor == null ? 'El periodo vuelve a usar la ficha de la tienda' : `Guardada como ficha propia del periodo ${amb.periodo.nombre}`)
      } else {
        await guardarPlantillaFicha(tienda.id, valor); setDeTienda(valor)
        setGuardado(valor); if (valor == null) setTexto(defecto)
        setOk(valor == null ? 'Vuelve a usarse la ficha por defecto' : 'Guardado')
      }
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }
  const sucio = texto !== (guardado ?? (amb.periodo ? deTienda ?? defecto : defecto))

  return (
    <>
    <Pagina titulo={`Hoja ${gr.con('encargo', 'del')}`} ayuda={`Lo que sale al pulsar «Imprimir ficha» en cada ${vocab.encargo.toLowerCase()} (también en PDF o como texto).`} />
    <Bloque titulo="Contenido">
      <SelectorAmbito periodos={amb.periodos} ambito={amb.ambito} onCambio={(a) => confirmarSalida(() => amb.setAmbito(a))} clave="ficha" />
      {amb.periodo && amb.propio == null && <span className="text-sm text-fg-3">Este periodo usa la ficha de la tienda. Si la cambias y guardas, tendrá la suya propia.</span>}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-fg-3">«# » título · «## » sección · los bloques van solos en su línea. Pulsa un marcador para insertarlo.</span>
        <div className="flex flex-wrap gap-1">
          {MARCADORES_FICHA.map((m) => (
            <button key={m.k} title={ayudaMarcador(m.ayuda, vocab)} onClick={() => insertar(m.k)} className="rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono text-xs hover:border-border-strong">{`{${m.k}}`}</button>
          ))}
          {campos.map((c) => (
            <button key={c.clave} title={`${c.etiqueta} (también {${c.clave}})`} onClick={() => insertar(aliasF(c))} className="rounded-sm border border-dashed border-border bg-bg px-1.5 py-0.5 font-mono text-xs text-fg-2 hover:border-border-strong">{`{${aliasF(c)}}`}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Textarea ref={area} value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[420px] font-mono text-sm" aria-label="Plantilla de la ficha" />
        <div className="flex flex-col gap-1">
          {tiposT.length > 1 && (
            <Select className="h-7 w-auto self-start" value={tipoSel} onChange={(e) => setTipoSel(e.target.value)} aria-label="Tipo para la vista previa">
              {tiposT.map((t) => <option key={t.id} value={t.id}>Vista previa: {t.nombre}</option>)}
            </Select>
          )}
          <iframe title="Vista previa de la ficha" srcDoc={vista} className="min-h-[420px] w-full rounded-sm border border-border bg-white" />
        </div>
      </div>
      <BarraGuardar sucio={sucio} busy={busy} ok={ok} err={err} onGuardar={() => guardar(texto)} onDescartar={() => setTexto(guardado ?? (amb.periodo ? deTienda ?? defecto : defecto))}
        extra={guardado != null && <Button variant="ghost" onClick={() => setConfirmarQuitar(true)}>{amb.periodo ? 'Quitar la ficha propia del periodo' : 'Volver a la ficha por defecto'}</Button>} />
      <Dialog open={confirmarQuitar} onOpenChange={setConfirmarQuitar} title={amb.periodo ? 'Quitar la ficha propia del periodo' : 'Volver a la ficha por defecto'}
        description={amb.periodo ? 'El periodo vuelve a usar la ficha de la tienda y la suya se borra.' : 'Se borra la ficha personalizada de la tienda y se usa la de por defecto.'}
        actions={[{ label: 'Confirmar', variant: 'danger', onClick: () => { setConfirmarQuitar(false); guardar(null) } }]} />
    </Bloque>
    </>
  )
}

import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { buscarClientes, comentar, crearHito, mensajeError, siguienteNumero } from '@/data/encargos'
import { camposDe, plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { PageHeader } from '@/layout/AppShell'
import { Button, Combobox, FormRow, Input, SectionLabel, Select, Textarea, useAvisos } from '@/ui'
import { ajustesFicha, altaRapidaProducto, fichaProducto, tieneFicha, type FichaTecnica } from '@/data/catalogos'
import { resumenFicha } from '@/pages/Productos'
import { CamposForm, NumeroInput, limpiar } from '@/components/CampoInput'
import { ajustesDinero } from '@/lib/utils'
import { min } from '@/lib/vocab'
import { SelectorMaterial } from '@/components/Material'
import { AvisoGuia, useGuia } from '@/components/Guia'
import { guiaDe } from '@/data/guia'
import { ajustesMaterial, anadirLinea, listarMateriales, type MaterialEstado } from '@/data/materiales'

type ClienteLite = { id: string; nombre: string; telefono: string | null; email: string | null }

/**
 * Alta de encargo. Todo encargo cuelga de un cliente: uno nuevo o uno existente
 * (buscador por nombre o teléfono, o ?cliente=<id> desde la ficha de otro encargo).
 * Solo el nombre del cliente es obligatorio (más los campos marcados obligatorios).
 */
export function NuevoEncargo() {
  const avisar = useAvisos()
  const { tienda, vocab, periodo, gr, rol } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [tipos, setTipos] = React.useState<{ id: string; clave: string; nombre: string }[]>([])
  const [productos, setProductos] = React.useState<{ id: string; nombre: string; precio_base?: number | null }[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [tipo, setTipo] = React.useState('')
  const [producto, setProducto] = React.useState('')
  const [existente, setExistente] = React.useState<ClienteLite | null>(null)
  const [nombre, setNombre] = React.useState(''); const [tel, setTel] = React.useState(''); const [email, setEmail] = React.useState('')
  const [sugeridos, setSugeridos] = React.useState<ClienteLite[]>([])
  const [dCli, setDCli] = React.useState<Record<string, string>>({})
  const [dEnc, setDEnc] = React.useState<Record<string, string>>({})
  const [comentario, setComentario] = React.useState('')
  const [importe, setImporte] = React.useState(''); const [aCuenta, setACuenta] = React.useState('')
  const [importeAuto, setImporteAuto] = React.useState(true)
  const din = ajustesDinero(tienda?.ajustes as Record<string, unknown>)
  const [numero, setNumero] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const conMaterial = ajustesMaterial(tienda?.ajustes as Record<string, unknown>).activo
  const [mats, setMats] = React.useState<MaterialEstado[]>([])
  const [mLineas, setMLineas] = React.useState<{ tipo: string; material_id: string; cantidad: string }[]>([])
  React.useEffect(() => { if (tienda && conMaterial) listarMateriales(tienda.id).then(setMats).catch(() => {}) }, [tienda, conMaterial])

  const camposCli: Campo[] = camposDe(ps, 'CLIENTE')
  const camposEnc: Campo[] = camposDe(ps, 'ENCARGO', tipo)
  // Guía de medidas: propuesta en vivo con las medidas del cliente (nuevo o existente) y del encargo
  const [cliDatos, setCliDatos] = React.useState<Record<string, unknown>>({})
  React.useEffect(() => {
    setCliDatos({})
    if (existente) supabase.from('cliente').select('datos').eq('id', existente.id).maybeSingle().then(({ data }) => setCliDatos((data?.datos as Record<string, unknown>) ?? {}))
  }, [existente])
  const datosGuia = React.useMemo(() => ({ ...(existente ? cliDatos : dCli), ...dEnc }), [existente, cliDatos, dCli, dEnc])
  const etiquetasGuia = React.useMemo(() => Object.fromEntries([...camposCli, ...camposEnc].map((c) => [c.clave, c.etiqueta])), [ps, tipo]) // eslint-disable-line react-hooks/exhaustive-deps
  const destinoGuia = guiaDe(tienda?.ajustes as Record<string, unknown>).destino ?? ''
  const guia = useGuia({ datos: datosGuia, etiquetas: etiquetasGuia, valor: String(dEnc[destinoGuia] ?? ''), inicialTocado: false,
    setValor: (v) => { if (destinoGuia) setDEnc((d) => ({ ...d, [destinoGuia]: v })) } })
  React.useEffect(() => { setDEnc({}) }, [tipo])

  React.useEffect(() => {
    if (!tienda) return
    ;(async () => {
      const [t, p, c] = await Promise.all([
        supabase.from('tipo_encargo').select('id,clave,nombre').eq('tienda_id', tienda.id).eq('activo', true),
        supabase.from('producto').select('id,nombre,precio_base').eq('tienda_id', tienda.id).eq('activo', true).order('nombre'),
        plantillas(tienda.id),
      ])
      setTipos(t.data ?? []); setProductos(p.data ?? []); setPs(c)
      setTipo(t.data?.[0]?.id ?? '')
      const cid = params.get('cliente')
      if (cid) {
        const { data } = await supabase.from('cliente').select('id,nombre,telefono,email').eq('id', cid).maybeSingle()
        if (data) setExistente(data as ClienteLite)
      }
    })().catch((x) => setErr(mensajeError(x)))
  }, [tienda, params])

  // El importe se rellena con el precio del producto mientras no se haya escrito a mano
  React.useEffect(() => {
    if (!importeAuto) return
    const p = productos.find((x) => x.id === producto)
    setImporte(p?.precio_base != null ? String(p.precio_base) : '')
  }, [producto, productos, importeAuto])

  // Ficha técnica del producto: pista de complementos y material propuesto (nunca autocompleta la variante)
  const fic = ajustesFicha(tienda?.ajustes as Record<string, unknown>)
  const [comp, setComp] = React.useState('')
  const [ficha, setFicha] = React.useState<(FichaTecnica & { nombre: string }) | null>(null)
  React.useEffect(() => {
    setFicha(null)
    if (!producto) return
    fichaProducto(producto).then((f) => {
      setFicha(f)
      if (f && conMaterial && f.material_tipo)
        setMLineas((xs) => xs.length === 0 || (xs.length === 1 && !xs[0].material_id) ? [{ tipo: f.material_tipo!, material_id: '', cantidad: f.consumo != null ? String(f.consumo) : '' }] : xs)
    }).catch(() => {})
  }, [producto, conMaterial])

  // Nº que se asignará (orientativo: se fija al guardar)
  React.useEffect(() => {
    if (!tienda || !tipo) return
    siguienteNumero(tipo, periodo?.id ?? null).then(setNumero)
  }, [tienda, periodo, tipo])

  // Sugerencias de clientes existentes al escribir el nombre (desde 2 letras)
  React.useEffect(() => {
    if (!tienda || existente || nombre.trim().length < 2) { setSugeridos([]); return }
    const t = setTimeout(() => { buscarClientes(tienda.id, nombre.trim()).then(setSugeridos).catch(() => setSugeridos([])) }, 200)
    return () => clearTimeout(t)
  }, [nombre, tienda, existente])

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    if (!tienda) return
    if (!existente && !nombre.trim()) { setErr(`Falta el nombre ${gr.con('cliente', 'del')}`); return }
    const falta = [
      ...camposEnc.filter((c) => c.obligatorio && !dEnc[c.clave]),
      ...(existente ? [] : camposCli.filter((c) => c.obligatorio && !dCli[c.clave])),
    ]
    if (falta.length) { setErr(`Falta: ${falta.map((c) => c.etiqueta).join(', ')}`); return }
    setBusy(true); setErr(null)
    try {
      if (din.usa && importe !== '' && aCuenta !== '' && Number(aCuenta) > Number(importe)) throw new Error('Lo entregado a cuenta no puede ser mayor que el importe')
      let clienteId = existente?.id
      if (!clienteId) {
        const { data: cli, error: e1 } = await supabase.from('cliente')
          .insert({ tienda_id: tienda.id, nombre: nombre.trim(), telefono: tel.trim() || null, email: email.trim() || null, datos: limpiar(dCli) })
          .select('id').single()
        if (e1) throw e1
        clienteId = cli.id
      }
      const { data: enc, error: e2 } = await supabase.from('encargo')
        .insert({ tienda_id: tienda.id, periodo_id: periodo?.id ?? null, tipo_encargo_id: tipo, cliente_id: clienteId, producto_id: producto || null, datos: limpiar(dEnc), complementos: comp.trim() || null,
          ...(din.usa ? { importe: importe === '' ? null : Number(importe), a_cuenta: aCuenta === '' ? 0 : Number(aCuenta) } : {}) })
        .select('id').single()
      if (e2) throw e2
      // Primera etapa del flujo: se marca al crear
      const { data: primera } = await supabase.from('etapa').select('clave').eq('tipo_encargo_id', tipo).order('orden').limit(1).maybeSingle()
      if (primera?.clave) await crearHito(enc.id, primera.clave, { forzarBlandas: true })
      for (const l of mLineas) if (l.material_id) await anadirLinea(tienda.id, enc.id, l.material_id, Number(String(l.cantidad).replace(',', '.')) || 0)
      if (comentario.trim()) await comentar(enc.id, comentario.trim())
      // Caso dudoso de la guía: incidencia y comentario automático (aparte del del usuario)
      const elegido = String(dEnc[destinoGuia] ?? '')
      if (guia.sug?.revisar && primera?.clave && (elegido === guia.sug.valor || elegido === guia.g.especial)) {
        await crearHito(enc.id, primera.clave, { tipo: 'INCIDENCIA', nota: guia.sug.motivo })
        await comentar(enc.id, `Guía de medidas: ${guia.sug.motivo}.`)
      }
      avisar({ tipo: 'ok', texto: `${vocab.encargo} cread${gr.o("encargo")} para ${nombre.trim() || existente?.nombre}` })
      nav(`/encargos/${enc.id}`)
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={gr.Con('encargo', 'nuevo')} subtitle={numero ? `Se asignará el nº ${numero}` : undefined} />
      <form onSubmit={guardar} className="flex max-w-[560px] flex-col gap-5 overflow-auto p-8">
        {err && <div className="rounded-sm bg-danger-bg px-3 py-2 text-danger-fg">{err}</div>}

        <div className="flex flex-col gap-1">
          <SectionLabel>{vocab.cliente}</SectionLabel>
          {existente ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2 px-3 py-2">
              <div className="flex flex-1 flex-col">
                <span className="font-medium">{existente.nombre}</span>
                <span className="text-sm text-fg-3">{[existente.telefono, existente.email].filter(Boolean).join(' · ') || `${vocab.cliente} existente`}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setExistente(null); setNombre('') }}>Cambiar</Button>
            </div>
          ) : (
            <>
              <FormRow label="Nombre *">
                <div className="relative">
                  <Input className="h-7" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus autoComplete="off" />
                  {sugeridos.length > 0 && (
                    <div className="absolute left-0 right-0 top-8 z-10 rounded-md border border-border bg-bg p-1 shadow-light">
                      <div className="px-2 py-1 text-xs text-fg-3">{vocab.clientes} existentes</div>
                      {sugeridos.map((s) => (
                        <button type="button" key={s.id} onClick={() => { setExistente(s); setSugeridos([]) }}
                          className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-bg-4">
                          <span className="flex-1 truncate">{s.nombre}</span>
                          <span className="text-sm text-fg-3">{s.telefono ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormRow>
              <FormRow label="Teléfono"><Input className="h-7" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></FormRow>
              <FormRow label="Correo"><Input className="h-7" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormRow>
              <CamposForm pegar campos={camposCli} valores={dCli} onCambio={(k, v) => setDCli((d) => ({ ...d, [k]: v }))} />
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <SectionLabel>{vocab.encargo}</SectionLabel>
          {tipos.length > 1 && (
            <FormRow label="Tipo">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </FormRow>
          )}
          <FormRow label={vocab.producto}>
            <Combobox opciones={productos} value={producto} onChange={setProducto} vacio="— sin decidir —" ariaLabel={vocab.producto}
              etiquetaCrear={`Añadir al catálogo`}
              crear={rol === 'ADMIN' || rol === 'OPERATIVO' ? async (n) => {
                const id = await altaRapidaProducto(tienda!.id, n)
                setProductos((l) => l.some((x) => x.id === id) ? l : [...l, { id, nombre: n }].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
                return id
              } : undefined} />
          </FormRow>
          {productos.length === 0 && <p className="pb-1 pl-[118px] text-sm text-fg-3">No hay {min(vocab.productos)} en el catálogo. <Link to="/productos" className="underline">Añadir</Link></p>}
          <CamposForm campos={guia.adaptar(camposEnc)} valores={dEnc} onCambio={(k, v) => { if (k === destinoGuia) guia.marcarTocado(); setDEnc((d) => ({ ...d, [k]: v })) }} />
          {camposEnc.some((c) => c.clave === destinoGuia) && <AvisoGuia sug={guia.sug} valor={String(dEnc[destinoGuia] ?? '')} onUsar={() => { if (guia.sug) setDEnc((d) => ({ ...d, [destinoGuia]: guia.sug!.valor })) }} />}
          {ficha && tieneFicha(ficha) && <p className="m-0 rounded-sm bg-bg-3 px-2 py-1 text-sm text-fg-2 md:ml-[128px]">{resumenFicha(ficha, tienda?.ajustes as Record<string, unknown>)}</p>}
          {ficha && !tieneFicha(ficha) && <p className="m-0 text-sm text-warn-fg md:ml-[128px]">{gr.Con('producto', 'este')} no tiene ficha técnica todavía. <Link to={`/productos?q=${encodeURIComponent(ficha.nombre)}`} className="underline">Crearla</Link></p>}
          <FormRow label={fic.etiqueta} ayuda={ficha?.receta ? `Receta: ${ficha.receta}. Aquí solo la variante.` : undefined}>
            <Input className="h-7" value={comp} onChange={(e) => setComp(e.target.value)} placeholder={ficha?.receta ? 'Color, acabado…' : 'Opcional'} />
          </FormRow>
          {din.usa && <>
            <FormRow label={`Importe (${din.moneda})`} ayuda={`Precio pactado. Si eliges ${gr.con('producto', 'un')} con precio, se rellena solo.`}>
              <NumeroInput value={importe} onChange={(v) => { setImporte(v); setImporteAuto(false) }} />
            </FormRow>
            <FormRow label="A cuenta"><NumeroInput value={aCuenta} onChange={setACuenta} /></FormRow>
          </>}
        </div>

        {conMaterial && (
          <div className="flex flex-col gap-1">
            <SectionLabel>{vocab.material}</SectionLabel>
            {mLineas.map((l, i) => (
              <div key={i} className="flex flex-col gap-0.5 border-b border-border-light pb-2">
                <SelectorMaterial materiales={mats} valor={l} puedeCrear={rol === 'ADMIN' || rol === 'OPERATIVO'}
                  onCambio={(v) => setMLineas((xs) => xs.map((x, j) => (j === i ? v : x)))} onCreado={(m) => setMats((xs) => [...xs, m])} />
                <Button size="sm" variant="ghost" type="button" className="self-end" onClick={() => setMLineas((xs) => xs.filter((_, j) => j !== i))}>Quitar</Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" type="button" className="self-start" onClick={() => setMLineas((xs) => [...xs, { tipo: '', material_id: '', cantidad: '' }])}>+ Añadir {min(vocab.material)}</Button>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <SectionLabel>Comentario inicial</SectionLabel>
          <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Opcional: algo que el equipo deba saber" />
        </div>

        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Creando…' : `Crear ${min(vocab.encargo)}`}</Button>
          <Button variant="ghost" type="button" onClick={() => nav(-1)}>Cancelar</Button>
        </div>
      </form>
    </>
  )
}

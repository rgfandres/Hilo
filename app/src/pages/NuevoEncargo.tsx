import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { buscarClientes, comentar, crearHito, mensajeError, siguienteNumero } from '@/data/encargos'
import { camposDe, plantillas, type Campo, type PlantillaCampos } from '@/data/config'
import { PageHeader } from '@/layout/AppShell'
import { Button, Combobox, FormRow, Input, SectionLabel, Select, Textarea, useAvisos } from '@/ui'
import { altaRapidaProducto } from '@/data/catalogos'
import { CamposForm, limpiar } from '@/components/CampoInput'
import { min } from '@/lib/vocab'

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
  const [productos, setProductos] = React.useState<{ id: string; nombre: string }[]>([])
  const [ps, setPs] = React.useState<PlantillaCampos[]>([])
  const [tipo, setTipo] = React.useState('')
  const [producto, setProducto] = React.useState('')
  const [existente, setExistente] = React.useState<ClienteLite | null>(null)
  const [nombre, setNombre] = React.useState(''); const [tel, setTel] = React.useState(''); const [email, setEmail] = React.useState('')
  const [sugeridos, setSugeridos] = React.useState<ClienteLite[]>([])
  const [dCli, setDCli] = React.useState<Record<string, string>>({})
  const [dEnc, setDEnc] = React.useState<Record<string, string>>({})
  const [comentario, setComentario] = React.useState('')
  const [numero, setNumero] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const camposCli: Campo[] = camposDe(ps, 'CLIENTE')
  const camposEnc: Campo[] = camposDe(ps, 'ENCARGO', tipo)
  React.useEffect(() => { setDEnc({}) }, [tipo])

  React.useEffect(() => {
    if (!tienda) return
    ;(async () => {
      const [t, p, c] = await Promise.all([
        supabase.from('tipo_encargo').select('id,clave,nombre').eq('tienda_id', tienda.id).eq('activo', true),
        supabase.from('producto').select('id,nombre').eq('tienda_id', tienda.id).eq('activo', true).order('nombre'),
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
      let clienteId = existente?.id
      if (!clienteId) {
        const { data: cli, error: e1 } = await supabase.from('cliente')
          .insert({ tienda_id: tienda.id, nombre: nombre.trim(), telefono: tel.trim() || null, email: email.trim() || null, datos: limpiar(dCli) })
          .select('id').single()
        if (e1) throw e1
        clienteId = cli.id
      }
      const { data: enc, error: e2 } = await supabase.from('encargo')
        .insert({ tienda_id: tienda.id, periodo_id: periodo?.id ?? null, tipo_encargo_id: tipo, cliente_id: clienteId, producto_id: producto || null, datos: limpiar(dEnc) })
        .select('id').single()
      if (e2) throw e2
      // Primera etapa del flujo: se marca al crear
      const { data: primera } = await supabase.from('etapa').select('clave').eq('tipo_encargo_id', tipo).order('orden').limit(1).maybeSingle()
      if (primera?.clave) await crearHito(enc.id, primera.clave, { forzarBlandas: true })
      if (comentario.trim()) await comentar(enc.id, comentario.trim())
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
          <CamposForm campos={camposEnc} valores={dEnc} onCambio={(k, v) => setDEnc((d) => ({ ...d, [k]: v }))} />
        </div>

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

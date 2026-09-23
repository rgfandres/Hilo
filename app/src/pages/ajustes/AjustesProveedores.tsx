import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  actualizarProveedor, anadirCorreoProveedor, crearProveedor, listarProveedoresAcceso, quitarCorreoProveedor,
  type ProveedorConAcceso,
} from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { Link } from 'react-router-dom'
import { Button, Input, Tag } from '@/ui'
import { min } from '@/lib/vocab'
import { Bloque, Estado, FilaLista, Interruptor, Lista } from './Ajustes'

/**
 * Ajustes → Proveedores: alta, nombre, activo y correos con acceso a su portal.
 * Un proveedor puede tener varios correos; cada correo solo ve lo de su proveedor.
 */
export function AjustesProveedores() {
  const { tienda, vocab, rol, gr } = useAuth()
  const [lista, setLista] = React.useState<ProveedorConAcceso[]>([])
  const [nuevo, setNuevo] = React.useState('')
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [correo, setCorreo] = React.useState('')
  const [nombre, setNombre] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    if (!tienda) return
    setLista(await listarProveedoresAcceso(tienda.id))
  }, [tienda])
  React.useEffect(() => { cargar().catch((x) => setErr(mensajeError(x))) }, [cargar])

  async function hacer(fn: () => Promise<unknown>, msg?: string) {
    setErr(null); setOk(null)
    try { await fn(); await cargar(); if (msg) setOk(msg); return true } catch (x) {
      const m = mensajeError(x)
      setErr(/duplicate|unique/i.test(m) ? 'Ya existe' : m); return false
    }
  }

  const V = vocab.proveedor, VS = vocab.proveedores
  return (
    <Bloque titulo={VS} ayuda={`Quién fabrica o transforma fuera de la tienda. Los correos que añadas podrán entrar a ver solo lo suyo.`}>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault(); if (!tienda || !nuevo.trim()) return
        if (await hacer(() => crearProveedor(tienda.id, nuevo), `${V} cread${gr.o('proveedor')}`)) setNuevo('')
      }}>
        <Input className="h-7" placeholder={`Añadir ${gr.con('proveedor', 'un')}`} value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <Button type="submit" variant="primary" disabled={!nuevo.trim()}>Añadir</Button>
      </form>

      {lista.length === 0 ? <p className="text-fg-3">Todavía no hay {min(VS)}.</p> : (
        <Lista>
          {lista.map((p) => (
            <React.Fragment key={p.id}>
              <FilaLista onClick={() => { setAbierto(abierto === p.id ? null : p.id); setNombre(p.nombre); setCorreo('') }}>
                <span className={p.activo ? 'flex-1 font-medium' : 'flex-1 font-medium text-fg-3'}>{p.nombre}</span>
                {!p.activo && <Tag color="gray">Inactivo</Tag>}
                <span className="text-sm text-fg-3">{p.emails.length === 0 ? 'sin acceso' : `${p.emails.length} ${p.emails.length === 1 ? 'correo' : 'correos'}`}</span>
                <span className="text-fg-3">{abierto === p.id ? '▾' : '▸'}</span>
              </FilaLista>
              {abierto === p.id && (
                <div className="flex flex-col gap-3 bg-bg-2 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Input className="h-7 w-[260px]" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                    <Button size="sm" disabled={!nombre.trim() || nombre === p.nombre} onClick={() => hacer(() => actualizarProveedor(p.id, { nombre: nombre.trim() }), 'Nombre cambiado')}>Renombrar</Button>
                    {rol === 'ADMIN' && <Button size="sm" variant="ghost" asChild><Link to={`/portal?proveedor=${p.id}`}>Ver su portal</Link></Button>}
                    <div className="flex-1" />
                    <Interruptor checked={p.activo} label="Activo" onChange={(v) => hacer(() => actualizarProveedor(p.id, { activo: v }), v ? 'Activado' : `Desactivad${gr.o('proveedor')}: no se le podrán asignar ${min(vocab.encargos)} nuev${gr.o('encargo', true)} ni podrá entrar`)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-fg-3">Correos con acceso</span>
                    {p.emails.map((e) => (
                      <div key={e} className="flex h-7 items-center gap-2">
                        <span className="flex-1">{e}</span>
                        <Button variant="danger" size="sm" onClick={() => hacer(() => quitarCorreoProveedor(p.id, e), 'Correo quitado')}>Quitar</Button>
                      </div>
                    ))}
                    <form className="flex gap-2" onSubmit={async (ev) => {
                      ev.preventDefault()
                      const c = correo.trim()
                      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { setErr('Ese correo no parece válido'); return }
                      if (await hacer(() => anadirCorreoProveedor(p.id, c), 'Correo añadido')) setCorreo('')
                    }}>
                      <Input className="h-7" type="email" placeholder="correo@ejemplo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                      <Button type="submit" size="md" disabled={!correo.trim()}>Añadir correo</Button>
                    </form>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </Lista>
      )}
      <Estado ok={ok} err={err} />
    </Bloque>
  )
}

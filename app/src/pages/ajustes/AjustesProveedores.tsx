import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  anadirCorreoProveedor, listarProveedoresAcceso, quitarCorreoProveedor,
  type ProveedorConAcceso,
} from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { Link } from 'react-router-dom'
import { Button, Input, Tag } from '@/ui'
import { min } from '@/lib/vocab'
import { Bloque, Estado, FilaLista, Lista } from './Ajustes'

/**
 * Ajustes → Proveedores: alta, nombre, activo y correos con acceso a su portal.
 * Un proveedor puede tener varios correos; cada correo solo ve lo de su proveedor.
 */
export function AjustesProveedores() {
  const { tienda, vocab, rol, gr } = useAuth()
  const [lista, setLista] = React.useState<ProveedorConAcceso[]>([])
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [correo, setCorreo] = React.useState('')
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

  const VS = vocab.proveedores
  return (
    <Bloque titulo={`Acceso al portal de ${min(VS)}`} ayuda={<>Los correos que añadas podrán entrar a ver solo lo suyo. Para dar de alta, renombrar o desactivar {gr.con('proveedor', 'un')}, ve a <Link to="/proveedores" className="underline">{VS}</Link>.</>}>

      {lista.length === 0 ? <p className="text-fg-3">Todavía no hay {min(VS)}. <Link to="/proveedores" className="underline">Añadir</Link></p> : (
        <Lista>
          {lista.map((p) => (
            <React.Fragment key={p.id}>
              <FilaLista onClick={() => { setAbierto(abierto === p.id ? null : p.id); setCorreo('') }}>
                <span className={p.activo ? 'flex-1 font-medium' : 'flex-1 font-medium text-fg-3'}>{p.nombre}</span>
                {!p.activo && <Tag color="gray">Inactiv{gr.o('proveedor')}</Tag>}
                <span className="text-sm text-fg-3">{p.emails.length === 0 ? 'sin acceso' : `${p.emails.length} ${p.emails.length === 1 ? 'correo' : 'correos'}`}</span>
                <span className="text-fg-3">{abierto === p.id ? '▾' : '▸'}</span>
              </FilaLista>
              {abierto === p.id && (
                <div className="flex flex-col gap-3 bg-bg-2 px-3 py-3">
                  <div className="flex items-center gap-2">
                    {!p.activo && <span className="text-sm text-warn-fg">Inactiv{gr.o('proveedor')}: sus correos no pueden entrar hasta que se active en {VS}.</span>}
                    <div className="flex-1" />
                    {rol === 'ADMIN' && <Button size="sm" variant="ghost" asChild><Link to={`/portal?proveedor=${p.id}`}>Ver su portal</Link></Button>}
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

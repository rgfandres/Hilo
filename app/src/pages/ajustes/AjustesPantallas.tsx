import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { guardarTienda } from '@/data/ajustes'
import { mensajeError } from '@/data/encargos'
import { ajustesHoja } from '@/data/produccion'
import { PANTALLAS, PAPELES_CONFIGURABLES, type Pantalla } from '@/lib/pantallas'
import type { Rol } from '@/lib/types'
import { min } from '@/lib/vocab'
import { BarraGuardar, Interruptor, Pagina } from './Ajustes'

/** Ajustes → Qué ve cada papel: pantallas del menú (y de la barra del móvil) por papel. */
export function AjustesPantallas() {
  const { tienda, recargar, vocab, nombresRol } = useAuth()
  const aj = React.useMemo(() => (tienda?.ajustes ?? {}) as Record<string, unknown>, [tienda?.ajustes])
  const inicial = React.useMemo(() => ((aj.pantallas ?? {}) as Partial<Record<Rol, Pantalla[]>>), [aj])
  const [cfg, setCfg] = React.useState(inicial)
  const [busy, setBusy] = React.useState(false)
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => setCfg(inicial), [inicial])
  const sucio = JSON.stringify(cfg) !== JSON.stringify(inicial)
  const nombre: Record<Pantalla, string> = {
    parahoy: 'Para hoy', encargos: `${vocab.encargos} (la lista)`, nuevo: `${vocab.encargo} nuevo`, clientes: vocab.clientes, productos: vocab.productos,
    proveedores: vocab.proveedores, logistica: 'Pantalla de logística', produccion: ajustesHoja(aj).nombre, materiales: vocab.materiales, pedidos: `Pedidos de ${min(vocab.material)}`, informes: 'Informes',
  }
  // Lo de siempre para cada papel, como punto de partida al personalizar
  const deSiempre = (r: Rol): Pantalla[] => r === 'LOGISTICA' ? ['logistica', 'parahoy', 'encargos', 'clientes', 'productos', 'proveedores']
    : r === 'ATENCION' ? ['parahoy', 'encargos', 'nuevo', 'clientes', 'productos', 'proveedores', 'produccion', 'materiales', 'pedidos']
    : ['parahoy', 'encargos', 'nuevo', 'clientes', 'productos', 'proveedores', 'logistica', 'produccion', 'materiales', 'pedidos']
  const toggle = (r: Rol, k: Pantalla, v: boolean) => setCfg((c) => { const l = c[r] ?? []; return { ...c, [r]: v ? [...l, k] : l.filter((x) => x !== k) } })

  async function guardar() {
    if (!tienda) return
    if (PAPELES_CONFIGURABLES.some((r) => cfg[r] && !cfg[r]!.length)) { setErr('Cada papel tiene que ver al menos una pantalla'); return }
    setBusy(true); setErr(null); setOk(null)
    try {
      const limpio = Object.fromEntries(Object.entries(cfg).filter(([, v]) => Array.isArray(v)))
      await guardarTienda(tienda.id, tienda.nombre, { ...aj, pantallas: Object.keys(limpio).length ? limpio : null })
      await recargar(); setOk('Guardado')
    } catch (x) { setErr(mensajeError(x)) } finally { setBusy(false) }
  }

  return (
    <>
      <Pagina titulo="Qué ve cada papel" ayuda="Las pantallas del menú (y de la barra del móvil) de cada papel, Administración lo ve todo. El nombre de cada menú se cambia en Nombres."
        mas="Solo cambia lo que se ve en el menú y a dónde se puede entrar; lo que cada papel puede hacer lo marcan sus permisos. Las fichas sueltas (un encargo, un cliente) se pueden abrir siempre desde un enlace. Los tipos con menú propio se renombran en Tipos y etapas → Renombrar." />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left font-medium text-fg-3">Pantalla</th>
              {PAPELES_CONFIGURABLES.map((r) => (
                <th key={r} className="p-2 text-left align-top font-medium">
                  <div className="flex flex-col gap-1">
                    <span>{nombresRol[r as keyof typeof nombresRol] ?? r}</span>
                    <Interruptor checked={!!cfg[r]} onChange={(v) => setCfg((c) => { const n = { ...c }; if (v) n[r] = deSiempre(r); else delete n[r]; return n })}
                      label={cfg[r] ? 'A medida' : 'Lo de siempre'} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PANTALLAS.map((p) => (
              <tr key={p.k} className="border-t border-border-light">
                <td className="p-2">{nombre[p.k]}</td>
                {PAPELES_CONFIGURABLES.map((r) => (
                  <td key={r} className="p-2">
                    {cfg[r]
                      ? <input type="checkbox" className="accent-gray-12" aria-label={`${nombre[p.k]} para ${r}`} checked={cfg[r]!.includes(p.k)} onChange={(e) => toggle(r, p.k, e.target.checked)} />
                      : <span className="text-fg-3">{deSiempre(r).includes(p.k) ? '✓' : '—'}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BarraGuardar sucio={sucio} busy={busy} ok={ok} err={err} onGuardar={guardar} onDescartar={() => { setCfg(inicial); setErr(null) }} />
    </>
  )
}

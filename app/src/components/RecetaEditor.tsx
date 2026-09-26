import { IconTrash } from '@tabler/icons-react'
import { nuevoComponente, valoresActivos, type Componente, type ListaTienda } from '@/data/listas'
import type { Campo } from '@/data/config'
import { Button, Input, Select } from '@/ui'

/**
 * Receta de un producto: qué lleva (componentes), de qué lista sale cada uno,
 * si lo elige el cliente o es fijo, y reglas «según la variante del material» (p. ej. un acabado según el color del material).
 */
export function RecetaEditor({ value, onChange, listas, variantes, etiquetaVariante, campos, etiquetaComplementos, encargo, producto, soloLectura }: {
  value: Componente[]; onChange: (v: Componente[]) => void; listas: ListaTienda[]
  variantes: string[]; etiquetaVariante: string | null; campos: Campo[]; etiquetaComplementos: string
  encargo: string; producto: string; soloLectura: boolean
}) {
  const set = (i: number, p: Partial<Componente>) => onChange(value.map((c, j) => j === i ? { ...c, ...p } : c))
  const listId = `var-receta`
  return (
    <div className="flex flex-col gap-2">
      <datalist id={listId}>{variantes.map((v) => <option key={v} value={v} />)}</datalist>
      {value.length === 0 && <span className="text-sm text-fg-3">Sin componentes. Añade lo que lleva (piezas, acabados…) y al tomar {encargo} se propone solo.</span>}
      {value.map((c, i) => {
        const lista = c.lista_id ? listas.find((l) => l.id === c.lista_id) : undefined
        const opciones = lista ? valoresActivos(lista, c.valor) : []
        const valor = (v: string, on: (x: string) => void, ph: string) => lista
          ? <Select className="h-7" disabled={soloLectura} value={v} onChange={(e) => on(e.target.value)}>
              <option value="">{ph}</option>
              {[...new Set([...opciones, ...(v ? [v] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          : <Input className="h-7" disabled={soloLectura} placeholder={ph} value={v} onChange={(e) => on(e.target.value)} />
        const reglas = c.segun_variante ?? []
        return (
          <div key={c.id} className="flex flex-col gap-2 rounded-md border border-border p-2.5">
            <div className="flex items-center gap-2">
              <Input className="h-7 flex-1 font-medium" disabled={soloLectura} placeholder="Componente (p. ej. Acabado)" value={c.nombre}
                onChange={(e) => set(i, { nombre: e.target.value })} aria-label="Nombre del componente" />
              {!soloLectura && <button aria-label="Quitar componente" className="px-1 text-fg-3 hover:text-danger-fg" onClick={() => onChange(value.filter((_, j) => j !== i))}><IconTrash size={14} /></button>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-fg-2">
              <label className="flex flex-col gap-1">Sale de
                <Select className="h-7" disabled={soloLectura} value={c.lista_id ?? ''} onChange={(e) => set(i, { lista_id: e.target.value || null })}>
                  <option value="">Texto libre</option>
                  {listas.map((l) => <option key={l.id} value={l.id}>Lista «{l.nombre}»</option>)}
                </Select>
              </label>
              <label className="flex flex-col gap-1">Quién lo decide
                <Select className="h-7" disabled={soloLectura} value={c.decide} onChange={(e) => set(i, { decide: e.target.value as Componente['decide'] })}>
                  <option value="cliente">Se elige en cada {encargo}</option>
                  <option value="fijo">Fijo ({producto})</option>
                </Select>
              </label>
              {c.decide === 'fijo' && <label className="flex flex-col gap-1">Valor{valor(c.valor ?? '', (x) => set(i, { valor: x }), '—')}</label>}
              <label className="flex flex-col gap-1">Cantidad
                <Input className="h-7" disabled={soloLectura} placeholder="Opcional (p. ej. 3 m)" value={c.cantidad ?? ''} onChange={(e) => set(i, { cantidad: e.target.value })} />
              </label>
              <label className="col-span-2 flex flex-col gap-1">Se guarda en
                <Select className="h-7" disabled={soloLectura} value={c.campo ?? ''} onChange={(e) => set(i, { campo: e.target.value || null })}>
                  <option value="">{etiquetaComplementos}</option>
                  {campos.filter((x) => x.tipo === 'texto' || x.tipo === 'opcion').map((x) => <option key={x.clave} value={x.clave}>{x.etiqueta}</option>)}
                </Select>
              </label>
            </div>
            {etiquetaVariante && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-fg-2">Según {etiquetaVariante.toLowerCase()} {reglas.length === 0 && <span className="text-fg-3">(opcional: propone un valor distinto según {etiquetaVariante.toLowerCase()})</span>}</span>
                {reglas.map((r, k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <Input className="h-7 flex-1" list={listId} disabled={soloLectura} placeholder={etiquetaVariante} value={r.variante}
                      onChange={(e) => set(i, { segun_variante: reglas.map((x, j) => j === k ? { ...x, variante: e.target.value } : x) })} />
                    <span className="text-fg-3">→</span>
                    <div className="flex-1">{valor(r.valor, (x) => set(i, { segun_variante: reglas.map((y, j) => j === k ? { ...y, valor: x } : y) }), '—')}</div>
                    {!soloLectura && <button aria-label="Quitar regla" className="text-fg-3 hover:text-danger-fg" onClick={() => set(i, { segun_variante: reglas.filter((_, j) => j !== k) })}><IconTrash size={13} /></button>}
                  </div>
                ))}
                {!soloLectura && <button className="self-start text-sm text-fg-2 underline" onClick={() => set(i, { segun_variante: [...reglas, { variante: '', valor: '' }] })}>+ Regla según {etiquetaVariante.toLowerCase()}</button>}
              </div>
            )}
          </div>
        )
      })}
      {!soloLectura && <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange([...value, nuevoComponente()])}>+ Añadir componente</Button>}
    </div>
  )
}

/** Quita componentes vacíos y reglas incompletas antes de guardar */
export function limpiarReceta(cs: Componente[]): Componente[] {
  return cs.filter((c) => c.nombre.trim()).map((c) => ({
    ...c, nombre: c.nombre.trim(), valor: c.decide === 'fijo' ? (c.valor ?? '').trim() : '', cantidad: (c.cantidad ?? '').trim(),
    segun_variante: (c.segun_variante ?? []).map((r) => ({ variante: r.variante.trim(), valor: r.valor.trim() })).filter((r) => r.variante && r.valor),
  }))
}

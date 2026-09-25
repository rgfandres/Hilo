import * as React from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { listarPeriodos } from '@/data/ajustes'
import { camposDe, plantillas, type PlantillaCampos } from '@/data/config'
import { mensajeError } from '@/data/encargos'
import { listarMateriales } from '@/data/materiales'
import { ajustesFicha } from '@/data/catalogos'
import { Button, Select } from '@/ui'
import { num3 } from '@/lib/utils'
import { min } from '@/lib/vocab'
import type { EncargoEstado } from '@/lib/types'
import { Bloque, Estado, Lista, FilaLista, Pagina } from './Ajustes'

type Fila = Record<string, unknown>

/** CSV que Excel abre bien en España: separador «;», BOM y todo entre comillas si hace falta */
function csv(cabecera: string[], filas: unknown[][]): string {
  const c = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabecera, ...filas].map((f) => f.map(c).join(';')).join('\r\n')
}
function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const fecha = (s: unknown) => (s ? new Date(String(s)).toLocaleDateString('es-ES') : '')
const valor = (v: unknown) => (v == null ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v)
const archivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_')

/**
 * Ajustes → Exportar datos: bajar a Excel (CSV) los encargos de un periodo, los clientes y los
 * catálogos, para guardarlos o reutilizarlos. Solo lee: no cambia nada.
 */
export function AjustesExportar() {
  const { tienda, vocab, periodo } = useAuth()
  const [periodos, setPeriodos] = React.useState<{ id: string; nombre: string }[]>([])
  const [per, setPer] = React.useState(periodo?.id ?? '')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => { if (tienda) listarPeriodos(tienda.id).then((ps) => setPeriodos(ps as { id: string; nombre: string }[])).catch(() => {}) }, [tienda])
  React.useEffect(() => { if (!per && periodo) setPer(periodo.id) }, [periodo, per])
  const tn = tienda ? archivo(tienda.nombre) : 'tienda'

  async function hacer(clave: string, fn: () => Promise<number>) {
    setBusy(clave); setErr(null); setOk(null)
    try { const n = await fn(); setOk(`Descargado: ${n} fila${n === 1 ? '' : 's'}`) } catch (e) { setErr(mensajeError(e)) } finally { setBusy(null) }
  }

  const encargos = () => hacer('encargos', async () => {
    if (!tienda) return 0
    const [{ data: es, error }, ps, tipos, clientes] = await Promise.all([
      supabase.from('v_encargo_estado').select('*').eq('tienda_id', tienda.id).eq('periodo_id', per).order('numero'),
      plantillas(tienda.id),
      supabase.from('tipo_encargo').select('id,nombre').eq('tienda_id', tienda.id),
      supabase.from('cliente').select('id,telefono,email').eq('tienda_id', tienda.id),
    ])
    if (error) throw error
    const filas = (es ?? []) as (EncargoEstado & { serie?: string })[]
    const tipo = new Map((tipos.data ?? []).map((t: Fila) => [t.id as string, t.nombre as string]))
    const cli = new Map((clientes.data ?? []).map((c: Fila) => [c.id as string, c]))
    // Columnas de datos: las de todos los tipos que salen en el periodo, sin repetir
    const vistos = new Set<string>()
    const campos = [...new Set(filas.map((e) => e.tipo_encargo_id))].flatMap((t) => camposDe(ps as PlantillaCampos[], 'ENCARGO', t))
      .filter((c) => (vistos.has(c.clave) ? false : (vistos.add(c.clave), true)))
    const cab = ['Nº', 'Tipo', 'Estado', 'Etapa', vocab.cliente, 'Teléfono', 'Correo', vocab.producto, vocab.proveedor, 'Importe', 'A cuenta', ajustesFicha(tienda.ajustes as Record<string, unknown>).etiqueta, 'Creado', ...campos.map((c) => c.etiqueta)]
    const out = filas.map((e) => {
      const c = cli.get(e.cliente_id) ?? {}
      return [num3(e), tipo.get(e.tipo_encargo_id) ?? '', e.estado === 'ANULADO' ? 'Anulado' : 'Activo', e.etapa_actual_nombre ?? '', e.cliente_nombre ?? '',
        c.telefono ?? '', c.email ?? '', e.producto_nombre ?? '', e.proveedor_nombre ?? '', e.importe ?? '', e.a_cuenta || '', e.complementos ?? '', fecha(e.creado_en),
        ...campos.map((k) => (k.tipo === 'fecha' ? fecha(e.datos?.[k.clave]) : valor(e.datos?.[k.clave])))]
    })
    const nombre = periodos.find((p) => p.id === per)?.nombre ?? min(vocab.periodo)
    descargar(`${tn}_${archivo(vocab.encargos)}_${archivo(nombre)}.csv`, csv(cab, out))
    return out.length
  })

  const clientes = () => hacer('clientes', async () => {
    if (!tienda) return 0
    const [{ data, error }, ps] = await Promise.all([
      supabase.from('cliente').select('nombre,telefono,email,notas,datos,creado_en').eq('tienda_id', tienda.id).order('nombre'),
      plantillas(tienda.id),
    ])
    if (error) throw error
    const campos = camposDe(ps as PlantillaCampos[], 'CLIENTE')
    const out = (data ?? []).map((c: Fila) => [c.nombre, c.telefono, c.email, c.notas, fecha(c.creado_en), ...campos.map((k) => valor((c.datos as Fila | null)?.[k.clave]))])
    descargar(`${tn}_${archivo(vocab.clientes)}.csv`, csv(['Nombre', 'Teléfono', 'Correo', 'Notas', 'Alta', ...campos.map((k) => k.etiqueta + (k.unidad ? ` (${k.unidad})` : ''))], out))
    return out.length
  })

  const productos = () => hacer('productos', async () => {
    if (!tienda) return 0
    const { data, error } = await supabase.from('producto').select('nombre,precio_base,material_tipo,consumo,activo').eq('tienda_id', tienda.id).order('nombre')
    if (error) throw error
    const out = (data ?? []).map((p: Fila) => [p.nombre, p.precio_base, p.material_tipo, p.consumo, p.activo ? 'Sí' : 'No'])
    descargar(`${tn}_${archivo(vocab.productos)}.csv`, csv(['Nombre', 'Precio', `Tipo de ${vocab.material.toLowerCase()}`, 'Consumo', 'Activo'], out))
    return out.length
  })

  const proveedores = () => hacer('proveedores', async () => {
    if (!tienda) return 0
    const { data, error } = await supabase.from('proveedor').select('nombre,tipo,telefono,email_contacto,unidad_pedido,notas,activo').eq('tienda_id', tienda.id).order('nombre')
    if (error) throw error
    const tipo = (t: unknown) => (t === 'MATERIAL' ? `Vende ${vocab.material.toLowerCase()}` : t === 'AMBOS' ? 'Las dos cosas' : `Hace ${vocab.encargos.toLowerCase()}`)
    const out = (data ?? []).map((p: Fila) => [p.nombre, tipo(p.tipo), p.telefono, p.email_contacto, p.unidad_pedido, p.notas, p.activo ? 'Sí' : 'No'])
    descargar(`${tn}_${archivo(vocab.proveedores)}.csv`, csv(['Nombre', 'Qué hace', 'Teléfono', 'Correo', 'Unidad de pedido', 'Notas', 'Activo'], out))
    return out.length
  })

  const materiales = () => hacer('materiales', async () => {
    if (!tienda) return 0
    const ms = await listarMateriales(tienda.id)
    const out = ms.map((m) => [m.tipo, m.variante, m.proveedor_nombre, Number(m.stock), m.unidad, Number(m.demanda) || '', Number(m.en_camino) || '', m.umbral_efectivo, Number(m.restos) || '', m.ubicacion, m.activo ? 'Sí' : 'No'])
    descargar(`${tn}_${archivo(vocab.materiales)}.csv`, csv(['Tipo', 'Variante', 'Proveedor', 'Stock', 'Unidad', 'Necesario', 'En camino', 'Umbral', 'En restos', 'Ubicación', 'Activo'], out))
    return out.length
  })

  const mod = ((tienda?.ajustes as Fila | undefined)?.modulos as Record<string, boolean> | undefined)?.materiales === true
  const fila = (clave: string, titulo: string, ayuda: string, fn: () => void, extra?: React.ReactNode) => (
    <FilaLista>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{titulo}</span>
        <span className="text-sm text-fg-3">{ayuda}</span>
      </div>
      {extra}
      <Button variant="ghost" disabled={!!busy} onClick={fn}>{busy === clave ? 'Preparando…' : 'Descargar'}</Button>
    </FilaLista>
  )
  return (
    <>
      <Pagina titulo="Exportar datos" ayuda="Descarga tus datos en un archivo que abre Excel (o Google Sheets). Solo se leen: no cambia nada." />
      <Bloque titulo="Qué quieres descargar">
        <Lista>
          {fila('encargos', `${vocab.encargos} de un periodo`, 'Con su etapa, cliente, fechas y todos los datos que guardáis, anulados incluidos.', encargos,
            <Select className="w-[200px]" value={per} onChange={(e) => setPer(e.target.value)} aria-label={vocab.periodo}>
              {periodos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>)}
          {fila('clientes', vocab.clientes, 'Nombre, contacto y medidas.', clientes)}
          {fila('productos', vocab.productos, 'El catálogo con precio y consumo.', productos)}
          {fila('proveedores', vocab.proveedores, 'Con teléfono, correo y qué hace cada uno.', proveedores)}
          {mod && fila('materiales', vocab.materiales, 'Stock de hoy, lo necesario, lo que está en camino y los restos.', materiales)}
        </Lista>
        <Estado ok={ok} err={err} />
      </Bloque>
    </>
  )
}

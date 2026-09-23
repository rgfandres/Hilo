import * as React from 'react'
import { Button, Tag, Tabs, Table, Th, Td, Tr, GroupRow, FilterChip, Segmented, UndoBar, Field, SectionLabel, Input } from '@/ui'

/** Guía viva del design system. Sin sesión: /demo */
export function Demo() {
  const [tab, setTab] = React.useState('todos')
  const [seg, setSeg] = React.useState('llevar')
  const [undo, setUndo] = React.useState(true)
  return (
    <div className="flex h-full bg-bg">
      <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-border bg-bg-3 p-2 pt-3">
        <div className="mb-2 flex h-7 items-center gap-2 px-2"><span className="h-4 w-4 rounded-sm bg-inverted" /><span className="font-semibold">Tienda demo</span></div>
        <div className="mb-2 flex h-7 items-center gap-2 rounded-sm border border-border bg-bg px-2 text-fg-3">Buscar<span className="ml-auto text-xs">⌘K</span></div>
        {['Para hoy', 'Encargos', 'Clientes', 'Productos', 'Proveedores'].map((x, i) => (
          <div key={x} className={'flex h-7 items-center rounded-sm px-2 font-medium ' + (i === 1 ? 'bg-gray-5' : '')}>{x}</div>
        ))}
      </nav>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 items-center gap-3 border-b border-border px-4">
          <span className="font-medium">Design system</span><span className="text-fg-3">guía viva</span>
          <div className="flex-1" /><Button variant="ghost">Filtro</Button><Button variant="primary">+ Encargo</Button>
        </header>
        <Tabs value={tab} onChange={setTab} items={[
          { key: 'todos', label: 'Todos', count: 41 }, { key: 'mat', label: 'Esperando material', count: 7 },
          { key: 'prov', label: 'En proveedor', count: 18 }, { key: 'rev', label: 'Revisar', count: 3, tone: 'danger' },
        ]} />
        <div className="flex h-9 items-center gap-1.5 border-b border-border-light px-4">
          <FilterChip field="Canal" value="Tienda" onRemove={() => {}} />
          <FilterChip field="Producto" value="Aro, Colgante" onRemove={() => {}} />
          <Button variant="ghost" size="sm">+ Añadir filtro</Button>
          <span className="ml-auto text-sm text-fg-3">14 de 41</span>
        </div>
        <div className="overflow-auto">
          <Table>
            <thead><tr><Th className="w-10">Nº</Th><Th className="w-[190px]">Cliente</Th><Th className="w-[110px]">Producto</Th><Th className="w-12">Medida</Th><Th className="w-[170px]">Etapa</Th><Th className="w-[110px]">Proveedor</Th><Th>Siguiente</Th></tr></thead>
            <tbody>
              <GroupRow colSpan={7}>NORTE <span className="ml-1.5 text-fg-3">3</span></GroupRow>
              <Tr><Td className="text-fg-3 tabular">037</Td><Td className="font-medium">Julia Romero</Td><Td>ARO</Td><Td>40</Td><Td><Tag color="red">Incidencia</Tag></Td><Td>NORTE</Td><Td><Button size="sm">Revisar</Button></Td></Tr>
              <Tr><Td className="text-fg-3 tabular">033</Td><Td className="font-medium">Marta Ruiz</Td><Td>ARO</Td><Td>38</Td><Td><Tag color="purple">En proveedor</Tag></Td><Td>NORTE</Td><Td><Button size="sm">Recibido del proveedor</Button></Td></Tr>
              <Tr><Td className="text-fg-3 tabular">038</Td><Td className="font-medium">Rocío Gálvez</Td><Td>COLGANTE</Td><Td>36</Td><Td><Tag color="blue">Enviado a preparar</Tag></Td><Td>NORTE</Td><Td><Button size="sm">Recogido de preparación</Button></Td></Tr>
              <GroupRow colSpan={7}>Sin proveedor <span className="ml-1.5 text-fg-3">2</span></GroupRow>
              <Tr><Td className="text-fg-3 tabular">040</Td><Td className="font-medium">Inés Carmona</Td><Td>ARO</Td><Td>44</Td><Td><Tag color="amber">Esperando material</Tag></Td><Td className="text-fg-3">—</Td><Td><Button size="sm">Material recibido</Button></Td></Tr>
              <Tr><Td className="text-fg-3 tabular">035</Td><Td className="font-medium">Paula Moreno</Td><Td>ARO</Td><Td>40</Td><Td><Tag color="green">En tienda</Tag></Td><Td className="text-fg-3">—</Td><Td><Button size="sm">Entregar</Button></Td></Tr>
            </tbody>
          </Table>
        </div>

        <div className="grid grid-cols-[380px_1fr] gap-0 border-t border-border">
          <div className="flex flex-col gap-4 border-r border-border p-5">
            <SectionLabel>Página de registro</SectionLabel>
            <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-2 p-3">
              <span className="text-sm text-fg-2">Siguiente paso</span><span className="font-medium">Recogido de preparación</span>
              <span className="text-sm text-danger-fg">Antes hay que resolver la incidencia.</span>
              <div className="flex gap-1.5"><Button>Incidencia</Button><Button variant="primary">Marcar recogido</Button></div>
            </div>
            <div><Field label="Producto">ARO</Field><Field label="Medida">40</Field><Field label="Acabado">Oro rosa</Field><Field label="Proveedor">NORTE</Field></div>
            <div className="flex flex-col gap-1"><SectionLabel>Añadir comentario</SectionLabel><Input placeholder="Escribe algo para el equipo…" /></div>
            <div className="flex gap-2"><Button variant="danger">Anular encargo</Button><Button variant="ghost">Cancelar</Button></div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <SectionLabel>Móvil</SectionLabel>
            <div className="w-[350px] rounded-lg border border-border p-4">
              <h1 className="m-0 mb-3 text-xl font-semibold tracking-tight">Llevar al proveedor <span className="font-normal text-fg-3">3</span></h1>
              <Segmented value={seg} onChange={setSeg} items={[{ key: 'recoger', label: 'Recoger', count: 4 }, { key: 'revisar', label: 'Revisar', count: 2 }, { key: 'llevar', label: 'Llevar', count: 3 }]} />
              <div className="mt-3 flex flex-col gap-2.5 border-b border-border py-3.5">
                <div className="flex items-baseline gap-2.5"><span className="text-base text-fg-3 tabular">039</span><span className="flex-1 text-md font-semibold">Elena Castro</span><span className="text-base text-fg-2">NORTE</span></div>
                <div className="text-md text-fg-2">ARO · medida 42 · plata</div>
                <Button variant="armed" size="touch">¿Confirmar? Llevado a NORTE</Button>
              </div>
              <div className="flex flex-col gap-2.5 py-3.5">
                <div className="flex items-baseline gap-2.5"><span className="text-base text-fg-3 tabular">043</span><span className="flex-1 text-md font-semibold">Teresa Núñez</span><span className="text-base text-fg-2">SUR</span></div>
                <div className="text-md text-fg-2">COLGANTE · medida 38 · oro</div>
                <Button size="touch">Llevado al proveedor</Button>
              </div>
              {undo && <UndoBar className="mt-2" message="038 llevado a NORTE" onUndo={() => setUndo(false)} onExpire={() => setUndo(false)} />}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

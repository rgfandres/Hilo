import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { AvisosProvider } from '@/ui/Avisos'
import { AppShell } from '@/layout/AppShell'
import { Login, NuevaContrasena, SinAcceso } from '@/pages/Login'
import { ControlSeguridad } from '@/components/Seguridad'
import { AjustesSeguridad } from '@/pages/ajustes/AjustesSeguridad'
import { AjustesCuenta } from '@/pages/ajustes/AjustesCuenta'
import { NuevaTienda } from '@/pages/NuevaTienda'
import { ParaHoy } from '@/pages/ParaHoy'
import { Encargos } from '@/pages/Encargos'
import { Encargo } from '@/pages/Encargo'
import { NuevoEncargo } from '@/pages/NuevoEncargo'
import { Informes } from '@/pages/Informes'
import { Demo } from '@/pages/Demo'
import { Invitacion } from '@/pages/Invitacion'
import { Portal } from '@/pages/Portal'
import { Productos } from '@/pages/Productos'
import { Clientes, Cliente } from '@/pages/Clientes'
import { Proveedores, Proveedor } from '@/pages/Proveedores'
import { Ajustes, AjustesInicio } from '@/pages/ajustes/Ajustes'
import { AjustesTienda } from '@/pages/ajustes/AjustesTienda'
import { AjustesEquipo } from '@/pages/ajustes/AjustesEquipo'
import { AjustesProveedores } from '@/pages/ajustes/AjustesProveedores'
import { AjustesFlujos } from '@/pages/ajustes/AjustesFlujos'
import { AjustesCampos } from '@/pages/ajustes/AjustesCampos'
import { AjustesPeriodos } from '@/pages/ajustes/AjustesPeriodos'
import { AjustesMensajes } from '@/pages/ajustes/AjustesMensajes'
import { AjustesFicha } from '@/pages/ajustes/AjustesFicha'

function Gate() {
  const { loading, session, tienda, rol, esProveedor, fase, recuperando } = useAuth()
  if (window.location.pathname === '/demo') return <Demo />
  if (window.location.pathname.startsWith('/invitacion/') && !loading) {
    return <Routes><Route path="/invitacion/:token" element={<Invitacion />} /></Routes>
  }
  if (loading) return <div className="flex h-full items-center justify-center text-fg-3" role="status">{fase}</div>
  if (!session) return <Login />
  if (recuperando) return <NuevaContrasena />
  if (window.location.pathname === '/nueva-tienda') return <NuevaTienda />
  if (!tienda) return <SinAcceso />
  // Proveedor externo: solo su portal
  if (!rol && esProveedor) return <Portal />
  if (!rol) return <SinAcceso />
  return (
    <ControlSeguridad>
    {/* key: al cambiar de tienda todo se monta de nuevo y se descartan las cargas en vuelo de la anterior */}
    <Routes key={tienda.id}>
      <Route path="portal" element={<Portal />} />
      <Route element={<AppShell />}>
        <Route index element={rol === 'LOGISTICA' ? <Navigate to="/encargos?b=mio" replace /> : <ParaHoy />} />
        <Route path="para-hoy" element={<ParaHoy />} />
        <Route path="encargos" element={<Encargos />} />
        <Route path="encargos/nuevo" element={rol === 'LOGISTICA' ? <Navigate to="/encargos" replace /> : <NuevoEncargo />} />
        <Route path="encargos/:id" element={<Encargo />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<Cliente />} />
        <Route path="productos" element={<Productos />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="proveedores/:id" element={<Proveedor />} />
        <Route path="informes" element={<Informes />} />
        <Route path="ajustes" element={<Ajustes />}>
          <Route index element={<AjustesInicio />} />
          <Route path="tienda" element={<AjustesTienda />} />
          <Route path="equipo" element={<AjustesEquipo />} />
          <Route path="proveedores" element={<AjustesProveedores />} />
          <Route path="flujos" element={<AjustesFlujos />} />
          <Route path="campos" element={<AjustesCampos />} />
          <Route path="periodos" element={<AjustesPeriodos />} />
          <Route path="mensajes" element={<AjustesMensajes />} />
          <Route path="ficha" element={<AjustesFicha />} />
          <Route path="seguridad" element={<AjustesSeguridad />} />
          <Route path="cuenta" element={<AjustesCuenta />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </ControlSeguridad>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AvisosProvider>
          <Gate />
        </AvisosProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

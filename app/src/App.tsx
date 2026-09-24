import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
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
import { Materiales } from '@/pages/Materiales'
import { Produccion } from '@/pages/Produccion'
import { Logistica } from '@/pages/Logistica'
import { AjustesGuia } from '@/pages/ajustes/AjustesGuia'
import { ajustesLogistica } from '@/data/logistica'
import { Ajustes, AjustesInicio } from '@/pages/ajustes/Ajustes'
import { AjustesTienda, AjustesRegion, AjustesPalabras, AjustesPapeles, AjustesReglas, AjustesModulos, AjustesMateriales, AjustesHoja, AjustesLogistica, AjustesFichaTecnica } from '@/pages/ajustes/AjustesTienda'
import { AjustesEquipo } from '@/pages/ajustes/AjustesEquipo'
import { AjustesProveedores } from '@/pages/ajustes/AjustesProveedores'
import { AjustesFlujos } from '@/pages/ajustes/AjustesFlujos'
import { AjustesBandejas } from '@/pages/ajustes/AjustesBandejas'
import { AjustesPantallas } from '@/pages/ajustes/AjustesPantallas'
import { AjustesCampos } from '@/pages/ajustes/AjustesCampos'
import { AjustesPeriodos } from '@/pages/ajustes/AjustesPeriodos'
import { AjustesMensajes } from '@/pages/ajustes/AjustesMensajes'
import { AjustesFicha } from '@/pages/ajustes/AjustesFicha'
import { AjustesImportar } from '@/pages/ajustes/AjustesImportar'
import { AjustesAsistente } from '@/pages/ajustes/AjustesAsistente'

function Gate() {
  const { avisoInvitacion, cerrarAvisoInvitacion } = useAuth()
  return (
    <>
      {avisoInvitacion && (
        <div role="alert" className="fixed left-1/2 top-3 z-[70] flex w-[480px] max-w-[calc(100vw-24px)] -translate-x-1/2 items-start gap-2 rounded-md border border-border bg-warn-bg px-3 py-2 text-sm text-warn-fg shadow-strong">
          <span className="flex-1"><b>No se ha podido aceptar la invitación:</b> {avisoInvitacion}</span>
          <button className="underline" onClick={cerrarAvisoInvitacion}>Cerrar</button>
        </div>
      )}
      <Pantallas />
    </>
  )
}

function Pantallas() {
  const { loading, session, tienda, rol, esProveedor, fase, recuperando } = useAuth()
  const { pathname } = useLocation()
  const conLogistica = ajustesLogistica(tienda?.ajustes as Record<string, unknown>).activo
  if (pathname === '/demo') return <Demo />
  if (pathname.startsWith('/invitacion/') && !loading) {
    return <Routes><Route path="/invitacion/:token" element={<Invitacion />} /></Routes>
  }
  if (loading) return <div className="flex h-full items-center justify-center text-fg-3" role="status">{fase}</div>
  if (!session) return <Login />
  if (recuperando) return <NuevaContrasena />
  if (pathname === '/nueva-tienda') return <NuevaTienda />
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
        <Route index element={rol === 'LOGISTICA' ? <Navigate to={conLogistica ? '/logistica' : '/encargos?b=mio'} replace /> : <ParaHoy />} />
        <Route path="logistica" element={rol === 'ATENCION' ? <Navigate to="/" replace /> : <Logistica />} />
        <Route path="para-hoy" element={<ParaHoy />} />
        <Route path="encargos" element={<Encargos />} />
        <Route path="encargos/nuevo" element={rol === 'LOGISTICA' ? <Navigate to="/encargos" replace /> : <NuevoEncargo />} />
        <Route path="encargos/:id" element={<EncargoPorId />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<Cliente />} />
        <Route path="productos" element={<Productos />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="proveedores/:id" element={<Proveedor />} />
        <Route path="materiales" element={rol === 'LOGISTICA' ? <Navigate to="/" replace /> : <Materiales />} />
        <Route path="pedidos" element={rol === 'LOGISTICA' ? <Navigate to="/" replace /> : <Materiales soloPedidos />} />
        <Route path="produccion" element={rol === 'LOGISTICA' ? <Navigate to="/" replace /> : <Produccion />} />
        <Route path="informes" element={rol === 'ADMIN' ? <Informes /> : <Navigate to="/" replace />} />
        <Route path="ajustes" element={<Ajustes />}>
          <Route index element={<AjustesInicio />} />
          <Route path="tienda" element={<AjustesTienda />} />
          <Route path="region" element={<AjustesRegion />} />
          <Route path="palabras" element={<AjustesPalabras />} />
          <Route path="papeles" element={<AjustesPapeles />} />
          <Route path="reglas" element={<AjustesReglas />} />
          <Route path="modulos" element={<AjustesModulos />} />
          <Route path="importar" element={<AjustesImportar />} />
          <Route path="asistente" element={rol === 'ADMIN' ? <AjustesAsistente /> : <Navigate to="/ajustes" replace />} />
          <Route path="materiales" element={<AjustesMateriales />} />
          <Route path="hoja" element={<AjustesHoja />} />
          <Route path="logistica" element={<AjustesLogistica />} />
          <Route path="ficha-tecnica" element={<AjustesFichaTecnica />} />
          <Route path="equipo" element={<AjustesEquipo />} />
          <Route path="proveedores" element={<AjustesProveedores />} />
          <Route path="flujos" element={<AjustesFlujos />} />
          <Route path="bandejas" element={<AjustesBandejas />} />
          <Route path="pantallas" element={<AjustesPantallas />} />
          <Route path="campos" element={<AjustesCampos />} />
          <Route path="periodos" element={<AjustesPeriodos />} />
          <Route path="guia" element={<AjustesGuia />} />
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

/** La ficha se monta de nuevo al cambiar de encargo: no arrastra «Deshacer», diálogos ni sugerencias del anterior */
function EncargoPorId() {
  const { id } = useParams()
  return <Encargo key={id} />
}

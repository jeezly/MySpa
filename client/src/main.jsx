import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ToastProvider, Spinner, Empty } from './components/ui.jsx';
import { PublicLayout, Workspace } from './components/layout.jsx';
import { Home, Catalog, Authors } from './pages/Public.jsx';
import { Login, Register, Profile } from './pages/Account.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { ManageBooks, ManageAuthors, ManageStaff, ManageAffiliates } from './pages/Admin.jsx';
import { Circulation, MyReservations, MyLoans } from './pages/Circulation.jsx';
import './styles.css';
function Guard({ roles }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/iniciar-sesion" replace />;
  if (roles && !roles.includes(user.rol)) return <Navigate to="/panel" replace />;
  return <Outlet />
}
function Guest({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (user) return <Navigate to="/panel" replace />;
  return children
}
function App() {
  return <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="catalogo" element={<Catalog />} />
            <Route path="autores" element={<Authors />} />
            <Route path="iniciar-sesion" element={<Guest>
              <Login />
            </Guest>} />
            <Route path="registro" element={<Guest>
              <Register />
            </Guest>} />
          </Route>
          <Route element={<Guard />}>
            <Route element={<Workspace />}>
              <Route path="panel" element={<Dashboard />} />
              <Route path="perfil" element={<Profile />} />
              <Route element={<Guard roles={['ADMIN']} />}>
                <Route path="gestion/libros" element={<ManageBooks />} />
                <Route path="gestion/autores" element={<ManageAuthors />} />
                <Route path="gestion/personal" element={<ManageStaff />} />
              </Route>
              <Route element={<Guard roles={['ADMIN', 'BIBLIOTECARIO']} />}>
                <Route path="gestion/afiliados" element={<ManageAffiliates />} />
                <Route path="circulacion" element={<Circulation />} />
              </Route>
              <Route element={<Guard roles={['AFILIADO']} />}>
                <Route path="mis-reservas" element={<MyReservations />} />
                <Route path="mis-prestamos" element={<MyLoans />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
}
createRoot(document.getElementById('root')).render(<React.StrictMode>
  <App />
</React.StrictMode>);

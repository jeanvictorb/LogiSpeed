import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Vendedor } from './pages/Vendedor'
import { Logistica } from './pages/Logistica'

function PrivateRoute({ children, perfil }: { children: React.ReactNode; perfil: string }) {
  const user = JSON.parse(localStorage.getItem('logispeed_user') || '{}')
  if (!user?.nome || user.perfil !== perfil) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/vendedor"
          element={
            <PrivateRoute perfil="vendedor">
              <Vendedor />
            </PrivateRoute>
          }
        />
        <Route
          path="/logistica"
          element={
            <PrivateRoute perfil="logistica">
              <Logistica />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

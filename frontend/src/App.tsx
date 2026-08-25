import { Navigate, Route, Routes, Link } from 'react-router-dom'
import { ThemeProvider, ThemeToggle, HorunFooter } from '@horun/design-system'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPage } from './pages/AdminPage'

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
            Horun Core
          </Link>
          {user?.is_super_admin && (
            <Link to="/admin" className="text-sm">
              Administração
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-sm">{user.username}</span>}
          <ThemeToggle />
          {user && (
            <button className="text-sm underline" onClick={() => logout()}>
              Sair
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <HorunFooter moduleName="Core" codename="—" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Carregando…</p>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Carregando…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_super_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Shell>
                  <DashboardPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireSuperAdmin>
                <Shell>
                  <AdminPage />
                </Shell>
              </RequireSuperAdmin>
            }
          />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

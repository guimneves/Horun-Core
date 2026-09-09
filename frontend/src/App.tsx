import { Navigate, Route, Routes, Link, NavLink } from 'react-router-dom'
import { ThemeProvider, ThemeToggle, HorunFooter } from '@horun/design-system'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { MuralPage } from './pages/MuralPage'
import { ModulesPage } from './pages/ModulesPage'
import { AgendaPage } from './pages/AgendaPage'
import { AdminPage } from './pages/AdminPage'
import { Avatar } from './components/Avatar'
import { MuralIcon, ModulesIcon, AgendaIcon, AdminIcon, SearchIcon, BellIcon } from './icons'

const NAV_ITEMS = [
  { to: '/', label: 'Mural', icon: MuralIcon, end: true },
  { to: '/modulos', label: 'Módulos', icon: ModulesIcon },
  { to: '/agenda', label: 'Agenda', icon: AgendaIcon },
]

function SideNav() {
  const { user } = useAuth()
  return (
    <div
      className="flex w-[232px] flex-shrink-0 flex-col justify-between p-3 pt-5"
      style={{ borderRight: '1px solid var(--color-border)' }}
    >
      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm' + (isActive ? ' font-semibold' : '')
            }
            style={({ isActive }) => ({
              background: isActive ? 'var(--color-surface)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
            })}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
        {user?.is_super_admin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm' + (isActive ? ' font-semibold' : '')
            }
            style={({ isActive }) => ({
              background: isActive ? 'var(--color-surface)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
            })}
          >
            <AdminIcon />
            Administração
          </NavLink>
        )}
      </div>

      {user && (
        <div
          className="flex items-center gap-2.5 rounded-[10px] p-3"
          style={{ background: 'var(--color-surface)' }}
        >
          <Avatar name={user.display_name || user.username} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold">{user.display_name || user.username}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {user.is_super_admin ? 'Administrador máximo' : 'Usuário'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header
        className="flex h-16 flex-shrink-0 items-center justify-between px-6"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <Link to="/" className="flex items-center gap-2 text-[17px] font-semibold" style={{ color: 'var(--color-primary)' }}>
          Horun
        </Link>

        <div
          className="flex w-[380px] items-center gap-2.5 rounded-full px-3.5 py-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <SearchIcon style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
            Buscar amostras, reagentes, avisos…
          </span>
        </div>

        <div className="flex items-center gap-4">
          <BellIcon style={{ color: 'var(--color-text-muted)' }} />
          <ThemeToggle />
          {user && (
            <button className="text-sm underline" onClick={() => logout()}>
              Sair
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <div className="flex-shrink-0">
        <HorunFooter moduleName="Core" codename="—" />
      </div>
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
                  <MuralPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/modulos"
            element={
              <RequireAuth>
                <Shell>
                  <ModulesPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/agenda"
            element={
              <RequireAuth>
                <Shell>
                  <AgendaPage />
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

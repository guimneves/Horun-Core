import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, Link, NavLink } from 'react-router-dom'
import { ThemeProvider, ThemeToggle, HorunFooter } from '@horun/design-system'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { api, type ModuleStatus } from './api/client'
import { LoginPage } from './pages/LoginPage'
import { MuralPage } from './pages/MuralPage'
import { ModulesPage } from './pages/ModulesPage'
import { AgendaPage } from './pages/AgendaPage'
import { AdminPage } from './pages/AdminPage'
import { ProfilePage } from './pages/ProfilePage'
import { Avatar } from './components/Avatar'
import { NotificationsBell } from './components/NotificationsBell'
import { MuralIcon, ModulesIcon, AgendaIcon, AdminIcon, SearchIcon } from './icons'
import horunIcon from './assets/horun-icon.png'
import nqtrLogo from './assets/nqtr-logo.png'

const NAV_ITEMS = [{ to: '/', label: 'Mural', icon: MuralIcon, end: true }]

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  background: isActive ? 'var(--color-surface)' : 'transparent',
  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
})
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm' + (isActive ? ' font-semibold' : '')

function EmbeddedModulesNav() {
  const [modules, setModules] = useState<ModuleStatus[]>([])

  useEffect(() => {
    api.dashboardModules().then(setModules).catch(() => {})
  }, [])

  // Só módulos com acesso e com interface encaixada no Core — os demais
  // continuam só visíveis na página "Módulos" (catálogo/status geral).
  const embedded = modules.filter((m) => m.has_access && m.embeddable)
  if (embedded.length === 0) return null

  return (
    <>
      {embedded.map((m) => (
        // <a> normal, não <Link>: cada módulo é uma SPA própria, buildada
        // e servida separadamente — precisa de um carregamento de página
        // de verdade, não navegação client-side do React Router do Core.
        <a
          key={m.id}
          href={`/m/${m.id}/`}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
          style={{ color: 'var(--color-text)' }}
        >
          <span className="w-[19px] text-center">{m.icon}</span>
          {m.display_name}
        </a>
      ))}
    </>
  )
}

function SideNav() {
  const { user, userVersion } = useAuth()
  return (
    <div
      className="flex w-[232px] flex-shrink-0 flex-col justify-between p-3 pt-5"
      style={{ borderRight: '1px solid var(--color-border)' }}
    >
      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass} style={navLinkStyle}>
            <Icon />
            {label}
          </NavLink>
        ))}

        <EmbeddedModulesNav />

        <NavLink to="/modulos" className={navLinkClass} style={navLinkStyle}>
          <ModulesIcon />
          Módulos
        </NavLink>
        <NavLink to="/agenda" className={navLinkClass} style={navLinkStyle}>
          <AgendaIcon />
          Agenda
        </NavLink>

        {user?.is_super_admin && (
          <NavLink to="/admin" className={navLinkClass} style={navLinkStyle}>
            <AdminIcon />
            Administração
          </NavLink>
        )}
      </div>

      {user && (
        <Link
          to="/perfil"
          className="flex items-center gap-2.5 rounded-[10px] p-3"
          style={{ background: 'var(--color-surface)' }}
        >
          <Avatar name={user.display_name || user.username} size={32} userId={user.id} cacheBust={userVersion} />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold">{user.display_name || user.username}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {user.is_super_admin ? 'Administrador máximo' : 'Usuário'}
            </div>
          </div>
        </Link>
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
        <Link to="/" className="flex items-center gap-2.5 text-[17px] font-semibold" style={{ color: 'var(--color-primary)' }}>
          <img src={horunIcon} alt="" className="h-7 w-7 rounded-[7px]" />
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
          <NotificationsBell />
          <ThemeToggle />
          {user && (
            <button className="text-sm underline" onClick={() => logout()}>
              Sair
            </button>
          )}
          {/* Marca institucional — NQTR/IQ-UFRJ, no canto superior, discreta. */}
          <img src={nqtrLogo} alt="NQTR · IQ-UFRJ" className="ml-1 h-7 w-auto opacity-70" />
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
            path="/perfil"
            element={
              <RequireAuth>
                <Shell>
                  <ProfilePage />
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

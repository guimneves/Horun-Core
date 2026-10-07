import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, Link, NavLink, useLocation } from 'react-router-dom'
import { ThemeProvider, ThemeToggle, HorunFooter } from '@horun/design-system'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { api, type ModuleStatus } from './api/client'
import { LoginPage } from './pages/LoginPage'
import { MuralPage } from './pages/MuralPage'
import { ModulesPage } from './pages/ModulesPage'
import { AgendaPage } from './pages/AgendaPage'
import { EquipmentPage } from './pages/EquipmentPage'
import { EquipmentDetailPage } from './pages/EquipmentDetailPage'
import { AdminPage } from './pages/AdminPage'
import { ProfilePage } from './pages/ProfilePage'
import { ColaboradoresPage } from './pages/ColaboradoresPage'
import { SobrePage } from './pages/SobrePage'
import { Avatar } from './components/Avatar'
import { NotificationsBell } from './components/NotificationsBell'
import { OnboardingModal } from './components/OnboardingModal'
import { SuggestionBox } from './components/SuggestionBox'
import { GlobalSearch } from './components/GlobalSearch'
import { MuralIcon, ModulesIcon, AgendaIcon, AdminIcon, PeopleIcon, EquipmentIcon, InfoIcon, MenuIcon, CloseIcon, SearchIcon } from './icons'
import { readHiddenModules, onHiddenModulesChange } from './sidebarModules'
import horunIcon from './assets/horun-icon.png'
import nqtrLogo from './assets/nqtr-logo.png'
import { canOpenAdmin } from './lib/permissions'

const NAV_ITEMS = [{ to: '/', label: 'Mural', icon: MuralIcon, end: true }]

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  background: isActive ? 'var(--color-surface)' : 'transparent',
  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
})
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm' + (isActive ? ' font-semibold' : '')

function EmbeddedModulesNav() {
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [hidden, setHidden] = useState<Set<string>>(() => readHiddenModules())

  useEffect(() => {
    // barra lateral é só atalho: se falhar, fica sem os módulos (a página
    // Módulos mostra o erro de carregamento)
    api.dashboardModules().then(setModules).catch(() => {})
  }, [])

  useEffect(() => onHiddenModulesChange(() => setHidden(readHiddenModules())), [])

  // Só módulos com acesso e com interface encaixada no Core — os demais
  // continuam só visíveis na página "Módulos" (catálogo/status geral). O
  // que sobra ainda passa pela preferência pessoal de barra lateral
  // (ver sidebarModules.ts), pra não poluir a lista à medida que mais
  // módulos são cadastrados.
  const embedded = modules.filter((m) => m.has_access && m.embeddable && !hidden.has(m.id))
  if (embedded.length === 0) return null

  return (
    <>
      {embedded.map((m) => (
        // <a> normal, não <Link>: cada módulo é uma SPA própria, buildada
        // e servida separadamente — precisa de um carregamento de página
        // de verdade, não navegação client-side do React Router do Core.
        <a
          key={m.id}
          href={`/m/${encodeURIComponent(m.id)}/`}
          className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
          style={{ color: 'var(--color-text)' }}
        >
          <span className="w-[19px] text-center">{m.icon}</span>
          {m.display_name}
        </a>
      ))}
    </>
  )
}

// Conteúdo da barra lateral — o mesmo no desktop (coluna fixa) e no
// celular (gaveta). `onNavigate` fecha a gaveta ao escolher um item.
function SideNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, userVersion } = useAuth()
  return (
    <>
      <nav className="flex flex-col gap-0.5" onClick={onNavigate}>
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
        <NavLink to="/equipamentos" className={navLinkClass} style={navLinkStyle}>
          <EquipmentIcon />
          Equipamentos
        </NavLink>
        <NavLink to="/colaboradores" className={navLinkClass} style={navLinkStyle}>
          <PeopleIcon />
          Colaboradores
        </NavLink>

        {canOpenAdmin(user) && (
          <NavLink to="/admin" className={navLinkClass} style={navLinkStyle}>
            <AdminIcon />
            Administração
          </NavLink>
        )}
        <NavLink to="/sobre" className={navLinkClass} style={navLinkStyle}>
          <InfoIcon />
          Sobre
        </NavLink>
      </nav>

      {user && (
        <Link
          to="/perfil"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-[10px] p-3"
          style={{ background: 'var(--color-surface)' }}
        >
          <Avatar name={user.display_name || user.username} size={32} userId={user.id} cacheBust={userVersion} />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold">{user.display_name || user.username}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {user.level_label}
            </div>
          </div>
        </Link>
      )}
    </>
  )
}

function SideNav() {
  return (
    <div
      className="hidden w-[232px] flex-shrink-0 flex-col justify-between overflow-y-auto p-3 pt-5 md:flex"
      style={{ borderRight: '1px solid var(--color-border)' }}
    >
      <SideNavContent />
    </div>
  )
}

// Gaveta do celular (abaixo de `md`): abre por cima do conteúdo com fundo
// escurecido; fecha ao escolher um item, ao tocar fora ou com Esc
// (Prompt_Horun_Modulo.md, seção 13 — mesma regra dos módulos).
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,40,0.55)' }} onClick={onClose} data-drawer-backdrop />
      <div
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto shadow-2xl"
        style={{ background: 'var(--color-bg-elevated)', borderRight: '1px solid var(--color-border)' }}
      >
        <div className="flex h-14 flex-shrink-0 items-center justify-between px-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="flex items-center gap-2.5 pl-1 text-[17px] font-semibold" style={{ color: 'var(--color-primary)' }}>
            <img src={horunIcon} alt="" className="h-7 w-7 rounded-[7px]" />
            Horun
          </span>
          <button onClick={onClose} aria-label="Fechar menu" className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-4 p-3">
          <SideNavContent onNavigate={onClose} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
          <ThemeToggle />
          {user && (
            <button className="min-h-10 px-2 text-sm underline" onClick={() => logout()}>
              Sair
            </button>
          )}
        </div>
        <HorunFooter moduleName="Core" />
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, userVersion } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Trocou de página (inclusive por busca ou notificação): gaveta e
  // busca do celular fecham.
  useEffect(() => {
    setDrawerOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header
        className="flex h-14 flex-shrink-0 items-center justify-between gap-2 px-2 md:h-16 md:px-6"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <div className="flex min-w-0 items-center gap-1">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg md:hidden"
            style={{ color: 'var(--color-text)' }}
          >
            <MenuIcon width={22} height={22} />
          </button>
          <Link to="/" className="flex min-h-10 items-center gap-2.5 text-[17px] font-semibold" style={{ color: 'var(--color-primary)' }}>
            <img src={horunIcon} alt="" className="h-7 w-7 rounded-[7px]" />
            Horun
          </Link>
        </div>

        <div className="hidden md:block">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-1 md:gap-4">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Buscar"
            aria-expanded={searchOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full md:hidden"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <SearchIcon />
          </button>
          <NotificationsBell />
          <div className="hidden items-center gap-4 md:flex">
            <ThemeToggle />
            {user && (
              <button className="text-sm underline" onClick={() => logout()}>
                Sair
              </button>
            )}
            {/* Marca institucional — NQTR/IQ-UFRJ, no canto superior, discreta. */}
            <img src={nqtrLogo} alt="NQTR · IQ-UFRJ" className="ml-1 h-7 w-auto opacity-70" />
          </div>
          {user && (
            <Link to="/perfil" aria-label="Meu perfil" className="flex h-10 w-10 items-center justify-center md:hidden">
              <Avatar name={user.display_name || user.username} size={30} userId={user.id} cacheBust={userVersion} />
            </Link>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="flex-shrink-0 px-3 py-2 md:hidden" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}>
          <GlobalSearch autoFocus />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>

      <div className="hidden flex-shrink-0 md:block">
        <HorunFooter moduleName="Core" />
      </div>

      <MobileDrawer open={drawerOpen} onClose={closeDrawer} />
      <OnboardingModal />
      <SuggestionBox />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Carregando…</p>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdminAccess({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-6">Carregando…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!canOpenAdmin(user)) return <Navigate to="/" replace />
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
            path="/equipamentos"
            element={
              <RequireAuth>
                <Shell>
                  <EquipmentPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/equipamentos/:id"
            element={
              <RequireAuth>
                <Shell>
                  <EquipmentDetailPage />
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
            path="/sobre"
            element={
              <RequireAuth>
                <Shell>
                  <SobrePage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/colaboradores"
            element={
              <RequireAuth>
                <Shell>
                  <ColaboradoresPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdminAccess>
                <Shell>
                  <AdminPage />
                </Shell>
              </RequireAdminAccess>
            }
          />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

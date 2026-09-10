import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type CurrentUser } from '../api/client'

interface AuthContextValue {
  user: CurrentUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setPassword: (username: string, setupCode: string, newPassword: string) => Promise<void>
  refreshUser: () => Promise<void>
  // Incrementa a cada refreshUser() — usado como cache-buster pelo
  // <Avatar> ao mostrar a própria foto (ex. no menu lateral), já que o
  // endpoint da foto tem a mesma URL antes e depois de trocar a imagem.
  userVersion: number
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [userVersion, setUserVersion] = useState(0)

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(username: string, password: string) {
    const u = await api.login(username, password)
    setUser(u)
    setUserVersion((v) => v + 1)
  }

  async function logout() {
    try {
      await api.logout()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
    }
    setUser(null)
  }

  async function setPassword(username: string, setupCode: string, newPassword: string) {
    const u = await api.setPassword(username, setupCode, newPassword)
    setUser(u)
    setUserVersion((v) => v + 1)
  }

  async function refreshUser() {
    const u = await api.me()
    setUser(u)
    setUserVersion((v) => v + 1)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setPassword, refreshUser, userVersion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

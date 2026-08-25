import { useEffect, useState } from 'react'
import { api, ApiError, type CurrentUser, type ModuleAccessEntry, type ModuleFull } from '../api/client'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      <h3 className="mb-3 font-semibold" style={{ color: 'var(--color-primary)' }}>
        {title}
      </h3>
      {children}
    </section>
  )
}

function UsersSection({ users, onChange }: { users: CurrentUser[]; onChange: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createUser({ username, password })
      setUsername('')
      setPassword('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar usuário.')
    }
  }

  return (
    <Section title="Usuários">
      <ul className="mb-3 divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-1.5 text-sm">
            <span>
              {u.username} {u.is_super_admin && <em className="text-xs">(administrador máximo)</em>}
              {u.is_protected && <em className="text-xs"> · protegida</em>}
            </span>
            {!u.is_protected && (
              <button
                className="text-xs text-red-500"
                onClick={() => api.deleteUser(u.id).then(onChange)}
              >
                remover
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="usuário"
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          placeholder="senha"
          type="password"
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="rounded-md px-3 py-1 text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          onClick={handleCreate}
        >
          Criar usuário
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </Section>
  )
}

function ModulesSection({ modules, onChange }: { modules: ModuleFull[]; onChange: () => void }) {
  const [id, setId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createModule({
        id,
        display_name: displayName,
        codename: '',
        description: '',
        icon: '🧪',
        internal_base_url: baseUrl,
        health_path: '/health',
      })
      setId('')
      setDisplayName('')
      setBaseUrl('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cadastrar módulo.')
    }
  }

  return (
    <Section title="Módulos cadastrados">
      <ul className="mb-3 divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {modules.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
            <span>
              {m.icon} {m.display_name} <em className="text-xs">({m.internal_base_url})</em>
            </span>
            <button className="text-xs text-red-500" onClick={() => api.deleteModule(m.id).then(onChange)}>
              remover
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="id (slug, ex.: re7s)"
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          placeholder="nome público"
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          placeholder="http://<container>:8000"
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <button
          className="rounded-md px-3 py-1 text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          onClick={handleCreate}
        >
          Cadastrar módulo
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </Section>
  )
}

function PermissionsSection({ modules, users }: { modules: ModuleFull[]; users: CurrentUser[] }) {
  const [moduleId, setModuleId] = useState('')
  const [access, setAccess] = useState<ModuleAccessEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  useEffect(() => {
    if (moduleId) api.listModuleAccess(moduleId).then(setAccess)
    else setAccess([])
  }, [moduleId])

  function reloadAccess() {
    if (moduleId) api.listModuleAccess(moduleId).then(setAccess)
  }

  return (
    <Section title="Permissões por módulo">
      <select
        className="mb-3 rounded-md border px-2 py-1 text-sm"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        value={moduleId}
        onChange={(e) => setModuleId(e.target.value)}
      >
        <option value="">Selecione um módulo…</option>
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>

      {moduleId && (
        <>
          <ul className="mb-3 divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {access.map((a) => (
              <li key={a.user_id} className="flex items-center justify-between py-1.5 text-sm">
                <span>{a.username}</span>
                <button
                  className="text-xs text-red-500"
                  onClick={() => api.revokeModuleAccess(moduleId, a.user_id).then(reloadAccess)}
                >
                  revogar
                </button>
              </li>
            ))}
            {access.length === 0 && (
              <li className="py-1.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Ninguém com acesso ainda.
              </li>
            )}
          </ul>

          <div className="flex gap-2">
            <select
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
            >
              <option value="">Selecione um usuário…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
            <button
              className="rounded-md px-3 py-1 text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
              onClick={() => {
                if (selectedUserId) api.grantModuleAccess(moduleId, selectedUserId).then(reloadAccess)
              }}
            >
              Conceder acesso
            </button>
          </div>
        </>
      )}
    </Section>
  )
}

export function AdminPage() {
  const [modules, setModules] = useState<ModuleFull[]>([])
  const [users, setUsers] = useState<CurrentUser[]>([])

  function reloadModules() {
    api.listModules().then(setModules)
  }

  function reloadUsers() {
    api.listUsers().then(setUsers)
  }

  useEffect(reloadModules, [])
  useEffect(reloadUsers, [])

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-2">
      <UsersSection users={users} onChange={reloadUsers} />
      <ModulesSection modules={modules} onChange={reloadModules} />
      <div className="lg:col-span-2">
        <PermissionsSection modules={modules} users={users} />
      </div>
    </div>
  )
}

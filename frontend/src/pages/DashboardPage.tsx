import { useEffect, useState } from 'react'
import { api, type ModuleStatus } from '../api/client'

function StatusBadge({ status }: { status: ModuleStatus['status'] }) {
  const online = status === 'online'
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: online ? 'rgba(31,163,74,0.15)' : 'rgba(212,59,59,0.15)',
        color: online ? '#1fa34a' : '#d43b3b',
      }}
    >
      {online ? 'Operacional' : 'Offline'}
    </span>
  )
}

export function DashboardPage() {
  const [modules, setModules] = useState<ModuleStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .dashboardModules()
      .then(setModules)
      .catch(() => setError('Não foi possível carregar os módulos.'))
  }, [])

  return (
    <div className="p-6">
      <h2 className="mb-1 text-lg font-semibold">Módulos</h2>
      <p className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Um módulo por equipamento do laboratório. Todo usuário vê o status de todos — só quem tem
        permissão pode abrir.
      </p>

      {error && <p className="text-red-500">{error}</p>}
      {!modules && !error && <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>}
      {modules?.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Nenhum módulo cadastrado ainda.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules?.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-2xl">{m.icon}</span>
              <StatusBadge status={m.status} />
            </div>
            <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>
              Horun · {m.display_name}
            </h3>
            {m.codename && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                codinome: {m.codename}
              </p>
            )}
            {m.description && <p className="mt-2 text-sm">{m.description}</p>}

            <div className="mt-4">
              {m.has_access ? (
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
                  disabled
                  title="Encaixe da interface do módulo dentro do Core ainda não implementado (Prompt_Horun_Core.md, seção 8) — por enquanto o dashboard só mostra status e permissão."
                >
                  Abrir (em breve)
                </button>
              ) : (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Sem permissão — solicite ao administrador.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

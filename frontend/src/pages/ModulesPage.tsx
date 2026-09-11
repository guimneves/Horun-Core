import { useEffect, useState } from 'react'
import { api, type ModuleStatus } from '../api/client'
import { readHiddenModules, writeHiddenModules } from '../sidebarModules'

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

export function ModulesPage() {
  const [modules, setModules] = useState<ModuleStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => readHiddenModules())

  useEffect(() => {
    api
      .dashboardModules()
      .then(setModules)
      .catch(() => setError('Não foi possível carregar os módulos.'))
  }, [])

  function setHiddenPersisted(next: Set<string>) {
    setHidden(next)
    writeHiddenModules(next)
  }

  function toggleSidebar(id: string) {
    const next = new Set(hidden)
    next.has(id) ? next.delete(id) : next.add(id)
    setHiddenPersisted(next)
  }

  // Só módulos com acesso e encaixados na interface chegam a aparecer na
  // barra lateral (ver EmbeddedModulesNav em App.tsx) — os outros não têm
  // o que esconder ali.
  const sidebarEligible = (modules ?? []).filter((m) => m.has_access && m.embeddable)

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Módulos</h2>
        {sidebarEligible.length > 0 && (
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Barra lateral:</span>
            <button className="underline" onClick={() => setHiddenPersisted(new Set())}>
              mostrar todos
            </button>
            <button className="underline" onClick={() => setHiddenPersisted(new Set(sidebarEligible.map((m) => m.id)))}>
              ocultar todos
            </button>
          </div>
        )}
      </div>

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
            {m.description && <p className="mt-2 text-sm">{m.description}</p>}

            <div className="mt-4">
              {m.has_access ? (
                m.embeddable ? (
                  <a
                    href={`/m/${m.id}/`}
                    className="inline-block rounded-md px-3 py-1.5 text-sm font-medium"
                    style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
                  >
                    Abrir
                  </a>
                ) : (
                  <button
                    className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
                    disabled
                    title="Este módulo ainda não suporta interface embutida no Core (Prompt_Horun_Core.md, seção 8)."
                  >
                    Abrir (em breve)
                  </button>
                )
              ) : (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Sem permissão — solicite ao administrador.
                </p>
              )}
            </div>

            {m.has_access && m.embeddable && (
              <label className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <input type="checkbox" checked={!hidden.has(m.id)} onChange={() => toggleSidebar(m.id)} />
                Mostrar na barra lateral
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

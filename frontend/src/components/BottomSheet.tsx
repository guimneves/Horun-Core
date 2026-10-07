import { useEffect } from 'react'

// Janela "de baixo para cima" do celular: largura toda, rolagem interna,
// fecha ao tocar no fundo escurecido ou com Esc. Usada pela Agenda (e pela
// mini-agenda do equipamento) para criar/editar reserva ou evento abaixo
// de `md` — no desktop esses painéis continuam na coluna lateral.
export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,40,0.55)' }} onClick={onClose} />
      <div
        className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl shadow-2xl"
        style={{ background: 'var(--color-bg-elevated)', borderTop: '1px solid var(--color-border)' }}
      >
        <div className="sticky top-0 z-10 flex justify-center pb-1 pt-2" style={{ background: 'var(--color-bg-elevated)' }}>
          <span className="h-1 w-10 rounded-full" style={{ background: 'var(--color-border)' }} />
        </div>
        {children}
      </div>
    </div>
  )
}

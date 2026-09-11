// Preferência pessoal (por navegador, não sincronizada entre dispositivos)
// de quais módulos aparecem fixados na barra lateral — evita que a lista
// fique poluída à medida que mais módulos são cadastrados. Editável na
// página Módulos; lida pelo SideNav em App.tsx.
export const SIDEBAR_HIDDEN_MODULES_KEY = 'sidebar.hiddenModules'
const CHANGE_EVENT = 'horun:sidebar-modules-changed'

export function readHiddenModules(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SIDEBAR_HIDDEN_MODULES_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function writeHiddenModules(next: Set<string>) {
  try {
    localStorage.setItem(SIDEBAR_HIDDEN_MODULES_KEY, JSON.stringify([...next]))
  } catch {
    /* ok */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function onHiddenModulesChange(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

import type { CurrentUser } from '../api/client'

/** A página de Administração abre para quem tem alguma aba dela: usuários,
 * permissões e grupos (coordenador), equipamentos (técnico) ou módulos
 * (administrador máximo). Cada aba confere a sua capacidade. */
export function canOpenAdmin(user: CurrentUser | null | undefined): boolean {
  if (!user) return false
  const c = user.can
  return c.manage_users || c.manage_access || c.manage_groups || c.manage_equipment || c.manage_modules
}

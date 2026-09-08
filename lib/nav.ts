import {
  Bell,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Receipt,
  Server,
  StickyNote,
  Ticket,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Proyectos', href: '/proyectos', icon: FolderKanban },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Cobros', href: '/cobros', icon: Wallet },
  { label: 'Caja', href: '/caja', icon: Landmark },
  { label: 'Gastos', href: '/gastos', icon: Receipt },
  { label: 'Mantenimientos', href: '/mantenimientos', icon: Wrench },
  { label: 'Infraestructura', href: '/infraestructura', icon: Server },
  { label: 'Tickets', href: '/tickets', icon: Ticket },
  { label: 'Notas e ideas', href: '/notas', icon: StickyNote },
  { label: 'Alertas', href: '/alertas', icon: Bell },
]

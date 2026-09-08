import {
  Bell,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Receipt,
  Server,
  StickyNote,
  Ticket,
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
  // Clientes vive adentro de Proyectos, como pestaña: un cliente sin sus
  // proyectos no dice nada. /clientes sigue existiendo, pero sólo para
  // redirigir ahí.
  { label: 'Proyectos y clientes', href: '/proyectos', icon: FolderKanban },
  { label: 'Cobros', href: '/cobros', icon: Wallet },
  { label: 'Caja', href: '/caja', icon: Landmark },
  { label: 'Gastos', href: '/gastos', icon: Receipt },
  { label: 'Mantenimientos', href: '/mantenimientos', icon: Wrench },
  { label: 'Infraestructura', href: '/infraestructura', icon: Server },
  { label: 'Tickets', href: '/tickets', icon: Ticket },
  { label: 'Notas e ideas', href: '/notas', icon: StickyNote },
  { label: 'Alertas', href: '/alertas', icon: Bell },
]

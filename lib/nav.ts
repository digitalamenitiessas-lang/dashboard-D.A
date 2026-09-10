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
  // Clientes tiene sección propia Y sigue existiendo como pestaña de
  // Proyectos: son dos preguntas distintas. Acá se entra a un cliente para
  // ver su ficha, su servicio y sus facturas; allá se ve cómo viene cada
  // proyecto, agrupado por cliente. Los números de las dos salen de
  // `enriquecerClientes()`, así que no pueden discrepar.
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

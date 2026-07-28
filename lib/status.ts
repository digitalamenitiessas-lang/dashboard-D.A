import type { Priority, ProjectStatus } from './types'

// Tailwind color classes per project status (semantic, subtle glass chips).
export const statusStyles: Record<ProjectStatus, string> = {
  Idea: 'bg-muted text-muted-foreground border-border',
  Presupuestado: 'bg-neon-blue/10 text-neon-blue border-neon-blue/25',
  'En negociación': 'bg-neon-blue/10 text-neon-blue border-neon-blue/25',
  'En desarrollo': 'bg-neon-green/12 text-neon-green border-neon-green/30',
  'En pruebas': 'bg-neon-violet/12 text-neon-violet border-neon-violet/30',
  'Esperando al cliente': 'bg-amber-400/12 text-amber-300 border-amber-400/25',
  Pausado: 'bg-muted text-muted-foreground border-border',
  Bloqueado: 'bg-destructive/15 text-red-300 border-destructive/30',
  Implementado: 'bg-neon-green/12 text-neon-green border-neon-green/30',
  'En mantenimiento': 'bg-neon-violet/12 text-neon-violet border-neon-violet/30',
  Finalizado: 'bg-muted text-foreground/80 border-border',
}

export const priorityStyles: Record<Priority, string> = {
  Baja: 'bg-muted text-muted-foreground border-border',
  Media: 'bg-neon-blue/10 text-neon-blue border-neon-blue/25',
  Alta: 'bg-amber-400/12 text-amber-300 border-amber-400/25',
  Crítica: 'bg-destructive/15 text-red-300 border-destructive/30',
}

// Groupings used for dashboard summaries.
export const ACTIVE_STATUSES: ProjectStatus[] = [
  'En negociación',
  'En desarrollo',
  'En pruebas',
  'Esperando al cliente',
]

export const DELAYED_STATUSES: ProjectStatus[] = ['Esperando al cliente', 'Pausado']

import { daysUntil } from './format'
import type {
  MaintenanceFrequency,
  Note,
  Payment,
  PaymentStatus,
  Project,
  Task,
} from './types'

/**
 * Stored status can go stale as dates pass, so a pending payment past its due
 * date reads as overdue everywhere without needing a write.
 */
export function effectivePaymentStatus(payment: Payment): PaymentStatus {
  if (payment.status === 'Cobrado') return 'Cobrado'
  const d = daysUntil(payment.dueDate)
  return d !== null && d < 0 ? 'Vencido' : payment.status
}

export interface ProjectFinance {
  quoted: number
  collected: number
  pending: number
  nextPayment: Payment | null
  overduePayments: Payment[]
}

export function projectFinance(
  project: Project,
  payments: Payment[],
): ProjectFinance {
  const projectPayments = payments.filter((p) => p.projectId === project.id)
  const collected = projectPayments
    .filter((p) => p.status === 'Cobrado')
    .reduce((sum, p) => sum + p.amount, 0)
  const quoted = project.quotedAmount
  const pending = Math.max(quoted - collected, 0)
  const upcoming = projectPayments
    .filter((p) => p.status !== 'Cobrado')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const overduePayments = projectPayments.filter((p) => p.status === 'Vencido')
  return {
    quoted,
    collected,
    pending,
    nextPayment: upcoming[0] ?? null,
    overduePayments,
  }
}

export const frequencyMonths: Record<MaintenanceFrequency, number> = {
  Mensual: 1,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
}

/** Maintenance fee normalized to a monthly figure, for MRR-style totals. */
export function monthlyMaintenanceValue(project: Project): number {
  const m = project.maintenance
  if (!m.active || m.status !== 'Activo') return 0
  return m.amount / frequencyMonths[m.frequency]
}

/** Next maintenance charge date as ISO (yyyy-mm-dd) or null when inactive. */
export function nextMaintenanceCharge(
  project: Project,
  today = new Date(),
): string | null {
  const m = project.maintenance
  if (!m.active || m.status !== 'Activo') return null
  const anchor = m.lastCollectedDate ?? m.startDate ?? m.implementationDate
  if (!anchor) return null
  const step = frequencyMonths[m.frequency]
  const anchorDate = new Date(anchor + 'T00:00:00')
  const candidate = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    Math.min(m.dueDay, 28),
  )
  // advance until strictly in the future relative to today
  let guard = 0
  while (candidate <= today && guard < 240) {
    candidate.setMonth(candidate.getMonth() + step)
    guard++
  }
  // if last collected exists, ensure we moved at least one period past it
  const y = candidate.getFullYear()
  const mo = String(candidate.getMonth() + 1).padStart(2, '0')
  const da = String(candidate.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

export type AlertLevel = 'critical' | 'warning' | 'info'

export interface AlertItem {
  id: string
  level: AlertLevel
  category: string
  title: string
  detail: string
  projectId: string | null
  date: string | null
}

interface AlertInput {
  projects: Project[]
  payments: Payment[]
  notes: Note[]
  tasks?: Task[]
}

export function buildAlerts({
  projects,
  payments,
  notes,
  tasks = [],
}: AlertInput): AlertItem[] {
  const alerts: AlertItem[] = []

  // Payments upcoming / overdue
  for (const pay of payments) {
    if (pay.status === 'Cobrado') continue
    const d = daysUntil(pay.dueDate)
    const project = projects.find((p) => p.id === pay.projectId)
    if (pay.status === 'Vencido' || (d !== null && d < 0)) {
      alerts.push({
        id: `pay-${pay.id}`,
        level: 'critical',
        category: 'Cobros',
        title: `Pago vencido · ${project?.name ?? ''}`,
        detail: `${pay.concept} — vencía ${pay.dueDate}`,
        projectId: pay.projectId,
        date: pay.dueDate,
      })
    } else if (d !== null && d <= 7) {
      alerts.push({
        id: `pay-${pay.id}`,
        level: 'warning',
        category: 'Cobros',
        title: `Pago próximo · ${project?.name ?? ''}`,
        detail: `${pay.concept} — vence en ${d} día(s)`,
        projectId: pay.projectId,
        date: pay.dueDate,
      })
    }
  }

  // Maintenance charges
  for (const project of projects) {
    const next = nextMaintenanceCharge(project)
    if (!next) continue
    const d = daysUntil(next)
    if (d === null) continue
    if (d < 0) {
      alerts.push({
        id: `mnt-${project.id}`,
        level: 'critical',
        category: 'Mantenimientos',
        title: `Mantenimiento vencido · ${project.name}`,
        detail: `Cobro previsto ${next}`,
        projectId: project.id,
        date: next,
      })
    } else if (d <= 7) {
      alerts.push({
        id: `mnt-${project.id}`,
        level: 'warning',
        category: 'Mantenimientos',
        title: `Mantenimiento por cobrar · ${project.name}`,
        detail: `Cobro en ${d} día(s) (${next})`,
        projectId: project.id,
        date: next,
      })
    }
  }

  const closed = ['Implementado', 'En mantenimiento', 'Finalizado']

  for (const project of projects) {
    // Delayed projects
    if (
      project.estimatedDelivery &&
      !closed.includes(project.status) &&
      (daysUntil(project.estimatedDelivery) ?? 0) < 0
    ) {
      alerts.push({
        id: `late-${project.id}`,
        level: 'warning',
        category: 'Proyectos',
        title: `Proyecto demorado · ${project.name}`,
        detail: `Entrega estimada ${project.estimatedDelivery} superada`,
        projectId: project.id,
        date: project.estimatedDelivery,
      })
    }

    // Blocked projects
    if (project.status === 'Bloqueado') {
      const openBlocker = tasks.find(
        (t) => t.projectId === project.id && t.kind === 'bloqueador' && !t.done,
      )
      alerts.push({
        id: `block-${project.id}`,
        level: 'critical',
        category: 'Proyectos',
        title: `Proyecto bloqueado · ${project.name}`,
        detail: openBlocker?.title ?? 'Requiere atención',
        projectId: project.id,
        date: project.updatedAt,
      })
    }

    // Domain expiry
    const dd = daysUntil(project.infrastructure.domainExpiry)
    if (dd !== null && dd <= 30) {
      alerts.push({
        id: `dom-${project.id}`,
        level: dd < 0 ? 'critical' : 'warning',
        category: 'Infraestructura',
        title: `Dominio por vencer · ${project.infrastructure.domain}`,
        detail:
          dd < 0
            ? `Venció hace ${Math.abs(dd)} día(s)`
            : `Vence en ${dd} día(s)`,
        projectId: project.id,
        date: project.infrastructure.domainExpiry,
      })
    }

    // Stale projects (no update in 21+ days) among active ones
    const stale = daysUntil(project.updatedAt)
    if (
      !closed.includes(project.status) &&
      project.status !== 'Idea' &&
      stale !== null &&
      stale <= -21
    ) {
      alerts.push({
        id: `stale-${project.id}`,
        level: 'info',
        category: 'Proyectos',
        title: `Sin actualizaciones · ${project.name}`,
        detail: `Última actualización hace ${Math.abs(stale)} días`,
        projectId: project.id,
        date: project.updatedAt,
      })
    }
  }

  // Notes with reminders
  for (const note of notes) {
    const d = daysUntil(note.reminderDate)
    if (d === null) continue
    if (d <= 7) {
      alerts.push({
        id: `note-${note.id}`,
        level: d < 0 ? 'warning' : 'info',
        category: 'Notas',
        title: `Recordatorio · ${note.title}`,
        detail: d < 0 ? `Venció hace ${Math.abs(d)} día(s)` : `En ${d} día(s)`,
        projectId: null,
        date: note.reminderDate,
      })
    }
  }

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.level] - order[b.level])
}

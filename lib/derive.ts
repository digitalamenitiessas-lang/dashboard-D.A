import { daysUntil } from './format'
import {
  formatMoneyByCurrency,
  mergeMoney,
  sumByCurrency,
  type MoneyByCurrency,
} from './money'
import type {
  Currency,
  Maintenance,
  MaintenanceCharge,
  MaintenanceFrequency,
  Note,
  Payment,
  Project,
  Task,
  Ticket,
  TicketStatus,
} from './types'

export interface ProjectFinance {
  /** The project's own currency; quoted/collected/pending are expressed in it. */
  currency: Currency
  quoted: number
  /** Payments cobrados in the project's currency — what `pending` discounts. */
  collected: number
  pending: number
  quotedByCurrency: MoneyByCurrency
  /** Payments cobrados, every currency. */
  paidByCurrency: MoneyByCurrency
  /** Recurring maintenance fees actually collected, every currency. */
  maintenanceByCurrency: MoneyByCurrency
  /** Total money in: payments plus maintenance. */
  collectedByCurrency: MoneyByCurrency
  /**
   * Lo que falta cobrar de ESTE proyecto, con el piso en cero puesto acá y no
   * sobre el agregado. Para el pendiente de varios proyectos se suman estos
   * buckets: si el piso se aplicara recién al final, un proyecto cobrado de
   * más taparía la deuda de otro de la misma moneda.
   */
  pendingByCurrency: MoneyByCurrency
  /** Lo cobrado por encima de lo cotizado. Se muestra aparte, no se compensa. */
  overpaidByCurrency: MoneyByCurrency
}

export function projectFinance(
  project: Project,
  payments: Payment[],
  maintenanceCharges: MaintenanceCharge[] = [],
): ProjectFinance {
  // Every stored payment is money already received.
  const paid = payments.filter((p) => p.projectId === project.id)

  // Only payments in the project's own currency can be discounted from the
  // quote; anything else is surfaced separately instead of being summed in.
  const collected = paid
    .filter((p) => p.currency === project.currency)
    .reduce((sum, p) => sum + p.amount, 0)

  const paidByCurrency = sumByCurrency(paid)
  const maintenanceByCurrency = sumByCurrency(
    maintenanceCharges.filter((c) => c.projectId === project.id),
  )

  const balance = project.quotedAmount - collected

  return {
    currency: project.currency,
    quoted: project.quotedAmount,
    collected,
    pending: Math.max(balance, 0),
    quotedByCurrency: { [project.currency]: project.quotedAmount },
    paidByCurrency,
    maintenanceByCurrency,
    collectedByCurrency: mergeMoney(paidByCurrency, maintenanceByCurrency),
    pendingByCurrency: { [project.currency]: Math.max(balance, 0) },
    overpaidByCurrency: { [project.currency]: Math.max(-balance, 0) },
  }
}

export const frequencyMonths: Record<MaintenanceFrequency, number> = {
  Mensual: 1,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
}

/**
 * Maintenance fee normalized to a monthly figure, for MRR-style totals.
 * Expressed in `project.maintenance.currency` — bucket before adding it up.
 */
export function monthlyMaintenanceValue(project: Project): number {
  const m = project.maintenance
  if (!m.active || m.status !== 'Activo') return 0
  return m.amount / frequencyMonths[m.frequency]
}

/** Infrastructure spend normalized to a monthly figure, bucketed by currency. */
export function monthlyInfraCost(project: Project): MoneyByCurrency {
  return sumByCurrency(
    project.infrastructure.costs.map((c) => ({
      amount: c.amount / frequencyMonths[c.frequency],
      currency: c.currency,
    })),
  )
}

/**
 * Tope duro de vencimientos a enumerar: 600 períodos son 50 años de plan
 * mensual. Está para que un `start_date` de 1990 cargado de más no ponga a
 * la pantalla a contar cuotas hasta el fin de los tiempos.
 */
const MAX_PERIODS = 600

/** Fecha local a ISO (yyyy-mm-dd), sin pasar por UTC y correrse un día. */
function toIso(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const da = String(date.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

/**
 * Serie de vencimientos del plan a partir del ancla, del más viejo al más
 * nuevo. El ancla es el arranque del servicio, no un cobro: el primer
 * vencimiento cae un período después, porque se factura el período cumplido.
 *
 * `past` son los vencimientos que ya cayeron y `next` el primero que todavía
 * no: la comparación va por día calendario contra la medianoche local (vía
 * `daysUntil`), así un vencimiento de HOY sigue siendo el próximo a cobrar y
 * no se saltea al período siguiente apenas pasan las 00:00.
 */
function dueDateSeries(
  m: Maintenance,
  anchor: string,
  today: Date,
): { past: string[]; next: string | null } {
  const step = frequencyMonths[m.frequency]
  const anchorDate = new Date(anchor + 'T00:00:00')
  if (Number.isNaN(anchorDate.getTime())) return { past: [], next: null }
  const anchorDay = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate(),
  )
  // Los días 29, 30 y 31 no existen todos los meses: se recortan a 28 para
  // que la serie no se vaya corriendo sola de mes en mes.
  const cursor = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    Math.max(1, Math.min(m.dueDay, 28)),
  )
  // El vencimiento del mes del ancla ya está cubierto por el ancla misma.
  let guard = 0
  while (cursor <= anchorDay && guard < 12) {
    cursor.setMonth(cursor.getMonth() + step)
    guard++
  }

  const past: string[] = []
  let next: string | null = null
  for (let i = 0; i < MAX_PERIODS; i++) {
    const iso = toIso(cursor)
    if ((daysUntil(iso, today) ?? 0) >= 0) {
      next = iso
      break
    }
    past.push(iso)
    cursor.setMonth(cursor.getMonth() + step)
  }
  // Si se agotó el tope, igual devolvemos algo como próximo vencimiento.
  if (next === null) next = toIso(cursor)

  return { past, next }
}

/**
 * Vencimiento del ciclo en curso como ISO (yyyy-mm-dd), o null si el plan no
 * está activo. Un vencimiento de hoy cuenta como el que viene, no como uno
 * que ya pasó.
 *
 * Ojo: esta función no sabe nada de cobros, así que no puede decir si los
 * períodos anteriores quedaron impagos. Para la mora usá
 * `maintenancePeriods()`, que mira los `MaintenanceCharge` de verdad.
 */
export function nextMaintenanceCharge(
  project: Project,
  today = new Date(),
): string | null {
  const m = project.maintenance
  if (!m.active || m.status !== 'Activo') return null
  const anchor = m.lastCollectedDate ?? m.startDate ?? m.implementationDate
  if (!anchor) return null
  return dueDateSeries(m, anchor, today).next
}

export interface MaintenancePeriods {
  /** Qué hay que cobrar: el impago más viejo si hay mora, si no el que viene. */
  next: string | null
  /** Vencimientos ya caídos sin ningún cobro que los tape, del más viejo al más nuevo. */
  overdue: string[]
  /** Lo adeudado por esos períodos, en la moneda del plan. */
  overdueTotal: MoneyByCurrency
}

/**
 * Todos los vencimientos del plan desde el arranque hasta hoy, y cuáles
 * quedaron sin cobrar.
 *
 * El ancla es cuándo arrancó el servicio, no el último cobro:
 * `lastCollectedDate` es estado derivado (es MAX(charged_on)), así que
 * usarlo de ancla haría que cada cobro nuevo borre los períodos impagos
 * anteriores y la mora se cure sola sin que nadie pague nada. Queda como
 * último recurso, cuando no hay ni inicio ni implementación ni cobros de
 * dónde agarrarse.
 *
 * Criterio de cobertura: cada vencimiento abre un período que va desde su
 * fecha (inclusive) hasta el vencimiento siguiente (exclusive), y un cobro
 * tapa el período en el que cae. Un cobro anterior al primer vencimiento —
 * un adelanto, o el cobro del día de la implementación — se imputa al primer
 * período. Dos cobros dentro del mismo período tapan uno solo: el otro sigue
 * contando como impago, que es justamente lo que hay que ver.
 */
export function maintenancePeriods(
  project: Project,
  charges: MaintenanceCharge[] = [],
  today = new Date(),
): MaintenancePeriods {
  const empty: MaintenancePeriods = { next: null, overdue: [], overdueTotal: {} }
  const m = project.maintenance
  if (!m.active || m.status !== 'Activo') return empty

  const own = charges.filter((c) => c.projectId === project.id)
  const earliestCharge = own.reduce<string | null>(
    (min, c) => (min === null || c.chargedOn < min ? c.chargedOn : min),
    null,
  )
  const anchor =
    m.startDate ?? m.implementationDate ?? earliestCharge ?? m.lastCollectedDate
  if (!anchor) return empty

  const { past, next } = dueDateSeries(m, anchor, today)
  const boundaries = next ? [...past, next] : past

  const covered = new Set<number>()
  for (const charge of own) {
    let index = -1
    for (let i = 0; i < boundaries.length; i++) {
      if (charge.chargedOn >= boundaries[i]) index = i
      else break
    }
    covered.add(index < 0 ? 0 : index)
  }

  const overdue = past.filter((_, i) => !covered.has(i))
  const overdueTotal: MoneyByCurrency =
    overdue.length > 0 ? { [m.currency]: overdue.length * m.amount } : {}

  return { next: overdue[0] ?? next, overdue, overdueTotal }
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

/**
 * El estado de un ticket no se guarda: se lee de `resolvedAt`. Toda la app
 * pasa por acá, así que la regla vive en un solo lugar y no hay forma de
 * que una pantalla diga «Abierto» y otra «Resuelto» de la misma fila.
 */
export function ticketStatus(ticket: Ticket): TicketStatus {
  return ticket.resolvedAt === null ? 'Abierto' : 'Resuelto'
}

export function isTicketOpen(ticket: Ticket): boolean {
  return ticket.resolvedAt === null
}

/** Cuántos abiertos hay de cada grado. Las claves son los tres grados. */
export function openTicketsByGrade(tickets: Ticket[]): Record<1 | 2 | 3, number> {
  const count: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  for (const t of tickets) if (isTicketOpen(t)) count[t.grade] += 1
  return count
}

/**
 * Días enteros que lleva abierto. Null si ya está resuelto.
 *
 * Se mide sobre el INSTANTE, no sobre los primeros diez caracteres de
 * `createdAt`. Esos diez caracteres son la fecha en UTC, y un ticket
 * cargado a las 22:00 de Buenos Aires ya cae en el día siguiente en UTC:
 * recién creado, se leería «1 día abierto» — y con el umbral en 0, un
 * grado 2 nacería casi a mitad de camino de su alerta. La resta de
 * instantes no tiene ese problema.
 */
export function ticketAge(ticket: Ticket, now = new Date()): number | null {
  if (!isTicketOpen(ticket)) return null
  const creado = new Date(ticket.createdAt)
  if (Number.isNaN(creado.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - creado.getTime()) / 86400000))
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

/**
 * Todos los campos son OBLIGATORIOS, y eso es el arreglo de un bug real.
 *
 * `maintenanceCharges` era opcional con default `[]`. La campana del header
 * y `/alertas` no lo pasaban y el dashboard sí, así que sin los cobros
 * `maintenancePeriods()` no encontraba nada que tapara los períodos y
 * marcaba como VENCIDO todo mantenimiento activo, aunque estuviera al día.
 * Tres vistas del mismo motor daban tres números distintos, y la que más se
 * ve — el punto rojo del header — era la que mentía.
 *
 * Un default vacío en una entrada de la que depende el resultado no ahorra
 * trabajo: esconde el olvido. Sin default, olvidarse es un error de
 * compilación y no una alerta fantasma que nadie sabe de dónde salió.
 */
interface AlertInput {
  projects: Project[]
  notes: Note[]
  tasks: Task[]
  /** Sin los cobros no hay forma de saber qué períodos quedaron impagos. */
  maintenanceCharges: MaintenanceCharge[]
  /** Si `11_tickets.sql` no está corrido llega vacío, y no hay alertas. */
  tickets: Ticket[]
}

/** dd/mm, que es todo lo que entra en el detalle de una alerta. */
function shortDay(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/**
 * Payments produce no alerts: they record money already received, so there
 * is no due date to fall behind. Recurring maintenance still does.
 */
export function buildAlerts({
  projects,
  notes,
  tasks,
  maintenanceCharges,
  tickets,
}: AlertInput): AlertItem[] {
  const alerts: AlertItem[] = []

  // Maintenance charges
  for (const project of projects) {
    const { next, overdue, overdueTotal } = maintenancePeriods(
      project,
      maintenanceCharges,
    )
    if (!next) continue
    // Una sola alerta por proyecto, aunque haya seis períodos sin cobrar:
    // el conteo y lo adeudado van en el detalle.
    if (overdue.length > 0) {
      alerts.push({
        id: `mnt-${project.id}`,
        level: 'critical',
        category: 'Mantenimientos',
        title: `Mantenimiento vencido · ${project.name}`,
        detail: `${overdue.length} cobro${overdue.length > 1 ? 's' : ''} sin registrar desde el ${shortDay(overdue[0])} · ${formatMoneyByCurrency(overdueTotal)}`,
        projectId: project.id,
        date: overdue[0],
      })
      continue
    }
    const d = daysUntil(next)
    if (d === null) continue
    if (d >= 0 && d <= 7) {
      alerts.push({
        id: `mnt-${project.id}`,
        level: 'warning',
        category: 'Mantenimientos',
        title: `Mantenimiento por cobrar · ${project.name}`,
        detail:
          d === 0
            ? `Se cobra hoy (${shortDay(next)})`
            : `Cobro en ${d} día(s) (${shortDay(next)})`,
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

  // Tickets abiertos.
  //
  // Un grado 3 alerta desde el minuto cero: eso significa «hay que verlo
  // ya». Los grados 2 y 1 no alertan por existir — alertan por quedarse:
  // a los 7 y a los 30 días. Sin ese umbral la campana quedaría con un
  // renglón por cada pedido cargado y dejaría de leerse.
  const umbral: Record<1 | 2 | 3, number> = { 3: 0, 2: 7, 1: 30 }

  for (const ticket of tickets) {
    if (!isTicketOpen(ticket)) continue
    const dias = ticketAge(ticket) ?? 0
    if (dias < umbral[ticket.grade]) continue
    const project = projects.find((p) => p.id === ticket.projectId)
    alerts.push({
      id: `tk-${ticket.id}`,
      level: ticket.grade === 3 ? 'critical' : ticket.grade === 2 ? 'warning' : 'info',
      category: 'Tickets',
      title: `${ticket.kind} sin resolver · ${project?.name ?? 'proyecto eliminado'}`,
      // `dias === 0` es «menos de 24 horas», no «hoy»: `ticketAge()` mide
      // períodos corridos, así que un ticket de ayer a las 23:00 todavía da
      // cero a las 10 de la mañana. Decirle «cargado hoy» sería mentir por
      // un detalle de redondeo.
      detail:
        dias === 0
          ? `${ticket.title} — hace menos de un día, grado ${ticket.grade}`
          : `${ticket.title} — ${dias} día(s) abierto, grado ${ticket.grade}`,
      projectId: ticket.projectId,
      date: ticket.createdAt,
    })
  }

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.level] - order[b.level])
}

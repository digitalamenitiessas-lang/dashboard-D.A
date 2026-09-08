import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  priorityStyles,
  statusStyles,
  ticketGradeStyles,
  ticketStatusStyles,
} from '@/lib/status'
import {
  TICKET_GRADE_LABELS,
  type Priority,
  type ProjectStatus,
  type TicketGrade,
  type TicketStatus,
} from '@/lib/types'

export function StatusChip({
  status,
  className,
}: {
  status: ProjectStatus
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', statusStyles[status], className)}
    >
      {status}
    </Badge>
  )
}

export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn('font-medium', priorityStyles[priority])}>
      {priority}
    </Badge>
  )
}

/**
 * El grado de un ticket. `short` muestra sólo «G3» — es lo que entra en el
 * renglón de una lista apretada o en una tarjeta del dashboard, donde el
 * color ya hace la mitad del trabajo.
 */
export function TicketGradeChip({
  grade,
  short = false,
}: {
  grade: TicketGrade
  short?: boolean
}) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium tabular-nums', ticketGradeStyles[grade])}
    >
      {short ? `G${grade}` : TICKET_GRADE_LABELS[grade]}
    </Badge>
  )
}

export function TicketStatusChip({ status }: { status: TicketStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', ticketStatusStyles[status])}
    >
      {status}
    </Badge>
  )
}

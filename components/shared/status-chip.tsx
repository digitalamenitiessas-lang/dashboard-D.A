import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { priorityStyles, statusStyles } from '@/lib/status'
import type { Priority, ProjectStatus } from '@/lib/types'

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

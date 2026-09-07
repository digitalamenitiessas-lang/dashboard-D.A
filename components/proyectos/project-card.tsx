import Link from 'next/link'
import { Building2, User } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { PriorityChip, StatusChip } from '@/components/shared/status-chip'
import { projectFinance } from '@/lib/derive'
import { formatMoney } from '@/lib/format'
import type { Payment, Project } from '@/lib/types'

export function ProjectCard({
  project,
  payments,
  clientName,
}: {
  project: Project
  payments: Payment[]
  clientName: string
}) {
  const fin = projectFinance(project, payments)
  return (
    <Link
      href={`/proyectos/${project.id}`}
      className="glass group flex flex-col gap-4 rounded-2xl p-4 transition-all hover:border-neon-green/25 hover:shadow-[0_0_30px_-12px_var(--neon-green)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {project.type === 'propio' ? (
            <Building2 className="size-3.5 text-neon-violet" />
          ) : (
            <User className="size-3.5 text-neon-blue" />
          )}
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {project.type === 'propio' ? 'Propio' : 'Terceros'}
          </span>
        </div>
        <StatusChip status={project.status} />
      </div>

      <div className="min-w-0">
        <h3 className="truncate font-display text-base font-extrabold group-hover:text-neon-green">
          {project.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {project.description}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{clientName}</span>
        <span className="text-white/20">·</span>
        <PriorityChip priority={project.priority} />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Avance</span>
          <span className="tabular-nums text-foreground">{project.development.progress}%</span>
        </div>
        <Progress value={project.development.progress} className="h-1.5" />
      </div>

      <div className="flex items-end justify-between border-t border-white/5 pt-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Cobrado</p>
          <p className="text-sm font-semibold tabular-nums text-neon-green">
            {formatMoney(fin.collected, project.currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Pendiente</p>
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(fin.pending, project.currency)}
          </p>
        </div>
      </div>
    </Link>
  )
}

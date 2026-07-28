'use client'

import Link from 'next/link'
import {
  Activity,
  Bell,
  CircleAlert,
  Clock,
  FolderKanban,
  Lightbulb,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { StatusChip } from '@/components/shared/status-chip'
import { SectionCard } from '@/components/dashboard/section-card'
import { Progress } from '@/components/ui/progress'
import { useStore } from '@/lib/store'
import {
  buildAlerts,
  nextMaintenanceCharge,
  projectFinance,
  type AlertLevel,
} from '@/lib/derive'
import { formatMoney, formatDate, relativeDays, daysUntil } from '@/lib/format'
import { ACTIVE_STATUSES } from '@/lib/status'
import { cn } from '@/lib/utils'

const alertDot: Record<AlertLevel, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-300',
  info: 'bg-neon-blue',
}

export default function DashboardPage() {
  const { projects, payments, notes, activity, tasks } = useStore()

  const totalQuoted = projects.reduce((s, p) => s + p.quotedAmount, 0)
  const totalCollected = projects.reduce(
    (s, p) => s + projectFinance(p, payments).collected,
    0,
  )
  const pending = Math.max(totalQuoted - totalCollected, 0)

  const own = projects.filter((p) => p.type === 'propio').length
  const third = projects.filter((p) => p.type === 'terceros').length
  const active = projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length
  const implemented = projects.filter(
    (p) => p.status === 'Implementado' || p.status === 'En mantenimiento',
  ).length
  const blocked = projects.filter((p) => p.status === 'Bloqueado').length
  const delayed = projects.filter(
    (p) =>
      p.estimatedDelivery &&
      (daysUntil(p.estimatedDelivery) ?? 0) < 0 &&
      !['Implementado', 'En mantenimiento', 'Finalizado'].includes(p.status),
  ).length

  const upcomingPayments = payments
    .filter((p) => p.status !== 'Cobrado')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4)

  const maintenanceDue = projects
    .map((p) => ({ project: p, next: nextMaintenanceCharge(p) }))
    .filter((m): m is { project: (typeof projects)[number]; next: string } => !!m.next)
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, 4)

  const alerts = buildAlerts({ projects, payments, notes, tasks }).slice(0, 5)

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  const recentNotes = [...notes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4)

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? '—'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Estado comercial, financiero, técnico y operativo de Digital Amenities."
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total cotizado"
          value={formatMoney(totalQuoted)}
          hint={`${projects.length} proyectos`}
          icon={TrendingUp}
          accent="blue"
        />
        <StatCard
          label="Total cobrado"
          value={formatMoney(totalCollected)}
          hint={`${Math.round((totalCollected / (totalQuoted || 1)) * 100)}% del total`}
          icon={Wallet}
          accent="green"
        />
        <StatCard
          label="Saldo pendiente"
          value={formatMoney(pending)}
          hint="Por cobrar"
          icon={Clock}
          accent="violet"
        />
        <StatCard
          label="Proyectos activos"
          value={active}
          hint={`${own} propios · ${third} terceros`}
          icon={FolderKanban}
          accent="neutral"
        />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Implementados" value={implemented} accent="green" />
        <StatCard label="Demorados" value={delayed} accent={delayed ? 'red' : 'neutral'} />
        <StatCard label="Bloqueados" value={blocked} accent={blocked ? 'red' : 'neutral'} />
        <StatCard label="Total proyectos" value={projects.length} accent="neutral" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Upcoming payments */}
        <SectionCard title="Próximos cobros" icon={Wallet} href="/cobros">
          <ul className="flex flex-col gap-3">
            {upcomingPayments.length === 0 ? (
              <li className="text-sm text-muted-foreground">Sin cobros pendientes.</li>
            ) : (
              upcomingPayments.map((pay) => {
                const overdue = (daysUntil(pay.dueDate) ?? 0) < 0 || pay.status === 'Vencido'
                return (
                  <li key={pay.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{pay.concept}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {projectName(pay.projectId)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(pay.amount, pay.currency)}
                      </p>
                      <p
                        className={cn(
                          'text-xs',
                          overdue ? 'text-red-300' : 'text-muted-foreground',
                        )}
                      >
                        {relativeDays(pay.dueDate)}
                      </p>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </SectionCard>

        {/* Maintenance due */}
        <SectionCard title="Mantenimientos por cobrar" icon={Wrench} href="/mantenimientos">
          <ul className="flex flex-col gap-3">
            {maintenanceDue.length === 0 ? (
              <li className="text-sm text-muted-foreground">Sin mantenimientos activos.</li>
            ) : (
              maintenanceDue.map(({ project, next }) => {
                const overdue = (daysUntil(next) ?? 0) < 0
                return (
                  <li key={project.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.maintenance.frequency} · {formatDate(next)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(project.maintenance.amount, project.maintenance.currency)}
                      </p>
                      <p className={cn('text-xs', overdue ? 'text-red-300' : 'text-muted-foreground')}>
                        {relativeDays(next)}
                      </p>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </SectionCard>

        {/* Alerts */}
        <SectionCard title="Alertas importantes" icon={Bell} href="/alertas">
          <ul className="flex flex-col gap-3">
            {alerts.length === 0 ? (
              <li className="text-sm text-muted-foreground">Todo en orden.</li>
            ) : (
              alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', alertDot[a.level])} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recently updated projects */}
        <SectionCard
          title="Proyectos actualizados recientemente"
          icon={FolderKanban}
          href="/proyectos"
          className="lg:col-span-2"
        >
          <ul className="flex flex-col divide-y divide-white/5">
            {recentProjects.map((p) => {
              const fin = projectFinance(p, payments)
              return (
                <li key={p.id}>
                  <Link
                    href={`/proyectos/${p.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <StatusChip status={p.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={p.development.progress} className="h-1.5 max-w-40" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {p.development.progress}%
                        </span>
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(fin.collected, p.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        de {formatMoney(fin.quoted, p.currency)}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </SectionCard>

        {/* Recent notes */}
        <SectionCard title="Últimas notas" icon={Lightbulb} href="/notas">
          <ul className="flex flex-col gap-3">
            {recentNotes.map((n) => (
              <li key={n.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="truncate text-sm font-medium">{n.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.content}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {n.author} · {formatDate(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Activity feed */}
      <SectionCard title="Historial de actividad" icon={Activity}>
        <ul className="flex flex-col gap-3">
          {activity.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
                <CircleAlert className="size-3.5 text-muted-foreground" />
              </span>
              <p className="min-w-0 flex-1 truncate text-sm">{a.message}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.date)}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

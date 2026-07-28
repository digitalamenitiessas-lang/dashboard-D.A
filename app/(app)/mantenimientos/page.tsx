'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  CircleCheck,
  History,
  Plus,
  Repeat,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { StatusChip } from '@/components/shared/status-chip'
import { SectionCard } from '@/components/dashboard/section-card'
import { TodoList } from '@/components/proyectos/detail-parts'
import {
  ActivateMaintenanceDialog,
  CollectMaintenanceDialog,
} from '@/components/mantenimientos/maintenance-dialogs'
import { useStore } from '@/lib/store'
import { monthlyMaintenanceValue, nextMaintenanceCharge } from '@/lib/derive'
import { formatDate, formatMoney, relativeDays, daysUntil } from '@/lib/format'
import { formatMoneyByCurrency, sumByCurrency } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/types'

export default function MantenimientosPage() {
  const { projects, maintenanceCharges } = useStore()
  const [activateTarget, setActivateTarget] = React.useState<Project | null>(null)
  const [collectTarget, setCollectTarget] = React.useState<Project | null>(null)
  const [newPlanOpen, setNewPlanOpen] = React.useState(false)

  const active = projects
    .filter((p) => p.maintenance.active && p.maintenance.status === 'Activo')
    .map((p) => ({ project: p, next: nextMaintenanceCharge(p) }))
    .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'))

  // Implemented projects that could start billing but haven't been activated.
  const eligible = projects.filter(
    (p) =>
      !p.maintenance.active &&
      (p.status === 'Implementado' || p.implementationDate !== null),
  )

  const projectName = React.useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? '—',
    [projects],
  )

  // Each plan bills in its own currency, so the MRR stays bucketed.
  const mrr = sumByCurrency(
    projects
      .map((p) => ({
        amount: monthlyMaintenanceValue(p),
        currency: p.maintenance.currency,
      }))
      .filter((m) => m.amount > 0),
  )
  const collectedTotal = sumByCurrency(maintenanceCharges)
  const chargesByProject = React.useMemo(() => {
    const grouped = new Map<string, typeof maintenanceCharges>()
    for (const charge of maintenanceCharges) {
      const list = grouped.get(charge.projectId)
      if (list) list.push(charge)
      else grouped.set(charge.projectId, [charge])
    }
    return grouped
  }, [maintenanceCharges])
  const dueSoon = active.filter(
    ({ next }) => next && (daysUntil(next) ?? 99) <= 7 && (daysUntil(next) ?? 0) >= 0,
  ).length
  const overdue = active.filter(
    ({ next }) => next && (daysUntil(next) ?? 0) < 0,
  ).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mantenimientos"
        description="Planes recurrentes, próximos cobros y proyectos listos para activar."
      >
        <Button size="sm" onClick={() => setNewPlanOpen(true)}>
          <Plus data-icon="inline-start" />
          Activar mantenimiento
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Ingreso mensual recurrente"
          value={formatMoneyByCurrency(mrr)}
          hint="Normalizado a valor mensual"
          icon={Repeat}
          accent="green"
        />
        <StatCard
          label="Planes activos"
          value={active.length}
          icon={Wrench}
          accent="violet"
        />
        <StatCard
          label="Por cobrar (7 días)"
          value={dueSoon}
          icon={CalendarClock}
          accent={dueSoon ? 'blue' : 'neutral'}
        />
        <StatCard
          label="Vencidos"
          value={overdue}
          icon={TriangleAlert}
          accent={overdue ? 'red' : 'neutral'}
        />
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-extrabold text-muted-foreground uppercase tracking-wide">
          Planes activos
        </h2>
        {active.length === 0 ? (
          <Empty className="glass rounded-2xl">
            <EmptyHeader>
              <EmptyTitle>Sin mantenimientos activos</EmptyTitle>
              <EmptyDescription>
                Activá un plan en los proyectos ya implementados para empezar a
                facturar de forma recurrente.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {active.map(({ project, next }) => {
              const d = next ? daysUntil(next) : null
              const late = d !== null && d < 0
              const soon = d !== null && d >= 0 && d <= 7
              const m = project.maintenance
              return (
                <section key={project.id} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/proyectos/${project.id}`}
                        className="font-display text-base font-extrabold transition-colors hover:text-neon-green"
                      >
                        {project.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatMoney(m.amount, m.currency)} ·{' '}
                        {m.frequency.toLowerCase()} · día {m.dueDay}
                      </p>
                    </div>
                    <StatusChip status={project.status} />
                  </div>

                  <div
                    className={cn(
                      'mt-4 flex items-center justify-between gap-3 rounded-xl border p-3',
                      late
                        ? 'border-destructive/30 bg-destructive/10'
                        : soon
                          ? 'border-amber-400/25 bg-amber-400/10'
                          : 'border-white/5 bg-white/[0.02]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        Próximo cobro
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {formatDate(next)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium',
                        late
                          ? 'text-red-300'
                          : soon
                            ? 'text-amber-300'
                            : 'text-muted-foreground',
                      )}
                    >
                      {next ? relativeDays(next) : '—'}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Servicios incluidos
                    </p>
                    <TodoList items={m.services} empty="Sin servicios definidos" />
                  </div>

                  {(() => {
                    const history = chargesByProject.get(project.id) ?? []
                    if (history.length === 0) return null
                    return (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Últimos cobros ({history.length})
                        </p>
                        <ul className="flex flex-col divide-y divide-white/5">
                          {history.slice(0, 3).map((charge) => (
                            <li
                              key={charge.id}
                              className="flex items-center justify-between gap-3 py-1.5 text-xs"
                            >
                              <span className="text-muted-foreground">
                                {formatDate(charge.chargedOn)}
                                {charge.method ? ` · ${charge.method}` : ''}
                              </span>
                              <span className="shrink-0 font-medium tabular-nums">
                                {formatMoney(charge.amount, charge.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })()}

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                    <span className="text-xs text-muted-foreground">
                      Último cobro: {formatDate(m.lastCollectedDate)}
                    </span>
                    <Button size="sm" onClick={() => setCollectTarget(project)}>
                      <CircleCheck data-icon="inline-start" />
                      Registrar cobro
                    </Button>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {eligible.length > 0 ? (
        <SectionCard title="Listos para activar mantenimiento" icon={Wrench}>
          <ul className="flex flex-col divide-y divide-white/5">
            {eligible.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/proyectos/${p.id}`}
                    className="truncate text-sm font-medium transition-colors hover:text-neon-green"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Implementado {formatDate(p.implementationDate)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActivateTarget(p)}
                >
                  Activar
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {maintenanceCharges.length > 0 ? (
        <SectionCard title="Historial de cobros" icon={History}>
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/5 pb-3">
            <span className="text-xs text-muted-foreground">
              {maintenanceCharges.length} cobro(s) registrado(s)
            </span>
            <span className="text-sm font-semibold tabular-nums text-neon-green">
              {formatMoneyByCurrency(collectedTotal)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Comprobante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenanceCharges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell>{formatDate(charge.chargedOn)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/proyectos/${charge.projectId}`}
                        className="transition-colors hover:text-neon-green"
                      >
                        {projectName(charge.projectId)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(charge.amount, charge.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {charge.method ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {charge.receipt ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      {newPlanOpen ? (
        <ActivateMaintenanceDialog
          open={newPlanOpen}
          onOpenChange={setNewPlanOpen}
        />
      ) : null}

      {activateTarget ? (
        <ActivateMaintenanceDialog
          project={activateTarget}
          open={!!activateTarget}
          onOpenChange={(o) => !o && setActivateTarget(null)}
        />
      ) : null}

      {collectTarget ? (
        <CollectMaintenanceDialog
          project={collectTarget}
          open={!!collectTarget}
          onOpenChange={(o) => !o && setCollectTarget(null)}
        />
      ) : null}
    </div>
  )
}

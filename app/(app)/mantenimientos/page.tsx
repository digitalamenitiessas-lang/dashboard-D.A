'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  CircleCheck,
  CirclePause,
  History,
  Pencil,
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
  EditMaintenanceChargeDialog,
  EditMaintenanceDialog,
} from '@/components/mantenimientos/maintenance-dialogs'
import { WhatsappButton } from '@/components/shared/whatsapp-button'
import { mensajeMantenimientoVencido } from '@/lib/mensajes'
import { useStore } from '@/lib/store'
import {
  hasMaintenancePlan,
  maintenancePeriods,
  monthlyMaintenanceValue,
} from '@/lib/derive'
import { formatDate, formatMoney, relativeDays, daysUntil } from '@/lib/format'
import {
  formatMoneyByCurrency,
  isEmptyMoney,
  mergeMoney,
  sumByCurrency,
} from '@/lib/money'
import { cn } from '@/lib/utils'
import type { MaintenanceCharge, Project } from '@/lib/types'

export default function MantenimientosPage() {
  const { projects, clients, maintenanceCharges } = useStore()
  const [activateTarget, setActivateTarget] = React.useState<Project | null>(null)
  const [collectTarget, setCollectTarget] = React.useState<Project | null>(null)
  const [newPlanOpen, setNewPlanOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Project | null>(null)
  const [chargeTarget, setChargeTarget] =
    React.useState<MaintenanceCharge | null>(null)

  // `next` ya viene con la mora adentro: si hay períodos sin cobrar, el que
  // toca cobrar es el impago más viejo, no el del mes que viene.
  const active = projects
    .filter((p) => p.maintenance.status === 'Activo')
    .map((p) => ({ project: p, ...maintenancePeriods(p, maintenanceCharges) }))
    .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'))

  /**
   * Planes cargados que hoy NO están cobrando: pausados y cancelados.
   *
   * Tienen que estar a la vista. Sin esta lista, pausar un plan lo hacía
   * desaparecer de todas las pantallas —con su importe y su historial
   * intactos pero invisibles— y no quedaba forma de volver a editarlo ni de
   * reactivarlo.
   */
  const parados = projects
    .filter((p) => hasMaintenancePlan(p.maintenance) && p.maintenance.status !== 'Activo')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  // Proyectos implementados que podrían empezar a facturar y todavía no
  // tienen ningún plan cargado. Los que SÍ tienen uno pero está parado van
  // arriba, en su propia lista: ahí lo que corresponde es editarlo, no
  // cargarlo de cero encima del que ya existe.
  const eligible = projects.filter(
    (p) =>
      !hasMaintenancePlan(p.maintenance) &&
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
    ({ next, overdue }) =>
      overdue.length === 0 &&
      next &&
      (daysUntil(next) ?? 99) <= 7 &&
      (daysUntil(next) ?? 0) >= 0,
  ).length
  // Planes con al menos un período caído sin cobro que lo tape.
  const overdueCount = active.filter(({ overdue }) => overdue.length > 0).length
  const overdueTotal = mergeMoney(...active.map((a) => a.overdueTotal))

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          value={overdueCount}
          hint={
            isEmptyMoney(overdueTotal)
              ? 'Sin cobros atrasados'
              : `${formatMoneyByCurrency(overdueTotal)} sin cobrar`
          }
          icon={TriangleAlert}
          accent={overdueCount ? 'red' : 'neutral'}
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
            {active.map(({ project, next, overdue, overdueTotal }) => {
              const d = next ? daysUntil(next) : null
              const late = overdue.length > 0
              const soon = !late && d !== null && d >= 0 && d <= 7
              const m = project.maintenance
              const cliente = clients.find((c) => c.id === project.clientId)
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
                        {late ? 'Cobro más viejo sin registrar' : 'Próximo cobro'}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
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

                  {late ? (
                    <div className="mt-2 flex flex-col items-start gap-1 rounded-xl border border-destructive/30 bg-destructive/10 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-red-300">
                        <TriangleAlert className="size-3.5 shrink-0" />
                        {overdue.length} período(s) sin cobrar
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-red-300">
                        {formatMoneyByCurrency(overdueTotal)}
                      </span>
                    </div>
                  ) : null}

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
                            <li key={charge.id}>
                              {/* Todo el renglón es el blanco: en el celular
                                  un ícono de lápiz de 24px al lado de un
                                  monto es imposible de acertar. */}
                              <button
                                type="button"
                                onClick={() => setChargeTarget(charge)}
                                aria-label={`Corregir el cobro del ${formatDate(charge.chargedOn)} en ${project.name}`}
                                className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-white/5"
                              >
                                <span className="text-muted-foreground tabular-nums">
                                  {formatDate(charge.chargedOn)}
                                  {charge.method ? ` · ${charge.method}` : ''}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums">
                                  {formatMoney(charge.amount, charge.currency)}
                                </span>
                              </button>
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* Sólo si está vencido: el reclamo se ofrece cuando hay
                          algo que reclamar. Un botón de WhatsApp en un plan al
                          día invita a molestar a un cliente que no debe nada. */}
                      {late && cliente?.phone ? (
                        <WhatsappButton
                          telefono={cliente.phone}
                          mensaje={mensajeMantenimientoVencido(
                            cliente.contactPerson || project.contactPerson,
                            project.name,
                            overdue.length,
                            overdue[0],
                            overdueTotal,
                          )}
                          label="Reclamar"
                        />
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditTarget(project)}
                      >
                        <Pencil data-icon="inline-start" />
                        Editar
                      </Button>
                      <Button size="sm" onClick={() => setCollectTarget(project)}>
                        <CircleCheck data-icon="inline-start" />
                        Registrar cobro
                      </Button>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {parados.length > 0 ? (
        <SectionCard title="Planes pausados o cancelados" icon={CirclePause}>
          <ul className="flex flex-col divide-y divide-white/5">
            {parados.map((p) => (
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
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {p.maintenance.status} ·{' '}
                    {formatMoney(p.maintenance.amount, p.maintenance.currency)} /{' '}
                    {p.maintenance.frequency.toLowerCase()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditTarget(p)}
                >
                  <Pencil data-icon="inline-start" />
                  Editar
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

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
          {/* Sin div extra: el scroll horizontal lo da Table. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead nowrap={false}>Comprobante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenanceCharges.map((charge) => (
                <TableRow
                  key={charge.id}
                  onClick={() => setChargeTarget(charge)}
                  className="cursor-pointer transition-colors hover:bg-white/5"
                >
                  <TableCell className="tabular-nums">
                    {formatDate(charge.chargedOn)}
                  </TableCell>
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
                  {/* El comprobante es texto libre (links de Drive incluidos):
                      wrappea en vez de estirar la tabla. */}
                  <TableCell
                    nowrap={false}
                    className="max-w-56 break-words text-muted-foreground"
                  >
                    {charge.receipt ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      ) : null}

      {editTarget ? (
        <EditMaintenanceDialog
          key={editTarget.id}
          project={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      ) : null}

      {chargeTarget ? (
        <EditMaintenanceChargeDialog
          key={chargeTarget.id}
          charge={chargeTarget}
          projectName={
            projects.find((p) => p.id === chargeTarget.projectId)?.name ??
            'Proyecto eliminado'
          }
          open={!!chargeTarget}
          onOpenChange={(o) => !o && setChargeTarget(null)}
        />
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

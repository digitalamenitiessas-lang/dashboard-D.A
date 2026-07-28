'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  CircleDollarSign,
  Database,
  ExternalLink,
  GitBranch,
  Globe,
  Pencil,
  Server,
  StickyNote,
  User,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  PaymentStatusChip,
  PriorityChip,
  StatusChip,
} from '@/components/shared/status-chip'
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { DetailCard, InfoRow, TodoList } from '@/components/proyectos/detail-parts'
import { TaskList } from '@/components/proyectos/task-list'
import { EditProjectDialog } from '@/components/proyectos/edit-project-dialog'
import { EditDevelopmentDialog } from '@/components/proyectos/edit-development-dialog'
import { EditInfrastructureDialog } from '@/components/proyectos/edit-infrastructure-dialog'
import { InfraCostsCard } from '@/components/proyectos/infra-costs-card'
import { NewNoteDialog } from '@/components/notas/new-note-dialog'
import { AddPaymentDialog } from '@/components/cobros/add-payment-dialog'
import { CollectPaymentDialog } from '@/components/cobros/collect-payment-dialog'
import { EditPaymentDialog } from '@/components/cobros/edit-payment-dialog'
import { useStore } from '@/lib/store'
import { projectFinance, nextMaintenanceCharge } from '@/lib/derive'
import { formatDate, formatMoney, relativeDays } from '@/lib/format'
import { PROJECT_STATUSES } from '@/lib/types'
import type { Payment, ProjectStatus } from '@/lib/types'

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const {
    projects,
    clients,
    payments,
    notes,
    activity,
    tasks,
    updateProjectStatus,
  } = useStore()
  const [payDialogOpen, setPayDialogOpen] = React.useState(false)
  const [collectTarget, setCollectTarget] = React.useState<Payment | null>(null)
  const [editPayTarget, setEditPayTarget] = React.useState<Payment | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [devOpen, setDevOpen] = React.useState(false)
  const [infraOpen, setInfraOpen] = React.useState(false)

  const project = projects.find((p) => p.id === params.id)

  if (!project) {
    return (
      <Empty className="glass rounded-2xl">
        <EmptyHeader>
          <EmptyTitle>Proyecto no encontrado</EmptyTitle>
          <EmptyDescription>
            El proyecto que buscás no existe o fue eliminado.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => router.push('/proyectos')}>
          Volver a proyectos
        </Button>
      </Empty>
    )
  }

  const client = clients.find((c) => c.id === project.clientId)
  const fin = projectFinance(project, payments)
  const projectPayments = payments
    .filter((p) => p.projectId === project.id)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const dev = project.development
  const infra = project.infrastructure
  const mnt = project.maintenance
  const nextCharge = nextMaintenanceCharge(project)
  const projectActivity = activity.filter((a) => a.projectId === project.id)
  const projectTasks = tasks.filter((t) => t.projectId === project.id)
  const internalTasks = projectTasks.filter((t) => t.kind === 'interno')
  const clientTasks = projectTasks.filter((t) => t.kind === 'cliente')
  const blockers = projectTasks.filter((t) => t.kind === 'bloqueador')

  // Notes spawned from this project, plus any that name it or its client.
  const noteHaystack = [project.name, client?.name]
    .filter(Boolean)
    .map((s) => (s as string).toLowerCase())
  const relatedNotes = notes.filter((n) => {
    if (n.projectId === project.id) return true
    if (n.convertedToProjectId === project.id) return true
    const text = `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase()
    return noteHaystack.some((needle) => text.includes(needle))
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 text-muted-foreground"
          nativeButton={false}
          render={<Link href="/proyectos" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Proyectos
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              {project.type === 'propio' ? (
                <Building2 className="size-4 text-neon-violet" />
              ) : (
                <User className="size-4 text-neon-blue" />
              )}
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {project.type === 'propio' ? 'Proyecto propio' : 'Cliente'}
                {client ? ` · ${client.name}` : ''}
              </span>
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-balance">
              {project.name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
              {project.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip status={project.status} />
              <PriorityChip priority={project.priority} />
              <span className="text-xs text-muted-foreground">
                Actualizado {relativeDays(project.updatedAt).toLowerCase()}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Cambiar estado</span>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil data-icon="inline-start" />
                Editar proyecto
              </Button>
            </div>
            <SimpleSelect
              value={project.status}
              onValueChange={(v) =>
                void updateProjectStatus(project.id, v as ProjectStatus)
              }
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
              className="lg:w-56"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Presupuestado"
          value={formatMoney(fin.quoted, project.currency)}
          icon={CircleDollarSign}
        />
        <StatCard
          label="Cobrado"
          value={formatMoney(fin.collected, project.currency)}
          accent="green"
        />
        <StatCard
          label="Pendiente"
          value={formatMoney(fin.pending, project.currency)}
          accent={fin.pending > 0 ? 'blue' : 'neutral'}
        />
        <StatCard
          label="Avance"
          value={`${dev.progress}%`}
          accent="violet"
        />
      </div>

      <Tabs defaultValue="resumen">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="desarrollo">Desarrollo</TabsTrigger>
          <TabsTrigger value="cobros">Cobros</TabsTrigger>
          <TabsTrigger value="infraestructura">Infraestructura</TabsTrigger>
          <TabsTrigger value="mantenimiento">Mantenimiento</TabsTrigger>
          <TabsTrigger value="actividad">Notas y actividad</TabsTrigger>
        </TabsList>

        {/* RESUMEN */}
        <TabsContent value="resumen" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailCard title="Información general" icon={Calendar}>
              <InfoRow label="Tipo">
                {project.type === 'propio' ? 'Propio' : 'Terceros'}
              </InfoRow>
              <InfoRow label="Cliente / dueño">
                {client?.name ?? project.ownerName}
              </InfoRow>
              <InfoRow label="Contacto">{project.contactPerson || '—'}</InfoRow>
              <InfoRow label="Responsable interno">{project.internalLead}</InfoRow>
              <InfoRow label="Inicio">{formatDate(project.startDate)}</InfoRow>
              <InfoRow label="Entrega estimada">
                {formatDate(project.estimatedDelivery)}
              </InfoRow>
              <InfoRow label="Implementación">
                {formatDate(project.implementationDate)}
              </InfoRow>
            </DetailCard>

            <div className="flex flex-col gap-4">
              <DetailCard title="Estado del desarrollo" icon={Wrench}>
                <div className="py-2">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{dev.stage}</span>
                    <span className="tabular-nums">{dev.progress}%</span>
                  </div>
                  <Progress value={dev.progress} className="h-2" />
                </div>
                <InfoRow label="Próximo objetivo">{dev.nextGoal || '—'}</InfoRow>
                <InfoRow label="Última actualización">
                  {formatDate(dev.lastUpdate)}
                </InfoRow>
              </DetailCard>

              {blockers.some((t) => !t.done) ? (
                <DetailCard title="Bloqueos activos">
                  <ul className="flex flex-col gap-2 py-1">
                    {blockers
                      .filter((t) => !t.done)
                      .map((t) => (
                        <li key={t.id} className="flex items-start gap-2.5 text-sm">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-400" />
                          <span className="text-pretty">{t.title}</span>
                        </li>
                      ))}
                  </ul>
                </DetailCard>
              ) : null}
            </div>
          </div>
        </TabsContent>

        {/* DESARROLLO */}
        <TabsContent value="desarrollo" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailCard
              title="Progreso"
              icon={Wrench}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDevOpen(true)}
                >
                  <Pencil data-icon="inline-start" />
                  Editar
                </Button>
              }
            >
              <div className="py-3">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {dev.stage || 'Sin etapa definida'}
                  </span>
                  <span className="tabular-nums">{dev.progress}%</span>
                </div>
                <Progress value={dev.progress} className="h-2" />
              </div>
              <InfoRow label="Próximo objetivo">{dev.nextGoal || '—'}</InfoRow>
              <InfoRow label="Última actualización">
                {formatDate(dev.lastUpdate)}
              </InfoRow>
            </DetailCard>

            <DetailCard title="Pendientes internos">
              <TaskList
                projectId={project.id}
                kind="interno"
                tasks={internalTasks}
                placeholder="Agregar una feature o tarea..."
              />
            </DetailCard>

            <DetailCard title="Pendientes del cliente">
              <TaskList
                projectId={project.id}
                kind="cliente"
                tasks={clientTasks}
                placeholder="Agregar algo que esperamos del cliente..."
                empty="Nada esperando del cliente"
              />
            </DetailCard>

            <DetailCard title="Bloqueos">
              <TaskList
                projectId={project.id}
                kind="bloqueador"
                tasks={blockers}
                placeholder="Agregar un bloqueo..."
                empty="Sin bloqueos"
              />
            </DetailCard>
          </div>
        </TabsContent>

        {/* COBROS */}
        <TabsContent value="cobros" className="mt-4">
          <div className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-white/5 p-4">
              <div>
                <h3 className="font-display text-sm font-extrabold">Pagos del proyecto</h3>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(fin.collected, project.currency)} cobrado de{' '}
                  {formatMoney(fin.quoted, project.currency)}
                </p>
              </div>
              <AddPaymentDialog
                open={payDialogOpen}
                onOpenChange={setPayDialogOpen}
                defaultProjectId={project.id}
              />
            </div>
            {projectPayments.length === 0 ? (
              <div className="p-6">
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Sin pagos registrados</EmptyTitle>
                    <EmptyDescription>
                      Registrá el primer cobro de este proyecto.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectPayments.map((pay) => (
                    <TableRow key={pay.id}>
                      <TableCell className="font-medium">{pay.concept}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatMoney(pay.amount, pay.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(pay.dueDate)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusChip status={pay.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {pay.status !== 'Cobrado' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCollectTarget(pay)}
                            >
                              Cobrar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(pay.paidDate)}
                            </span>
                          )}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar pago: ${pay.concept}`}
                            onClick={() => setEditPayTarget(pay)}
                          >
                            <Pencil />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* INFRAESTRUCTURA */}
        <TabsContent value="infraestructura" className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setInfraOpen(true)}>
              <Pencil data-icon="inline-start" />
              Editar infraestructura
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailCard title="Accesos y entornos" icon={Globe}>
              <InfoRow label="Producción">
                <LinkOrDash url={infra.productionUrl} />
              </InfoRow>
              <InfoRow label="Staging">
                <LinkOrDash url={infra.stagingUrl} />
              </InfoRow>
              <InfoRow label="Repositorio">
                <LinkOrDash url={infra.repo} icon={GitBranch} label="Repo" />
              </InfoRow>
              <InfoRow label="Dominio">{infra.domain || '—'}</InfoRow>
              <InfoRow label="Vence dominio">
                {infra.domainExpiry ? (
                  <span>
                    {formatDate(infra.domainExpiry)}{' '}
                    <span className="text-muted-foreground">
                      ({relativeDays(infra.domainExpiry).toLowerCase()})
                    </span>
                  </span>
                ) : (
                  '—'
                )}
              </InfoRow>
            </DetailCard>

            <DetailCard title="Stack técnico" icon={Server}>
              <InfoRow label="Deploy">{infra.deployPlatform || '—'}</InfoRow>
              <InfoRow label="Hosting">{infra.hosting || '—'}</InfoRow>
              <InfoRow label="Base de datos">
                <span className="inline-flex items-center gap-1.5">
                  <Database className="size-3.5 text-muted-foreground" />
                  {infra.database || '—'}
                </span>
              </InfoRow>
              <InfoRow label="Líder técnico">{infra.techLead || '—'}</InfoRow>
            </DetailCard>

            <DetailCard title="Servicios externos">
              <TodoList items={infra.externalServices} empty="Ninguno" />
            </DetailCard>

            <DetailCard title="Automatizaciones">
              <TodoList items={infra.automations} empty="Ninguna" />
            </DetailCard>

            <InfraCostsCard project={project} />
          </div>
        </TabsContent>

        {/* MANTENIMIENTO */}
        <TabsContent value="mantenimiento" className="mt-4">
          {mnt.active ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DetailCard title="Plan de mantenimiento" icon={Wrench}>
                <InfoRow label="Estado">{mnt.status}</InfoRow>
                <InfoRow label="Monto">
                  {formatMoney(mnt.amount, mnt.currency)} / {mnt.frequency.toLowerCase()}
                </InfoRow>
                <InfoRow label="Día de cobro">Día {mnt.dueDay} del período</InfoRow>
                <InfoRow label="Inicio">{formatDate(mnt.startDate)}</InfoRow>
                <InfoRow label="Último cobro">
                  {formatDate(mnt.lastCollectedDate)}
                </InfoRow>
                <InfoRow label="Próximo cobro">
                  {nextCharge ? (
                    <span>
                      {formatDate(nextCharge)}{' '}
                      <span className="text-muted-foreground">
                        ({relativeDays(nextCharge).toLowerCase()})
                      </span>
                    </span>
                  ) : (
                    '—'
                  )}
                </InfoRow>
              </DetailCard>
              <DetailCard title="Servicios incluidos">
                <TodoList items={mnt.services} empty="Sin servicios definidos" />
              </DetailCard>
            </div>
          ) : (
            <Empty className="glass rounded-2xl">
              <EmptyHeader>
                <EmptyTitle>Sin mantenimiento activo</EmptyTitle>
                <EmptyDescription>
                  Este proyecto no tiene un plan de mantenimiento recurrente.
                  Activalo desde la sección Mantenimientos una vez implementado.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/mantenimientos" />}
              >
                Ir a mantenimientos
              </Button>
            </Empty>
          )}
        </TabsContent>

        {/* NOTAS Y ACTIVIDAD */}
        <TabsContent value="actividad" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailCard title="Historial de actividad" icon={Activity}>
              {projectActivity.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Todavía no hay movimientos registrados.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-white/5">
                  {projectActivity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {a.type}
                      </span>
                      <p className="min-w-0 flex-1 text-sm text-pretty">
                        {a.message}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(a.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>

            <DetailCard
              title="Notas relacionadas"
              icon={StickyNote}
              action={
                <NewNoteDialog
                  defaultProjectId={project.id}
                  triggerLabel="Nueva nota"
                  triggerVariant="outline"
                />
              }
            >
              {relatedNotes.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Sin notas vinculadas a este proyecto.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-white/5">
                  {relatedNotes.map((n) => (
                    <li key={n.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <PriorityChip priority={n.priority} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground text-pretty">
                        {n.content}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {n.author} · {formatDate(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>
          </div>
        </TabsContent>
      </Tabs>

      <Separator className="opacity-0" />

      {collectTarget ? (
        <CollectPaymentDialog
          payment={collectTarget}
          open={!!collectTarget}
          onOpenChange={(o) => !o && setCollectTarget(null)}
        />
      ) : null}

      {editPayTarget ? (
        <EditPaymentDialog
          key={editPayTarget.id}
          payment={editPayTarget}
          open={!!editPayTarget}
          onOpenChange={(o) => !o && setEditPayTarget(null)}
        />
      ) : null}

      {/* Keyed so each dialog re-seeds its fields from the current project. */}
      {editOpen ? (
        <EditProjectDialog
          key={`edit-${project.updatedAt}`}
          project={project}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
      {devOpen ? (
        <EditDevelopmentDialog
          key={`dev-${project.updatedAt}`}
          project={project}
          open={devOpen}
          onOpenChange={setDevOpen}
        />
      ) : null}
      {infraOpen ? (
        <EditInfrastructureDialog
          key={`infra-${project.updatedAt}`}
          project={project}
          open={infraOpen}
          onOpenChange={setInfraOpen}
        />
      ) : null}
    </div>
  )
}

function LinkOrDash({
  url,
  icon: Icon = ExternalLink,
  label,
}: {
  url: string
  icon?: typeof ExternalLink
  label?: string
}) {
  if (!url) return <span>—</span>
  // Seed data stores some URLs without a scheme; without it the anchor would
  // resolve relative to the current route.
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-neon-blue hover:underline"
    >
      {label ?? url.replace(/^https?:\/\//, '')}
      <Icon className="size-3.5" />
    </a>
  )
}

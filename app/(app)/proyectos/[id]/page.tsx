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
  History,
  Pencil,
  Server,
  StickyNote,
  Ticket as TicketIcon,
  TriangleAlert,
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
  PriorityChip,
  StatusChip,
  TicketGradeChip,
} from '@/components/shared/status-chip'
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { LinkedText } from '@/components/shared/linked-text'
import { DetailCard, InfoRow, TodoList } from '@/components/proyectos/detail-parts'
import { TaskList } from '@/components/proyectos/task-list'
import { EditProjectDialog } from '@/components/proyectos/edit-project-dialog'
import { EditDevelopmentDialog } from '@/components/proyectos/edit-development-dialog'
import { EditInfrastructureDialog } from '@/components/proyectos/edit-infrastructure-dialog'
import { FixedCostsCard } from '@/components/proyectos/fixed-costs-card'
import { FacturasCard } from '@/components/facturas/facturas-card'
import { EditMaintenanceDialog } from '@/components/mantenimientos/maintenance-dialogs'
import { NewNoteDialog } from '@/components/notas/new-note-dialog'
import { WhatsappButton } from '@/components/shared/whatsapp-button'
import { mensajeCobroProyecto } from '@/lib/mensajes'
import { NewTicketDialog } from '@/components/tickets/new-ticket-dialog'
import { ResolveTicketDialog } from '@/components/tickets/resolve-ticket-dialog'
import { AddPaymentDialog } from '@/components/cobros/add-payment-dialog'
import { EditPaymentDialog } from '@/components/cobros/edit-payment-dialog'
import { useStore } from '@/lib/store'
import {
  describirVentana,
  hasMaintenancePlan,
  isTicketOpen,
  nextMaintenanceCharge,
  projectFinance,
  ticketAge,
} from '@/lib/derive'
import {
  formatDate,
  formatMoney,
  formatMoneyWithCode,
  relativeDays,
} from '@/lib/format'
import { formatMoneyByCurrency, isEmptyMoney } from '@/lib/money'
import { PROJECT_STATUSES } from '@/lib/types'
import type { Payment, ProjectStatus, Ticket } from '@/lib/types'

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
    maintenanceCharges,
    tickets,
    ticketsReady,
    updateProjectStatus,
  } = useStore()
  const [payDialogOpen, setPayDialogOpen] = React.useState(false)
  const [editPayTarget, setEditPayTarget] = React.useState<Payment | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [devOpen, setDevOpen] = React.useState(false)
  const [infraOpen, setInfraOpen] = React.useState(false)
  const [resolveTarget, setResolveTarget] = React.useState<Ticket | null>(null)
  const [editMntOpen, setEditMntOpen] = React.useState(false)

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
  const fin = projectFinance(project, payments, maintenanceCharges)
  const projectPayments = payments
    .filter((p) => p.projectId === project.id)
    .sort((a, b) => b.paidDate.localeCompare(a.paidDate))
  const projectCharges = maintenanceCharges.filter(
    (c) => c.projectId === project.id,
  )
  const dev = project.development
  const infra = project.infrastructure
  const mnt = project.maintenance
  const nextCharge = nextMaintenanceCharge(project)
  const projectActivity = activity.filter((a) => a.projectId === project.id)

  // Ya vienen ordenados del store (abiertos primero, grado desc), así que
  // filtrar por proyecto conserva ese orden.
  const projectTickets = tickets.filter((t) => t.projectId === project.id)
  const openTickets = projectTickets.filter(isTicketOpen)
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
            {/* break-words: text-pretty elige dónde cortar entre palabras,
                pero nunca parte una URL pegada en la descripción. */}
            <p className="mt-1 max-w-2xl text-sm break-words text-muted-foreground text-pretty">
              <LinkedText text={project.description} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip status={project.status} />
              <PriorityChip priority={project.priority} />
              {/* The production URL is the link you actually want at hand,
                  so it sits here instead of only inside Infraestructura. */}
              {infra.productionUrl ? (
                <a
                  href={infra.productionUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neon-blue/25 bg-neon-blue/10 px-2.5 py-1 text-xs font-medium text-neon-blue transition-colors hover:border-neon-green/30 hover:bg-neon-green/10 hover:text-neon-green"
                >
                  <ExternalLink className="size-3" />
                  Abrir proyecto
                </a>
              ) : null}
              {infra.repo ? (
                <a
                  href={infra.repo}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <GitBranch className="size-3" />
                  Repo
                </a>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Actualizado {relativeDays(project.updatedAt).toLowerCase()}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {/* En el celular la etiqueta quedaba a 200px del botón que dice
                otra cosa: se leía como el título de «Editar proyecto». */}
            <div className="flex items-center justify-end gap-2 lg:justify-between">
              <span className="hidden text-xs text-muted-foreground lg:inline">
                Cambiar estado
              </span>
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

      {/* Con código y no con símbolo. Un proyecto tiene UNA moneda, así que
          en teoría el contexto alcanzaría — pero la moneda del proyecto no se
          mostraba en ningún lado de esta pantalla, y la tabla de cobros de más
          abajo puede traer cobros en otra. Con el código pegado al número, el
          dato viaja con el monto y no depende de que alguien lo haya leído
          arriba. */}
      {/* El hueco a la vista, no en silencio. Un cobro en otra moneda sin
          equivalente cargado no descuenta nada de la deuda: antes eso pasaba
          y no había forma de enterarse — el pendiente quedaba alto sin
          explicación. Se arregla entrando al cobro y diciéndole a cuánto
          equivale. */}
      {fin.sinEquivalente.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p className="text-sm leading-relaxed text-amber-100/90 text-pretty">
            <span className="font-medium tabular-nums">
              {fin.sinEquivalente.length} cobro
              {fin.sinEquivalente.length === 1 ? '' : 's'} en otra moneda sin
              equivalente
            </span>
            {' — '}
            {fin.sinEquivalente
              .map((p) => `${p.concept} (${formatMoneyWithCode(p.amount, p.currency)})`)
              .join(', ')}
            . Este proyecto está cotizado en {project.currency}, así que{' '}
            {fin.sinEquivalente.length === 1 ? 'ese cobro' : 'esos cobros'} no
            {fin.sinEquivalente.length === 1 ? ' descuenta' : ' descuentan'}{' '}
            nada del pendiente hasta que se cargue a cuánto{' '}
            {fin.sinEquivalente.length === 1 ? 'equivale' : 'equivalen'}.
            Editalos desde la pestaña Cobros.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Presupuestado"
          value={formatMoneyWithCode(fin.quoted, project.currency)}
          icon={CircleDollarSign}
        />
        <StatCard
          label="Cobrado"
          value={formatMoneyWithCode(fin.collected, project.currency)}
          hint={
            isEmptyMoney(fin.maintenanceByCurrency)
              ? undefined
              : `+ ${formatMoneyByCurrency(fin.maintenanceByCurrency)} en mantenimientos`
          }
          accent="green"
        />
        <StatCard
          label="Pendiente"
          value={formatMoneyWithCode(fin.pending, project.currency)}
          accent={fin.pending > 0 ? 'blue' : 'neutral'}
        />
        <StatCard
          label="Avance"
          value={`${dev.progress}%`}
          accent="violet"
        />
      </div>

      <Tabs defaultValue="resumen">
        {/* Siete pestañas no entran en 343px de pantalla: el scroll sangra
            hasta el borde para que se vea que hay más a la derecha, y dos
            etiquetas se acortan para bajar el total. «Tickets» es la última
            y la más ancha (lleva ícono y un contador que cambia de ancho),
            así que es la primera que queda fuera de cuadro — a propósito:
            las que se miran todos los días son las de la izquierda. */}
        <TabsList className="-mx-4 w-[calc(100%+2rem)] justify-start overflow-x-auto px-4 group-data-horizontal/tabs:h-10 lg:mx-0 lg:w-full lg:px-0">
          <TabsTrigger value="resumen" className="flex-none">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="desarrollo" className="flex-none">
            Desarrollo
          </TabsTrigger>
          <TabsTrigger value="cobros" className="flex-none">
            Cobros
          </TabsTrigger>
          <TabsTrigger value="infraestructura" className="flex-none">
            Infra
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="flex-none">
            Mantenimiento
          </TabsTrigger>
          <TabsTrigger value="tickets" className="flex-none">
            <TicketIcon data-icon="inline-start" />
            Tickets{openTickets.length ? ` (${openTickets.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="actividad" className="flex-none">
            Notas
          </TabsTrigger>
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
              {/* Sólo con cliente cargado y teléfono válido. Un proyecto
                  propio no tiene a quién escribirle. */}
              {client?.phone ? (
                <InfoRow label="Contactar">
                  <WhatsappButton
                    telefono={client.phone}
                    mensaje={mensajeCobroProyecto(
                      client.contactPerson || project.contactPerson,
                      project.name,
                      fin.pendingByCurrency,
                    )}
                    label={
                      isEmptyMoney(fin.pendingByCurrency)
                        ? 'WhatsApp'
                        : `Reclamar ${formatMoneyByCurrency(fin.pendingByCurrency)}`
                    }
                  />
                </InfoRow>
              ) : null}
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
          {/* Arriba de los cobros a proposito: la factura es lo que se le
              reclama al cliente y el cobro es lo que la salda. Leerlo en ese
              orden es el orden en que pasa. */}
          {project.type === 'terceros' ? (
            <div className="mb-4">
              <FacturasCard project={project} />
            </div>
          ) : null}
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
              <>
                {/* Abajo de md, lista en vez de tabla: mismo patrón que el
                    historial de mantenimientos de esta misma pantalla. La
                    tabla son seis columnas y ~770px de ancho mínimo. */}
                <ul className="divide-y divide-white/5 p-4 md:hidden">
                  {projectPayments.map((pay) => (
                    <li
                      key={pay.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {pay.concept}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatDate(pay.paidDate)}
                          {pay.method ? ` · ${pay.method}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatMoney(pay.amount, pay.currency)}
                        </span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Editar pago: ${pay.concept}`}
                          onClick={() => setEditPayTarget(pay)}
                        >
                          <Pencil />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Fecha de pago</TableHead>
                        <TableHead>Medio</TableHead>
                        <TableHead nowrap={false}>Comprobante</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectPayments.map((pay) => (
                        <TableRow key={pay.id}>
                          <TableCell nowrap={false} className="min-w-40 font-medium">
                            {pay.concept}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatMoney(pay.amount, pay.currency)}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {formatDate(pay.paidDate)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {pay.method ?? '—'}
                          </TableCell>
                          <TableCell
                            nowrap={false}
                            className="max-w-56 break-words text-muted-foreground"
                          >
                            {pay.receipt ?? '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
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
                </div>
              </>
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

            <FixedCostsCard project={project} />
          </div>
        </TabsContent>

        {/* MANTENIMIENTO */}
        <TabsContent value="mantenimiento" className="mt-4">
          {/* `hasMaintenancePlan` y no `active`: un plan pausado sigue siendo
              un plan, con su importe y su historial. Preguntando por `active`
              desaparecía de acá y no quedaba forma de reactivarlo. */}
          {hasMaintenancePlan(mnt) ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DetailCard
                title="Plan de mantenimiento"
                icon={Wrench}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditMntOpen(true)}
                  >
                    <Pencil data-icon="inline-start" />
                    Editar
                  </Button>
                }
              >
                <InfoRow label="Estado">
                  {mnt.status === 'Activo' ? (
                    mnt.status
                  ) : (
                    <span className="text-amber-300">
                      {mnt.status} · no está cobrando
                    </span>
                  )}
                </InfoRow>
                <InfoRow label="Monto">
                  {formatMoney(mnt.amount, mnt.currency)} / {mnt.frequency.toLowerCase()}
                </InfoRow>
                <InfoRow label="Ventana de cobro">
                  {describirVentana(mnt)} de cada período
                </InfoRow>
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
              <DetailCard
                title="Historial de cobros"
                icon={History}
                className="lg:col-span-2"
              >
                {projectCharges.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Todavía sin cobros registrados.
                  </p>
                ) : (
                  <>
                    <ul className="flex flex-col divide-y divide-white/5">
                      {projectCharges.map((charge) => (
                        <li
                          key={charge.id}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm">
                              {formatDate(charge.chargedOn)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {charge.method ?? 'Sin medio'}
                              {charge.receipt ? ` · ${charge.receipt}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoney(charge.amount, charge.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2.5 text-sm">
                      <span className="text-muted-foreground">
                        Total cobrado ({projectCharges.length})
                      </span>
                      <span className="font-semibold tabular-nums text-neon-green">
                        {formatMoneyByCurrency(fin.maintenanceByCurrency)}
                      </span>
                    </div>
                  </>
                )}
              </DetailCard>
            </div>
          ) : (
            <Empty className="glass rounded-2xl">
              <EmptyHeader>
                <EmptyTitle>Sin plan de mantenimiento</EmptyTitle>
                <EmptyDescription>
                  Este proyecto no tiene un plan recurrente cargado. Activalo
                  desde la sección Mantenimientos una vez implementado.
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
        <TabsContent value="tickets" className="mt-4">
          <DetailCard
            title="Reclamos y pedidos"
            icon={TicketIcon}
            action={
              ticketsReady ? (
                <NewTicketDialog
                  defaultProjectId={project.id}
                  triggerLabel="Nuevo ticket"
                  triggerVariant="outline"
                />
              ) : null
            }
          >
            {/* Mismo degradado por módulo que el resto del repo: sin la
                migración corrida no se ofrece un botón que sólo puede
                terminar en un toast rojo. */}
            {!ticketsReady ? (
              <p className="py-2 text-sm text-muted-foreground">
                Falta correr{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                  supabase/11_tickets.sql
                </code>{' '}
                para usar los tickets.
              </p>
            ) : projectTickets.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Este proyecto no tiene tickets cargados.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-white/5">
                {projectTickets.map((t) => {
                  const abierto = isTicketOpen(t)
                  const dias = ticketAge(t)
                  return (
                    <li key={t.id} className="flex flex-col gap-1.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium text-pretty">
                          {t.title}
                        </p>
                        <TicketGradeChip grade={t.grade} short />
                      </div>
                      {t.detail ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground text-pretty">
                          {t.detail}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {t.kind} ·{' '}
                          {abierto
                            ? dias === 0
                              ? 'cargado hoy'
                              : `${dias} día(s) abierto`
                            : `resuelto el ${formatDate(t.resolvedAt)}`}
                        </span>
                        {abierto ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setResolveTarget(t)}
                          >
                            Resolver
                          </Button>
                        ) : null}
                      </div>
                      {!abierto && t.resolution ? (
                        <p className="text-xs text-muted-foreground text-pretty">
                          {t.resolution}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </DetailCard>
        </TabsContent>

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

      {editMntOpen ? (
        <EditMaintenanceDialog
          project={project}
          open={editMntOpen}
          onOpenChange={setEditMntOpen}
        />
      ) : null}

      {resolveTarget ? (
        <ResolveTicketDialog
          key={resolveTarget.id}
          ticket={resolveTarget}
          open={!!resolveTarget}
          onOpenChange={(o) => !o && setResolveTarget(null)}
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
    // El texto va en su propio span con min-w-0: como flex item, su
    // min-width:auto era la URL entera sin cortar y sacaba de eje a la página.
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 text-neon-blue hover:underline"
    >
      <span className="min-w-0 break-all">
        {label ?? url.replace(/^https?:\/\//, '')}
      </span>
      <Icon className="size-3.5 shrink-0" />
    </a>
  )
}

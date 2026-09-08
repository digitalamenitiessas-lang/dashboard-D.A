'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CircleCheckBig,
  CircleAlert,
  Inbox,
  Pencil,
  RotateCcw,
  Search,
  Ticket as TicketIcon,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { LinkedText } from '@/components/shared/linked-text'
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { TicketGradeChip } from '@/components/shared/status-chip'
import { NewTicketDialog } from '@/components/tickets/new-ticket-dialog'
import { EditTicketDialog } from '@/components/tickets/edit-ticket-dialog'
import { ResolveTicketDialog } from '@/components/tickets/resolve-ticket-dialog'
import { useStore } from '@/lib/store'
import { isTicketOpen, openTicketsByGrade, ticketAge } from '@/lib/derive'
import { formatDate } from '@/lib/format'
import { TICKET_KINDS } from '@/lib/types'
import type { Ticket } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function TicketsPage() {
  const {
    tickets,
    projects,
    clients,
    ticketsReady,
    addTicket,
    reopenTicket,
    deleteTicket,
  } = useStore()

  const [tab, setTab] = React.useState('abiertos')
  const [query, setQuery] = React.useState('')
  const [gradeFilter, setGradeFilter] = React.useState('todos')
  const [kindFilter, setKindFilter] = React.useState('todos')
  const [projectFilter, setProjectFilter] = React.useState('todos')
  const [editTarget, setEditTarget] = React.useState<Ticket | null>(null)
  const [resolveTarget, setResolveTarget] = React.useState<Ticket | null>(null)

  /** Nombre del proyecto y, si lo tiene, del cliente detrás. */
  const contexto = React.useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return { proyecto: 'Proyecto eliminado', cliente: null }
      const cliente = project.clientId
        ? (clients.find((c) => c.id === project.clientId)?.name ?? null)
        : null
      return { proyecto: project.name, cliente }
    },
    [projects, clients],
  )

  const abiertos = tickets.filter(isTicketOpen)
  const resueltos = tickets.filter((t) => !isTicketOpen(t))
  const porGrado = openTicketsByGrade(tickets)

  const filtrar = React.useCallback(
    (list: Ticket[]) =>
      list.filter((t) => {
        if (gradeFilter !== 'todos' && String(t.grade) !== gradeFilter) return false
        if (kindFilter !== 'todos' && t.kind !== kindFilter) return false
        if (projectFilter !== 'todos' && t.projectId !== projectFilter) return false
        if (query) {
          const q = query.toLowerCase()
          const { proyecto, cliente } = contexto(t.projectId)
          const hay =
            t.title.toLowerCase().includes(q) ||
            t.detail.toLowerCase().includes(q) ||
            t.resolution.toLowerCase().includes(q) ||
            proyecto.toLowerCase().includes(q) ||
            (cliente?.toLowerCase().includes(q) ?? false)
          if (!hay) return false
        }
        return true
      }),
    [gradeFilter, kindFilter, projectFilter, query, contexto],
  )

  /**
   * Reabrir borra la resolución: si el ticket vuelve a estar abierto, lo que
   * se había hecho no alcanzó. El aviso lo dice explícitamente cuando había
   * texto escrito — destruir el registro de qué se hizo en silencio, y encima
   * detrás de un toast verde de éxito, es la peor combinación posible.
   */
  async function handleReopen(ticket: Ticket) {
    const tenia = ticket.resolution.trim() !== ''
    if (!(await reopenTicket(ticket.id))) return
    toast.success('Ticket reabierto', {
      description: tenia
        ? `${ticket.title} — vuelve a pendientes y se borró el texto de cómo se había resuelto`
        : `${ticket.title} — vuelve a la lista de pendientes`,
    })
  }

  /**
   * Un ticket no mueve plata, así que se borra sin preguntar y se ofrece
   * deshacer — mismo criterio que las notas, los costos fijos y las tareas.
   *
   * Deshacer NO es una restauración exacta y el aviso no lo promete: el
   * ticket vuelve con otro id, con fecha de creación de hoy, siempre como
   * ABIERTO (aunque estuviera resuelto) y perdiendo el texto de cómo se
   * resolvió. Y como es un alta nueva, el trigger de la base vuelve a
   * mandar el aviso a los celulares. Por eso el botón dice qué va a pasar
   * en vez de un «Deshacer» pelado.
   */
  async function handleDelete(ticket: Ticket) {
    if (!(await deleteTicket(ticket.id))) return
    toast.success('Ticket eliminado', {
      description: ticket.title,
      action: {
        label: 'Deshacer',
        onClick: () => {
          void addTicket({
            projectId: ticket.projectId,
            kind: ticket.kind,
            grade: ticket.grade,
            title: ticket.title,
            detail: ticket.detail,
          }).then((ok) => {
            if (!ok) return
            toast.info('Ticket restaurado como abierto', {
              description: 'Vuelve con fecha de hoy y se reenvió el aviso al celular.',
            })
          })
        },
      },
    })
  }

  if (!ticketsReady) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Tickets"
          description="Reclamos y pedidos de clientes, por urgencia."
        />
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Falta correr la migración</EmptyTitle>
            <EmptyDescription>
              La tabla de tickets todavía no existe en la base. Corré{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                supabase/11_tickets.sql
              </code>{' '}
              desde el SQL Editor de Supabase y recargá esta página. El resto de
              la app funciona normal mientras tanto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  function lista(list: Ticket[], vacio: { titulo: string; texto: string }) {
    if (list.length === 0) {
      return (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>{vacio.titulo}</EmptyTitle>
            <EmptyDescription>{vacio.texto}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((ticket) => {
          const { proyecto, cliente } = contexto(ticket.projectId)
          const abierto = isTicketOpen(ticket)
          const dias = ticketAge(ticket)
          return (
            <article
              key={ticket.id}
              className={cn(
                'glass flex flex-col gap-3 rounded-2xl p-4',
                abierto && ticket.grade === 3 && 'ring-1 ring-destructive/25',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className="font-medium">
                  {ticket.kind}
                </Badge>
                <TicketGradeChip grade={ticket.grade} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-extrabold text-pretty">
                  {ticket.title}
                </h2>
                {ticket.detail ? (
                  <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-muted-foreground text-pretty">
                    <LinkedText text={ticket.detail} />
                  </p>
                ) : null}
              </div>

              <Link
                href={`/proyectos/${ticket.projectId}`}
                className="truncate text-xs text-neon-blue hover:underline"
              >
                {proyecto}
                {cliente ? ` · ${cliente}` : ''}
              </Link>

              {abierto ? (
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs tabular-nums',
                    ticket.grade === 3 ? 'text-red-300' : 'text-muted-foreground',
                  )}
                >
                  <CircleAlert className="size-3.5" />
                  {dias === 0
                    ? 'Cargado hoy'
                    : `${dias} día${dias === 1 ? '' : 's'} abierto`}
                </div>
              ) : (
                <div className="flex flex-col gap-1 rounded-lg bg-neon-green/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs tabular-nums text-neon-green">
                    <CircleCheckBig className="size-3.5" />
                    Resuelto el {formatDate(ticket.resolvedAt)}
                  </div>
                  {ticket.resolution ? (
                    <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                      <LinkedText text={ticket.resolution} />
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3 text-[11px] text-muted-foreground">
                <span className="truncate tabular-nums">
                  Cargado {formatDate(ticket.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-10 md:size-7"
                    aria-label={`Editar ticket: ${ticket.title}`}
                    onClick={() => setEditTarget(ticket)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-10 md:size-7"
                    aria-label={`Eliminar ticket: ${ticket.title}`}
                    onClick={() => void handleDelete(ticket)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              {abierto ? (
                <Button
                  className="w-full"
                  onClick={() => setResolveTarget(ticket)}
                >
                  <CircleCheckBig data-icon="inline-start" />
                  Resolver
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleReopen(ticket)}
                >
                  <RotateCcw data-icon="inline-start" />
                  Reabrir
                </Button>
              )}
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tickets"
        description="Reclamos y pedidos de clientes, por urgencia. Al crear uno sale el aviso al celular."
      >
        <NewTicketDialog />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Abiertos"
          value={abiertos.length}
          icon={Inbox}
          accent={abiertos.length ? 'blue' : 'neutral'}
        />
        <StatCard
          label="Grado 3 · urgentes"
          value={porGrado[3]}
          icon={CircleAlert}
          accent={porGrado[3] ? 'red' : 'neutral'}
          hint={porGrado[3] ? 'Hay que verlos ya' : 'Ninguno pendiente'}
        />
        <StatCard
          label="Grado 2 · esta semana"
          value={porGrado[2]}
          accent={porGrado[2] ? 'violet' : 'neutral'}
        />
        <StatCard
          label="Resueltos"
          value={resueltos.length}
          icon={CircleCheckBig}
          accent="green"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <InputGroup className="lg:w-64">
          <InputGroupInput
            placeholder="Buscar por título, detalle, proyecto o cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SimpleSelect
            value={gradeFilter}
            onValueChange={setGradeFilter}
            className="sm:w-40"
            options={[
              { value: 'todos', label: 'Todos los grados' },
              { value: '3', label: 'Grado 3 · Urgente' },
              { value: '2', label: 'Grado 2 · Media' },
              { value: '1', label: 'Grado 1 · Baja' },
            ]}
          />
          <SimpleSelect
            value={kindFilter}
            onValueChange={setKindFilter}
            className="sm:w-40"
            options={[
              { value: 'todos', label: 'Todos los tipos' },
              ...TICKET_KINDS.map((k) => ({ value: k, label: k })),
            ]}
          />
          <SimpleSelect
            value={projectFilter}
            onValueChange={setProjectFilter}
            className="sm:w-48"
            options={[
              { value: 'todos', label: 'Todos los proyectos' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="abiertos" className="flex-none">
            <TicketIcon data-icon="inline-start" />
            Para resolver ({abiertos.length})
          </TabsTrigger>
          <TabsTrigger value="resueltos" className="flex-none">
            <CircleCheckBig data-icon="inline-start" />
            Resueltos ({resueltos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abiertos" className="mt-4">
          {lista(filtrar(abiertos), {
            titulo: abiertos.length ? 'Nada con esos filtros' : 'No hay nada pendiente',
            texto: abiertos.length
              ? 'Probá aflojando la búsqueda o los filtros.'
              : 'Cuando un cliente reclame o pida algo, cargalo acá y le llega el aviso a todo el equipo.',
          })}
        </TabsContent>

        <TabsContent value="resueltos" className="mt-4">
          {lista(filtrar(resueltos), {
            titulo: resueltos.length ? 'Nada con esos filtros' : 'Todavía no resolviste ninguno',
            texto: resueltos.length
              ? 'Probá aflojando la búsqueda o los filtros.'
              : 'Acá queda el registro de todo lo que se cerró, con la fecha y qué se hizo.',
          })}
        </TabsContent>
      </Tabs>

      {editTarget ? (
        <EditTicketDialog
          key={editTarget.id}
          ticket={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
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
    </div>
  )
}

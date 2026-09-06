'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Building2,
  Mail,
  Pencil,
  Phone,
  Search,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { NewClientDialog } from '@/components/clientes/new-client-dialog'
import { EditClientDialog } from '@/components/clientes/edit-client-dialog'
import { useStore } from '@/lib/store'
import { projectFinance } from '@/lib/derive'
import {
  collectionRatio,
  formatMoneyByCurrency,
  isEmptyMoney,
  mergeMoney,
} from '@/lib/money'
import type { Client } from '@/lib/types'

export default function ClientesPage() {
  const { clients, projects, payments, maintenanceCharges } = useStore()
  const [query, setQuery] = React.useState('')
  const [editTarget, setEditTarget] = React.useState<Client | null>(null)

  const enriched = React.useMemo(() => {
    return clients.map((client) => {
      const clientProjects = projects.filter((p) => p.clientId === client.id)
      const finances = clientProjects.map((p) =>
        projectFinance(p, payments, maintenanceCharges),
      )
      const quoted = mergeMoney(...finances.map((f) => f.quotedByCurrency))
      const paid = mergeMoney(...finances.map((f) => f.paidByCurrency))
      const maintenance = mergeMoney(
        ...finances.map((f) => f.maintenanceByCurrency),
      )
      const activeMaintenances = clientProjects.filter(
        (p) => p.maintenance.active && p.maintenance.status === 'Activo',
      )
      return {
        client,
        projects: clientProjects,
        quoted,
        paid,
        maintenance,
        collected: mergeMoney(paid, maintenance),
        // Measured against the quote, so recurring fees stay out of it. El
        // piso en cero viene puesto de cada proyecto: si un proyecto del
        // cliente está cobrado de más, eso no borra la deuda de otro.
        pending: mergeMoney(...finances.map((f) => f.pendingByCurrency)),
        pct: collectionRatio(quoted, paid),
        activeMaintenances,
      }
    })
  }, [clients, projects, payments, maintenanceCharges])

  const filtered = enriched.filter(({ client, projects: ps }) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      client.name.toLowerCase().includes(q) ||
      client.contactPerson.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      ps.some((p) => p.name.toLowerCase().includes(q))
    )
  })

  const totalQuoted = mergeMoney(...enriched.map((e) => e.quoted))
  const totalCollected = mergeMoney(...enriched.map((e) => e.collected))
  const totalMaintenances = enriched.reduce(
    (s, e) => s + e.activeMaintenances.length,
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Cartera de clientes con su situación comercial y financiera."
      >
        <NewClientDialog />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Clientes"
          value={clients.length}
          icon={Users}
          accent="blue"
        />
        <StatCard
          label="Total cotizado"
          value={formatMoneyByCurrency(totalQuoted)}
          accent="neutral"
        />
        <StatCard
          label="Total cobrado"
          value={formatMoneyByCurrency(totalCollected)}
          hint="Cobros y mantenimientos"
          icon={Wallet}
          accent="green"
        />
        <StatCard
          label="Mantenimientos activos"
          value={totalMaintenances}
          icon={Wrench}
          accent="violet"
        />
      </div>

      <div className="flex justify-end">
        <InputGroup className="sm:w-72">
          <InputGroupInput
            placeholder="Buscar cliente, contacto o proyecto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </div>

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin clientes</EmptyTitle>
            <EmptyDescription>
              No hay clientes que coincidan con la búsqueda.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map(
            ({
              client,
              projects: ps,
              quoted,
              paid,
              maintenance,
              pending,
              pct,
              activeMaintenances,
            }) => {
              return (
                <section key={client.id} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neon-blue/10 text-neon-blue ring-1 ring-neon-blue/20">
                        <Building2 className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-base font-extrabold">
                          {client.name}
                        </h2>
                        <p className="truncate text-xs text-muted-foreground">
                          {client.contactPerson || 'Sin contacto asignado'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {activeMaintenances.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-violet/25 bg-neon-violet/10 px-2.5 py-1 text-[11px] font-medium text-neon-violet">
                          <Wrench className="size-3" />
                          {activeMaintenances.length} mant.
                        </span>
                      ) : null}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Editar cliente: ${client.name}`}
                        onClick={() => setEditTarget(client)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    {client.phone ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3.5" />
                        {client.phone}
                      </span>
                    ) : null}
                    {client.email ? (
                      <a
                        href={`mailto:${client.email}`}
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-neon-green"
                      >
                        <Mail className="size-3.5" />
                        {client.email}
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Cotizado</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
                        {formatMoneyByCurrency(quoted)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Cobrado</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-neon-green">
                        {formatMoneyByCurrency(paid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Pendiente</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
                        {formatMoneyByCurrency(pending)}
                      </p>
                    </div>
                    {/* No conversion rate exists, so a single bar only makes
                        sense while one currency is in play. */}
                    {pct !== null ? (
                      <div className="col-span-3">
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    ) : null}
                    {!isEmptyMoney(maintenance) ? (
                      <div className="col-span-3 flex items-center justify-between gap-3 border-t border-white/5 pt-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Wrench className="size-3" />
                          Mantenimientos cobrados
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-neon-violet">
                          {formatMoneyByCurrency(maintenance)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Proyectos ({ps.length})
                    </p>
                    {ps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Todavía sin proyectos.
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-white/5">
                        {ps.map((p) => (
                          <li key={p.id}>
                            <Link
                              href={`/proyectos/${p.id}`}
                              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
                            >
                              <span className="min-w-0 truncate text-sm">
                                {p.name}
                              </span>
                              <StatusChip status={p.status} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {client.notes ? (
                    <p className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
                      {client.notes}
                    </p>
                  ) : null}
                </section>
              )
            },
          )}
        </div>
      )}

      {editTarget ? (
        <EditClientDialog
          key={editTarget.id}
          client={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      ) : null}
    </div>
  )
}

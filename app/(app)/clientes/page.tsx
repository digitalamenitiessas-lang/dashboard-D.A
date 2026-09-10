'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Building2,
  ChevronRight,
  CircleAlert,
  Search,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
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
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { NewClientDialog } from '@/components/clientes/new-client-dialog'
import { useStore } from '@/lib/store'
import { enriquecerClientes, proyectosSinCliente } from '@/lib/clientes'
import { formatMoneyByCurrency, isEmptyMoney, mergeMoney } from '@/lib/money'
import { formatearTelefono } from '@/lib/telefono'

/**
 * Clientes, con su propia sección.
 *
 * Convive a propósito con la pestaña «De clientes» de /proyectos, que NO se
 * saca: son dos preguntas distintas. Esta contesta «quiénes son mis clientes
 * y cuánto me deben», y se entra a cada uno para ver su ficha, el servicio
 * que le damos y —en la vuelta que viene— sus facturas. La de Proyectos
 * contesta «cómo viene cada proyecto», agrupado por cliente.
 *
 * Los números de las dos salen de `enriquecerClientes()`: una sola fuente,
 * para que no puedan mostrar cosas distintas del mismo cliente.
 */
export default function ClientesPage() {
  const { clients, projects, payments, maintenanceCharges } = useStore()
  const [query, setQuery] = React.useState('')

  const enriched = React.useMemo(
    () =>
      enriquecerClientes({ clients, projects, payments, maintenanceCharges }),
    [clients, projects, payments, maintenanceCharges],
  )
  const huerfanos = React.useMemo(
    () => proyectosSinCliente(projects),
    [projects],
  )

  const q = query.trim().toLowerCase()
  const filtrados = enriched.filter(({ client, projects: ps }) => {
    if (!q) return true
    return (
      client.name.toLowerCase().includes(q) ||
      client.contactPerson.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      ps.some((p) => p.name.toLowerCase().includes(q))
    )
  })

  const totalPendiente = mergeMoney(...enriched.map((e) => e.pending))
  const totalCobrado = mergeMoney(...enriched.map((e) => e.collected))
  const conMantenimiento = enriched.filter(
    (e) => e.activeMaintenances.length > 0,
  ).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Quiénes son, cuánto nos deben y qué servicio les damos."
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
          label="Pendiente de cobro"
          value={formatMoneyByCurrency(totalPendiente)}
          accent={isEmptyMoney(totalPendiente) ? 'neutral' : 'red'}
        />
        <StatCard
          label="Cobrado"
          value={formatMoneyByCurrency(totalCobrado)}
          icon={Wallet}
          accent="green"
          hint="Cobros y mantenimientos"
        />
        <StatCard
          label="Con mantenimiento"
          value={conMantenimiento}
          icon={Wrench}
          accent="violet"
        />
      </div>

      {/* El mismo aviso que en la pestaña de Proyectos: el hueco a la vista
          en vez de silencioso. Se apaga solo a medida que se asignan. */}
      {huerfanos.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p className="text-sm leading-relaxed text-amber-100/90 text-pretty">
            <span className="font-medium tabular-nums">
              {huerfanos.length} proyecto{huerfanos.length === 1 ? '' : 's'} de
              terceros sin cliente asignado
            </span>
            {' — '}
            {huerfanos.map((p) => p.name).join(', ')}. Entrá al proyecto y usá{' '}
            <span className="font-medium">Editar proyecto → Cliente</span>. Si
            el cliente todavía no existe, crealo acá arriba.
          </p>
        </div>
      ) : null}

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

      {filtrados.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>
              {clients.length === 0 ? 'Sin clientes' : 'Sin resultados'}
            </EmptyTitle>
            <EmptyDescription>
              {clients.length === 0
                ? 'Cargá tu primer cliente. Después lo enganchás a sus proyectos desde Editar proyecto.'
                : 'Ajustá la búsqueda.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtrados.map(
            ({ client, projects: ps, pending, collected, activeMaintenances }) => (
              <li key={client.id}>
                {/* Todo el renglón entra al detalle: en el celular, un link
                    en el nombre es un blanco de 20px. */}
                <Link
                  href={`/clientes/${client.id}`}
                  className="glass flex items-center gap-4 rounded-2xl p-4 transition-colors hover:border-white/15"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neon-blue/10 text-neon-blue ring-1 ring-neon-blue/20">
                    <Building2 className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-extrabold">
                      {client.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {client.contactPerson || 'Sin contacto'}
                      {client.phone
                        ? ` · ${formatearTelefono(client.phone)}`
                        : ''}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
                      {ps.length} proyecto{ps.length === 1 ? '' : 's'}
                      {activeMaintenances.length > 0
                        ? ` · ${activeMaintenances.length} mantenimiento${activeMaintenances.length === 1 ? '' : 's'}`
                        : ''}
                    </p>
                  </div>

                  {/* Los dos números que importan de un vistazo. Abajo de sm
                      se esconde el cobrado: el pendiente es el que se mira. */}
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[11px] text-muted-foreground">Cobrado</p>
                    <p className="text-sm font-semibold tabular-nums text-neon-green">
                      {formatMoneyByCurrency(collected)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-muted-foreground">
                      Pendiente
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoneyByCurrency(pending)}
                    </p>
                  </div>

                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

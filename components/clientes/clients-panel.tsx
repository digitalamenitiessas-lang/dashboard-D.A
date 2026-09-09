'use client'

import * as React from 'react'
import Link from 'next/link'
import { Building2, CircleAlert, Mail, Pencil, Phone, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { StatusChip } from '@/components/shared/status-chip'
import { EditClientDialog } from '@/components/clientes/edit-client-dialog'
import { WhatsappButton } from '@/components/shared/whatsapp-button'
import { mensajeCobroCliente } from '@/lib/mensajes'
import { formatearTelefono } from '@/lib/telefono'
import { useStore } from '@/lib/store'
import { projectFinance } from '@/lib/derive'
import {
  collectionRatio,
  formatMoneyByCurrency,
  isEmptyMoney,
  mergeMoney,
} from '@/lib/money'
import type { Client, Project } from '@/lib/types'

/**
 * La pestaña «De clientes» de la sección unificada.
 *
 * El cliente es el AGRUPADOR de los proyectos de terceros: su ficha —la
 * misma que vivía en la pantalla /clientes— encabeza el grupo y los
 * proyectos van listados abajo. Nada de lo que había se perdió: contacto,
 * teléfono, mail, notas, cotizado/cobrado/pendiente y mantenimientos
 * activos siguen todos acá.
 *
 * Un proyecto `propio` NO puede aparecer en esta pestaña, y no por un
 * filtro de pantalla: los diálogos de proyecto fuerzan
 * `clientId = type === 'terceros' ? clientId : null`, así que un proyecto
 * propio nunca tiene cliente. Acá se filtra por `type` igual, para que la
 * pestaña siga siendo correcta si esa regla alguna vez cambia.
 */
export function ClientsPanel({
  query,
  statusFilter,
  matchesStatus,
}: {
  query: string
  statusFilter: string
  matchesStatus: (p: Project) => boolean
}) {
  const { clients, projects, payments, maintenanceCharges } = useStore()
  const [editTarget, setEditTarget] = React.useState<Client | null>(null)

  const terceros = React.useMemo(
    () => projects.filter((p) => p.type === 'terceros'),
    [projects],
  )

  /** Terceros a los que nadie les asignó cliente todavía. */
  const huerfanos = React.useMemo(
    () => terceros.filter((p) => !p.clientId),
    [terceros],
  )

  const enriched = React.useMemo(() => {
    return clients.map((client) => {
      const clientProjects = terceros.filter((p) => p.clientId === client.id)
      const finances = clientProjects.map((p) =>
        projectFinance(p, payments, maintenanceCharges),
      )
      const quoted = mergeMoney(...finances.map((f) => f.quotedByCurrency))
      const paid = mergeMoney(...finances.map((f) => f.paidByCurrency))
      const maintenance = mergeMoney(
        ...finances.map((f) => f.maintenanceByCurrency),
      )
      return {
        client,
        projects: clientProjects,
        quoted,
        paid,
        maintenance,
        // Se mide contra lo cotizado, así que los mantenimientos quedan
        // afuera. El piso en cero viene de cada proyecto: si uno está
        // cobrado de más, eso no borra la deuda de otro.
        pending: mergeMoney(...finances.map((f) => f.pendingByCurrency)),
        pct: collectionRatio(quoted, paid),
        activeMaintenances: clientProjects.filter(
          (p) => p.maintenance.status === 'Activo',
        ),
      }
    })
  }, [clients, terceros, payments, maintenanceCharges])

  const q = query.trim().toLowerCase()

  const filtered = enriched.filter(({ client, projects: ps }) => {
    if (!q) return true
    return (
      client.name.toLowerCase().includes(q) ||
      client.contactPerson.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      ps.some((p) => p.name.toLowerCase().includes(q))
    )
  })

  const huerfanosFiltrados = huerfanos.filter((p) => {
    if (!matchesStatus(p)) return false
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    )
  })

  const sinNada = filtered.length === 0 && huerfanosFiltrados.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* El hueco a la vista en vez de silencioso. Se apaga solo a medida
          que se asignan: no hay nada que marcar como leído. */}
      {huerfanos.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p className="text-sm leading-relaxed text-amber-100/90 text-pretty">
            <span className="font-medium tabular-nums">
              {huerfanos.length} proyecto{huerfanos.length === 1 ? '' : 's'} de
              terceros sin cliente asignado
            </span>
            {' — '}
            {huerfanos.length === 1 ? 'aparece' : 'aparecen'} abajo de todo, en
            «Sin cliente asignado». Para engancharlos, entrá al proyecto y usá{' '}
            <span className="font-medium">Editar proyecto → Cliente</span>. Si
            el cliente todavía no existe, crealo primero acá arriba.
          </p>
        </div>
      ) : null}

      {sinNada ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>
              {clients.length === 0 && huerfanos.length === 0
                ? 'Sin clientes'
                : 'Sin resultados'}
            </EmptyTitle>
            <EmptyDescription>
              {clients.length === 0 && huerfanos.length === 0
                ? 'Creá un cliente para empezar a agrupar los proyectos de terceros.'
                : 'Ajustá la búsqueda o el filtro de estado.'}
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
              const visibles = ps.filter(matchesStatus)
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
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-violet/25 bg-neon-violet/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-neon-violet">
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
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Phone className="size-3.5" />
                        {formatearTelefono(client.phone)}
                      </span>
                    ) : null}
                    {client.email ? (
                      // Un mail es un token indivisible: sin min-w-0 empujaba
                      // el ancho de la página entera.
                      <a
                        href={`mailto:${client.email}`}
                        className="inline-flex min-w-0 max-w-full items-center gap-1.5 transition-colors hover:text-neon-green"
                      >
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </a>
                    ) : null}
                  </div>

                  {/* A 375px tres columnas dejaban 84px por monto y se pisaban
                      entre sí: en el celular va cada uno en su renglón. */}
                  <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:grid-cols-3 sm:gap-3">
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                      <p className="text-[11px] text-muted-foreground">Cotizado</p>
                      <p className="text-sm font-semibold tabular-nums sm:mt-0.5">
                        {formatMoneyByCurrency(quoted)}
                      </p>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                      <p className="text-[11px] text-muted-foreground">Cobrado</p>
                      <p className="text-sm font-semibold tabular-nums text-neon-green sm:mt-0.5">
                        {formatMoneyByCurrency(paid)}
                      </p>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                      <p className="text-[11px] text-muted-foreground">Pendiente</p>
                      <p className="text-sm font-semibold tabular-nums sm:mt-0.5">
                        {formatMoneyByCurrency(pending)}
                      </p>
                    </div>
                    {/* Sin cotización cargada, una sola barra sólo tiene
                        sentido mientras haya una única moneda en juego. */}
                    {pct !== null ? (
                      <div className="sm:col-span-3">
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    ) : null}
                    {!isEmptyMoney(maintenance) ? (
                      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 sm:col-span-3">
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

                  {/* Abajo del cuadro de montos a propósito: es el renglón
                      donde uno acaba de leer cuánto le deben, que es el
                      momento en que da ganas de escribirle. */}
                  {client.phone ? (
                    <div className="mt-3">
                      <WhatsappButton
                        telefono={client.phone}
                        mensaje={mensajeCobroCliente(
                          client.contactPerson,
                          pending,
                        )}
                        label={
                          isEmptyMoney(pending)
                            ? 'Escribirle por WhatsApp'
                            : `Reclamar ${formatMoneyByCurrency(pending)}`
                        }
                        className="w-full"
                      />
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground tabular-nums">
                      Proyectos ({visibles.length}
                      {visibles.length !== ps.length ? ` de ${ps.length}` : ''})
                    </p>
                    {ps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Todavía sin proyectos.
                      </p>
                    ) : visibles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Ninguno con ese estado.
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-white/5">
                        {visibles.map((p) => (
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

          {/* Los huérfanos van en su propio grupo y no repartidos entre los
              clientes: son trabajo para afuera que todavía no sabe para
              quién es, y esconderlos sería fingir que el dato está. */}
          {huerfanosFiltrados.length > 0 ? (
            <section className="glass rounded-2xl border-dashed p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20">
                  <CircleAlert className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-extrabold">
                    Sin cliente asignado
                  </h2>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {huerfanosFiltrados.length} proyecto
                    {huerfanosFiltrados.length === 1 ? '' : 's'} de terceros
                  </p>
                </div>
              </div>

              <ul className="mt-4 flex flex-col divide-y divide-white/5">
                {huerfanosFiltrados.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/proyectos/${p.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
                    >
                      <span className="min-w-0 truncate text-sm">{p.name}</span>
                      <StatusChip status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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

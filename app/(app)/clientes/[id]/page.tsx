'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  FileText,
  Mail,
  Pencil,
  Phone,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { StatusChip } from '@/components/shared/status-chip'
import { WhatsappButton } from '@/components/shared/whatsapp-button'
import { DetailCard, InfoRow } from '@/components/proyectos/detail-parts'
import { FacturasCard } from '@/components/facturas/facturas-card'
import { EditClientDialog } from '@/components/clientes/edit-client-dialog'
import { useStore } from '@/lib/store'
import { enriquecerClientes } from '@/lib/clientes'
import { describirVentana, nextMaintenanceCharge } from '@/lib/derive'
import { formatDate, formatMoney, relativeDays } from '@/lib/format'
import { formatMoneyByCurrency, isEmptyMoney } from '@/lib/money'
import { mensajeCobroCliente } from '@/lib/mensajes'
import { formatearTelefono } from '@/lib/telefono'

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>()
  const { clients, projects, payments, maintenanceCharges } = useStore()
  const [editOpen, setEditOpen] = React.useState(false)

  const enriquecido = React.useMemo(
    () =>
      enriquecerClientes({
        clients,
        projects,
        payments,
        maintenanceCharges,
      }).find((e) => e.client.id === params.id),
    [clients, projects, payments, maintenanceCharges, params.id],
  )

  if (!enriquecido) {
    return (
      <Empty className="glass rounded-2xl">
        <EmptyHeader>
          <EmptyTitle>Cliente no encontrado</EmptyTitle>
          <EmptyDescription>
            Puede que se haya eliminado. Sus proyectos, si tenía, siguen
            existiendo sin cliente asignado.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" nativeButton={false} render={<Link href="/clientes" />}>
          <ArrowLeft data-icon="inline-start" />
          Volver a clientes
        </Button>
      </Empty>
    )
  }

  const {
    client,
    projects: ps,
    quoted,
    paid,
    maintenance,
    pending,
    pct,
    activeMaintenances,
  } = enriquecido

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2 mb-2"
          nativeButton={false}
          render={<Link href="/clientes" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Clientes
        </Button>
        <PageHeader
          title={client.name}
          description={client.contactPerson || 'Sin contacto asignado'}
        >
          {client.phone ? (
            <WhatsappButton
              telefono={client.phone}
              mensaje={mensajeCobroCliente(client.contactPerson, pending)}
              label={
                isEmptyMoney(pending)
                  ? 'WhatsApp'
                  : `Reclamar ${formatMoneyByCurrency(pending)}`
              }
            />
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil data-icon="inline-start" />
            Editar
          </Button>
        </PageHeader>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Cotizado"
          value={formatMoneyByCurrency(quoted)}
          accent="neutral"
        />
        <StatCard
          label="Cobrado"
          value={formatMoneyByCurrency(paid)}
          accent="green"
          hint="Sin contar mantenimientos"
        />
        <StatCard
          label="Pendiente"
          value={formatMoneyByCurrency(pending)}
          accent={isEmptyMoney(pending) ? 'neutral' : 'red'}
          hint="Contra lo cotizado"
        />
        <StatCard
          label="Mantenimientos cobrados"
          value={formatMoneyByCurrency(maintenance)}
          icon={Wrench}
          accent="violet"
        />
      </div>

      {/* Sin cotización cargada, una barra sólo tiene sentido con una única
          moneda en juego: `collectionRatio` devuelve null si no. */}
      {pct !== null ? <Progress value={pct} className="h-1.5" /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title="Datos de contacto" icon={Building2}>
          <InfoRow label="Razón social">{client.name}</InfoRow>
          <InfoRow label="Contacto">
            {client.contactPerson || '—'}
          </InfoRow>
          <InfoRow label="Teléfono">
            {client.phone ? (
              <span className="tabular-nums">
                {formatearTelefono(client.phone)}
              </span>
            ) : (
              <span className="text-amber-300">Falta cargarlo</span>
            )}
          </InfoRow>
          <InfoRow label="Correo">
            {client.email ? (
              <a
                href={`mailto:${client.email}`}
                className="transition-colors hover:text-neon-green"
              >
                {client.email}
              </a>
            ) : (
              '—'
            )}
          </InfoRow>
          {client.notes ? (
            <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground text-pretty">
              {client.notes}
            </p>
          ) : null}
        </DetailCard>

        <DetailCard title="Servicio que le damos" icon={Wrench}>
          {activeMaintenances.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground text-pretty">
              Sin mantenimiento activo. Si le damos un servicio recurrente,
              activalo desde Mantenimientos.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {activeMaintenances.map((p) => {
                const m = p.maintenance
                const next = nextMaintenanceCharge(p)
                return (
                  <li key={p.id} className="flex flex-col gap-1 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/proyectos/${p.id}`}
                        className="min-w-0 truncate text-sm font-medium transition-colors hover:text-neon-green"
                      >
                        {p.name}
                      </Link>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-neon-violet">
                        {formatMoney(m.amount, m.currency)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {m.frequency} · {describirVentana(m)}
                      {next
                        ? ` · próximo ${formatDate(next)} (${relativeDays(next).toLowerCase()})`
                        : ''}
                    </p>
                    {m.services.length > 0 ? (
                      <p className="text-xs text-muted-foreground text-pretty">
                        {m.services.join(' · ')}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </DetailCard>
      </div>

      <DetailCard title={`Proyectos (${ps.length})`} icon={FileText}>
        {ps.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground text-pretty">
            Todavía sin proyectos. Para engancharle uno, entrá al proyecto y usá
            Editar proyecto → Cliente.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {ps.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/proyectos/${p.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatMoney(p.quotedAmount, p.currency)} cotizado
                    </p>
                  </div>
                  <StatusChip status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      {/* Una tarjeta de facturas por proyecto: el importe de una factura
          está en la moneda de SU proyecto, y un cliente puede tener proyectos
          en monedas distintas. Juntarlas en una sola lista obligaría a sumar
          monedas o a repetir el código en cada renglón. */}
      {ps.map((p) => (
        <FacturasCard key={p.id} project={p} />
      ))}

      {editOpen ? (
        <EditClientDialog
          client={client}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
    </div>
  )
}

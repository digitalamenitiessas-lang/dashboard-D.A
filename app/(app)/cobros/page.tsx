'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CircleDollarSign,
  Clock,
  Pencil,
  Search,
  TriangleAlert,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
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
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { PaymentStatusChip } from '@/components/shared/status-chip'
import { AddPaymentDialog } from '@/components/cobros/add-payment-dialog'
import { CollectPaymentDialog } from '@/components/cobros/collect-payment-dialog'
import { EditPaymentDialog } from '@/components/cobros/edit-payment-dialog'
import { useStore } from '@/lib/store'
import { effectivePaymentStatus } from '@/lib/derive'
import { formatDate, formatMoney, relativeDays } from '@/lib/format'
import {
  collectionRatio,
  formatMoneyByCurrency,
  mergeMoney,
  pendingMoney,
  sumByCurrency,
} from '@/lib/money'
import { cn } from '@/lib/utils'
import type {
  Currency,
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '@/lib/types'

/**
 * Payments and collected maintenance fees share this screen, so both flow
 * through one normalized row. Only payments are editable — a maintenance
 * charge is a record of money already in.
 */
interface CobroRow {
  id: string
  kind: 'payment' | 'maintenance'
  projectId: string
  concept: string
  amount: number
  currency: Currency
  date: string
  status: PaymentStatus
  method: PaymentMethod | null
  receipt: string | null
  paidDate: string | null
  payment: Payment | null
}

export default function CobrosPage() {
  const { projects, payments, maintenanceCharges } = useStore()
  const [query, setQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('todos')
  const [projectFilter, setProjectFilter] = React.useState('todos')
  const [addOpen, setAddOpen] = React.useState(false)
  const [collectTarget, setCollectTarget] = React.useState<Payment | null>(null)
  const [editTarget, setEditTarget] = React.useState<Payment | null>(null)

  const projectName = React.useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? '—',
    [projects],
  )

  const totalQuoted = sumByCurrency(
    projects.map((p) => ({ amount: p.quotedAmount, currency: p.currency })),
  )
  const totalPaid = sumByCurrency(payments.filter((p) => p.status === 'Cobrado'))
  const totalMaintenance = sumByCurrency(maintenanceCharges)
  const totalCollected = mergeMoney(totalPaid, totalMaintenance)
  const pending = pendingMoney(totalQuoted, totalPaid)
  const collectedPct = collectionRatio(totalQuoted, totalPaid)
  const overdue = payments.filter(
    (p) => effectivePaymentStatus(p) === 'Vencido',
  )
  const overdueTotal = sumByCurrency(overdue)

  const rows = React.useMemo<CobroRow[]>(() => {
    const fromPayments: CobroRow[] = payments.map((pay) => ({
      id: `pay-${pay.id}`,
      kind: 'payment',
      projectId: pay.projectId,
      concept: pay.concept,
      amount: pay.amount,
      currency: pay.currency,
      date: pay.dueDate,
      status: effectivePaymentStatus(pay),
      method: pay.method,
      receipt: pay.receipt,
      paidDate: pay.paidDate,
      payment: pay,
    }))

    const fromMaintenance: CobroRow[] = maintenanceCharges.map((charge) => ({
      id: `mnt-${charge.id}`,
      kind: 'maintenance',
      projectId: charge.projectId,
      concept: 'Mantenimiento',
      amount: charge.amount,
      currency: charge.currency,
      date: charge.chargedOn,
      status: 'Cobrado',
      method: charge.method,
      receipt: charge.receipt,
      paidDate: charge.chargedOn,
      payment: null,
    }))

    return [...fromPayments, ...fromMaintenance]
  }, [payments, maintenanceCharges])

  const filtered = React.useMemo(() => {
    return rows
      .filter((row) => {
        if (statusFilter !== 'todos' && row.status !== statusFilter) return false
        if (projectFilter !== 'todos' && row.projectId !== projectFilter)
          return false
        if (query) {
          const q = query.toLowerCase()
          const hay =
            row.concept.toLowerCase().includes(q) ||
            projectName(row.projectId).toLowerCase().includes(q) ||
            (row.receipt ?? '').toLowerCase().includes(q)
          if (!hay) return false
        }
        return true
      })
      .sort((a, b) => {
        // Unpaid first, then by date.
        const aPaid = a.status === 'Cobrado' ? 1 : 0
        const bPaid = b.status === 'Cobrado' ? 1 : 0
        if (aPaid !== bPaid) return aPaid - bPaid
        // Pending rows read best oldest-first; settled ones newest-first.
        return aPaid === 1
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date)
      })
  }, [rows, statusFilter, projectFilter, query, projectName])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cobros"
        description="Todos los pagos de los proyectos: previstos, cobrados y vencidos."
      >
        <AddPaymentDialog open={addOpen} onOpenChange={setAddOpen} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total cotizado"
          value={formatMoneyByCurrency(totalQuoted)}
          hint={`${projects.length} proyectos`}
          icon={CircleDollarSign}
          accent="blue"
        />
        <StatCard
          label="Total cobrado"
          value={formatMoneyByCurrency(totalCollected)}
          hint={
            maintenanceCharges.length === 0
              ? collectedPct !== null
                ? `${collectedPct}% del total`
                : 'Cobros de proyectos'
              : `Incluye ${maintenanceCharges.length} cobro(s) de mantenimiento`
          }
          icon={Wallet}
          accent="green"
        />
        <StatCard
          label="Saldo pendiente"
          value={formatMoneyByCurrency(pending)}
          hint="Por cobrar de lo cotizado"
          icon={Clock}
          accent="violet"
        />
        <StatCard
          label="Vencidos"
          value={formatMoneyByCurrency(overdueTotal)}
          hint={`${overdue.length} pago(s)`}
          icon={TriangleAlert}
          accent={overdue.length ? 'red' : 'neutral'}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <InputGroup className="sm:w-64">
          <InputGroupInput
            placeholder="Buscar concepto o proyecto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <SimpleSelect
          value={projectFilter}
          onValueChange={setProjectFilter}
          className="sm:w-56"
          options={[
            { value: 'todos', label: 'Todos los proyectos' },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <SimpleSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="sm:w-44"
          options={[
            { value: 'todos', label: 'Todos los estados' },
            { value: 'Pendiente', label: 'Pendiente' },
            { value: 'Cobrado', label: 'Cobrado' },
            { value: 'Vencido', label: 'Vencido' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin cobros</EmptyTitle>
            <EmptyDescription>
              No hay pagos que coincidan con los filtros aplicados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const late = row.status === 'Vencido'
                const payment = row.payment
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {row.concept}
                        {row.kind === 'maintenance' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-neon-violet/25 bg-neon-violet/10 px-1.5 py-0.5 text-[10px] font-medium text-neon-violet">
                            <Wrench className="size-3" />
                            Recurrente
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/proyectos/${row.projectId}`}
                        className="text-muted-foreground transition-colors hover:text-neon-green"
                      >
                        {projectName(row.projectId)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(row.amount, row.currency)}
                    </TableCell>
                    <TableCell>
                      <span className="block">{formatDate(row.date)}</span>
                      {row.status !== 'Cobrado' ? (
                        <span
                          className={cn(
                            'text-xs',
                            late ? 'text-red-300' : 'text-muted-foreground',
                          )}
                        >
                          {relativeDays(row.date)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusChip status={row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.method ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.receipt ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {payment && payment.status !== 'Cobrado' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCollectTarget(payment)}
                          >
                            Cobrar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(row.paidDate)}
                          </span>
                        )}
                        {payment ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar pago: ${row.concept}`}
                            onClick={() => setEditTarget(payment)}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {collectTarget ? (
        <CollectPaymentDialog
          payment={collectTarget}
          open={!!collectTarget}
          onOpenChange={(o) => !o && setCollectTarget(null)}
        />
      ) : null}

      {editTarget ? (
        <EditPaymentDialog
          key={editTarget.id}
          payment={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      ) : null}
    </div>
  )
}

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
import { cn } from '@/lib/utils'
import type { Payment } from '@/lib/types'

export default function CobrosPage() {
  const { projects, payments } = useStore()
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

  const totalQuoted = projects.reduce((s, p) => s + p.quotedAmount, 0)
  const totalCollected = payments
    .filter((p) => p.status === 'Cobrado')
    .reduce((s, p) => s + p.amount, 0)
  const pending = Math.max(totalQuoted - totalCollected, 0)
  const overdue = payments.filter(
    (p) => effectivePaymentStatus(p) === 'Vencido',
  )
  const overdueTotal = overdue.reduce((s, p) => s + p.amount, 0)

  const filtered = React.useMemo(() => {
    return payments
      .filter((pay) => {
        const status = effectivePaymentStatus(pay)
        if (statusFilter !== 'todos' && status !== statusFilter) return false
        if (projectFilter !== 'todos' && pay.projectId !== projectFilter)
          return false
        if (query) {
          const q = query.toLowerCase()
          const hay =
            pay.concept.toLowerCase().includes(q) ||
            projectName(pay.projectId).toLowerCase().includes(q) ||
            (pay.receipt ?? '').toLowerCase().includes(q)
          if (!hay) return false
        }
        return true
      })
      .sort((a, b) => {
        // Unpaid first, then by due date.
        const aPaid = a.status === 'Cobrado' ? 1 : 0
        const bPaid = b.status === 'Cobrado' ? 1 : 0
        if (aPaid !== bPaid) return aPaid - bPaid
        return a.dueDate.localeCompare(b.dueDate)
      })
  }, [payments, statusFilter, projectFilter, query, projectName])

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
          value={formatMoney(totalQuoted)}
          hint={`${projects.length} proyectos`}
          icon={CircleDollarSign}
          accent="blue"
        />
        <StatCard
          label="Total cobrado"
          value={formatMoney(totalCollected)}
          hint={`${Math.round((totalCollected / (totalQuoted || 1)) * 100)}% del total`}
          icon={Wallet}
          accent="green"
        />
        <StatCard
          label="Saldo pendiente"
          value={formatMoney(pending)}
          hint="Por cobrar"
          icon={Clock}
          accent="violet"
        />
        <StatCard
          label="Vencidos"
          value={formatMoney(overdueTotal)}
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
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((pay) => {
                const status = effectivePaymentStatus(pay)
                const late = status === 'Vencido'
                return (
                  <TableRow key={pay.id}>
                    <TableCell className="font-medium">{pay.concept}</TableCell>
                    <TableCell>
                      <Link
                        href={`/proyectos/${pay.projectId}`}
                        className="text-muted-foreground transition-colors hover:text-neon-green"
                      >
                        {projectName(pay.projectId)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(pay.amount, pay.currency)}
                    </TableCell>
                    <TableCell>
                      <span className="block">{formatDate(pay.dueDate)}</span>
                      {pay.status !== 'Cobrado' ? (
                        <span
                          className={cn(
                            'text-xs',
                            late ? 'text-red-300' : 'text-muted-foreground',
                          )}
                        >
                          {relativeDays(pay.dueDate)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusChip status={status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pay.method ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pay.receipt ?? '—'}
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
                          onClick={() => setEditTarget(pay)}
                        >
                          <Pencil />
                        </Button>
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

'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  CircleDollarSign,
  Clock,
  Pencil,
  Search,
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
import { AddPaymentDialog } from '@/components/cobros/add-payment-dialog'
import { EditPaymentDialog } from '@/components/cobros/edit-payment-dialog'
import { useStore } from '@/lib/store'
import { projectFinance } from '@/lib/derive'
import { formatDate, formatMoney, formatMoneyWithCode } from '@/lib/format'
import {
  collectionRatio,
  formatMoneyByCurrency,
  mergeMoney,
  sumByCurrency,
} from '@/lib/money'
import type { Currency, Payment, PaymentMethod } from '@/lib/types'

/**
 * Payments and collected maintenance fees share this screen, so both flow
 * through one normalized row. Every row is money already received; only
 * payments are editable, since a maintenance charge belongs to its plan.
 */
interface CobroRow {
  id: string
  kind: 'payment' | 'maintenance'
  /** Null = cobro de un servicio que no corresponde a ningún proyecto. */
  projectId: string | null
  concept: string
  amount: number
  currency: Currency
  paidDate: string
  method: PaymentMethod | null
  receipt: string | null
  payment: Payment | null
}

/** yyyy-mm prefix, for "this month" comparisons on ISO dates. */
const currentMonth = () => new Date().toISOString().slice(0, 7)

export default function CobrosPage() {
  const { projects, payments, maintenanceCharges } = useStore()
  const [query, setQuery] = React.useState('')
  const [kindFilter, setKindFilter] = React.useState('todos')
  const [projectFilter, setProjectFilter] = React.useState('todos')
  const [addOpen, setAddOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Payment | null>(null)

  /**
   * Desde el paso 17 un cobro puede no tener proyecto: es el que salda una
   * factura de servicio suelto (hosting, soporte). Se muestra «Servicio» en
   * vez de un guión, para que se lea como lo que es y no como un dato que
   * falta.
   */
  const projectName = React.useCallback(
    (id: string | null) =>
      id ? (projects.find((p) => p.id === id)?.name ?? '—') : 'Servicio',
    [projects],
  )

  const totalQuoted = sumByCurrency(
    projects.map((p) => ({ amount: p.quotedAmount, currency: p.currency })),
  )
  const totalPaid = sumByCurrency(payments)
  const totalMaintenance = sumByCurrency(maintenanceCharges)
  const totalCollected = mergeMoney(totalPaid, totalMaintenance)
  // El pendiente se calcula proyecto por proyecto y recién después se suma:
  // con el piso en cero sobre el agregado, un proyecto cobrado de más tapaba
  // la deuda de otro de la misma moneda.
  const pending = mergeMoney(
    ...projects.map((p) => projectFinance(p, payments).pendingByCurrency),
  )
  const collectedPct = collectionRatio(totalQuoted, totalPaid)

  const rows = React.useMemo<CobroRow[]>(() => {
    const fromPayments: CobroRow[] = payments.map((pay) => ({
      id: `pay-${pay.id}`,
      kind: 'payment',
      projectId: pay.projectId,
      concept: pay.concept,
      amount: pay.amount,
      currency: pay.currency,
      paidDate: pay.paidDate,
      method: pay.method,
      receipt: pay.receipt,
      payment: pay,
    }))

    const fromMaintenance: CobroRow[] = maintenanceCharges.map((charge) => ({
      id: `mnt-${charge.id}`,
      kind: 'maintenance',
      projectId: charge.projectId,
      concept: 'Mantenimiento',
      amount: charge.amount,
      currency: charge.currency,
      paidDate: charge.chargedOn,
      method: charge.method,
      receipt: charge.receipt,
      payment: null,
    }))

    return [...fromPayments, ...fromMaintenance]
  }, [payments, maintenanceCharges])

  const thisMonth = sumByCurrency(
    rows.filter((r) => r.paidDate.startsWith(currentMonth())),
  )

  const filtered = React.useMemo(() => {
    return rows
      .filter((row) => {
        if (kindFilter !== 'todos' && row.kind !== kindFilter) return false
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
      .sort((a, b) => b.paidDate.localeCompare(a.paidDate))
  }, [rows, kindFilter, projectFilter, query, projectName])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cobros"
        description="Todo el dinero que entró: pagos de proyectos y mantenimientos."
      >
        <AddPaymentDialog open={addOpen} onOpenChange={setAddOpen} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          label="Cobrado este mes"
          value={formatMoneyByCurrency(thisMonth)}
          hint="Pagos y mantenimientos"
          icon={CalendarDays}
          accent="neutral"
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
          value={kindFilter}
          onValueChange={setKindFilter}
          className="sm:w-44"
          options={[
            { value: 'todos', label: 'Todo el dinero' },
            { value: 'payment', label: 'Pagos de proyecto' },
            { value: 'maintenance', label: 'Mantenimientos' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin cobros</EmptyTitle>
            <EmptyDescription>
              No hay movimientos que coincidan con los filtros aplicados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // El scroll horizontal ya lo trae el contenedor de Table: acá sólo
        // queda el recorte de las esquinas.
        <div className="glass overflow-hidden rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead nowrap={false}>Concepto</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Fecha de pago</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead nowrap={false}>Comprobante</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const payment = row.payment
                return (
                  <TableRow key={row.id}>
                    {/* Concepto y Comprobante son texto libre: sin dejarlos
                        wrappear estiraban la tabla sin techo. */}
                    <TableCell nowrap={false} className="min-w-40 font-medium">
                      <span className="flex flex-wrap items-center gap-2">
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
                      {/* Sin proyecto no hay a dónde linkear: el texto solo. */}
                      {row.projectId ? (
                        <Link
                          href={`/proyectos/${row.projectId}`}
                          className="text-muted-foreground transition-colors hover:text-neon-green"
                        >
                          {projectName(row.projectId)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {projectName(row.projectId)}
                        </span>
                      )}
                    </TableCell>
                    {/* Con código y no con símbolo: esta tabla apila cobros
                        de proyectos en monedas distintas, y USD y ARS
                        comparten el «$». Un «$300» acá no se puede leer. */}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoneyWithCode(row.amount, row.currency)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(row.paidDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.method ?? '—'}
                    </TableCell>
                    <TableCell
                      nowrap={false}
                      className="max-w-56 break-words text-muted-foreground"
                    >
                      {row.receipt ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {payment ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar pago: ${row.concept}`}
                            onClick={() => setEditTarget(payment)}
                          >
                            <Pencil />
                          </Button>
                        ) : (
                          <Link
                            href="/mantenimientos"
                            className="text-xs text-muted-foreground transition-colors hover:text-neon-green"
                          >
                            Ver plan
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

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

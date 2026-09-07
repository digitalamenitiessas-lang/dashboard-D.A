'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { SimpleSelect } from '@/components/shared/simple-select'
import {
  MovementDialog,
  type MovementPreset,
} from '@/components/caja/movement-dialog'
import { FixedExpenseDialog } from '@/components/gastos/fixed-expense-dialog'
import { useStore } from '@/lib/store'
import {
  committedMonthly,
  expenseEntries,
  fixedExpenseBoard,
  isActiveOn,
  monthRange,
  pendingThisMonth,
  spentByCurrency,
  spentByKind,
  structureSpend,
  todayIso,
  withdrawalsMislabeled,
  type ExpenseEntry,
  type PeriodState,
} from '@/lib/gastos'
import { formatDate, formatMoneyWithCode, relativeDays } from '@/lib/format'
import { formatMoneyByCurrency, isEmptyMoney, subtractMoney } from '@/lib/money'
import { EXPENSE_KINDS } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Currency, FixedExpense, MoneyMovement } from '@/lib/types'

const estadoStyles: Record<PeriodState, string> = {
  pagado: 'bg-neon-green/12 text-neon-green border-neon-green/30',
  pendiente: 'bg-amber-400/12 text-amber-300 border-amber-400/25',
  vencido: 'bg-destructive/15 text-red-300 border-destructive/30',
}

function EstadoChip({ state }: { state: PeriodState }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium capitalize', estadoStyles[state])}
    >
      {state}
    </Badge>
  )
}

/** "2026-09" → "septiembre 2026", para el filtro de mes del historial. */
function monthLabel(ym: string): string {
  const year = Number(ym.slice(0, 4))
  const month = Number(ym.slice(5, 7))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return ym
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

/**
 * La moneda con más gastos en el período. Sirve para UNA sola cosa: elegir
 * contra qué se dibuja la barra del desglose. El criterio es cantidad de
 * movimientos y no monto justamente para no comparar pesos con dólares.
 */
function leadingCurrency(entries: ExpenseEntry[]): Currency | null {
  const count = new Map<Currency, number>()
  for (const e of entries) count.set(e.currency, (count.get(e.currency) ?? 0) + 1)
  let lead: Currency | null = null
  for (const [currency, n] of count) {
    if (lead === null || n > (count.get(lead) ?? 0)) lead = currency
  }
  return lead
}

export default function GastosPage() {
  const {
    accounts,
    movements,
    projects,
    fixedExpenses,
    gastosReady,
  } = useStore()

  const [tab, setTab] = React.useState('mes')
  const [kindFilter, setKindFilter] = React.useState('todos')
  const [projectFilter, setProjectFilter] = React.useState('todos')
  const [monthFilter, setMonthFilter] = React.useState('todos')
  const [movementDialog, setMovementDialog] = React.useState<{
    open: boolean
    movement?: MoneyMovement
    preset?: MovementPreset
  }>({ open: false })
  const [fixedDialog, setFixedDialog] = React.useState<{
    open: boolean
    expense?: FixedExpense
  }>({ open: false })

  const projectName = React.useCallback(
    (id: string | null) =>
      id ? (projects.find((p) => p.id === id)?.name ?? '—') : 'Estructura',
    [projects],
  )
  const accountName = React.useCallback(
    (id: string) => accounts.find((a) => a.id === id)?.name ?? '—',
    [accounts],
  )
  const movementById = React.useMemo(
    () => new Map(movements.map((m) => [m.id, m])),
    [movements],
  )
  const planById = React.useMemo(
    () => new Map(fixedExpenses.map((e) => [e.id, e])),
    [fixedExpenses],
  )

  const hoy = todayIso()
  const mes = React.useMemo(() => monthRange(hoy), [hoy])

  // Dos listas y no una: el StatCard del mes mira el rango, pero al board hay
  // que pasarle TODO. Con un rango de un mes, el pago de agosto no taparía el
  // período de agosto y el plan saldría en rojo teniendo todo al día.
  const delMes = React.useMemo(
    () => expenseEntries({ movements, accounts }, mes),
    [movements, accounts, mes],
  )
  const todos = React.useMemo(
    () => expenseEntries({ movements, accounts }),
    [movements, accounts],
  )
  const board = React.useMemo(
    () => fixedExpenseBoard(fixedExpenses, todos),
    [fixedExpenses, todos],
  )

  const totalMes = spentByCurrency(delMes)
  const estructuraMes = structureSpend(delMes)
  const desglose = spentByKind(delMes)
  const lead = leadingCurrency(delMes)

  const pendiente = pendingThisMonth(board)
  const comprometido = committedMonthly(fixedExpenses)
  const comprometidoEstructura = committedMonthly(fixedExpenses, {
    structureOnly: true,
  })
  const comprometidoProyectos = subtractMoney(
    comprometido,
    comprometidoEstructura,
  )

  const conMora = board.filter((s) => s.overdue.length > 0)
  const periodosVencidos = conMora.reduce((n, s) => n + s.overdue.length, 0)

  // Los dos avisos del cartel ámbar. El primero es del mes en curso, que es lo
  // que se puede arreglar hoy; el segundo es de siempre, porque un retiro mal
  // cargado sigue contando plata dos veces por más viejo que sea.
  const sinRubro = delMes.filter((e) => e.kind === null)
  const malCargados = React.useMemo(
    () => withdrawalsMislabeled({ movements, accounts }),
    [movements, accounts],
  )

  const meses = React.useMemo(() => {
    const found = new Set(todos.map((e) => e.date.slice(0, 7)))
    return [...found].sort((a, b) => b.localeCompare(a))
  }, [todos])

  const historial = todos.filter((e) => {
    if (kindFilter === 'sin-rubro' && e.kind !== null) return false
    if (kindFilter !== 'todos' && kindFilter !== 'sin-rubro' && e.kind !== kindFilter) {
      return false
    }
    if (projectFilter === 'estructura' && e.projectId !== null) return false
    if (
      projectFilter !== 'todos' &&
      projectFilter !== 'estructura' &&
      e.projectId !== projectFilter
    ) {
      return false
    }
    if (monthFilter !== 'todos' && e.date.slice(0, 7) !== monthFilter) return false
    return true
  })
  const totalHistorial = spentByCurrency(historial)

  function verSinRubro() {
    setKindFilter('sin-rubro')
    setProjectFilter('todos')
    setMonthFilter(hoy.slice(0, 7))
    setTab('historial')
  }

  function editarMovimiento(movementId: string) {
    const movement = movementById.get(movementId)
    if (movement) setMovementDialog({ open: true, movement })
  }

  if (!gastosReady) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Gastos"
          description="En qué se va la plata y qué falta pagar."
        />
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Falta correr la migración</EmptyTitle>
            <EmptyDescription>
              Las tablas y columnas de gastos todavía no existen en la base.
              Corré{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                supabase/10_gastos.sql
              </code>{' '}
              desde el SQL Editor de Supabase y recargá esta página. El resto de
              la app funciona normal mientras tanto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gastos"
        description="En qué se va la plata y qué falta pagar."
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => setFixedDialog({ open: true })}
        >
          <Plus data-icon="inline-start" />
          Gasto fijo
        </Button>
        <Button
          size="sm"
          onClick={() =>
            setMovementDialog({ open: true, preset: { category: 'Gasto' } })
          }
        >
          <Plus data-icon="inline-start" />
          Gasto
        </Button>
      </PageHeader>

      {/* Los cuatro elegidos para que no se pisen: el primero es plata que ya
          salió, el segundo es plata que todavía no salió, el tercero es
          compromiso normalizado y el cuarto es un contador de planes. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Gasto del mes"
          value={formatMoneyByCurrency(totalMes)}
          hint={`${delMes.length} gasto(s) — sin retiros ni transferencias`}
          icon={Receipt}
          accent="blue"
        />
        <StatCard
          label="Pendiente este mes"
          value={formatMoneyByCurrency(pendiente.total)}
          hint={
            pendiente.count === 0
              ? 'Nada por pagar en el mes'
              : `${pendiente.count} período(s) sin pagar — se suma al gasto del mes`
          }
          icon={CalendarClock}
          accent="violet"
        />
        <StatCard
          label="Fijo por mes"
          value={formatMoneyByCurrency(comprometido)}
          hint={
            isEmptyMoney(comprometidoProyectos)
              ? `estructura ${formatMoneyByCurrency(comprometidoEstructura)}`
              : `estructura ${formatMoneyByCurrency(
                  comprometidoEstructura,
                )} · proyectos ${formatMoneyByCurrency(comprometidoProyectos)}`
          }
          icon={Repeat}
          accent="neutral"
        />
        <StatCard
          label="Vencidos"
          value={conMora.length}
          hint={
            periodosVencidos === 0
              ? 'Todo al día'
              : `${periodosVencidos} período(s) sin pagar`
          }
          icon={TriangleAlert}
          accent={conMora.length ? 'red' : 'neutral'}
        />
      </div>

      {sinRubro.length > 0 || malCargados.length > 0 ? (
        <div className="glass flex flex-col gap-3 rounded-2xl border-amber-400/25 bg-amber-400/5 p-4">
          {sinRubro.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-300">
                  {sinRubro.length} gasto(s) sin rubro este mes
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Suman al total pero no aparecen abiertos en el desglose hasta
                  que digas en qué se gastaron.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={verSinRubro}
              >
                Ver los sin rubro
              </Button>
            </div>
          ) : null}

          {/* Un 'Gasto' pagado desde la cuenta de Retiros es plata que ya está
              contada como repartida entre los socios. `expenseEntries()` la
              deja afuera a propósito, así que no está en ninguna tabla de esta
              pantalla: se listan acá o no se ven en ningún lado. */}
          {malCargados.length > 0 ? (
            <div
              className={cn(
                'flex flex-col gap-2',
                sinRubro.length > 0 && 'border-t border-amber-400/15 pt-3',
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-300">
                  {malCargados.length} movimiento(s) cargados como Gasto desde
                  una cuenta de Retiros
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Esa plata ya está contada como retirada, así que no suma acá.
                  Si era un retiro de socio, cambiale el tipo a «Retiro»; si era
                  un gasto real, pagalo desde la cuenta de la que salió.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {malCargados.slice(0, 4).map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setMovementDialog({ open: true, movement: m })
                    }
                  >
                    <Pencil data-icon="inline-start" />
                    <span className="tabular-nums">{formatDate(m.movedOn)}</span>
                    {m.concept ? ` · ${m.concept}` : ''}
                  </Button>
                ))}
                {malCargados.length > 4 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<Link href="/caja" />}
                    nativeButton={false}
                  >
                    Ver los {malCargados.length} en Caja
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="mes">Del mes</TabsTrigger>
          <TabsTrigger value="fijos">Fijos</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        {/* DEL MES */}
        <TabsContent value="mes" className="mt-4">
          {delMes.length === 0 ? (
            <Empty className="glass rounded-2xl">
              <EmptyHeader>
                <EmptyTitle>Sin gastos este mes</EmptyTitle>
                <EmptyDescription>
                  Un gasto es un movimiento de Caja que sale de una cuenta y no
                  entra a ninguna otra. Cargá el primero con el botón «Gasto».
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="glass overflow-x-auto rounded-2xl xl:col-span-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Rubro</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Imputado a</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {delMes.map((e) => (
                      <TableRow key={e.movementId}>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {formatDate(e.date)}
                        </TableCell>
                        <TableCell>
                          {e.kind ? (
                            <span className="text-muted-foreground">{e.kind}</span>
                          ) : (
                            <span className="text-amber-300">Sin rubro</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {e.concept || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {projectName(e.projectId)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {accountName(e.accountId)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap text-red-300">
                          −{formatMoneyWithCode(e.amount, e.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Editar gasto del ${e.date}`}
                              onClick={() => editarMovimiento(e.movementId)}
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

              <section className="glass rounded-2xl p-5">
                <h2 className="font-display text-base font-extrabold">
                  Desglose por rubro
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  De estructura: {formatMoneyByCurrency(estructuraMes)}
                  {lead ? ` · la barra compara sólo en ${lead}` : ''}
                </p>
                <ul className="mt-4 flex flex-col gap-3">
                  {desglose.map((row) => {
                    const base = lead ? (totalMes[lead] ?? 0) : 0
                    const own = lead ? (row.total[lead] ?? null) : null
                    const pct =
                      own !== null && base > 0
                        ? Math.max(2, Math.round((own / base) * 100))
                        : null
                    return (
                      <li key={row.kind ?? 'sin-rubro'}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span
                            className={cn(
                              'min-w-0 truncate text-sm',
                              row.kind === null
                                ? 'text-amber-300'
                                : 'text-foreground',
                            )}
                          >
                            {row.kind ?? 'Sin rubro'}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoneyByCurrency(row.total)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
                            {pct !== null ? (
                              <div
                                className="h-full rounded-full bg-neon-violet/70"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            ) : null}
                          </div>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {row.count}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          )}
        </TabsContent>

        {/* FIJOS */}
        <TabsContent value="fijos" className="mt-4">
          {board.length === 0 ? (
            <Empty className="glass rounded-2xl">
              <EmptyHeader>
                <EmptyTitle>Sin gastos fijos</EmptyTitle>
                <EmptyDescription>
                  Un gasto fijo es el compromiso: el servidor, el sueldo del
                  empleado, el contador. No es plata que salió — eso se registra
                  después, con el botón «Pagar» de cada fila.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setFixedDialog({ open: true })}>
                  <Plus data-icon="inline-start" />
                  Nuevo gasto fijo
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="glass overflow-x-auto rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Rubro</TableHead>
                    <TableHead>Imputado a</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Próximo vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {board.map((status) => {
                    const e = status.expense
                    const vigente = isActiveOn(e, hoy)
                    const next = status.next
                    return (
                      <TableRow key={e.id} className={cn(!vigente && 'opacity-60')}>
                        <TableCell>
                          <span className="font-medium">{e.concept}</span>
                          {e.vendor ? (
                            <span className="block text-xs text-muted-foreground">
                              {e.vendor}
                            </span>
                          ) : null}
                          {/* Una sola línea con el conteo, no un renglón por
                              período: con seis meses de mora la tabla se
                              volvería ilegible justo cuando más hay que leerla. */}
                          {status.overdue.length > 0 ? (
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-red-300">
                              <TriangleAlert className="size-3.5 shrink-0" />
                              {status.overdue.length} período(s) vencido(s) — el
                              más viejo hace{' '}
                              <span className="tabular-nums">
                                {status.overdue[0].daysLate}
                              </span>{' '}
                              días
                            </span>
                          ) : null}
                          {!vigente ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              De baja desde {formatDate(e.endedOn)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.kind}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {projectName(e.projectId)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className="font-semibold tabular-nums">
                            {formatMoneyWithCode(e.amount, e.currency)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {e.frequency.toLowerCase()} · día{' '}
                            <span className="tabular-nums">{e.dueDay}</span>
                          </span>
                          {e.frequency !== 'Mensual' ? (
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              ≈ {formatMoneyByCurrency(status.monthly)}/mes
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {next ? (
                            <>
                              <span className="tabular-nums">
                                {formatDate(next.dueDate)}
                              </span>
                              <span
                                className={cn(
                                  'block text-xs',
                                  next.state === 'vencido'
                                    ? 'text-red-300'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {relativeDays(next.dueDate)}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {next ? (
                            <EstadoChip state={next.state} />
                          ) : (
                            <Badge variant="outline" className="font-medium">
                              sin vencimientos
                            </Badge>
                          )}
                          {status.lastPaid ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Último pago{' '}
                              <span className="tabular-nums">
                                {formatDate(status.lastPaid.date)}
                              </span>
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              disabled={!next}
                              onClick={() =>
                                next &&
                                setMovementDialog({
                                  open: true,
                                  // Rubro y proyecto NO viajan en el preset:
                                  // el diálogo los saca del plan, que es de
                                  // donde tienen que salir para que la
                                  // pantalla no pueda contradecirlo.
                                  preset: {
                                    category: 'Gasto',
                                    concept: e.concept,
                                    fixedExpenseId: e.id,
                                    periodStart: next.periodStart,
                                  },
                                })
                              }
                            >
                              Pagar
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Editar gasto fijo: ${e.concept}`}
                              onClick={() =>
                                setFixedDialog({ open: true, expense: e })
                              }
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
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="historial" className="mt-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <SimpleSelect
                value={kindFilter}
                onValueChange={setKindFilter}
                className="sm:w-56"
                options={[
                  { value: 'todos', label: 'Todos los rubros' },
                  { value: 'sin-rubro', label: 'Sin rubro' },
                  ...EXPENSE_KINDS.map((k) => ({ value: k, label: k })),
                ]}
              />
              <SimpleSelect
                value={projectFilter}
                onValueChange={setProjectFilter}
                className="sm:w-56"
                options={[
                  { value: 'todos', label: 'Todo, proyectos y estructura' },
                  { value: 'estructura', label: 'Sólo estructura' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <SimpleSelect
                value={monthFilter}
                onValueChange={setMonthFilter}
                className="sm:w-48"
                options={[
                  { value: 'todos', label: 'Todos los meses' },
                  ...meses.map((m) => ({ value: m, label: monthLabel(m) })),
                ]}
              />
            </div>

            {historial.length === 0 ? (
              <Empty className="glass rounded-2xl">
                <EmptyHeader>
                  <EmptyTitle>Sin gastos</EmptyTitle>
                  <EmptyDescription>
                    No hay gastos que coincidan con los filtros aplicados.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {historial.length} gasto(s)
                  </span>
                  <span className="font-semibold tabular-nums text-red-300">
                    {formatMoneyByCurrency(totalHistorial)}
                  </span>
                </div>
                <div className="glass overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Rubro</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Imputado a</TableHead>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Gasto fijo</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historial.map((e) => {
                        const plan = e.fixedExpenseId
                          ? planById.get(e.fixedExpenseId)
                          : undefined
                        return (
                          <TableRow key={e.movementId}>
                            <TableCell className="tabular-nums whitespace-nowrap">
                              {formatDate(e.date)}
                            </TableCell>
                            <TableCell>
                              {e.kind ? (
                                <span className="text-muted-foreground">
                                  {e.kind}
                                </span>
                              ) : (
                                <span className="text-amber-300">Sin rubro</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              {e.concept || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {projectName(e.projectId)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {accountName(e.accountId)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {plan ? (
                                <>
                                  {plan.concept}
                                  {e.periodStart ? (
                                    <span className="block text-xs tabular-nums">
                                      {monthLabel(e.periodStart.slice(0, 7))}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap text-red-300">
                              −{formatMoneyWithCode(e.amount, e.currency)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Editar gasto del ${e.date}`}
                                  onClick={() => editarMovimiento(e.movementId)}
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
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {movementDialog.open ? (
        <MovementDialog
          key={
            movementDialog.movement?.id ??
            `${movementDialog.preset?.fixedExpenseId ?? 'suelto'}-${
              movementDialog.preset?.periodStart ?? ''
            }`
          }
          movement={movementDialog.movement}
          preset={movementDialog.preset}
          open={movementDialog.open}
          onOpenChange={(o) => !o && setMovementDialog({ open: false })}
        />
      ) : null}

      {fixedDialog.open ? (
        <FixedExpenseDialog
          key={fixedDialog.expense?.id ?? 'nuevo'}
          expense={fixedDialog.expense}
          open={fixedDialog.open}
          onOpenChange={(o) => !o && setFixedDialog({ open: false })}
        />
      ) : null}
    </div>
  )
}

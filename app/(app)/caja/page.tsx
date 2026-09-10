'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Pencil,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react'
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
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { SimpleSelect } from '@/components/shared/simple-select'
import { AccountDialog } from '@/components/caja/account-dialog'
import { MovementDialog } from '@/components/caja/movement-dialog'
import { useStore } from '@/lib/store'
import {
  accountBalances,
  accountLedger,
  cobrosDescalzados,
  totalByCurrency,
} from '@/lib/caja'
import { formatDate, formatMoney, formatMoneyWithCode } from '@/lib/format'
import { formatMoneyByCurrency } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Account, MoneyMovement } from '@/lib/types'

export default function CajaPage() {
  const {
    accounts,
    movements,
    payments,
    maintenanceCharges,
    projects,
    cajaReady,
  } = useStore()
  const [accountDialog, setAccountDialog] = React.useState<{
    open: boolean
    account?: Account
  }>({ open: false })
  const [movementDialog, setMovementDialog] = React.useState<{
    open: boolean
    movement?: MoneyMovement
  }>({ open: false })
  const [ledgerAccount, setLedgerAccount] = React.useState('')

  const projectName = React.useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? '—',
    [projects],
  )
  const accountName = React.useCallback(
    (id: string | null) =>
      id ? (accounts.find((a) => a.id === id)?.name ?? '—') : '—',
    [accounts],
  )

  const balances = accountBalances({
    accounts,
    movements,
    payments,
    maintenanceCharges,
  })
  const active = balances.filter((b) => !b.account.archived)
  const invested = active.filter((b) => b.account.kind === 'Inversión')
  const withdrawn = active.filter((b) => b.account.kind === 'Retiros')
  const available = active.filter(
    (b) => b.account.kind !== 'Inversión' && b.account.kind !== 'Retiros',
  )

  // Cobros with no account assigned are money the Caja can't see.
  const descalzados = cobrosDescalzados({
    accounts,
    payments,
    maintenanceCharges,
  })

  const unassigned = [
    ...payments.filter((p) => !p.accountId),
    ...maintenanceCharges.filter((c) => !c.accountId),
  ]

  const ledger = ledgerAccount
    ? accountLedger(
        ledgerAccount,
        { movements, payments, maintenanceCharges },
        projectName,
      )
    : []
  const ledgerCurrency = accounts.find((a) => a.id === ledgerAccount)?.currency

  React.useEffect(() => {
    if (!ledgerAccount && active.length > 0) setLedgerAccount(active[0].account.id)
  }, [ledgerAccount, active])

  if (!cajaReady) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Caja"
          description="Dónde está la plata y qué se hizo con ella."
        />
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Falta correr la migración</EmptyTitle>
            <EmptyDescription>
              Las tablas de la caja todavía no existen en la base. Corré{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                supabase/08_caja.sql
              </code>{' '}
              desde el SQL Editor de Supabase y recargá esta página. El resto
              de la app funciona normal mientras tanto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Caja"
        description="Dónde está la plata y qué se hizo con ella."
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAccountDialog({ open: true })}
          >
            <Plus data-icon="inline-start" />
            Cuenta
          </Button>
          <Button size="sm" onClick={() => setMovementDialog({ open: true })}>
            <Plus data-icon="inline-start" />
            Movimiento
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Disponible"
          value={formatMoneyByCurrency(totalByCurrency(available))}
          hint="Cajas, bancos y billeteras"
          icon={Wallet}
          accent="green"
        />
        <StatCard
          label="Invertido"
          value={formatMoneyByCurrency(totalByCurrency(invested))}
          hint="Cheques y demás"
          icon={TrendingUp}
          accent="violet"
        />
        <StatCard
          label="Retirado"
          value={formatMoneyByCurrency(totalByCurrency(withdrawn))}
          hint="Lo que salió para ustedes"
          icon={ArrowUpRight}
          accent="blue"
        />
        <StatCard
          label="Cuentas activas"
          value={active.length}
          hint={`${movements.length} movimiento(s)`}
          icon={Landmark}
          accent="neutral"
        />
      </div>

      {/* Mismo cartel y mismo criterio que el de «sin cuenta asignada»: esa
          plata no suma a ningún saldo, y el dato queda a la vista en vez de
          desaparecer. La diferencia es el motivo: acá la cuenta está puesta
          pero es de otra moneda, y sumarlo sería mezclar monedas. */}
      {descalzados.length > 0 ? (
        <div className="glass flex flex-col gap-2 rounded-2xl border-amber-400/25 bg-amber-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-300 tabular-nums">
              {descalzados.length} cobro(s) en una cuenta de otra moneda
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
              {descalzados
                .slice(0, 3)
                .map(
                  (d) =>
                    `${d.concepto} (${formatMoneyWithCode(d.amount, d.currency)} en ${accounts.find((a) => a.id === d.accountId)?.name ?? 'cuenta borrada'})`,
                )
                .join(', ')}
              {descalzados.length > 3 ? ` y ${descalzados.length - 3} más` : ''}
              . No suman a ningún saldo: una cuenta tiene una sola moneda. Se
              arregla moviéndolos a una cuenta de su moneda, o corrigiendo la
              moneda del cobro.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            render={<Link href="/cobros" />}
            nativeButton={false}
          >
            Ir a Cobros
          </Button>
        </div>
      ) : null}

      {unassigned.length > 0 ? (
        <div className="glass flex flex-col gap-2 rounded-2xl border-amber-400/25 bg-amber-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-300">
              {unassigned.length} cobro(s) sin cuenta asignada
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
              Esa plata no suma a ningún saldo hasta que digas a qué cuenta
              entró. Se asigna editando cada cobro.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            render={<Link href="/cobros" />}
            nativeButton={false}
          >
            Ir a Cobros
          </Button>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin cuentas</EmptyTitle>
            <EmptyDescription>
              Creá una cuenta por cada lugar donde tengas plata: la caja en
              dólares, el banco en pesos, Mercado Pago, los cheques.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Tabs defaultValue="cuentas">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
            <TabsTrigger value="detalle">Detalle por cuenta</TabsTrigger>
          </TabsList>

          {/* CUENTAS */}
          <TabsContent value="cuentas" className="mt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {balances.map(({ account, collected, movedIn, movedOut, balance }) => (
                <section
                  key={account.id}
                  className={cn(
                    'glass rounded-2xl p-5',
                    account.archived && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-base font-extrabold">
                        {account.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {account.kind} · {account.currency}
                        {account.archived ? ' · archivada' : ''}
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Editar cuenta: ${account.name}`}
                      onClick={() => setAccountDialog({ open: true, account })}
                    >
                      <Pencil />
                    </Button>
                  </div>

                  <p
                    className={cn(
                      'mt-4 font-display text-2xl font-extrabold tabular-nums',
                      balance < 0 ? 'text-red-300' : 'text-neon-green',
                    )}
                  >
                    {formatMoney(balance, account.currency)}
                  </p>

                  <div className="mt-4 flex flex-col gap-1.5 border-t border-white/5 pt-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <ArrowDownLeft className="size-3.5 text-neon-green" />
                        Entró
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(collected + movedIn, account.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <ArrowUpRight className="size-3.5 text-red-300" />
                        Salió
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(movedOut, account.currency)}
                      </span>
                    </div>
                    {collected > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          De cobros
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(collected, account.currency)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {account.notes ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {account.notes}
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          </TabsContent>

          {/* MOVIMIENTOS */}
          <TabsContent value="movimientos" className="mt-4">
            {movements.length === 0 ? (
              <Empty className="glass rounded-2xl">
                <EmptyHeader>
                  <EmptyTitle>Sin movimientos</EmptyTitle>
                  <EmptyDescription>
                    Cada vez que cambies plata, pagues algo, retires o
                    inviertas, registralo acá y los saldos se acomodan solos.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              // Un solo scroller: el de Table. Acá sólo el recorte de las
              // esquinas, así la columna fija se pega al scroller correcto.
              <div className="glass overflow-hidden rounded-2xl">
                {/* Abajo de md, lista en vez de tabla: son 8 columnas y
                    ~940px de ancho mínimo contra 343px de pantalla. */}
                <ul className="divide-y divide-white/5 p-4 md:hidden">
                  {movements.map((m) => {
                    const from = accounts.find((a) => a.id === m.fromAccountId)
                    const to = accounts.find((a) => a.id === m.toAccountId)
                    return (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-words">
                            {m.concept || m.category}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {formatDate(m.movedOn)}
                            {/* Si no hay concepto el título ya es el tipo: no
                                se repite acá. */}
                            {m.concept ? ` · ${m.category}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs break-words text-muted-foreground">
                            {accountName(m.fromAccountId)} →{' '}
                            {accountName(m.toAccountId)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {from ? (
                            <span className="text-sm font-semibold tabular-nums text-red-300">
                              −{formatMoney(m.amountOut, from.currency)}
                            </span>
                          ) : null}
                          {to ? (
                            <span className="text-sm font-semibold tabular-nums text-neon-green">
                              +{formatMoney(m.amountIn, to.currency)}
                            </span>
                          ) : null}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar movimiento del ${m.movedOn}`}
                            onClick={() =>
                              setMovementDialog({ open: true, movement: m })
                            }
                          >
                            <Pencil />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead sticky>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead nowrap={false}>Concepto</TableHead>
                        <TableHead>Sale de</TableHead>
                        {/* Las dos columnas de monto decían "Monto": al llegar
                            scrolleando a la segunda no se sabía cuál era cuál. */}
                        <TableHead className="text-right">Sale</TableHead>
                        <TableHead>Entra a</TableHead>
                        <TableHead className="text-right">Entra</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => {
                        const from = accounts.find(
                          (a) => a.id === m.fromAccountId,
                        )
                        const to = accounts.find((a) => a.id === m.toAccountId)
                        return (
                          <TableRow key={m.id}>
                            <TableCell sticky className="tabular-nums">
                              {formatDate(m.movedOn)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {m.category}
                            </TableCell>
                            <TableCell
                              nowrap={false}
                              className="min-w-40 max-w-56 break-words font-medium"
                            >
                              {m.concept || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {accountName(m.fromAccountId)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-red-300">
                              {from
                                ? `−${formatMoney(m.amountOut, from.currency)}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {accountName(m.toAccountId)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-neon-green">
                              {to
                                ? `+${formatMoney(m.amountIn, to.currency)}`
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Editar movimiento del ${m.movedOn}`}
                                  onClick={() =>
                                    setMovementDialog({
                                      open: true,
                                      movement: m,
                                    })
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
              </div>
            )}
          </TabsContent>

          {/* DETALLE POR CUENTA */}
          <TabsContent value="detalle" className="mt-4">
            <div className="flex flex-col gap-4">
              <SimpleSelect
                value={ledgerAccount}
                onValueChange={setLedgerAccount}
                className="sm:w-72"
                options={balances.map((b) => ({
                  value: b.account.id,
                  label: `${b.account.name} · ${formatMoney(
                    b.balance,
                    b.account.currency,
                  )}`,
                }))}
              />
              {ledger.length === 0 ? (
                <Empty className="glass rounded-2xl">
                  <EmptyHeader>
                    <EmptyTitle>Sin movimientos en esta cuenta</EmptyTitle>
                    <EmptyDescription>
                      Todavía no entró ni salió plata de acá.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="glass overflow-hidden rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead sticky>Fecha</TableHead>
                        <TableHead nowrap={false}>Concepto</TableHead>
                        <TableHead nowrap={false}>Detalle</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell sticky className="tabular-nums">
                            {formatDate(entry.date)}
                          </TableCell>
                          <TableCell
                            nowrap={false}
                            className="min-w-40 max-w-56 break-words font-medium"
                          >
                            {entry.concept}
                          </TableCell>
                          <TableCell
                            nowrap={false}
                            className="max-w-56 break-words text-muted-foreground"
                          >
                            {entry.detail}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-semibold tabular-nums',
                              entry.amount < 0 ? 'text-red-300' : 'text-neon-green',
                            )}
                          >
                            {entry.amount < 0 ? '−' : '+'}
                            {formatMoney(Math.abs(entry.amount), ledgerCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {accountDialog.open ? (
        <AccountDialog
          key={accountDialog.account?.id ?? 'nueva'}
          account={accountDialog.account}
          open={accountDialog.open}
          onOpenChange={(o) => !o && setAccountDialog({ open: false })}
        />
      ) : null}

      {movementDialog.open ? (
        <MovementDialog
          key={movementDialog.movement?.id ?? 'nuevo'}
          movement={movementDialog.movement}
          open={movementDialog.open}
          onOpenChange={(o) => !o && setMovementDialog({ open: false })}
        />
      ) : null}
    </div>
  )
}

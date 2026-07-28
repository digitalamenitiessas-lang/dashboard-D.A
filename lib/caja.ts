// Balances and money-flow reporting for the Caja screen.
//
// A balance is never stored: it is always the sum of everything that
// landed in an account minus everything that left it. That way the Caja
// can't drift out of sync with Cobros — there is nothing to keep in sync.

import { sumByCurrency, type MoneyByCurrency } from './money'
import type {
  Account,
  MaintenanceCharge,
  MoneyMovement,
  Payment,
} from './types'

export interface CajaInput {
  accounts: Account[]
  movements: MoneyMovement[]
  payments: Payment[]
  maintenanceCharges: MaintenanceCharge[]
}

export interface AccountBalance {
  account: Account
  /** Money in from cobros (payments + maintenance) assigned to it. */
  collected: number
  /** Money in from movements. */
  movedIn: number
  /** Money out through movements. */
  movedOut: number
  balance: number
}

/**
 * Every amount here is in the account's own currency: a movement's
 * `amountOut` belongs to its origin account and `amountIn` to its
 * destination, which is exactly what makes a currency exchange work
 * without a conversion rate.
 */
export function accountBalances({
  accounts,
  movements,
  payments,
  maintenanceCharges,
}: CajaInput): AccountBalance[] {
  const collected = new Map<string, number>()
  const movedIn = new Map<string, number>()
  const movedOut = new Map<string, number>()

  const add = (map: Map<string, number>, key: string | null, amount: number) => {
    if (!key) return
    map.set(key, (map.get(key) ?? 0) + amount)
  }

  for (const p of payments) add(collected, p.accountId, p.amount)
  for (const c of maintenanceCharges) add(collected, c.accountId, c.amount)
  for (const m of movements) {
    add(movedIn, m.toAccountId, m.amountIn)
    add(movedOut, m.fromAccountId, m.amountOut)
  }

  return accounts.map((account) => {
    const inFromCobros = collected.get(account.id) ?? 0
    const inFromMoves = movedIn.get(account.id) ?? 0
    const out = movedOut.get(account.id) ?? 0
    return {
      account,
      collected: inFromCobros,
      movedIn: inFromMoves,
      movedOut: out,
      balance: inFromCobros + inFromMoves - out,
    }
  })
}

/** Total sitting in the given accounts, bucketed by currency. */
export function totalByCurrency(balances: AccountBalance[]): MoneyByCurrency {
  return sumByCurrency(
    balances.map((b) => ({ amount: b.balance, currency: b.account.currency })),
  )
}

/**
 * One row per side of a movement, so an account's history reads as a
 * simple list of ins and outs. A movement between two accounts shows up
 * once in each.
 */
export interface LedgerEntry {
  id: string
  date: string
  concept: string
  detail: string
  /** Positive = came in, negative = went out. */
  amount: number
  accountId: string
  source: 'cobro' | 'movimiento'
  category: string
}

export function accountLedger(
  accountId: string,
  { movements, payments, maintenanceCharges }: Omit<CajaInput, 'accounts'>,
  projectName: (id: string) => string,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []

  for (const p of payments) {
    if (p.accountId !== accountId) continue
    entries.push({
      id: `pay-${p.id}`,
      date: p.paidDate,
      concept: p.concept,
      detail: projectName(p.projectId),
      amount: p.amount,
      accountId,
      source: 'cobro',
      category: 'Cobro',
    })
  }

  for (const c of maintenanceCharges) {
    if (c.accountId !== accountId) continue
    entries.push({
      id: `mnt-${c.id}`,
      date: c.chargedOn,
      concept: 'Mantenimiento',
      detail: projectName(c.projectId),
      amount: c.amount,
      accountId,
      source: 'cobro',
      category: 'Cobro',
    })
  }

  for (const m of movements) {
    if (m.toAccountId === accountId) {
      entries.push({
        id: `mov-${m.id}-in`,
        date: m.movedOn,
        concept: m.concept || m.category,
        detail: m.category,
        amount: m.amountIn,
        accountId,
        source: 'movimiento',
        category: m.category,
      })
    }
    if (m.fromAccountId === accountId) {
      entries.push({
        id: `mov-${m.id}-out`,
        date: m.movedOn,
        concept: m.concept || m.category,
        detail: m.category,
        amount: -m.amountOut,
        accountId,
        source: 'movimiento',
        category: m.category,
      })
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Implied exchange rate of a currency swap, or null when the movement
 * isn't one. Nothing is stored: the rate is whatever the two amounts say.
 */
export function impliedRate(movement: MoneyMovement): number | null {
  if (!movement.fromAccountId || !movement.toAccountId) return null
  if (movement.amountOut <= 0 || movement.amountIn <= 0) return null
  return movement.amountIn / movement.amountOut
}

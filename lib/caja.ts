// Balances and money-flow reporting for the Caja screen.
//
// A balance is never stored: it is always the sum of everything that
// landed in an account minus everything that left it. That way the Caja
// can't drift out of sync with Cobros — there is nothing to keep in sync.

import { sumByCurrency, type MoneyByCurrency } from './money'
import type {
  Account,
  Currency,
  MaintenanceCharge,
  MoneyMovement,
  Payment,
} from './types'

/**
 * Un cobro asignado a una cuenta cuya moneda no coincide con la del cobro.
 *
 * No suma a ningún saldo, porque sumarlo sería mezclar monedas. Se devuelve
 * para que la pantalla lo pueda mostrar, con el mismo criterio que los
 * cobros sin cuenta asignada: el dato queda a la vista en vez de
 * desaparecer.
 */
export interface Descalzado {
  accountId: string
  amount: number
  currency: Currency
  concepto: string
}

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

  /**
   * Un cobro suma al saldo de su cuenta SÓLO si está en la moneda de esa
   * cuenta.
   *
   * Una cuenta tiene una sola moneda —regla de la casa— así que sumarle un
   * importe en otra es sumar peras con manzanas: un cobro de ARS 250.000
   * asignado a una cuenta en dólares inflaba el saldo en USD en 250.000 y
   * nada lo avisaba. Los que no coinciden quedan en `descalzados` para que
   * la pantalla los muestre, igual que ya hace con los cobros sin cuenta
   * asignada.
   */
  const monedaDe = new Map(accounts.map((a) => [a.id, a.currency]))
  const suma = (
    accountId: string | null,
    amount: number,
    currency: Currency,
  ) => {
    if (!accountId) return
    // La moneda tiene que coincidir. Ver `cobrosDescalzados()`.
    if (monedaDe.get(accountId) !== currency) return
    add(collected, accountId, amount)
  }

  for (const p of payments) suma(p.accountId, p.amount, p.currency)
  for (const c of maintenanceCharges) suma(c.accountId, c.amount, c.currency)
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

/**
 * Los cobros asignados a una cuenta cuya moneda no es la del cobro.
 *
 * No suman a ningún saldo —sumarlos sería mezclar monedas, que es la única
 * regla que respeta toda la app— y antes se sumaban igual: un cobro de
 * ARS 250.000 asignado a una cuenta en dólares le agregaba 250.000 al saldo
 * en USD, sin que nada lo avisara. Ahora quedan afuera del cálculo y salen
 * por acá, con el mismo criterio que los cobros sin cuenta asignada: el dato
 * a la vista en vez de desaparecido.
 *
 * Se arregla de dos formas y las dos son de la persona, no del sistema:
 * moverlo a una cuenta de su moneda, o corregir la moneda del cobro.
 */
export function cobrosDescalzados({
  accounts,
  payments,
  maintenanceCharges,
}: Omit<CajaInput, 'movements'>): Descalzado[] {
  const monedaDe = new Map(accounts.map((a) => [a.id, a.currency]))
  const fuera: Descalzado[] = []

  const revisar = (
    accountId: string | null,
    amount: number,
    currency: Currency,
    concepto: string,
  ) => {
    if (!accountId) return
    const dela = monedaDe.get(accountId)
    // Una cuenta que no existe no es un descalce: es un cobro apuntando a
    // una cuenta borrada, y de eso ya se encarga el FK con SET NULL.
    if (dela === undefined || dela === currency) return
    fuera.push({ accountId, amount, currency, concepto })
  }

  for (const p of payments) {
    revisar(p.accountId, p.amount, p.currency, p.concept)
  }
  for (const c of maintenanceCharges) {
    revisar(c.accountId, c.amount, c.currency, 'Cobro de mantenimiento')
  }
  return fuera
}

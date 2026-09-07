// Totals that never sum different currencies into one meaningless number.
// The app has no exchange rate, so amounts stay bucketed by currency and are
// rendered side by side ("US$ 12.000 · $ 4.500.000").

import { formatMoney, formatMoneyWithCode } from './format'
import type { Currency } from './types'

export type MoneyByCurrency = Partial<Record<Currency, number>>

/** Fixed display order, so the same set of currencies always reads the same. */
const CURRENCY_ORDER: Currency[] = ['USD', 'ARS', 'EUR']

/** Buckets present in a total, in display order. */
function entries(totals: MoneyByCurrency): [Currency, number][] {
  return CURRENCY_ORDER.filter((c) => totals[c] !== undefined).map((c) => [
    c,
    totals[c] as number,
  ])
}

export function addMoney(
  into: MoneyByCurrency,
  amount: number,
  currency: Currency,
): MoneyByCurrency {
  into[currency] = (into[currency] ?? 0) + amount
  return into
}

export function sumByCurrency(
  items: Iterable<{ amount: number; currency: Currency }>,
): MoneyByCurrency {
  const totals: MoneyByCurrency = {}
  for (const item of items) addMoney(totals, item.amount, item.currency)
  return totals
}

export function mergeMoney(...totals: MoneyByCurrency[]): MoneyByCurrency {
  const merged: MoneyByCurrency = {}
  for (const total of totals) {
    for (const [currency, amount] of entries(total)) {
      addMoney(merged, amount, currency)
    }
  }
  return merged
}

/**
 * Per-currency `quoted - collected`, floored at zero.
 *
 * Sirve para UN presupuesto contra SUS cobros. No la uses sobre totales ya
 * agregados de varios proyectos: el piso en cero recién sobre la suma hace
 * que un proyecto cobrado de más tape la deuda de otro de la misma moneda.
 * Para eso está `ProjectFinance.pendingByCurrency`, que pone el piso proyecto
 * por proyecto, y después se suman con `mergeMoney`.
 */
export function pendingMoney(
  quoted: MoneyByCurrency,
  collected: MoneyByCurrency,
): MoneyByCurrency {
  const pending: MoneyByCurrency = {}
  for (const [currency, amount] of entries(quoted)) {
    pending[currency] = Math.max(amount - (collected[currency] ?? 0), 0)
  }
  return pending
}

/**
 * `a - b`, bucket por bucket, iterando la UNIÓN de las dos.
 *
 * Dos diferencias deliberadas con `pendingMoney()`, que es la otra resta del
 * archivo y hace justo lo contrario en las dos:
 *
 * 1. No pisa el negativo en cero. Un proyecto puede dar pérdida, y un
 *    resultado que nunca baja de cero no es un resultado, es un consuelo.
 *    `pendingMoney()` sí lo pisa porque «cobrado de más» no es deuda.
 * 2. Itera la unión y no sólo las monedas de `a`. Si hubo gastos en dólares y
 *    ningún ingreso en dólares, esa moneda tiene que aparecer en rojo, no
 *    desaparecer del total.
 */
export function subtractMoney(
  a: MoneyByCurrency,
  b: MoneyByCurrency,
): MoneyByCurrency {
  const result: MoneyByCurrency = {}
  for (const currency of CURRENCY_ORDER) {
    if (a[currency] === undefined && b[currency] === undefined) continue
    result[currency] = (a[currency] ?? 0) - (b[currency] ?? 0)
  }
  return result
}

export function isEmptyMoney(totals: MoneyByCurrency): boolean {
  return entries(totals).every(([, amount]) => Math.round(amount) === 0)
}

/**
 * Zero buckets are dropped as long as something else has a value, so one idle
 * currency doesn't clutter every total. Falls back to "—" when there is
 * nothing at all to show.
 *
 * Once two currencies sit side by side the symbol alone is not enough — USD
 * and ARS are both "$" — so the whole line switches to currency codes.
 */
export function formatMoneyByCurrency(totals: MoneyByCurrency): string {
  const all = entries(totals)
  if (all.length === 0) return '—'
  const nonZero = all.filter(([, amount]) => Math.round(amount) !== 0)
  const shown = nonZero.length > 0 ? nonZero : all.slice(0, 1)
  const render = shown.length > 1 ? formatMoneyWithCode : formatMoney
  return shown
    .map(([currency, amount]) => render(amount, currency))
    .join(' · ')
}

/**
 * The one currency in play across these totals, or null when they mix.
 *
 * Un bucket en cero no es una moneda en juego: un proyecto cargado en euros
 * con monto 0 no tiene por qué hacer desaparecer el porcentaje de cobranza
 * de toda la empresa. Si no hay nada distinto de cero se mira igual qué
 * monedas están presentes, para no perder el caso legítimo de "todo en cero
 * en una sola moneda".
 */
export function singleCurrency(...totals: MoneyByCurrency[]): Currency | null {
  const found = new Set<Currency>()
  const withValue = new Set<Currency>()
  for (const total of totals) {
    for (const [currency, amount] of entries(total)) {
      found.add(currency)
      if (Math.round(amount) !== 0) withValue.add(currency)
    }
  }
  const inPlay = withValue.size > 0 ? withValue : found
  return inPlay.size === 1 ? [...inPlay][0] : null
}

/**
 * Collected over quoted, as a percentage. Null when more than one currency is
 * involved: without a conversion rate there is no honest single ratio.
 */
export function collectionRatio(
  quoted: MoneyByCurrency,
  collected: MoneyByCurrency,
): number | null {
  const currency = singleCurrency(quoted, collected)
  if (!currency) return null
  const total = quoted[currency] ?? 0
  if (total <= 0) return null
  return Math.round(((collected[currency] ?? 0) / total) * 100)
}

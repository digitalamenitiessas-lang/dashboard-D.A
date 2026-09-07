// Gastos: en qué se va la plata y qué falta pagar.
//
// Hermano de `lib/caja.ts`: un módulo por área de derivación. Tres reglas
// que valen para todo el archivo y no se negocian adentro de ninguna
// función:
//
//   1. Nada se guarda. El estado de un gasto fijo, la mora y los totales se
//      calculan cada vez a partir de los movimientos. Es lo mismo que hace
//      `accountBalances()`: si no hay nada guardado, no hay nada que se
//      pueda desincronizar.
//   2. Ninguna función pública devuelve un número de plata sin su moneda.
//      Todo total sale como `MoneyByCurrency` (o como `{ amount, currency }`
//      cuando es uno solo). Un escalar pelado en API pública es la primitiva
//      con la que alguien suma pesos con dólares dentro de tres meses.
//   3. El monto de un gasto va en la moneda de la cuenta de la que salió,
//      nunca en la del plan. Lo que se pagó es lo que salió.
//
// El calendario de un gasto fijo es función pura de
// (startedOn, frequency, dueDay) y NO del último pago: ver `expensePeriods`.

import { daysUntil, todayIso } from './format'
import { frequencyMonths } from './derive'
import { addMoney, sumByCurrency, type MoneyByCurrency } from './money'
import type {
  Account,
  Currency,
  ExpenseKind,
  FixedExpense,
  MoneyMovement,
} from './types'

/**
 * `todayIso` vive en `lib/format.ts` (ahí ya lee el reloj local y no el UTC,
 * que a partir de las 21:00 en Argentina contesta mañana). Se reexporta acá
 * porque el resto del módulo de gastos lo usa en cada firma con `today`
 * opcional, y así una pantalla de /gastos importa de un solo lado.
 */
export { todayIso }

/** Rango de fechas ISO, los dos extremos incluidos. */
export interface DateRange {
  from: string
  to: string
}

/** Fecha local a ISO (yyyy-mm-dd), sin pasar por UTC y correrse un día. */
function toIso(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const da = String(date.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

/** Rango del mes calendario al que pertenece una fecha ISO. */
export function monthRange(iso: string): DateRange {
  const month = iso.slice(0, 7)
  const year = Number(iso.slice(0, 4))
  const monthNumber = Number(iso.slice(5, 7))
  // Día 0 del mes siguiente = último día de éste, sin tabla de 30/31 ni
  // reglas de año bisiesto a mano.
  const last = new Date(year, monthNumber, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

/**
 * Suma meses a una fecha ISO recortando el día al último del mes destino.
 *
 * `setMonth()` a secas no sirve: el 31 de enero más un mes da 3 de marzo, y
 * con eso el calendario de un plan se va corriendo solo mes a mes.
 */
function addMonths(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7)) - 1
  const day = Number(iso.slice(8, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return iso
  }
  const target = new Date(year, month + months, 1)
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate()
  target.setDate(Math.min(day, lastDay))
  return toIso(target)
}

/** Un rango ISO contiene una fecha ISO. Comparación de strings, no de Date. */
function inRange(iso: string, range?: DateRange): boolean {
  if (!range) return true
  return iso >= range.from && iso <= range.to
}

// =====================================================================
// El gasto real
// =====================================================================

/**
 * Un egreso que ya ocurrió, listo para reportar. Sale siempre de un
 * `MoneyMovement`: el gasto real no tiene tabla propia, justamente para que
 * el saldo de una cuenta tenga una sola fuente de egresos.
 */
export interface ExpenseEntry {
  movementId: string
  date: string
  concept: string
  /** Null = todavía sin clasificar. Se muestra, no se adivina. */
  kind: ExpenseKind | null
  amount: number
  /** La de la cuenta de origen, siempre. Nunca la del plan. */
  currency: Currency
  accountId: string
  projectId: string | null
  fixedExpenseId: string | null
  periodStart: string | null
}

interface ExpenseInput {
  movements: MoneyMovement[]
  accounts: Account[]
}

/** Índice de cuentas por id, para resolver moneda y tipo en O(1). */
function accountIndex(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]))
}

/**
 * El único lugar del sistema donde un movimiento se convierte en gasto.
 *
 * Filtra, en este orden y por estos motivos:
 *
 *   category === 'Gasto'       Un 'Retiro' nunca entra: la plata que se
 *                              reparten los socios no es un costo de la
 *                              empresa, y contarla acá la duplica.
 *   fromAccountId resuelto     Sin cuenta de origen el monto no tiene
 *                              moneda, y un monto sin moneda no se puede
 *                              totalizar sin mentir.
 *   toAccountId === null       Si entró a otra cuenta propia, la plata no
 *                              salió: se movió. Contarla infla el mes.
 *   account.kind !== 'Retiros' Ver `withdrawalsMislabeled()`: es el mismo
 *                              caso del primer filtro, pero mal cargado.
 *
 * La base impone los tres primeros con checks (10_gastos.sql), así que en
 * teoría no hacen falta. Están igual porque los movimientos también se
 * cargan por SQL a mano y porque el store puede tener datos viejos en
 * memoria mientras la migración no está corrida.
 *
 * Orden de salida: del más reciente al más viejo, como el ledger de Caja.
 */
export function expenseEntries(
  { movements, accounts }: ExpenseInput,
  range?: DateRange,
): ExpenseEntry[] {
  const byId = accountIndex(accounts)
  const out: ExpenseEntry[] = []

  for (const m of movements) {
    if (m.category !== 'Gasto') continue
    if (!m.fromAccountId) continue
    if (m.toAccountId) continue
    const account = byId.get(m.fromAccountId)
    if (!account) continue
    if (account.kind === 'Retiros') continue
    if (!inRange(m.movedOn, range)) continue

    out.push({
      movementId: m.id,
      date: m.movedOn,
      concept: m.concept,
      kind: m.expenseKind,
      amount: m.amountOut,
      currency: account.currency,
      accountId: account.id,
      projectId: m.projectId,
      fixedExpenseId: m.fixedExpenseId,
      periodStart: m.periodStart,
    })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Los 'Gasto' pagados desde una cuenta de Retiros, que `expenseEntries()`
 * deja afuera.
 *
 * No es un caso teórico y ahora menos: los socios cobran por retiro y el
 * empleado por sueldo, así que alguien va a cargar tarde o temprano un
 * retiro de socio como rubro 'Sueldos'. Esa plata ya está contada como
 * repartida; sumarla otra vez como gasto de la empresa la cuenta dos veces
 * y hunde el resultado del mes. La pantalla los lista en el cartel ámbar
 * para que se recategoricen a 'Retiro'.
 */
export function withdrawalsMislabeled({
  movements,
  accounts,
}: ExpenseInput): MoneyMovement[] {
  const byId = accountIndex(accounts)
  return movements
    .filter((m) => {
      if (m.category !== 'Gasto') return false
      if (!m.fromAccountId) return false
      if (m.toAccountId) return false
      return byId.get(m.fromAccountId)?.kind === 'Retiros'
    })
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn))
}

/** Lo que salió, por moneda. */
export function spentByCurrency(entries: ExpenseEntry[]): MoneyByCurrency {
  return sumByCurrency(entries)
}

export interface SpendByKind {
  kind: ExpenseKind | null
  total: MoneyByCurrency
  count: number
}

/**
 * Abierto por rubro. Los sin clasificar van con `kind === null` y se
 * muestran: esconderlos haría que el desglose no cierre contra el total y
 * nadie los cargaría nunca.
 *
 * Orden: de mayor a menor DENTRO de la moneda con más movimientos en el
 * período, que es la misma que la pantalla usa para la barra proporcional.
 * Un rubro que no tiene nada en esa moneda va después, ordenado por su
 * bucket más grande. Ese último criterio compara números de monedas
 * distintas y por eso sirve sólo para dar un orden estable en pantalla:
 * acá no se suma nada entre monedas, y ningún total sale de esta
 * comparación.
 */
export function spentByKind(entries: ExpenseEntry[]): SpendByKind[] {
  const rows = new Map<string, SpendByKind>()
  const perCurrency = new Map<Currency, number>()

  for (const entry of entries) {
    const key = entry.kind ?? ''
    const row = rows.get(key) ?? { kind: entry.kind, total: {}, count: 0 }
    addMoney(row.total, entry.amount, entry.currency)
    row.count += 1
    rows.set(key, row)
    perCurrency.set(entry.currency, (perCurrency.get(entry.currency) ?? 0) + 1)
  }

  let leading: Currency | null = null
  for (const [currency, count] of perCurrency) {
    if (leading === null || count > (perCurrency.get(leading) ?? 0)) {
      leading = currency
    }
  }

  const biggest = (total: MoneyByCurrency): number =>
    Math.max(0, ...Object.values(total).map((n) => n ?? 0))

  return [...rows.values()].sort((a, b) => {
    const aLead = leading ? (a.total[leading] ?? null) : null
    const bLead = leading ? (b.total[leading] ?? null) : null
    if (aLead !== null && bLead !== null) return bLead - aLead
    if (aLead !== null) return -1
    if (bLead !== null) return 1
    return biggest(b.total) - biggest(a.total)
  })
}

/**
 * Lo pagado sin proyecto imputado: el costo de tener la empresa abierta.
 * No se prorratea sobre los proyectos — para eso harían falta horas
 * cargadas, y acá nadie carga horas.
 */
export function structureSpend(entries: ExpenseEntry[]): MoneyByCurrency {
  return sumByCurrency(entries.filter((e) => e.projectId === null))
}

// =====================================================================
// El compromiso
// =====================================================================

/**
 * Un gasto fijo normalizado a valor mensual, CON su moneda: un dominio de
 * USD 120 al año aporta USD 10 por mes.
 *
 * Ojo con qué significa este número: es compromiso normalizado, no caja.
 * Esos USD 120 caen todos juntos en un mes del año, así que comparar esto
 * contra el gasto real del mes dice «faltan pagos» once meses de cada doce.
 */
export function monthlyValue(e: FixedExpense): {
  amount: number
  currency: Currency
} {
  return {
    amount: e.amount / frequencyMonths[e.frequency],
    currency: e.currency,
  }
}

/**
 * Vigencia por rango y no por null-check: un plan que arranca el mes que
 * viene todavía no cuesta nada, y uno con fin en diciembre sigue costando
 * hasta diciembre. No hay campo `status`: dar de baja es poner `endedOn`.
 */
export function isActiveOn(e: FixedExpense, iso: string): boolean {
  if (e.startedOn > iso) return false
  return e.endedOn === null || e.endedOn >= iso
}

export interface CommittedFilter {
  /**
   * `null` = sólo estructura, un id = sólo ese proyecto, ausente = todos.
   * `undefined` y `null` NO son lo mismo acá: uno no filtra y el otro sí.
   */
  projectId?: string | null
  /** Atajo legible de `projectId: null`. */
  structureOnly?: boolean
  /** Un solo rubro, para la pantalla de Infraestructura. */
  kind?: ExpenseKind
}

/**
 * Lo comprometido por mes, por moneda, contando sólo los planes vigentes al
 * día `on` (por defecto hoy).
 */
export function committedMonthly(
  expenses: FixedExpense[],
  filter: CommittedFilter = {},
  on: string = todayIso(),
): MoneyByCurrency {
  const wanted = expenses.filter((e) => {
    if (!isActiveOn(e, on)) return false
    if (filter.kind !== undefined && e.kind !== filter.kind) return false
    if (filter.structureOnly) return e.projectId === null
    if (filter.projectId !== undefined) return e.projectId === filter.projectId
    return true
  })
  return sumByCurrency(wanted.map(monthlyValue))
}

// =====================================================================
// El calendario
// =====================================================================

export type PeriodState = 'pagado' | 'vencido' | 'pendiente'

export interface ExpensePeriod {
  /** Primer día del período. Es la clave con la que un pago lo declara. */
  periodStart: string
  /** El `dueDay` del mes de `periodStart`, topado en 28. */
  dueDate: string
  state: PeriodState
  /** Días de atraso. Sólo en 'vencido'; en el resto, null. */
  daysLate: number | null
  /** Lo que realmente salió por este período, por moneda. */
  paid: MoneyByCurrency
  /** Cuándo se terminó de pagar. Null si todavía no se pagó. */
  paidOn: string | null
}

/**
 * Tope duro de períodos a enumerar. Un plan mensual con `startedOn` en 1990
 * daría más de 400, y ahí el problema es el dato, no el bucle.
 */
const MAX_PERIODS = 400

/**
 * Todos los períodos de un gasto fijo, del más viejo al más nuevo.
 *
 * Cómo se arma, que es lo único importante de este archivo:
 *
 * 1. El período k arranca en `addMonths(startedOn, k * frequencyMonths)`.
 *    Su vencimiento es el `dueDay` de ESE mes, topado en 28 para que exista
 *    en febrero.
 * 2. Se enumeran todos desde k = 0 hasta hoy, más el primero que todavía no
 *    llegó. Los pasados SE QUEDAN en la lista: ahí está la mora.
 * 3. Un período está pago si existe un movimiento que lo declara
 *    (`fixedExpenseId` + `periodStart`). El pago DICE qué salda; no se
 *    infiere de la fecha en que salió la plata.
 * 4. pagado = hay movimiento · vencido = venció y no hay movimiento ·
 *    pendiente = el resto.
 *
 * Consecuencias buscadas, y es acá donde NO se repite el bug de
 * `nextMaintenanceCharge()` (que ancla en el último cobro y por eso jamás
 * devuelve una fecha pasada): pagar el hosting de septiembre el 12 de
 * octubre no mueve el vencimiento de octubre y deja septiembre en verde;
 * pagar adelantado no abre un hueco; y un mes que nunca se pagó queda
 * vencido para siempre, hasta que alguien lo pague.
 *
 * Un plan dado de baja (`endedOn`) deja de generar períodos después de esa
 * fecha, pero los anteriores quedan intactos con su estado: dar de baja no
 * perdona lo que quedó debiendo.
 *
 * La comparación con hoy va por día calendario en hora local (`daysUntil`),
 * nunca contra un `Date` con hora: un vencimiento de hoy es pendiente, no
 * vencido.
 */
export function expensePeriods(
  e: FixedExpense,
  entries: ExpenseEntry[],
  today: Date = new Date(),
): ExpensePeriod[] {
  if (!e.startedOn || e.startedOn.length < 10) return []
  const step = frequencyMonths[e.frequency] ?? 1
  const day = Math.max(1, Math.min(Math.trunc(e.dueDay) || 1, 28))

  // Los pagos de ESTE plan, agrupados por el período que declaran saldar.
  const paidByPeriod = new Map<string, ExpenseEntry[]>()
  for (const entry of entries) {
    if (entry.fixedExpenseId !== e.id || !entry.periodStart) continue
    const list = paidByPeriod.get(entry.periodStart)
    if (list) list.push(entry)
    else paidByPeriod.set(entry.periodStart, [entry])
  }

  const periods: ExpensePeriod[] = []
  for (let k = 0; k < MAX_PERIODS; k++) {
    const periodStart = addMonths(e.startedOn, k * step)
    // Un plan dado de baja no sigue generando vencimientos para siempre.
    if (e.endedOn && periodStart > e.endedOn) break

    const dueDate = `${periodStart.slice(0, 7)}-${String(day).padStart(2, '0')}`
    const paidEntries = paidByPeriod.get(periodStart) ?? []
    const paid = sumByCurrency(paidEntries)
    // Con más de un pago (la base lo impide por índice único, pero un
    // import a mano no) vale el último: es cuando el período quedó saldado.
    const paidOn =
      paidEntries.length > 0
        ? paidEntries.reduce((max, p) => (p.date > max ? p.date : max), paidEntries[0].date)
        : null

    const daysToDue = daysUntil(dueDate, today) ?? 0
    const overdue = paidEntries.length === 0 && daysToDue < 0

    periods.push({
      periodStart,
      dueDate,
      state: paidEntries.length > 0 ? 'pagado' : overdue ? 'vencido' : 'pendiente',
      daysLate: overdue ? -daysToDue : null,
      paid,
      paidOn,
    })

    // El primero que todavía no arrancó cierra la lista: se enumera hasta
    // hoy MÁS un período, para que el diálogo de pago permita adelantar uno
    // y la pantalla muestre el próximo vencimiento.
    if ((daysUntil(periodStart, today) ?? 0) > 0) break
  }

  return periods
}

export interface FixedExpenseStatus {
  expense: FixedExpense
  /**
   * Todos los períodos enumerados, del más viejo al más nuevo. Está acá
   * porque `pendingThisMonth()` recibe el board y no los planes: sin la
   * lista completa no podría ver el período que vence más adelante en este
   * mismo mes cuando el plan además arrastra mora.
   */
  periods: ExpensePeriod[]
  /** Los impagos ya vencidos, el más viejo primero. */
  overdue: ExpensePeriod[]
  /** El vencido más viejo si hay; si no, el próximo a vencer. */
  next: ExpensePeriod | null
  lastPaid: { date: string; total: MoneyByCurrency } | null
  /** El compromiso normalizado a mes, aunque el plan ya no esté vigente. */
  monthly: MoneyByCurrency
}

/**
 * Un renglón por gasto fijo con su estado completo. Los que tienen mora van
 * arriba, y dentro de cada grupo manda la fecha de vencimiento: lo más
 * viejo primero, que es el orden en el que hay que pagar.
 */
export function fixedExpenseBoard(
  expenses: FixedExpense[],
  entries: ExpenseEntry[],
  today: Date = new Date(),
): FixedExpenseStatus[] {
  const board = expenses.map((expense): FixedExpenseStatus => {
    const periods = expensePeriods(expense, entries, today)
    const overdue = periods.filter((p) => p.state === 'vencido')
    const next = overdue[0] ?? periods.find((p) => p.state === 'pendiente') ?? null

    const paid = periods.filter((p) => p.paidOn !== null)
    const last = paid.reduce<ExpensePeriod | null>(
      (best, p) => (best === null || (p.paidOn as string) > (best.paidOn as string) ? p : best),
      null,
    )

    const { amount, currency } = monthlyValue(expense)

    return {
      expense,
      periods,
      overdue,
      next,
      lastPaid: last ? { date: last.paidOn as string, total: last.paid } : null,
      monthly: { [currency]: amount },
    }
  })

  const far = '9999-12-31'
  return board.sort((a, b) => {
    const byMora = (a.overdue.length > 0 ? 0 : 1) - (b.overdue.length > 0 ? 0 : 1)
    if (byMora !== 0) return byMora
    const byDue = (a.next?.dueDate ?? far).localeCompare(b.next?.dueDate ?? far)
    if (byDue !== 0) return byDue
    return a.expense.concept.localeCompare(b.expense.concept, 'es')
  })
}

/**
 * Períodos que vencen en el mes en curso y TODAVÍA no tienen pago, valuados
 * a lo comprometido por el plan.
 *
 * Es «lo que falta pagar», no «lo que hay que pagar en el mes»: por eso no
 * se pisa con el StatCard de gasto del mes, que ya incluye los fijos que sí
 * se pagaron. Los dos se pueden sumar sin contar nada dos veces.
 *
 * `count` cuenta períodos, no planes: un plan mensual con dos vencimientos
 * caídos en el mismo mes aporta dos.
 */
export function pendingThisMonth(
  board: FixedExpenseStatus[],
  today: Date = new Date(),
): { total: MoneyByCurrency; count: number } {
  const month = monthRange(todayIso(today))
  const total: MoneyByCurrency = {}
  let count = 0

  for (const status of board) {
    for (const period of status.periods) {
      if (period.state === 'pagado') continue
      if (!inRange(period.dueDate, month)) continue
      addMoney(total, status.expense.amount, status.expense.currency)
      count += 1
    }
  }

  return { total, count }
}

/**
 * Los períodos que todavía se pueden pagar, para el select del diálogo de
 * pago. Van del más viejo al más nuevo, así el vencido más viejo queda
 * primero y es el que se preselecciona: si hay mora, lo que corresponde
 * saldar es lo más atrasado y no lo de este mes.
 *
 * Los ya pagos no están en la lista, y el índice único de la base los
 * rechaza igual si alguien fuerza el payload: son las dos mitades de la
 * misma defensa contra el doble conteo.
 */
export function payablePeriods(
  e: FixedExpense,
  entries: ExpenseEntry[],
  today: Date = new Date(),
): ExpensePeriod[] {
  return expensePeriods(e, entries, today).filter((p) => p.state !== 'pagado')
}

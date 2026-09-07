// Domain model for Digital Amenities control center.
// Shapes mirror the intended Supabase tables so the mock store can be
// swapped for real queries with minimal changes.

export type ProjectType = 'propio' | 'terceros'

export const PROJECT_STATUSES = [
  'Idea',
  'Presupuestado',
  'En negociación',
  'En desarrollo',
  'En pruebas',
  'Esperando al cliente',
  'Pausado',
  'Bloqueado',
  'Implementado',
  'En mantenimiento',
  'Finalizado',
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PRIORITIES = ['Baja', 'Media', 'Alta', 'Crítica'] as const

export type Priority = (typeof PRIORITIES)[number]

export const NOTE_CATEGORIES = [
  'Idea',
  'Proyecto potencial',
  'Recordatorio',
  'Reunión',
  'Pendiente',
  'Mejora',
] as const

export type NoteCategory = (typeof NOTE_CATEGORIES)[number]

export type Currency = 'USD' | 'ARS' | 'EUR'

export type PaymentMethod =
  | 'Transferencia'
  | 'Efectivo'
  | 'Tarjeta'
  | 'Mercado Pago'
  | 'Crypto'
  | 'PayPal'

export type MaintenanceStatus = 'Activo' | 'Pausado' | 'Cancelado'

export const MAINTENANCE_FREQUENCIES = [
  'Mensual',
  'Trimestral',
  'Semestral',
  'Anual',
] as const

export type MaintenanceFrequency = (typeof MAINTENANCE_FREQUENCIES)[number]

export interface Client {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  notes: string
}

/** Money that already came in. There is no scheduled/overdue notion. */
export interface Payment {
  id: string
  projectId: string
  concept: string
  amount: number
  currency: Currency
  paidDate: string // ISO
  method: PaymentMethod | null
  receipt: string | null
  notes: string
  /** Which account the money landed in. Null = not assigned yet. */
  accountId: string | null
}

export const TASK_KINDS = ['interno', 'cliente', 'bloqueador'] as const

export type TaskKind = (typeof TASK_KINDS)[number]

export interface Task {
  id: string
  projectId: string
  kind: TaskKind
  title: string
  done: boolean
  doneAt: string | null
  createdAt: string
}

export interface Development {
  stage: string
  progress: number
  nextGoal: string
  lastUpdate: string | null // ISO
}

export interface InfraCost {
  id: string
  concept: string
  amount: number
  currency: Currency
  frequency: MaintenanceFrequency
}

export interface Infrastructure {
  productionUrl: string
  stagingUrl: string
  repo: string
  deployPlatform: string
  hosting: string
  domain: string
  domainExpiry: string | null // ISO
  database: string
  externalServices: string[]
  automations: string[]
  techLead: string
  costs: InfraCost[]
}

export interface Maintenance {
  active: boolean
  implementationDate: string | null // ISO
  startDate: string | null // ISO
  amount: number
  currency: Currency
  frequency: MaintenanceFrequency
  dueDay: number // day of month
  services: string[]
  status: MaintenanceStatus
  lastCollectedDate: string | null // ISO
}

/** One recurring maintenance fee actually collected. */
export interface MaintenanceCharge {
  id: string
  projectId: string
  chargedOn: string // ISO
  amount: number
  currency: Currency
  method: PaymentMethod | null
  receipt: string | null
  notes: string
  /** Which account the money landed in. Null = not assigned yet. */
  accountId: string | null
}

export const ACCOUNT_KINDS = [
  'Caja',
  'Banco',
  'Billetera',
  'Inversión',
  'Retiros',
] as const

export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/** Somewhere money can sit. Balances are derived, never stored. */
export interface Account {
  id: string
  name: string
  kind: AccountKind
  currency: Currency
  notes: string
  archived: boolean
  sortOrder: number
}

export const MOVEMENT_CATEGORIES = [
  'Cambio de moneda',
  'Transferencia',
  'Gasto',
  'Retiro',
  'Inversión',
  'Ingreso extra',
  'Ajuste',
] as const

export type MovementCategory = (typeof MOVEMENT_CATEGORIES)[number]

/**
 * En qué se gastó. Enum y no texto libre porque en seis meses habría 'AWS',
 * 'aws' y 'Amazon' y la pregunta «¿en qué gastamos?» dejaría de tener
 * respuesta. La lista arranca generosa a propósito: agregar un valor después
 * es un script SQL nuevo (y `alter type ... add value` ni siquiera deja usar
 * el valor recién agregado en ese mismo script).
 *
 * Dos aclaraciones que no son cosméticas:
 *
 * - `Sueldos` es el sueldo del EMPLEADO, que es gasto fijo de estructura. Lo
 *   que cobran los socios no va acá: es un movimiento categoría 'Retiro' a
 *   una cuenta `kind === 'Retiros'` y nunca entra al resultado. Cargar un
 *   retiro de socio como Sueldos cuenta esa plata dos veces.
 * - `Comisiones por venta` es lo que se le paga al empleado por cerrar un
 *   proyecto: costo DIRECTO, se carga como gasto suelto con `projectId`.
 *   `Comisiones bancarias` son las del banco, que son de estructura. Van
 *   separadas porque una se le imputa a un proyecto y la otra no.
 */
export const EXPENSE_KINDS = [
  'Infraestructura',
  'Herramientas',
  'Sueldos',
  'Honorarios',
  'Impuestos',
  'Servicios',
  'Comisiones bancarias',
  'Comisiones por venta',
  'Marketing',
  'Equipamiento',
  'Otros',
] as const

export type ExpenseKind = (typeof EXPENSE_KINDS)[number]

/**
 * Un gasto comprometido: el servidor, el sueldo del empleado, el contador.
 * Es un PLAN, no es plata que salió — lo que se pagó de verdad vive siempre
 * en `MoneyMovement`, y el estado de cada período se deriva cruzando los dos.
 *
 * `projectId` null = gasto de estructura, no imputable a ningún proyecto.
 *
 * No hay campo `status`: la vigencia se lee del rango
 * (`startedOn <= hoy && (endedOn === null || endedOn >= hoy)`). Un `status`
 * al lado de un `endedOn` son dos formas de decir lo mismo y una de las dos
 * siempre termina mintiendo. Dar de baja es poner `endedOn`, y los pagos
 * anteriores quedan intactos.
 *
 * Tampoco hay cuenta sugerida: un plan en USD con cuenta por defecto en pesos
 * es la forma más corta de cargar 20 pesos donde iban 20 dólares. La cuenta
 * se elige en cada pago.
 */
export interface FixedExpense {
  id: string
  concept: string
  kind: ExpenseKind
  vendor: string
  projectId: string | null
  /** Lo ESPERADO por período, en `currency`. Nunca lo pagado. */
  amount: number
  currency: Currency
  frequency: MaintenanceFrequency
  /** Día del mes en que vence cada período. Tope 28: existe en todo mes. */
  dueDay: number
  /**
   * Arranque del primer período. Todo el calendario sale de acá y de la
   * frecuencia, nunca del último pago: pagar tarde no corre el vencimiento,
   * y un período impago se queda vencido hasta que alguien lo pague.
   */
  startedOn: string // ISO
  endedOn: string | null // ISO
  notes: string
}

/**
 * Money moving. Each amount is in its own account's currency, so a
 * currency exchange is just a movement between accounts of different
 * currencies — the rate is implied by the two amounts.
 *
 * No origin = money came in from outside. No destination = it left.
 *
 * Los tres campos de gasto son null salvo en un movimiento
 * `category === 'Gasto'` — lo impone la base, así que un 'Retiro' no puede
 * llevar rubro y no se puede colar en el desglose. `fixedExpenseId` y
 * `periodStart` van juntos o no van: un pago imputado a un plan siempre dice
 * qué período salda, y no puede haber dos movimientos para el mismo par.
 */
export interface MoneyMovement {
  id: string
  movedOn: string // ISO
  category: MovementCategory
  concept: string
  fromAccountId: string | null
  amountOut: number
  toAccountId: string | null
  amountIn: number
  projectId: string | null
  notes: string
  /** En qué se gastó. Null = todavía sin clasificar; se muestra, no se adivina. */
  expenseKind: ExpenseKind | null
  /** Qué gasto fijo salda este egreso. Null = gasto excepcional. */
  fixedExpenseId: string | null
  /**
   * Qué período de ese gasto fijo salda, por su primer día. El pago DECLARA
   * qué cubre; no se infiere de la fecha en que salió la plata.
   */
  periodStart: string | null
}

export interface ActivityEntry {
  id: string
  projectId: string | null
  type:
    | 'estado'
    | 'pago'
    | 'mantenimiento'
    | 'nota'
    | 'proyecto'
    | 'edición'
  message: string
  date: string // ISO
}

export interface Project {
  id: string
  name: string
  description: string
  type: ProjectType
  clientId: string | null
  ownerName: string
  contactPerson: string
  internalLead: string
  status: ProjectStatus
  priority: Priority
  startDate: string | null
  estimatedDelivery: string | null
  implementationDate: string | null
  quotedAmount: number
  currency: Currency
  createdAt: string
  updatedAt: string
  development: Development
  infrastructure: Infrastructure
  maintenance: Maintenance
}

export interface Note {
  id: string
  title: string
  content: string
  author: string
  priority: Priority
  tags: string[]
  category: NoteCategory
  createdAt: string
  reminderDate: string | null
  convertedToProjectId: string | null
  /** Optional: notes can hang off a project (a meeting, an idea for it). */
  projectId: string | null
}

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
  /**
   * Opcional desde el paso 17: un cobro puede saldar una factura de servicio
   * que no corresponde a ningún proyecto (hosting, soporte).
   */
  projectId: string | null
  concept: string
  /** Lo que entró de verdad, en `currency`. Es lo que suma al saldo de su cuenta. */
  amount: number
  currency: Currency
  /**
   * Cuánto de lo COTIZADO salda, en la moneda del PROYECTO.
   *
   * Null = salda su propio importe, que es el caso normal de un cobro en la
   * misma moneda que el proyecto.
   *
   * Existe para el caso real y más frecuente de la empresa: se cotiza en
   * dólares y el cliente paga en pesos al cambio del día. Sin esto había que
   * elegir entre perder cuántos pesos entraron —y dejar mal el saldo de la
   * cuenta— o que la deuda del proyecto no bajara, en silencio.
   *
   * Son DOS MONTOS y no una cotización guardada, que es la misma decisión que
   * ya tomó `MoneyMovement` para un cambio de moneda: la cotización de esa
   * operación es la división de los dos, y queda como dato real de lo que
   * pasó ese día en vez de un número estimado.
   */
  appliedAmount: number | null
  paidDate: string // ISO
  method: PaymentMethod | null
  receipt: string | null
  notes: string
  /** Which account the money landed in. Null = not assigned yet. */
  accountId: string | null
  /**
   * Qué factura salda este cobro. Null = cobro sin imputar — un anticipo
   * antes de facturar, por ejemplo.
   *
   * Un cobro salda UNA factura; una factura recibe varios cobros, y de ahí
   * sale el estado Parcial.
   */
  facturaId: string | null
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
  /**
   * DERIVADO de `status`, no se escribe.
   *
   * En la base es una columna generada (`generated always as (status =
   * 'Activo')`), así que Postgres rechaza cualquier intento de escribirla y
   * no puede volver a discrepar. Antes eran dos columnas independientes y la
   * lógica exigía las dos: una fila con `active` en true y `status` en
   * 'Pausado' desaparecía en silencio de la mora, del próximo cobro, de las
   * alertas y del push. Ver `supabase/13_mantenimiento_un_solo_estado.sql`.
   *
   * Sigue existiendo porque lo leen cinco scripts SQL, entre ellos la
   * función del cron diario. Para código nuevo, preguntá por `status`.
   */
  active: boolean
  implementationDate: string | null // ISO
  startDate: string | null // ISO
  amount: number
  currency: Currency
  frequency: MaintenanceFrequency
  /**
   * Primer día de la ventana de cobro: desde acá se puede cobrar el período.
   * Tope 28, para que exista en todos los meses.
   */
  dueDay: number // day of month
  /**
   * Último día de la ventana. Null = ventana de un solo día.
   *
   * Existe porque así se cobra de verdad: el cliente paga «entre el 1 y el
   * 10». Con un solo día, un plan con `dueDay` 1 quedaba VENCIDO el día 2, y
   * eso significaba mostrar mora inexistente nueve días de cada mes y mandar
   * un push de «mantenimiento sin cobrar» todos los meses. Un aviso que
   * grita cuando no pasa nada se empieza a ignorar, y el mes que de verdad
   * no pagaron no lo mira nadie.
   */
  dueDayTo: number | null
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
    | 'ticket'
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

// ---------------------------------------------------------------------
// Tickets: reclamos y pedidos de clientes
// ---------------------------------------------------------------------

/**
 * En qué se gastó... no: de qué se trata el ticket. Enum y no texto libre
 * por el mismo motivo que `ExpenseKind`: en seis meses habría 'reclamo',
 * 'Reclamo' y 'queja' y la pregunta «¿qué nos piden más?» dejaría de tener
 * respuesta. Arranca generosa a propósito — agregar un valor después es un
 * script SQL nuevo.
 */
export const TICKET_KINDS = [
  'Reclamo',
  'Pedido',
  'Consulta',
  'Incidencia',
  'Mejora',
  'Otro',
] as const

export type TicketKind = (typeof TICKET_KINDS)[number]

/**
 * La urgencia, en tres grados. Es un número y no un enum de Postgres a
 * propósito: el grado es ORDINAL, y con un número `grade >= 2` significa
 * lo mismo del lado de TypeScript y del lado de SQL, sin depender del
 * orden en que se declararon los valores del tipo.
 *
 * No reusa `Priority` (Baja/Media/Alta/Crítica) porque son dos escalas
 * distintas: la de proyectos tiene cuatro peldaños y la de tickets tres.
 * Mapearlas una contra otra obligaría a decidir si 'Alta' es grado 2 o 3,
 * y esa decisión estaría escrita en un solo lado del código.
 */
export const TICKET_GRADES = [1, 2, 3] as const

export type TicketGrade = (typeof TICKET_GRADES)[number]

export const TICKET_GRADE_LABELS: Record<TicketGrade, string> = {
  1: 'Grado 1 · Baja',
  2: 'Grado 2 · Media',
  3: 'Grado 3 · Urgente',
}

/** Sólo para el detalle de una tarjeta: el label ya dice el número. */
export const TICKET_GRADE_HINTS: Record<TicketGrade, string> = {
  1: 'Sin apuro',
  2: 'Para esta semana',
  3: 'Hay que verlo ya',
}

export const TICKET_STATUSES = ['Abierto', 'Resuelto'] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

/**
 * Un reclamo, pedido o consulta de un cliente, siempre contra un proyecto
 * (el cliente sale del proyecto: `project.clientId`).
 *
 * **No hay columna `status`.** El estado se lee de `resolvedAt`:
 * null = abierto, con fecha = resuelto. Es la misma decisión que en
 * `FixedExpense` y por el mismo motivo: un `status` al lado de un
 * `resolvedAt` son dos formas de decir lo mismo y una de las dos siempre
 * termina mintiendo — un ticket marcado 'Resuelto' sin fecha, o con fecha
 * y todavía 'Abierto'. Resolver es poner la fecha; reabrir es sacarla.
 * `ticketStatus()` en `lib/derive.ts` hace la lectura.
 */
export interface Ticket {
  id: string
  projectId: string
  kind: TicketKind
  grade: TicketGrade
  title: string
  detail: string
  createdAt: string // ISO
  /** Null = abierto. Con fecha = resuelto. Es el único estado que se guarda. */
  resolvedAt: string | null // ISO
  /** Qué se hizo para resolverlo. Vacío mientras está abierto. */
  resolution: string
}

// ---------------------------------------------------------------------
// Seguimientos: los acercamientos comerciales antes de que haya proyecto
// ---------------------------------------------------------------------

export const SEGUIMIENTO_KINDS = [
  'Reunión',
  'Llamada',
  'Mail',
  'WhatsApp',
  'Visita',
  'Otro',
] as const

export type SeguimientoKind = (typeof SEGUIMIENTO_KINDS)[number]

/**
 * Cómo quedó la cosa DESPUÉS de este contacto. No es un atributo del
 * prospecto sino de cada contacto, y el estado del prospecto se lee del
 * contacto más reciente (`seguimientoPorProspecto()` en `lib/derive.ts`).
 *
 * Guardarlo también a nivel prospecto sería una segunda fuente para el mismo
 * dato: alcanzaría con cargar una reunión y olvidarse de tocar el estado de
 * arriba para que la pantalla dijera «esperamos respuesta» sobre algo que se
 * cerró la semana pasada.
 *
 * Los dos primeros son la pregunta que importa todos los días: de quién es
 * la pelota. Es la distinción que pidió el usuario y la que decide si algo
 * alerta o no — si están esperando ellos, no hay nada que hacer más que
 * esperar, y una alerta ahí sería ruido.
 */
export const SEGUIMIENTO_ESTADOS = [
  'Pelota nuestra',
  'Pelota de ellos',
  'Ganado',
  'Perdido',
] as const

export type SeguimientoEstado = (typeof SEGUIMIENTO_ESTADOS)[number]

/** Los dos estados en los que la negociación sigue viva. */
export const SEGUIMIENTO_ABIERTOS: SeguimientoEstado[] = [
  'Pelota nuestra',
  'Pelota de ellos',
]

/**
 * Un contacto con un prospecto: la reunión, la llamada, el mail.
 *
 * `prospecto` es texto libre y no un `clientId` — decisión tomada a
 * conciencia: anotar una reunión con alguien de quien todavía no se sabe
 * nada no debería exigir crearle una ficha antes. El costo es que la misma
 * empresa se puede escribir de tres formas, y por eso el agrupado NO usa
 * este campo crudo sino `prospectoKey`, que la base deriva normalizando.
 */
export interface Seguimiento {
  id: string
  prospecto: string
  /**
   * `prospecto` normalizado (minúsculas, sin espacios de más). Lo genera la
   * base, así que vale igual para lo que se carga por la app y para lo que
   * alguien inserte por SQL. Es la clave con la que se agrupa; nunca se
   * muestra. NO saca acentos: eso necesitaría la extensión `unaccent`, que
   * no está instalada — «Mediterráneo» y «Mediterraneo» todavía se separan.
   */
  prospectoKey: string
  contactedOn: string // ISO date
  kind: SeguimientoKind
  /** Quiénes estuvieron, de los dos lados. Texto libre. */
  attendees: string
  /** Qué se habló y cómo fue. */
  summary: string
  estado: SeguimientoEstado
  /** Cuándo hay que retomar. Null = no quedó fecha. */
  nextContactOn: string | null // ISO date
  createdAt: string
}

// ---------------------------------------------------------------------
// Facturas de cliente
// ---------------------------------------------------------------------

export const FACTURA_ESTADOS = ['Pendiente', 'Parcial', 'Cancelada'] as const

export type FacturaEstado = (typeof FACTURA_ESTADOS)[number]

/**
 * Lo que se le facturó a un cliente por un proyecto.
 *
 * Es un REGISTRO INTERNO, no un comprobante de AFIP: sin tipo A/B/C, sin
 * punto de venta, sin IVA discriminado y sin retenciones. Decisión tomada; el
 * día que haya que espejar lo que se emite de verdad, esos campos se agregan.
 *
 * **No tiene estado.** Pendiente / Parcial / Cancelada salen de comparar
 * `importe` con lo que se le imputó de cobros (`lib/facturas.ts`). Es la
 * regla de siempre acá —lo derivado no se guarda— y además hace que «que el
 * cobro mueva el estado» no exista como trabajo: no hay nada que mover, y no
 * llega el día en que una columna diga una cosa y los cobros otra.
 *
 * **No tiene moneda propia**: está en la del proyecto. Una moneda propia
 * abriría una tercera conversión —cotizado, facturado y cobrado en tres
 * monedas— y este sistema no tiene cotización cargada para resolverla. Con la
 * del proyecto, el `appliedAmount` de un cobro salda la factura sin ninguna
 * cuenta extra: es el mismo número que ya salda lo cotizado.
 */
export interface Factura {
  id: string
  /** A quién se le factura. Obligatorio: una factura siempre tiene destinatario. */
  clienteId: string
  /**
   * Opcional. Con proyecto, la factura suma a los números de ese proyecto
   * —facturado, sin facturar—. Sin proyecto es un servicio suelto: hosting,
   * soporte, lo que no es un desarrollo con presupuesto.
   */
  projectId: string | null
  numero: string
  /** Qué se factura: «Servicio de hosting». Es lo que se lee en la lista. */
  concepto: string
  emitidaOn: string // ISO date
  /** Null = sin plazo pactado. */
  venceOn: string | null
  importe: number
  /**
   * Propia, porque sin proyecto no hay de dónde heredarla. Con proyecto, la
   * base exige que sea la del proyecto: si no, «facturado» y «cotizado» del
   * mismo proyecto quedarían en monedas distintas y restarlos —que es lo que
   * hace «sin facturar»— sería justo lo que esta app no hace en ningún lado.
   */
  moneda: Currency
  notas: string
  createdAt: string
}

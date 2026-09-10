// Translation layer between Supabase rows (snake_case, flat-ish) and the
// domain types the UI works with (camelCase, nested).

import type {
  Account,
  ActivityEntry,
  Client,
  Development,
  FixedExpense,
  InfraCost,
  Infrastructure,
  Maintenance,
  MaintenanceCharge,
  MoneyMovement,
  Note,
  Payment,
  Factura,
  Project,
  Seguimiento,
  Task,
  Ticket,
  TicketGrade,
} from './types'

/** Untyped Supabase row; the mappers below are the typed boundary. */
type Row = Record<string, any>

/** PostgREST returns embedded to-one relations as an object or a 1-item array. */
function one(value: unknown): Row | undefined {
  if (Array.isArray(value)) return value[0]
  return (value as Row) ?? undefined
}

const num = (v: unknown, fallback = 0) =>
  v === null || v === undefined ? fallback : Number(v)

const str = (v: unknown, fallback = '') =>
  v === null || v === undefined ? fallback : String(v)

export function mapClient(r: Row): Client {
  return {
    id: r.id,
    name: str(r.name),
    contactPerson: str(r.contact_person),
    phone: str(r.phone),
    email: str(r.email),
    notes: str(r.notes),
  }
}

export function mapTask(r: Row): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    title: str(r.title),
    done: Boolean(r.done),
    doneAt: r.done_at ?? null,
    createdAt: r.created_at,
  }
}

export function mapInfraCost(r: Row): InfraCost {
  return {
    id: r.id,
    concept: str(r.concept),
    amount: num(r.amount),
    currency: r.currency ?? 'USD',
    frequency: r.frequency ?? 'Mensual',
  }
}

function mapDevelopment(r: Row | undefined): Development {
  return {
    stage: str(r?.stage),
    progress: num(r?.progress),
    nextGoal: str(r?.next_goal),
    lastUpdate: r?.last_update ?? null,
  }
}

function mapInfrastructure(r: Row | undefined, costs: Row[]): Infrastructure {
  return {
    productionUrl: str(r?.production_url),
    stagingUrl: str(r?.staging_url),
    repo: str(r?.repo),
    deployPlatform: str(r?.deploy_platform),
    hosting: str(r?.hosting),
    domain: str(r?.domain),
    domainExpiry: r?.domain_expiry ?? null,
    database: str(r?.database),
    externalServices: r?.external_services ?? [],
    automations: r?.automations ?? [],
    techLead: str(r?.tech_lead),
    costs: costs.map(mapInfraCost),
  }
}

function mapMaintenance(r: Row | undefined): Maintenance {
  return {
    active: Boolean(r?.active),
    implementationDate: r?.implementation_date ?? null,
    startDate: r?.start_date ?? null,
    amount: num(r?.amount),
    currency: r?.currency ?? 'USD',
    frequency: r?.frequency ?? 'Mensual',
    dueDay: num(r?.due_day, 1),
    // Sin `15_ventana_de_cobro.sql` la columna no viene: null es «un solo
    // día», que es exactamente el comportamiento de antes.
    dueDayTo: r?.due_day_to == null ? null : num(r.due_day_to),
    services: r?.services ?? [],
    status: r?.status ?? 'Pausado',
    lastCollectedDate: r?.last_collected_date ?? null,
  }
}

export function mapProject(r: Row): Project {
  return {
    id: r.id,
    name: str(r.name),
    description: str(r.description),
    type: r.type ?? 'terceros',
    clientId: r.client_id ?? null,
    ownerName: str(r.owner_name),
    contactPerson: str(r.contact_person),
    internalLead: str(r.internal_lead),
    status: r.status ?? 'Idea',
    priority: r.priority ?? 'Media',
    startDate: r.start_date ?? null,
    estimatedDelivery: r.estimated_delivery ?? null,
    implementationDate: r.implementation_date ?? null,
    quotedAmount: num(r.quoted_amount),
    currency: r.currency ?? 'USD',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    development: mapDevelopment(one(r.project_development)),
    infrastructure: mapInfrastructure(
      one(r.project_infrastructure),
      r.infrastructure_costs ?? [],
    ),
    maintenance: mapMaintenance(one(r.project_maintenance)),
  }
}

export function mapPayment(r: Row): Payment {
  return {
    id: r.id,
    projectId: r.project_id,
    concept: str(r.concept),
    amount: num(r.amount),
    // Sin `14_cobros_en_otra_moneda.sql` la columna no viene y queda null,
    // que es exactamente lo que significa «salda su propio importe».
    appliedAmount: r.applied_amount == null ? null : num(r.applied_amount),
    // Sin `16_facturas.sql` la columna no viene: null es «sin imputar».
    facturaId: r.factura_id ?? null,
    currency: r.currency ?? 'USD',
    paidDate: r.paid_date,
    method: r.method ?? null,
    receipt: r.receipt ?? null,
    notes: str(r.notes),
    accountId: r.account_id ?? null,
  }
}

export function mapMaintenanceCharge(r: Row): MaintenanceCharge {
  return {
    id: r.id,
    projectId: r.project_id,
    chargedOn: r.charged_on,
    amount: num(r.amount),
    currency: r.currency ?? 'USD',
    method: r.method ?? null,
    receipt: r.receipt ?? null,
    notes: str(r.notes),
    accountId: r.account_id ?? null,
  }
}

export function mapAccount(r: Row): Account {
  return {
    id: r.id,
    name: str(r.name),
    kind: r.kind ?? 'Banco',
    currency: r.currency ?? 'ARS',
    notes: str(r.notes),
    archived: Boolean(r.archived),
    sortOrder: num(r.sort_order),
  }
}

/**
 * El plan, no el pago. `fixed_expenses` no tiene columna `status`: la
 * vigencia sale del rango, así que `ended_on` nulo se mapea a null y no se
 * inventa ningún estado.
 *
 * Los defaults espejan los de la tabla (`kind` 'Otros', `currency` 'ARS',
 * `frequency` 'Mensual', `due_day` 1) para que una fila vieja o incompleta
 * no rompa la pantalla.
 */
export function mapFixedExpense(r: Row): FixedExpense {
  return {
    id: r.id,
    concept: str(r.concept),
    kind: r.kind ?? 'Otros',
    vendor: str(r.vendor),
    projectId: r.project_id ?? null,
    amount: num(r.amount),
    currency: r.currency ?? 'ARS',
    frequency: r.frequency ?? 'Mensual',
    dueDay: num(r.due_day, 1),
    startedOn: r.started_on,
    endedOn: r.ended_on ?? null,
    notes: str(r.notes),
  }
}

/**
 * Las tres últimas columnas sólo existen si se corrió `10_gastos.sql`. Contra
 * una base sin ese script PostgREST ni siquiera las devuelve, y por eso acá
 * caen en null en vez de romper: un movimiento viejo es un movimiento válido
 * sin rubro.
 */
export function mapMovement(r: Row): MoneyMovement {
  return {
    id: r.id,
    movedOn: r.moved_on,
    category: r.category ?? 'Transferencia',
    concept: str(r.concept),
    fromAccountId: r.from_account_id ?? null,
    amountOut: num(r.amount_out),
    toAccountId: r.to_account_id ?? null,
    amountIn: num(r.amount_in),
    projectId: r.project_id ?? null,
    notes: str(r.notes),
    expenseKind: r.expense_kind ?? null,
    fixedExpenseId: r.fixed_expense_id ?? null,
    periodStart: r.period_start ?? null,
  }
}

export function mapNote(r: Row): Note {
  return {
    id: r.id,
    title: str(r.title),
    content: str(r.content),
    author: str(r.author),
    priority: r.priority ?? 'Media',
    tags: r.tags ?? [],
    category: r.category ?? 'Idea',
    createdAt: r.created_at,
    reminderDate: r.reminder_date ?? null,
    convertedToProjectId: r.converted_to_project_id ?? null,
    projectId: r.project_id ?? null,
  }
}

/**
 * `grade` viene de Postgres como smallint, pero PostgREST lo serializa a
 * JSON y en el camino puede llegar como string. `Number()` y un clamp al
 * rango 1-3: un grado fuera de rango es un dato imposible, y si alguna vez
 * llega, que caiga en el más bajo y no rompa el `Record` de estilos.
 */
function grade(v: unknown): TicketGrade {
  const n = Number(v)
  return n === 2 || n === 3 ? n : 1
}

export function mapTicket(r: Row): Ticket {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind ?? 'Pedido',
    grade: grade(r.grade),
    title: str(r.title),
    detail: str(r.detail),
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? null,
    resolution: str(r.resolution),
  }
}

export function mapSeguimiento(r: Row): Seguimiento {
  return {
    id: r.id,
    prospecto: str(r.prospecto),
    // La genera la base. Si por lo que sea no vino, se deriva acá con la
    // MISMA regla: un agrupado que se cae a un string vacío juntaría todos
    // los prospectos en un solo montón.
    prospectoKey: str(r.prospecto_key) || normalizarProspecto(str(r.prospecto)),
    contactedOn: r.contacted_on,
    kind: r.kind ?? 'Reunión',
    attendees: str(r.attendees),
    summary: str(r.summary),
    estado: r.estado ?? 'Pelota nuestra',
    nextContactOn: r.next_contact_on ?? null,
    createdAt: r.created_at,
  }
}

/** Espejo exacto de la columna generada `seguimientos.prospecto_key`. */
export function normalizarProspecto(valor: string): string {
  return valor.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function mapFactura(r: Row): Factura {
  return {
    id: r.id,
    projectId: r.project_id,
    numero: str(r.numero),
    emitidaOn: r.emitida_on,
    venceOn: r.vence_on ?? null,
    importe: num(r.importe),
    notas: str(r.notas),
    createdAt: r.created_at,
  }
}

export function facturaToRow(f: Partial<Factura>): Row {
  return pick(f, {
    projectId: 'project_id',
    numero: 'numero',
    emitidaOn: 'emitida_on',
    venceOn: 'vence_on',
    importe: 'importe',
    notas: 'notas',
  })
}

export function mapActivity(r: Row): ActivityEntry {
  return {
    id: r.id,
    projectId: r.project_id ?? null,
    type: r.type,
    message: str(r.message),
    date: r.date,
  }
}

// ---------------------------------------------------------------------
// Domain -> row, for writes. Only defined keys are sent, so these double
// as partial-update builders.
// ---------------------------------------------------------------------

function pick(source: Record<string, unknown>, map: Record<string, string>) {
  const row: Row = {}
  for (const [domainKey, column] of Object.entries(map)) {
    if (source[domainKey] !== undefined) row[column] = source[domainKey]
  }
  return row
}

export function projectToRow(p: Partial<Project>): Row {
  return pick(p, {
    name: 'name',
    description: 'description',
    type: 'type',
    clientId: 'client_id',
    ownerName: 'owner_name',
    contactPerson: 'contact_person',
    internalLead: 'internal_lead',
    status: 'status',
    priority: 'priority',
    startDate: 'start_date',
    estimatedDelivery: 'estimated_delivery',
    implementationDate: 'implementation_date',
    quotedAmount: 'quoted_amount',
    currency: 'currency',
  })
}

export function developmentToRow(d: Partial<Development>): Row {
  return pick(d, {
    stage: 'stage',
    progress: 'progress',
    nextGoal: 'next_goal',
    lastUpdate: 'last_update',
  })
}

export function infrastructureToRow(i: Partial<Infrastructure>): Row {
  return pick(i, {
    productionUrl: 'production_url',
    stagingUrl: 'staging_url',
    repo: 'repo',
    deployPlatform: 'deploy_platform',
    hosting: 'hosting',
    domain: 'domain',
    domainExpiry: 'domain_expiry',
    database: 'database',
    externalServices: 'external_services',
    automations: 'automations',
    techLead: 'tech_lead',
  })
}

/**
 * `active` NO va: en la base es una columna generada a partir de `status` y
 * Postgres rechaza que alguien le escriba encima. Activar o pausar un plan
 * es mover `status`, y nada más.
 */
export function maintenanceToRow(m: Partial<Maintenance>): Row {
  return pick(m, {
    dueDayTo: 'due_day_to',
    implementationDate: 'implementation_date',
    startDate: 'start_date',
    amount: 'amount',
    currency: 'currency',
    frequency: 'frequency',
    dueDay: 'due_day',
    services: 'services',
    status: 'status',
    lastCollectedDate: 'last_collected_date',
  })
}

/**
 * Faltaba: `maintenance_charges` se leía con mapper y se escribía a mano en
 * el store, que es la asimetría que hace que un rename de columna se pierda
 * en silencio (`Row` es `Record<string, any>`, así que el build no avisa).
 */
export function maintenanceChargeToRow(c: Partial<MaintenanceCharge>): Row {
  return pick(c, {
    projectId: 'project_id',
    chargedOn: 'charged_on',
    amount: 'amount',
    currency: 'currency',
    method: 'method',
    receipt: 'receipt',
    notes: 'notes',
    accountId: 'account_id',
  })
}

export function paymentToRow(p: Partial<Payment>): Row {
  return pick(p, {
    projectId: 'project_id',
    concept: 'concept',
    appliedAmount: 'applied_amount',
    facturaId: 'factura_id',
    amount: 'amount',
    currency: 'currency',
    paidDate: 'paid_date',
    method: 'method',
    receipt: 'receipt',
    notes: 'notes',
    accountId: 'account_id',
  })
}

export function accountToRow(a: Partial<Account>): Row {
  return pick(a, {
    name: 'name',
    kind: 'kind',
    currency: 'currency',
    notes: 'notes',
    archived: 'archived',
    sortOrder: 'sort_order',
  })
}

export function fixedExpenseToRow(e: Partial<FixedExpense>): Row {
  return pick(e, {
    concept: 'concept',
    kind: 'kind',
    vendor: 'vendor',
    projectId: 'project_id',
    amount: 'amount',
    currency: 'currency',
    frequency: 'frequency',
    dueDay: 'due_day',
    startedOn: 'started_on',
    endedOn: 'ended_on',
    notes: 'notes',
  })
}

/**
 * OJO con las tres columnas de gasto, que no es cosmético:
 *
 * `pick()` descarta `undefined` pero NO descarta `null`, a propósito — mandar
 * `null` es la única forma de vaciar una columna. La contracara es que quien
 * arma el payload (hoy `MovementDialog`) tiene que mandar `expenseKind`,
 * `fixedExpenseId` y `periodStart` como `undefined`, nunca como `null`,
 * mientras `gastosReady` sea false: contra una base sin `10_gastos.sql`
 * corrido esas columnas no existen, PostgREST contesta PGRST204 y no se
 * podría guardar NINGÚN movimiento de NINGUNA categoría, ni un cambio de
 * moneda. Con `undefined` la clave ni sale, y Caja sigue andando igual que
 * antes hasta que la migración esté.
 */
export function movementToRow(m: Partial<MoneyMovement>): Row {
  return pick(m, {
    movedOn: 'moved_on',
    category: 'category',
    concept: 'concept',
    fromAccountId: 'from_account_id',
    amountOut: 'amount_out',
    toAccountId: 'to_account_id',
    amountIn: 'amount_in',
    projectId: 'project_id',
    notes: 'notes',
    expenseKind: 'expense_kind',
    fixedExpenseId: 'fixed_expense_id',
    periodStart: 'period_start',
  })
}

export function clientToRow(c: Partial<Client>): Row {
  return pick(c, {
    name: 'name',
    contactPerson: 'contact_person',
    phone: 'phone',
    email: 'email',
    notes: 'notes',
  })
}

export function noteToRow(n: Partial<Note>): Row {
  return pick(n, {
    title: 'title',
    content: 'content',
    author: 'author',
    priority: 'priority',
    tags: 'tags',
    category: 'category',
    reminderDate: 'reminder_date',
    convertedToProjectId: 'converted_to_project_id',
    projectId: 'project_id',
  })
}

export function ticketToRow(t: Partial<Ticket>): Row {
  return pick(t, {
    projectId: 'project_id',
    kind: 'kind',
    grade: 'grade',
    title: 'title',
    detail: 'detail',
    resolvedAt: 'resolved_at',
    resolution: 'resolution',
  })
}

export function seguimientoToRow(s: Partial<Seguimiento>): Row {
  // `prospectoKey` NO va: es una columna generada y Postgres rechaza que
  // alguien le escriba encima.
  return pick(s, {
    prospecto: 'prospecto',
    contactedOn: 'contacted_on',
    kind: 'kind',
    attendees: 'attendees',
    summary: 'summary',
    estado: 'estado',
    nextContactOn: 'next_contact_on',
  })
}

/** Columns needed to rebuild a full Project, including its 1:1 children. */
export const PROJECT_SELECT = `
  *,
  project_development(*),
  project_infrastructure(*),
  project_maintenance(*),
  infrastructure_costs(*)
`

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

export type PaymentStatus = 'Pendiente' | 'Cobrado' | 'Vencido'

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

export interface Payment {
  id: string
  projectId: string
  concept: string
  amount: number
  currency: Currency
  dueDate: string // ISO
  paidDate: string | null // ISO
  method: PaymentMethod | null
  status: PaymentStatus
  receipt: string | null
  notes: string
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

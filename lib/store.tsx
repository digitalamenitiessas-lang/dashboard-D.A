'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { createClient } from './supabase/client'
import {
  PROJECT_SELECT,
  accountToRow,
  clientToRow,
  developmentToRow,
  infrastructureToRow,
  maintenanceToRow,
  mapAccount,
  mapActivity,
  mapClient,
  mapMaintenanceCharge,
  mapMovement,
  mapNote,
  mapPayment,
  mapProject,
  mapTask,
  movementToRow,
  noteToRow,
  paymentToRow,
  projectToRow,
} from './mappers'
import type {
  Account,
  ActivityEntry,
  Client,
  Development,
  InfraCost,
  Infrastructure,
  Maintenance,
  MaintenanceCharge,
  MoneyMovement,
  Note,
  Payment,
  Project,
  ProjectStatus,
  Task,
  TaskKind,
} from './types'

const todayIso = () => new Date().toISOString().slice(0, 10)

export interface NewProjectInput {
  name: string
  description: string
  type: Project['type']
  clientId: string | null
  ownerName: string
  contactPerson: string
  internalLead: string
  status: ProjectStatus
  priority: Project['priority']
  startDate: string | null
  estimatedDelivery: string | null
  quotedAmount: number
  currency: Project['currency']
}

interface StoreValue {
  loading: boolean
  error: string | null
  projects: Project[]
  clients: Client[]
  payments: Payment[]
  notes: Note[]
  activity: ActivityEntry[]
  tasks: Task[]
  maintenanceCharges: MaintenanceCharge[]
  accounts: Account[]
  movements: MoneyMovement[]
  /** False until `08_caja.sql` has been run on the database. */
  cajaReady: boolean
  refresh: () => Promise<void>

  // projects
  addProject: (input: NewProjectInput) => Promise<string | null>
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>
  updateProjectStatus: (id: string, status: ProjectStatus) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  updateDevelopment: (
    projectId: string,
    patch: Partial<Development>,
  ) => Promise<void>
  updateInfrastructure: (
    projectId: string,
    patch: Partial<Infrastructure>,
  ) => Promise<void>

  // tasks
  addTask: (projectId: string, kind: TaskKind, title: string) => Promise<void>
  toggleTask: (id: string, done: boolean) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // infrastructure costs
  addInfraCost: (projectId: string, cost: Omit<InfraCost, 'id'>) => Promise<void>
  deleteInfraCost: (projectId: string, costId: string) => Promise<void>

  // payments
  addPayment: (payment: Omit<Payment, 'id'>) => Promise<void>
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<void>
  deletePayment: (id: string) => Promise<void>

  // clients
  addClient: (client: Omit<Client, 'id'>) => Promise<void>
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>

  // notes
  addNote: (
    note: Omit<Note, 'id' | 'createdAt' | 'convertedToProjectId'>,
  ) => Promise<void>
  updateNote: (id: string, patch: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  convertNoteToProject: (noteId: string) => Promise<string | null>

  // caja
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>
  updateAccount: (id: string, patch: Partial<Account>) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  addMovement: (movement: Omit<MoneyMovement, 'id'>) => Promise<void>
  updateMovement: (
    id: string,
    patch: Partial<MoneyMovement>,
  ) => Promise<void>
  deleteMovement: (id: string) => Promise<void>

  // maintenance
  activateMaintenance: (
    id: string,
    maintenance: Partial<Maintenance>,
  ) => Promise<void>
  updateMaintenance: (
    id: string,
    maintenance: Partial<Maintenance>,
  ) => Promise<void>
  collectMaintenance: (
    id: string,
    data: {
      date: string
      amount: number
      method?: Payment['method']
      receipt?: string | null
      accountId?: string | null
    },
  ) => Promise<void>
}

const StoreContext = React.createContext<StoreValue | null>(null)

export function useStore() {
  const ctx = React.useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), [])

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [clients, setClients] = React.useState<Client[]>([])
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [notes, setNotes] = React.useState<Note[]>([])
  const [activity, setActivity] = React.useState<ActivityEntry[]>([])
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [maintenanceCharges, setMaintenanceCharges] = React.useState<
    MaintenanceCharge[]
  >([])
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [movements, setMovements] = React.useState<MoneyMovement[]>([])
  const [cajaReady, setCajaReady] = React.useState(true)

  /** Surfaces the failure to the user and keeps it out of the happy path. */
  const fail = React.useCallback((action: string, e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[store] ${action}:`, e)
    toast.error(`No se pudo ${action}`, { description: message })
  }, [])

  const refresh = React.useCallback(async () => {
    try {
      const [p, c, pay, n, a, t, mc, acc, mov] = await Promise.all([
        supabase
          .from('projects')
          .select(PROJECT_SELECT)
          .order('updated_at', { ascending: false }),
        supabase.from('clients').select('*').order('name'),
        supabase
          .from('payments')
          .select('*')
          .order('paid_date', { ascending: false }),
        supabase.from('notes').select('*').order('created_at', { ascending: false }),
        supabase
          .from('activity')
          .select('*')
          .order('date', { ascending: false })
          .limit(100),
        supabase.from('project_tasks').select('*').order('created_at'),
        supabase
          .from('maintenance_charges')
          .select('*')
          .order('charged_on', { ascending: false }),
        supabase
          .from('accounts')
          .select('*')
          .order('archived')
          .order('sort_order')
          .order('name'),
        supabase
          .from('money_movements')
          .select('*')
          .order('moved_on', { ascending: false }),
      ])

      // Caja is the newest module: if 08_caja.sql hasn't been run yet its
      // tables are simply missing. That shouldn't take down the whole app,
      // so it degrades to an empty Caja that says what to do.
      const cajaMissing = [acc.error, mov.error].some(
        (e) => e && (e.code === 'PGRST205' || /does not exist/i.test(e.message)),
      )
      setCajaReady(!cajaMissing)

      const firstError =
        p.error ||
        c.error ||
        pay.error ||
        n.error ||
        a.error ||
        t.error ||
        mc.error ||
        (cajaMissing ? null : acc.error || mov.error)
      if (firstError) throw firstError

      setProjects((p.data ?? []).map(mapProject))
      setClients((c.data ?? []).map(mapClient))
      setPayments((pay.data ?? []).map(mapPayment))
      setNotes((n.data ?? []).map(mapNote))
      setActivity((a.data ?? []).map(mapActivity))
      setTasks((t.data ?? []).map(mapTask))
      setMaintenanceCharges((mc.data ?? []).map(mapMaintenanceCharge))
      setAccounts((acc.data ?? []).map(mapAccount))
      setMovements((mov.data ?? []).map(mapMovement))
      setError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      console.error('[store] refresh:', e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const logActivity = React.useCallback(
    async (entry: Omit<ActivityEntry, 'id' | 'date'>) => {
      const { data, error } = await supabase
        .from('activity')
        .insert({
          project_id: entry.projectId,
          type: entry.type,
          message: entry.message,
        })
        .select()
        .single()
      if (!error && data) {
        setActivity((prev) => [mapActivity(data), ...prev])
      }
    },
    [supabase],
  )

  /** Re-reads a single project (with its 1:1 children) into local state. */
  const reloadProject = React.useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .eq('id', id)
        .single()
      if (error || !data) return
      const mapped = mapProject(data)
      setProjects((prev) => {
        const exists = prev.some((p) => p.id === id)
        return exists
          ? prev.map((p) => (p.id === id ? mapped : p))
          : [mapped, ...prev]
      })
    },
    [supabase],
  )

  // -------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------
  const addProject = React.useCallback(
    async (input: NewProjectInput): Promise<string | null> => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .insert(projectToRow(input))
          .select('id')
          .single()
        if (error) throw error

        await reloadProject(data.id)
        await logActivity({
          projectId: data.id,
          type: 'proyecto',
          message: `Nuevo proyecto: ${input.name}`,
        })
        return data.id
      } catch (e) {
        fail('crear el proyecto', e)
        return null
      }
    },
    [supabase, reloadProject, logActivity, fail],
  )

  const updateProject = React.useCallback(
    async (id: string, patch: Partial<Project>) => {
      try {
        const row = projectToRow(patch)
        if (Object.keys(row).length === 0) return
        const { error } = await supabase.from('projects').update(row).eq('id', id)
        if (error) throw error
        await reloadProject(id)
      } catch (e) {
        fail('guardar el proyecto', e)
      }
    },
    [supabase, reloadProject, fail],
  )

  const updateProjectStatus = React.useCallback(
    async (id: string, status: ProjectStatus) => {
      try {
        const { error } = await supabase
          .from('projects')
          .update({ status })
          .eq('id', id)
        if (error) throw error
        await reloadProject(id)
        const project = projects.find((p) => p.id === id)
        await logActivity({
          projectId: id,
          type: 'estado',
          message: `${project?.name ?? 'Proyecto'} pasó a "${status}"`,
        })
      } catch (e) {
        fail('cambiar el estado', e)
      }
    },
    [supabase, reloadProject, projects, logActivity, fail],
  )

  const deleteProject = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('projects').delete().eq('id', id)
        if (error) throw error
        setProjects((prev) => prev.filter((p) => p.id !== id))
        setPayments((prev) => prev.filter((p) => p.projectId !== id))
        setTasks((prev) => prev.filter((t) => t.projectId !== id))
        setMaintenanceCharges((prev) => prev.filter((c) => c.projectId !== id))
      } catch (e) {
        fail('eliminar el proyecto', e)
      }
    },
    [supabase, fail],
  )

  const updateDevelopment = React.useCallback(
    async (projectId: string, patch: Partial<Development>) => {
      try {
        const { error } = await supabase
          .from('project_development')
          .update({ ...developmentToRow(patch), last_update: todayIso() })
          .eq('project_id', projectId)
        if (error) throw error
        // Touch the project so "última actualización" stays meaningful.
        await supabase
          .from('projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', projectId)
        await reloadProject(projectId)
      } catch (e) {
        fail('guardar el desarrollo', e)
      }
    },
    [supabase, reloadProject, fail],
  )

  const updateInfrastructure = React.useCallback(
    async (projectId: string, patch: Partial<Infrastructure>) => {
      try {
        const row = infrastructureToRow(patch)
        if (Object.keys(row).length === 0) return
        const { error } = await supabase
          .from('project_infrastructure')
          .update(row)
          .eq('project_id', projectId)
        if (error) throw error
        await reloadProject(projectId)
      } catch (e) {
        fail('guardar la infraestructura', e)
      }
    },
    [supabase, reloadProject, fail],
  )

  // -------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------
  const addTask = React.useCallback(
    async (projectId: string, kind: TaskKind, title: string) => {
      try {
        const { data, error } = await supabase
          .from('project_tasks')
          .insert({ project_id: projectId, kind, title })
          .select()
          .single()
        if (error) throw error
        setTasks((prev) => [...prev, mapTask(data)])
      } catch (e) {
        fail('agregar el pendiente', e)
      }
    },
    [supabase, fail],
  )

  const toggleTask = React.useCallback(
    async (id: string, done: boolean) => {
      try {
        const { data, error } = await supabase
          .from('project_tasks')
          .update({ done })
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setTasks((prev) => prev.map((t) => (t.id === id ? mapTask(data) : t)))
      } catch (e) {
        fail('actualizar el pendiente', e)
      }
    },
    [supabase, fail],
  )

  const deleteTask = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('project_tasks')
          .delete()
          .eq('id', id)
        if (error) throw error
        setTasks((prev) => prev.filter((t) => t.id !== id))
      } catch (e) {
        fail('eliminar el pendiente', e)
      }
    },
    [supabase, fail],
  )

  // -------------------------------------------------------------------
  // Infrastructure costs
  // -------------------------------------------------------------------
  const addInfraCost = React.useCallback(
    async (projectId: string, cost: Omit<InfraCost, 'id'>) => {
      try {
        const { error } = await supabase.from('infrastructure_costs').insert({
          project_id: projectId,
          concept: cost.concept,
          amount: cost.amount,
          currency: cost.currency,
          frequency: cost.frequency,
        })
        if (error) throw error
        await reloadProject(projectId)
      } catch (e) {
        fail('agregar el costo', e)
      }
    },
    [supabase, reloadProject, fail],
  )

  const deleteInfraCost = React.useCallback(
    async (projectId: string, costId: string) => {
      try {
        const { error } = await supabase
          .from('infrastructure_costs')
          .delete()
          .eq('id', costId)
        if (error) throw error
        await reloadProject(projectId)
      } catch (e) {
        fail('eliminar el costo', e)
      }
    },
    [supabase, reloadProject, fail],
  )

  // -------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------
  const addPayment = React.useCallback(
    async (payment: Omit<Payment, 'id'>) => {
      try {
        const { data, error } = await supabase
          .from('payments')
          .insert(paymentToRow(payment))
          .select()
          .single()
        if (error) throw error
        setPayments((prev) => [...prev, mapPayment(data)])
        const project = projects.find((p) => p.id === payment.projectId)
        await logActivity({
          projectId: payment.projectId,
          type: 'pago',
          message: `Pago registrado: ${payment.concept} en ${project?.name ?? ''}`,
        })
      } catch (e) {
        fail('registrar el pago', e)
      }
    },
    [supabase, projects, logActivity, fail],
  )

  const updatePayment = React.useCallback(
    async (id: string, patch: Partial<Payment>) => {
      try {
        const row = paymentToRow(patch)
        if (Object.keys(row).length === 0) return
        const { data, error } = await supabase
          .from('payments')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setPayments((prev) => prev.map((p) => (p.id === id ? mapPayment(data) : p)))
      } catch (e) {
        fail('guardar el pago', e)
      }
    },
    [supabase, fail],
  )

  const deletePayment = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('payments').delete().eq('id', id)
        if (error) throw error
        setPayments((prev) => prev.filter((p) => p.id !== id))
      } catch (e) {
        fail('eliminar el pago', e)
      }
    },
    [supabase, fail],
  )

  // -------------------------------------------------------------------
  // Clients
  // -------------------------------------------------------------------
  const addClient = React.useCallback(
    async (client: Omit<Client, 'id'>) => {
      try {
        const { data, error } = await supabase
          .from('clients')
          .insert(clientToRow(client))
          .select()
          .single()
        if (error) throw error
        setClients((prev) =>
          [...prev, mapClient(data)].sort((a, b) => a.name.localeCompare(b.name)),
        )
      } catch (e) {
        fail('crear el cliente', e)
      }
    },
    [supabase, fail],
  )

  const updateClient = React.useCallback(
    async (id: string, patch: Partial<Client>) => {
      try {
        const row = clientToRow(patch)
        if (Object.keys(row).length === 0) return
        const { data, error } = await supabase
          .from('clients')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setClients((prev) =>
          prev
            .map((c) => (c.id === id ? mapClient(data) : c))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      } catch (e) {
        fail('guardar el cliente', e)
      }
    },
    [supabase, fail],
  )

  const deleteClient = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id)
        if (error) throw error
        setClients((prev) => prev.filter((c) => c.id !== id))
        // Projects keep existing with client_id set to null by the FK rule.
        await refresh()
      } catch (e) {
        fail('eliminar el cliente', e)
      }
    },
    [supabase, refresh, fail],
  )

  // -------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------
  const addNote = React.useCallback(
    async (note: Omit<Note, 'id' | 'createdAt' | 'convertedToProjectId'>) => {
      try {
        const { data, error } = await supabase
          .from('notes')
          .insert(noteToRow(note))
          .select()
          .single()
        if (error) throw error
        setNotes((prev) => [mapNote(data), ...prev])
        await logActivity({
          projectId: note.projectId ?? null,
          type: 'nota',
          message: `Nueva nota: ${note.title}`,
        })
      } catch (e) {
        fail('crear la nota', e)
      }
    },
    [supabase, logActivity, fail],
  )

  const updateNote = React.useCallback(
    async (id: string, patch: Partial<Note>) => {
      try {
        const row = noteToRow(patch)
        if (Object.keys(row).length === 0) return
        const { data, error } = await supabase
          .from('notes')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setNotes((prev) => prev.map((n) => (n.id === id ? mapNote(data) : n)))
      } catch (e) {
        fail('guardar la nota', e)
      }
    },
    [supabase, fail],
  )

  const deleteNote = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('notes').delete().eq('id', id)
        if (error) throw error
        setNotes((prev) => prev.filter((n) => n.id !== id))
      } catch (e) {
        fail('eliminar la nota', e)
      }
    },
    [supabase, fail],
  )

  const convertNoteToProject = React.useCallback(
    async (noteId: string): Promise<string | null> => {
      const note = notes.find((n) => n.id === noteId)
      if (!note) return null
      try {
        const { data, error } = await supabase
          .from('projects')
          .insert({
            name: note.title,
            description: note.content,
            type: 'propio',
            owner_name: 'Digital Amenities',
            internal_lead: note.author,
            status: 'Idea',
            priority: note.priority,
          })
          .select('id')
          .single()
        if (error) throw error

        const { error: noteError } = await supabase
          .from('notes')
          .update({ converted_to_project_id: data.id })
          .eq('id', noteId)
        if (noteError) throw noteError

        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? { ...n, convertedToProjectId: data.id } : n,
          ),
        )
        await reloadProject(data.id)
        await logActivity({
          projectId: data.id,
          type: 'proyecto',
          message: `Nota convertida en proyecto: ${note.title}`,
        })
        return data.id
      } catch (e) {
        fail('convertir la nota', e)
        return null
      }
    },
    [supabase, notes, reloadProject, logActivity, fail],
  )

  // -------------------------------------------------------------------
  // Caja: accounts and movements
  // -------------------------------------------------------------------
  const sortAccounts = (list: Account[]) =>
    [...list].sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    )

  const addAccount = React.useCallback(
    async (account: Omit<Account, 'id'>) => {
      try {
        const { data, error } = await supabase
          .from('accounts')
          .insert(accountToRow(account))
          .select()
          .single()
        if (error) throw error
        setAccounts((prev) => sortAccounts([...prev, mapAccount(data)]))
      } catch (e) {
        fail('crear la cuenta', e)
      }
    },
    [supabase, fail],
  )

  const updateAccount = React.useCallback(
    async (id: string, patch: Partial<Account>) => {
      try {
        const row = accountToRow(patch)
        if (Object.keys(row).length === 0) return
        const { data, error } = await supabase
          .from('accounts')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setAccounts((prev) =>
          sortAccounts(prev.map((a) => (a.id === id ? mapAccount(data) : a))),
        )
      } catch (e) {
        fail('guardar la cuenta', e)
      }
    },
    [supabase, fail],
  )

  const deleteAccount = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('accounts').delete().eq('id', id)
        if (error) throw error
        setAccounts((prev) => prev.filter((a) => a.id !== id))
        // Cobros pointing at it were cleared by the FK rule.
        await refresh()
      } catch (e) {
        // The FK on movements is RESTRICT: an account with history can't
        // be deleted, only archived.
        fail('eliminar la cuenta', e)
      }
    },
    [supabase, refresh, fail],
  )

  const addMovement = React.useCallback(
    async (movement: Omit<MoneyMovement, 'id'>) => {
      try {
        const { data, error } = await supabase
          .from('money_movements')
          .insert(movementToRow(movement))
          .select()
          .single()
        if (error) throw error
        setMovements((prev) =>
          [mapMovement(data), ...prev].sort((a, b) =>
            b.movedOn.localeCompare(a.movedOn),
          ),
        )
      } catch (e) {
        fail('registrar el movimiento', e)
      }
    },
    [supabase, fail],
  )

  const updateMovement = React.useCallback(
    async (id: string, patch: Partial<MoneyMovement>) => {
      try {
        const row = movementToRow(patch)
        if (Object.keys(row).length === 0) return
        const { data, error } = await supabase
          .from('money_movements')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setMovements((prev) =>
          prev
            .map((m) => (m.id === id ? mapMovement(data) : m))
            .sort((a, b) => b.movedOn.localeCompare(a.movedOn)),
        )
      } catch (e) {
        fail('guardar el movimiento', e)
      }
    },
    [supabase, fail],
  )

  const deleteMovement = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('money_movements')
          .delete()
          .eq('id', id)
        if (error) throw error
        setMovements((prev) => prev.filter((m) => m.id !== id))
      } catch (e) {
        fail('eliminar el movimiento', e)
      }
    },
    [supabase, fail],
  )

  // -------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------
  const updateMaintenance = React.useCallback(
    async (id: string, maintenance: Partial<Maintenance>) => {
      try {
        const row = maintenanceToRow(maintenance)
        if (Object.keys(row).length === 0) return
        const { error } = await supabase
          .from('project_maintenance')
          .update(row)
          .eq('project_id', id)
        if (error) throw error
        await reloadProject(id)
      } catch (e) {
        fail('guardar el mantenimiento', e)
      }
    },
    [supabase, reloadProject, fail],
  )

  const activateMaintenance = React.useCallback(
    async (id: string, maintenance: Partial<Maintenance>) => {
      try {
        const { error } = await supabase
          .from('project_maintenance')
          .update({
            ...maintenanceToRow(maintenance),
            active: true,
            status: 'Activo',
          })
          .eq('project_id', id)
        if (error) throw error

        const { error: statusError } = await supabase
          .from('projects')
          .update({ status: 'En mantenimiento' })
          .eq('id', id)
        if (statusError) throw statusError

        await reloadProject(id)
        const project = projects.find((p) => p.id === id)
        await logActivity({
          projectId: id,
          type: 'mantenimiento',
          message: `Mantenimiento activado en ${project?.name ?? ''}`,
        })
      } catch (e) {
        fail('activar el mantenimiento', e)
      }
    },
    [supabase, reloadProject, projects, logActivity, fail],
  )

  const collectMaintenance = React.useCallback(
    async (
      id: string,
      data: {
        date: string
        amount: number
        method?: Payment['method']
        receipt?: string | null
        accountId?: string | null
      },
    ) => {
      try {
        const project = projects.find((p) => p.id === id)
        const { data: charge, error } = await supabase
          .from('maintenance_charges')
          .insert({
            project_id: id,
            charged_on: data.date,
            amount: data.amount,
            currency: project?.maintenance.currency ?? 'USD',
            method: data.method ?? null,
            receipt: data.receipt ?? null,
            account_id: data.accountId ?? null,
          })
          .select()
          .single()
        if (error) throw error
        setMaintenanceCharges((prev) =>
          [mapMaintenanceCharge(charge), ...prev].sort((a, b) =>
            b.chargedOn.localeCompare(a.chargedOn),
          ),
        )

        const { error: mErr } = await supabase
          .from('project_maintenance')
          .update({ last_collected_date: data.date })
          .eq('project_id', id)
        if (mErr) throw mErr

        await reloadProject(id)
        await logActivity({
          projectId: id,
          type: 'mantenimiento',
          message: `Mantenimiento cobrado en ${project?.name ?? ''} ($${data.amount})`,
        })
      } catch (e) {
        fail('registrar el cobro de mantenimiento', e)
      }
    },
    [supabase, reloadProject, projects, logActivity, fail],
  )

  const value: StoreValue = {
    loading,
    error,
    projects,
    clients,
    payments,
    notes,
    activity,
    tasks,
    maintenanceCharges,
    accounts,
    movements,
    cajaReady,
    refresh,
    addProject,
    updateProject,
    updateProjectStatus,
    deleteProject,
    updateDevelopment,
    updateInfrastructure,
    addTask,
    toggleTask,
    deleteTask,
    addInfraCost,
    deleteInfraCost,
    addPayment,
    updatePayment,
    deletePayment,
    addClient,
    updateClient,
    deleteClient,
    addNote,
    updateNote,
    deleteNote,
    convertNoteToProject,
    addAccount,
    updateAccount,
    deleteAccount,
    addMovement,
    updateMovement,
    deleteMovement,
    activateMaintenance,
    updateMaintenance,
    collectMaintenance,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { createClient } from './supabase/client'
import {
  PROJECT_SELECT,
  accountToRow,
  clientToRow,
  developmentToRow,
  fixedExpenseToRow,
  infrastructureToRow,
  maintenanceToRow,
  mapAccount,
  mapActivity,
  mapClient,
  mapFixedExpense,
  mapMaintenanceCharge,
  mapMovement,
  mapNote,
  mapPayment,
  mapProject,
  mapTask,
  movementToRow,
  noteToRow,
  mapSeguimiento,
  mapTicket,
  paymentToRow,
  projectToRow,
  seguimientoToRow,
  ticketToRow,
} from './mappers'
import { formatMoney, todayIso } from './format'
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
  Project,
  ProjectStatus,
  Seguimiento,
  Task,
  TaskKind,
  Ticket,
} from './types'

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
  /**
   * Los gastos comprometidos. Son un PLAN: lo que realmente se pagó vive en
   * `movements`, y el estado de cada período se deriva cruzando los dos
   * (`lib/gastos.ts`). Acá no hay nada de plata que haya salido.
   */
  fixedExpenses: FixedExpense[]
  /**
   * Reclamos y pedidos de clientes. Siempre contra un proyecto, y el estado
   * no se guarda: `resolvedAt` null = abierto. Ver `lib/types.ts`.
   */
  tickets: Ticket[]
  /**
   * Los acercamientos comerciales. Un renglón por CONTACTO; el hilo de un
   * prospecto y su estado se derivan con `agruparSeguimientos()`.
   */
  seguimientos: Seguimiento[]
  /** False until `08_caja.sql` has been run on the database. */
  cajaReady: boolean
  /** False mientras no se haya corrido `10_gastos.sql`. Mismo degradado. */
  gastosReady: boolean
  /** False mientras no se haya corrido `11_tickets.sql`. Mismo degradado. */
  ticketsReady: boolean
  /** False mientras no se haya corrido `12_seguimientos.sql`. Ídem. */
  seguimientosReady: boolean
  refresh: () => Promise<void>

  // Toda mutación contesta si el dato quedó guardado: `true` si salió bien,
  // `false` si falló (el store ya avisó con un toast rojo). Quien llama tiene
  // que mirarlo antes de festejar: sin esto un diálogo cierra en verde
  // habiendo perdido la carga.

  // projects
  addProject: (input: NewProjectInput) => Promise<string | null>
  updateProject: (id: string, patch: Partial<Project>) => Promise<boolean>
  updateProjectStatus: (id: string, status: ProjectStatus) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>
  updateDevelopment: (
    projectId: string,
    patch: Partial<Development>,
  ) => Promise<boolean>
  updateInfrastructure: (
    projectId: string,
    patch: Partial<Infrastructure>,
  ) => Promise<boolean>

  // tasks
  addTask: (
    projectId: string,
    kind: TaskKind,
    title: string,
  ) => Promise<boolean>
  toggleTask: (id: string, done: boolean) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>

  // infrastructure costs
  addInfraCost: (
    projectId: string,
    cost: Omit<InfraCost, 'id'>,
  ) => Promise<boolean>
  deleteInfraCost: (projectId: string, costId: string) => Promise<boolean>

  // payments
  addPayment: (payment: Omit<Payment, 'id'>) => Promise<boolean>
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<boolean>
  deletePayment: (id: string) => Promise<boolean>

  // clients
  addClient: (client: Omit<Client, 'id'>) => Promise<boolean>
  updateClient: (id: string, patch: Partial<Client>) => Promise<boolean>
  deleteClient: (id: string) => Promise<boolean>

  // notes
  addNote: (
    note: Omit<Note, 'id' | 'createdAt' | 'convertedToProjectId'>,
  ) => Promise<boolean>
  updateNote: (id: string, patch: Partial<Note>) => Promise<boolean>
  deleteNote: (id: string) => Promise<boolean>
  convertNoteToProject: (noteId: string) => Promise<string | null>

  // caja
  addAccount: (account: Omit<Account, 'id'>) => Promise<boolean>
  updateAccount: (id: string, patch: Partial<Account>) => Promise<boolean>
  deleteAccount: (id: string) => Promise<boolean>
  addMovement: (movement: Omit<MoneyMovement, 'id'>) => Promise<boolean>
  updateMovement: (
    id: string,
    patch: Partial<MoneyMovement>,
  ) => Promise<boolean>
  deleteMovement: (id: string) => Promise<boolean>

  // gastos fijos
  //
  // NO hay `payFixedExpense`, y es a propósito: un pago se registra con
  // `addMovement`, que ya existe. Una sola vía de escritura a
  // `money_movements` es la mitad de la defensa contra el doble conteo; la
  // otra mitad es el índice único (fixed_expense_id, period_start).
  addFixedExpense: (expense: Omit<FixedExpense, 'id'>) => Promise<boolean>
  updateFixedExpense: (
    id: string,
    patch: Partial<FixedExpense>,
  ) => Promise<boolean>
  deleteFixedExpense: (id: string) => Promise<boolean>

  // tickets
  //
  // No hay `setTicketStatus`: el estado es `resolvedAt`, así que resolver y
  // reabrir son las dos únicas transiciones y cada una tiene su método. Un
  // setter genérico dejaría escribir un estado sin fecha, que es justo lo
  // que el modelo evita.
  addTicket: (
    ticket: Omit<Ticket, 'id' | 'createdAt' | 'resolvedAt' | 'resolution'>,
  ) => Promise<boolean>
  updateTicket: (id: string, patch: Partial<Ticket>) => Promise<boolean>
  resolveTicket: (id: string, resolution: string) => Promise<boolean>
  reopenTicket: (id: string) => Promise<boolean>
  deleteTicket: (id: string) => Promise<boolean>

  // seguimientos
  //
  // No hay `setEstadoProspecto`: el estado de un prospecto es el del último
  // contacto, así que cambiarlo es cargar un contacto nuevo — que es lo que
  // de verdad pasó. Un setter dejaría mover el estado sin que quede registro
  // de por qué se movió.
  addSeguimiento: (
    seguimiento: Omit<Seguimiento, 'id' | 'createdAt' | 'prospectoKey'>,
  ) => Promise<boolean>
  updateSeguimiento: (
    id: string,
    patch: Partial<Seguimiento>,
  ) => Promise<boolean>
  deleteSeguimiento: (id: string) => Promise<boolean>

  // maintenance
  activateMaintenance: (
    id: string,
    maintenance: Partial<Maintenance>,
    options?: { markProjectInMaintenance?: boolean },
  ) => Promise<boolean>
  updateMaintenance: (
    id: string,
    maintenance: Partial<Maintenance>,
  ) => Promise<boolean>
  collectMaintenance: (
    id: string,
    data: {
      date: string
      amount: number
      method?: Payment['method']
      receipt?: string | null
      accountId?: string | null
    },
  ) => Promise<boolean>
}

/**
 * Los tres errores de Postgres del módulo de gastos que un usuario va a ver
 * sí o sí, traducidos a algo que se pueda leer y que además diga qué hacer.
 * El resto de los errores pasa crudo: inventarle una explicación a algo que
 * no conocemos es peor que mostrar el texto de la base.
 *
 * Los tres son defensas reales, no validaciones cosméticas, así que el
 * mensaje explica la salida en vez de pedir que se reintente:
 *
 *   - `money_movements_gasto_fijo_periodo_uidx` — el mismo período de un
 *     gasto fijo pagado dos veces (una desde Caja y otra desde el botón
 *     Pagar). La base rechaza el segundo.
 *   - `money_movements_fixed_expense_id_fkey` — el FK es RESTRICT: un plan
 *     con pagos no se borra. Aparece de dos maneras y por eso hace falta
 *     `scope`: borrando el gasto fijo, o borrando el proyecto, porque el
 *     cascade de `fixed_expenses_project_id_fkey` intenta llevarse el plan
 *     y el que aborta es igual este FK, con el mismo nombre en el mensaje.
 */
function enCriollo(e: unknown, scope?: 'proyecto'): string | null {
  const parts: string[] = [e instanceof Error ? e.message : String(e)]
  if (typeof e === 'object' && e !== null) {
    const { details, hint } = e as { details?: unknown; hint?: unknown }
    if (details) parts.push(String(details))
    if (hint) parts.push(String(hint))
  }
  const raw = parts.join(' ')

  if (raw.includes('money_movements_gasto_fijo_periodo_uidx')) {
    return 'Ese período ya está registrado como pagado. Si el pago se hizo en dos partes, editá el movimiento o cargá el resto como gasto suelto.'
  }
  if (
    raw.includes('money_movements_fixed_expense_id_fkey') ||
    raw.includes('fixed_expenses_project_id_fkey')
  ) {
    return scope === 'proyecto'
      ? 'El proyecto tiene un gasto fijo con pagos. Dale de baja primero.'
      : 'Este gasto fijo tiene pagos registrados: no se borra, se da de baja poniéndole fecha de fin.'
  }
  return null
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
  const [fixedExpenses, setFixedExpenses] = React.useState<FixedExpense[]>([])
  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [seguimientos, setSeguimientos] = React.useState<Seguimiento[]>([])
  const [cajaReady, setCajaReady] = React.useState(true)
  const [gastosReady, setGastosReady] = React.useState(true)
  const [ticketsReady, setTicketsReady] = React.useState(true)
  const [seguimientosReady, setSeguimientosReady] = React.useState(true)

  /**
   * Surfaces the failure to the user and keeps it out of the happy path.
   *
   * `scope` sólo lo usa `enCriollo`, y hoy sólo para una cosa: distinguir el
   * FK del gasto fijo cuando el que se está borrando es el proyecto. La base
   * informa el mismo nombre de constraint en los dos casos.
   */
  const fail = React.useCallback(
    (action: string, e: unknown, scope?: 'proyecto') => {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[store] ${action}:`, e)
      toast.error(`No se pudo ${action}`, {
        description: enCriollo(e, scope) ?? message,
      })
    },
    [],
  )

  const refresh = React.useCallback(async () => {
    try {
      const [p, c, pay, n, a, t, mc, acc, mov, fe, tk, sg] = await Promise.all([
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
        supabase.from('fixed_expenses').select('*').order('concept'),
        // Los abiertos primero (son los `resolved_at` nulos) y, dentro de
        // cada grupo, lo más urgente o lo más reciente arriba.
        //
        // DESCENDENTE con nullsFirst, no ascendente: tiene que dar el MISMO
        // orden que `sortTickets`, que es quien reordena la lista después de
        // cada mutación. Con ascendente los resueltos venían del más viejo
        // al más nuevo y la pestaña Resueltos se daba vuelta sola apenas
        // tocabas cualquier cosa.
        supabase
          .from('tickets')
          .select('*')
          .order('resolved_at', { ascending: false, nullsFirst: true })
          .order('grade', { ascending: false })
          .order('created_at', { ascending: false }),
        // Por prospecto y, adentro, el contacto más reciente primero: es el
        // mismo orden que espera `agruparSeguimientos()`.
        supabase
          .from('seguimientos')
          .select('*')
          .order('prospecto_key')
          .order('contacted_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

      // Caja is the newest module: if 08_caja.sql hasn't been run yet its
      // tables are simply missing. That shouldn't take down the whole app,
      // so it degrades to an empty Caja that says what to do.
      const missing = (e: typeof acc.error) =>
        !!e && (e.code === 'PGRST205' || /does not exist/i.test(e.message))

      const cajaMissing = [acc.error, mov.error].some(missing)
      setCajaReady(!cajaMissing)

      // Mismo criterio para gastos: sin `10_gastos.sql` la tabla no existe y
      // la pantalla degrada a un cartel que dice qué correr. Las tres
      // columnas nuevas de money_movements no hacen falta chequearlas: el
      // select es `*`, así que simplemente no vienen y el mapper las deja en
      // null.
      const gastosMissing = missing(fe.error)
      setGastosReady(!gastosMissing)

      // Y lo mismo para tickets: sin `11_tickets.sql` la tabla no existe y
      // la pantalla degrada al cartel que dice qué correr, en vez de tirar
      // abajo el resto de la app.
      const ticketsMissing = missing(tk.error)
      setTicketsReady(!ticketsMissing)

      const seguimientosMissing = missing(sg.error)
      setSeguimientosReady(!seguimientosMissing)

      const firstError =
        p.error ||
        c.error ||
        pay.error ||
        n.error ||
        a.error ||
        t.error ||
        mc.error ||
        (cajaMissing ? null : acc.error || mov.error) ||
        (gastosMissing ? null : fe.error) ||
        (ticketsMissing ? null : tk.error) ||
        (seguimientosMissing ? null : sg.error)
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
      setFixedExpenses((fe.data ?? []).map(mapFixedExpense))
      setTickets((tk.data ?? []).map(mapTicket))
      setSeguimientos((sg.data ?? []).map(mapSeguimiento))
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
        if (Object.keys(row).length === 0) return true
        const { error } = await supabase.from('projects').update(row).eq('id', id)
        if (error) throw error
        await reloadProject(id)
        return true
      } catch (e) {
        fail('guardar el proyecto', e)
        return false
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
        return true
      } catch (e) {
        fail('cambiar el estado', e)
        return false
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
        // El FK de fixed_expenses es CASCADE: los planes del proyecto se
        // fueron con él.
        setFixedExpenses((prev) => prev.filter((f) => f.projectId !== id))
        // Y el de tickets también: `tickets.project_id` es CASCADE, así que
        // en la base ya no están. Sin esto quedaban en memoria apuntando a
        // un proyecto inexistente y la pantalla los mostraba como «Proyecto
        // eliminado» hasta la próxima recarga.
        setTickets((prev) => prev.filter((t) => t.projectId !== id))
        return true
      } catch (e) {
        // Si alguno de esos planes tenía pagos, el cascade lo frena el
        // RESTRICT de money_movements y no se borró nada: el mensaje lo
        // aclara.
        fail('eliminar el proyecto', e, 'proyecto')
        return false
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
        return true
      } catch (e) {
        fail('guardar el desarrollo', e)
        return false
      }
    },
    [supabase, reloadProject, fail],
  )

  const updateInfrastructure = React.useCallback(
    async (projectId: string, patch: Partial<Infrastructure>) => {
      try {
        const row = infrastructureToRow(patch)
        if (Object.keys(row).length === 0) return true
        const { error } = await supabase
          .from('project_infrastructure')
          .update(row)
          .eq('project_id', projectId)
        if (error) throw error
        await reloadProject(projectId)
        return true
      } catch (e) {
        fail('guardar la infraestructura', e)
        return false
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
        return true
      } catch (e) {
        fail('agregar el pendiente', e)
        return false
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
        return true
      } catch (e) {
        fail('actualizar el pendiente', e)
        return false
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
        return true
      } catch (e) {
        fail('eliminar el pendiente', e)
        return false
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
        return true
      } catch (e) {
        fail('agregar el costo', e)
        return false
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
        return true
      } catch (e) {
        fail('eliminar el costo', e)
        return false
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
        // La lista viene ordenada por fecha de cobro descendente: un pago
        // nuevo va donde le toca por fecha, no al final.
        setPayments((prev) =>
          [mapPayment(data), ...prev].sort((a, b) =>
            b.paidDate.localeCompare(a.paidDate),
          ),
        )
        const project = projects.find((p) => p.id === payment.projectId)
        await logActivity({
          projectId: payment.projectId,
          type: 'pago',
          message: `Pago registrado: ${payment.concept} en ${project?.name ?? ''}`,
        })
        return true
      } catch (e) {
        fail('registrar el pago', e)
        return false
      }
    },
    [supabase, projects, logActivity, fail],
  )

  const updatePayment = React.useCallback(
    async (id: string, patch: Partial<Payment>) => {
      try {
        const row = paymentToRow(patch)
        if (Object.keys(row).length === 0) return true
        const { data, error } = await supabase
          .from('payments')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setPayments((prev) =>
          prev
            .map((p) => (p.id === id ? mapPayment(data) : p))
            .sort((a, b) => b.paidDate.localeCompare(a.paidDate)),
        )
        return true
      } catch (e) {
        fail('guardar el pago', e)
        return false
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
        return true
      } catch (e) {
        fail('eliminar el pago', e)
        return false
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
        return true
      } catch (e) {
        fail('crear el cliente', e)
        return false
      }
    },
    [supabase, fail],
  )

  const updateClient = React.useCallback(
    async (id: string, patch: Partial<Client>) => {
      try {
        const row = clientToRow(patch)
        if (Object.keys(row).length === 0) return true
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
        return true
      } catch (e) {
        fail('guardar el cliente', e)
        return false
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
        return true
      } catch (e) {
        fail('eliminar el cliente', e)
        return false
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
        return true
      } catch (e) {
        fail('crear la nota', e)
        return false
      }
    },
    [supabase, logActivity, fail],
  )

  const updateNote = React.useCallback(
    async (id: string, patch: Partial<Note>) => {
      try {
        const row = noteToRow(patch)
        if (Object.keys(row).length === 0) return true
        const { data, error } = await supabase
          .from('notes')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setNotes((prev) => prev.map((n) => (n.id === id ? mapNote(data) : n)))
        return true
      } catch (e) {
        fail('guardar la nota', e)
        return false
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
        return true
      } catch (e) {
        fail('eliminar la nota', e)
        return false
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
        return true
      } catch (e) {
        fail('crear la cuenta', e)
        return false
      }
    },
    [supabase, fail],
  )

  const updateAccount = React.useCallback(
    async (id: string, patch: Partial<Account>) => {
      try {
        const row = accountToRow(patch)
        if (Object.keys(row).length === 0) return true
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
        return true
      } catch (e) {
        fail('guardar la cuenta', e)
        return false
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
        return true
      } catch (e) {
        // The FK on movements is RESTRICT: an account with history can't
        // be deleted, only archived.
        fail('eliminar la cuenta', e)
        return false
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
        return true
      } catch (e) {
        fail('registrar el movimiento', e)
        return false
      }
    },
    [supabase, fail],
  )

  const updateMovement = React.useCallback(
    async (id: string, patch: Partial<MoneyMovement>) => {
      try {
        const row = movementToRow(patch)
        if (Object.keys(row).length === 0) return true
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
        return true
      } catch (e) {
        fail('guardar el movimiento', e)
        return false
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
        return true
      } catch (e) {
        fail('eliminar el movimiento', e)
        return false
      }
    },
    [supabase, fail],
  )

  // -------------------------------------------------------------------
  // Gastos fijos
  //
  // El plan, nada más. Pagar un período es un `addMovement` con
  // fixed_expense_id y period_start: acá no hay ninguna función que escriba
  // en money_movements, y eso no es un olvido.
  // -------------------------------------------------------------------
  const sortFixedExpenses = (list: FixedExpense[]) =>
    [...list].sort((a, b) => a.concept.localeCompare(b.concept))

  const addFixedExpense = React.useCallback(
    async (expense: Omit<FixedExpense, 'id'>) => {
      try {
        const { data, error } = await supabase
          .from('fixed_expenses')
          .insert(fixedExpenseToRow(expense))
          .select()
          .single()
        if (error) throw error
        setFixedExpenses((prev) =>
          sortFixedExpenses([...prev, mapFixedExpense(data)]),
        )
        return true
      } catch (e) {
        fail('crear el gasto fijo', e)
        return false
      }
    },
    [supabase, fail],
  )

  const updateFixedExpense = React.useCallback(
    async (id: string, patch: Partial<FixedExpense>) => {
      try {
        const row = fixedExpenseToRow(patch)
        if (Object.keys(row).length === 0) return true
        const { data, error } = await supabase
          .from('fixed_expenses')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setFixedExpenses((prev) =>
          sortFixedExpenses(
            prev.map((f) => (f.id === id ? mapFixedExpense(data) : f)),
          ),
        )
        return true
      } catch (e) {
        fail('guardar el gasto fijo', e)
        return false
      }
    },
    [supabase, fail],
  )

  const deleteFixedExpense = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('fixed_expenses')
          .delete()
          .eq('id', id)
        if (error) throw error
        setFixedExpenses((prev) => prev.filter((f) => f.id !== id))
        return true
      } catch (e) {
        // Un plan con pagos no se borra: el FK es RESTRICT y `enCriollo`
        // explica que la salida es ponerle fecha de fin.
        fail('eliminar el gasto fijo', e)
        return false
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
        if (Object.keys(row).length === 0) return true
        const { error } = await supabase
          .from('project_maintenance')
          .update(row)
          .eq('project_id', id)
        if (error) throw error
        await reloadProject(id)
        return true
      } catch (e) {
        fail('guardar el mantenimiento', e)
        return false
      }
    },
    [supabase, reloadProject, fail],
  )

  const activateMaintenance = React.useCallback(
    async (
      id: string,
      maintenance: Partial<Maintenance>,
      options?: { markProjectInMaintenance?: boolean },
    ) => {
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

        // A plan can be set up before delivery, so the project's status is
        // only moved when the caller says so.
        if (options?.markProjectInMaintenance !== false) {
          const { error: statusError } = await supabase
            .from('projects')
            .update({ status: 'En mantenimiento' })
            .eq('id', id)
          if (statusError) throw statusError
        }

        await reloadProject(id)
        const project = projects.find((p) => p.id === id)
        await logActivity({
          projectId: id,
          type: 'mantenimiento',
          message: `Mantenimiento activado en ${project?.name ?? ''}`,
        })
        return true
      } catch (e) {
        fail('activar el mantenimiento', e)
        return false
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
        // El monto va formateado y con su moneda: acá el «$» solo no dice
        // nada, que es justamente el punto de toda la app.
        const collected = formatMoney(
          data.amount,
          project?.maintenance.currency ?? 'USD',
        )
        await logActivity({
          projectId: id,
          type: 'mantenimiento',
          message: `Mantenimiento cobrado en ${project?.name ?? ''} (${collected})`,
        })
        return true
      } catch (e) {
        fail('registrar el cobro de mantenimiento', e)
        return false
      }
    },
    [supabase, reloadProject, projects, logActivity, fail],
  )

  // -------------------------------------------------------------------
  // Tickets
  //
  // El orden es el mismo que pide el `refresh`: abiertos arriba, y dentro
  // de cada grupo el grado más alto primero. Se reordena en memoria después
  // de cada mutación en vez de volver a pedir la lista: resolver un ticket
  // lo tiene que mandar al fondo en el acto, y un refetch por click es un
  // viaje a la base para reacomodar cinco filas.
  // -------------------------------------------------------------------
  const sortTickets = React.useCallback((list: Ticket[]) => {
    return [...list].sort((a, b) => {
      const abiertoA = a.resolvedAt === null
      const abiertoB = b.resolvedAt === null
      if (abiertoA !== abiertoB) return abiertoA ? -1 : 1
      if (!abiertoA) {
        // Entre resueltos manda el más recientemente resuelto.
        return (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')
      }
      if (a.grade !== b.grade) return b.grade - a.grade
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [])

  const addTicket = React.useCallback(
    async (
      ticket: Omit<Ticket, 'id' | 'createdAt' | 'resolvedAt' | 'resolution'>,
    ) => {
      try {
        const { data, error } = await supabase
          .from('tickets')
          .insert(ticketToRow(ticket))
          .select()
          .single()
        if (error) throw error
        setTickets((prev) => sortTickets([mapTicket(data), ...prev]))
        await logActivity({
          projectId: ticket.projectId,
          type: 'ticket',
          message: `Ticket nuevo (grado ${ticket.grade}): ${ticket.title}`,
        })
        return true
      } catch (e) {
        fail('crear el ticket', e)
        return false
      }
    },
    [supabase, sortTickets, logActivity, fail],
  )

  const updateTicket = React.useCallback(
    async (id: string, patch: Partial<Ticket>) => {
      try {
        const row = ticketToRow(patch)
        if (Object.keys(row).length === 0) return true
        const { data, error } = await supabase
          .from('tickets')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setTickets((prev) =>
          sortTickets(prev.map((t) => (t.id === id ? mapTicket(data) : t))),
        )
        return true
      } catch (e) {
        fail('guardar el ticket', e)
        return false
      }
    },
    [supabase, sortTickets, fail],
  )

  /**
   * Resolver es poner la fecha, porque la fecha ES el estado. Se manda un
   * instante ISO y no `todayIso()`: `resolved_at` es timestamptz, no una
   * fecha-día, así que acá el UTC de `toISOString()` es lo correcto y no
   * el error que `lib/format.ts` advierte para las columnas `date`.
   *
   * La condición `is('resolved_at', null)` no es decorativa: si dos
   * personas tocan Resolver casi al mismo tiempo desde dos celulares, la
   * segunda no piso la resolución de la primera — no encuentra fila, y el
   * store lo dice en vez de sobrescribir en silencio.
   */
  const resolveTicket = React.useCallback(
    async (id: string, resolution: string) => {
      try {
        const { data, error } = await supabase
          .from('tickets')
          .update({
            resolved_at: new Date().toISOString(),
            resolution: resolution.trim(),
          })
          .eq('id', id)
          .is('resolved_at', null)
          .select()
          .maybeSingle()
        if (error) throw error
        if (!data) {
          toast.info('Ese ticket ya estaba resuelto', {
            description: 'Alguien lo resolvió antes. Recargá para ver cómo quedó.',
          })
          return false
        }
        const ticket = mapTicket(data)
        setTickets((prev) =>
          sortTickets(prev.map((t) => (t.id === id ? ticket : t))),
        )
        await logActivity({
          projectId: ticket.projectId,
          type: 'ticket',
          message: `Ticket resuelto: ${ticket.title}`,
        })
        return true
      } catch (e) {
        fail('resolver el ticket', e)
        return false
      }
    },
    [supabase, sortTickets, logActivity, fail],
  )

  /** Reabrir es sacarle la fecha. La resolución se borra con ella: si vuelve
   *  a estar abierto, lo que se había hecho no alcanzó. */
  const reopenTicket = React.useCallback(
    async (id: string) => {
      try {
        const { data, error } = await supabase
          .from('tickets')
          .update({ resolved_at: null, resolution: '' })
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        const ticket = mapTicket(data)
        setTickets((prev) =>
          sortTickets(prev.map((t) => (t.id === id ? ticket : t))),
        )
        await logActivity({
          projectId: ticket.projectId,
          type: 'ticket',
          message: `Ticket reabierto: ${ticket.title}`,
        })
        return true
      } catch (e) {
        fail('reabrir el ticket', e)
        return false
      }
    },
    [supabase, sortTickets, logActivity, fail],
  )

  const deleteTicket = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('tickets').delete().eq('id', id)
        if (error) throw error
        setTickets((prev) => prev.filter((t) => t.id !== id))
        return true
      } catch (e) {
        fail('eliminar el ticket', e)
        return false
      }
    },
    [supabase, fail],
  )

  // -------------------------------------------------------------------
  // Seguimientos
  //
  // No se reordena en memoria como los tickets: acá el orden que importa es
  // el de los GRUPOS, y ese lo arma `agruparSeguimientos()` en cada render a
  // partir de la lista. Alcanza con que la lista tenga los datos correctos.
  // -------------------------------------------------------------------
  const addSeguimiento = React.useCallback(
    async (
      seguimiento: Omit<Seguimiento, 'id' | 'createdAt' | 'prospectoKey'>,
    ) => {
      try {
        const { data, error } = await supabase
          .from('seguimientos')
          .insert(seguimientoToRow(seguimiento))
          .select()
          .single()
        if (error) throw error
        setSeguimientos((prev) => [mapSeguimiento(data), ...prev])
        await logActivity({
          projectId: null,
          type: 'nota',
          message: `Seguimiento: ${seguimiento.kind.toLowerCase()} con ${seguimiento.prospecto}`,
        })
        return true
      } catch (e) {
        fail('guardar el seguimiento', e)
        return false
      }
    },
    [supabase, logActivity, fail],
  )

  const updateSeguimiento = React.useCallback(
    async (id: string, patch: Partial<Seguimiento>) => {
      try {
        const row = seguimientoToRow(patch)
        if (Object.keys(row).length === 0) return true
        const { data, error } = await supabase
          .from('seguimientos')
          .update(row)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        setSeguimientos((prev) =>
          prev.map((s) => (s.id === id ? mapSeguimiento(data) : s)),
        )
        return true
      } catch (e) {
        fail('guardar el seguimiento', e)
        return false
      }
    },
    [supabase, fail],
  )

  const deleteSeguimiento = React.useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('seguimientos')
          .delete()
          .eq('id', id)
        if (error) throw error
        setSeguimientos((prev) => prev.filter((s) => s.id !== id))
        return true
      } catch (e) {
        fail('eliminar el seguimiento', e)
        return false
      }
    },
    [supabase, fail],
  )

  // Sin memoizar, cada render del provider arma un objeto nuevo y despierta
  // a todas las pantallas que leen el store aunque no haya cambiado un dato.
  const value = React.useMemo<StoreValue>(
    () => ({
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
      fixedExpenses,
      tickets,
      seguimientos,
      cajaReady,
      gastosReady,
      ticketsReady,
      seguimientosReady,
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
      addFixedExpense,
      updateFixedExpense,
      deleteFixedExpense,
      addTicket,
      updateTicket,
      resolveTicket,
      reopenTicket,
      deleteTicket,
      addSeguimiento,
      updateSeguimiento,
      deleteSeguimiento,
      activateMaintenance,
      updateMaintenance,
      collectMaintenance,
    }),
    [
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
      fixedExpenses,
      tickets,
      seguimientos,
      cajaReady,
      gastosReady,
      ticketsReady,
      seguimientosReady,
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
      addFixedExpense,
      updateFixedExpense,
      deleteFixedExpense,
      addTicket,
      updateTicket,
      resolveTicket,
      reopenTicket,
      deleteTicket,
      addSeguimiento,
      updateSeguimiento,
      deleteSeguimiento,
      activateMaintenance,
      updateMaintenance,
      collectMaintenance,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

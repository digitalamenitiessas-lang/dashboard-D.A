'use client'

import * as React from 'react'
import { CircleDollarSign, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { DetailCard } from '@/components/proyectos/detail-parts'
import { useStore } from '@/lib/store'
import {
  committedMonthly,
  expenseEntries,
  fixedExpenseBoard,
} from '@/lib/gastos'
import { formatDate, formatMoney, relativeDays } from '@/lib/format'
import { formatMoneyByCurrency, isEmptyMoney } from '@/lib/money'
import { EXPENSE_KINDS, MAINTENANCE_FREQUENCIES } from '@/lib/types'
import type {
  Currency,
  ExpenseKind,
  FixedExpense,
  MaintenanceFrequency,
  Project,
} from '@/lib/types'

/**
 * Arranque por defecto del plan que se carga desde acá.
 *
 * El primer período vence HOY, no el 1: si el plan naciera con `dueDay = 1`
 * y `startedOn` a principio de mes, un costo cargado un día 6 aparecería
 * vencido hace cinco días sin que nadie deba nada. Y si hoy cae después del
 * 28 (tope del día de vencimiento, para que el día exista en febrero) el
 * plan arranca el mes que viene, por el mismo motivo.
 *
 * Es un default, no una verdad: el día real de facturación se corrige en
 * /gastos, que es donde vive el formulario completo del compromiso.
 */
function defaultSchedule(today = new Date()): {
  dueDay: number
  startedOn: string
} {
  const year = today.getFullYear()
  const month = today.getMonth()
  const day = today.getDate()
  const first = (y: number, m: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-01`
  if (day <= 28) return { dueDay: day, startedOn: first(year, month) }
  const next = new Date(year, month + 1, 1)
  return { dueDay: 1, startedOn: first(next.getFullYear(), next.getMonth()) }
}

/**
 * Los costos fijos imputados a un proyecto, con alta inline.
 *
 * Reemplaza a la vieja card de `infrastructure_costs`: es la MISMA carga
 * rápida de siempre, pero ahora escribe en `fixed_expenses`, o sea en el
 * mismo lugar que /gastos. Que existan dos tablas donde cargar un costo
 * recurrente es exactamente la forma en que dos pantallas terminan
 * contestando distinto la misma pregunta.
 *
 * Lo que se ve acá es el COMPROMISO. Lo que realmente se pagó son
 * movimientos, y el estado de cada período sale de cruzarlos: por eso el
 * board se arma con los entries SIN rango, si no un pago de agosto no
 * taparía el período de agosto y todo saldría en rojo.
 */
export function FixedCostsCard({ project }: { project: Project }) {
  const {
    fixedExpenses,
    movements,
    accounts,
    gastosReady,
    addFixedExpense,
    deleteFixedExpense,
  } = useStore()

  const [concept, setConcept] = React.useState('')
  const [kind, setKind] = React.useState<ExpenseKind>('Infraestructura')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>('Mensual')
  const [adding, setAdding] = React.useState(false)

  const board = React.useMemo(() => {
    const mine = fixedExpenses.filter((e) => e.projectId === project.id)
    return fixedExpenseBoard(mine, expenseEntries({ movements, accounts }))
  }, [fixedExpenses, movements, accounts, project.id])

  // Sólo los vigentes: un plan que ya se dio de baja no cuesta más nada.
  const monthly = committedMonthly(fixedExpenses, { projectId: project.id })

  // El vencimiento que va a generar lo que se cargue en el formulario.
  const { dueDay: proximoDia, startedOn: proximoInicio } = defaultSchedule()
  const firstDue = `${proximoInicio.slice(0, 7)}-${String(proximoDia).padStart(2, '0')}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!concept.trim() || !(Number(amount) > 0) || adding) return
    setAdding(true)
    const { dueDay, startedOn } = defaultSchedule()
    const ok = await addFixedExpense({
      concept: concept.trim(),
      kind,
      vendor: '',
      proveedorId: null,
      projectId: project.id,
      amount: Number(amount),
      currency,
      frequency,
      dueDay,
      startedOn,
      endedOn: null,
      notes: '',
    })
    setAdding(false)
    // Si falló, lo cargado queda en el formulario: el store ya avisó por qué.
    if (!ok) return
    setConcept('')
    setAmount('')
  }

  /**
   * Borrar es para el plan cargado mal hace treinta segundos. Un plan con
   * pagos no se borra —el FK es RESTRICT y el store lo explica en criollo—:
   * ése se da de baja con fecha de fin, desde /gastos. Por eso el deshacer
   * vuelve a crearlo tal cual (con otro id) y no toca ningún movimiento.
   */
  async function remove(plan: FixedExpense) {
    if (!(await deleteFixedExpense(plan.id))) return
    const { id: _id, ...campos } = plan
    toast.success('Costo fijo eliminado', {
      description: plan.concept,
      action: {
        label: 'Deshacer',
        onClick: () => void addFixedExpense(campos),
      },
    })
  }

  if (!gastosReady) {
    return (
      <DetailCard title="Costos fijos del proyecto" icon={CircleDollarSign}>
        <p className="py-2 text-sm text-muted-foreground">
          Falta correr{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
            supabase/10_gastos.sql
          </code>{' '}
          en la base. El resto del proyecto funciona normal mientras tanto.
        </p>
      </DetailCard>
    )
  }

  return (
    <DetailCard title="Costos fijos del proyecto" icon={CircleDollarSign}>
      {board.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Sin costos fijos cargados.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {board.map(({ expense: plan, next, overdue }) => (
            <li
              key={plan.id}
              className="group flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{plan.concept}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {plan.kind} · {plan.frequency}
                  {next ? (
                    <>
                      {' · Próximo: '}
                      <span
                        className={
                          next.state === 'vencido' ? 'text-red-300' : undefined
                        }
                      >
                        {relativeDays(next.dueDate)}
                      </span>
                    </>
                  ) : null}
                </p>
                {overdue.length > 0 ? (
                  <p className="text-xs text-red-300">
                    {overdue.length} período{overdue.length === 1 ? '' : 's'} sin
                    pagar
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {formatMoney(plan.amount, plan.currency)}
                </span>
                {/* Se esconde por PUNTERO, no por ancho: en un celular no hay
                    hover y `focus-visible` no dispara con un toque, así que
                    con `opacity-0` pelado el botón quedaba invisible pero
                    clickeable — o no podías borrar, o borrabas sin querer. */}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Eliminar costo fijo: ${plan.concept}`}
                  className="-mr-1 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
                  onClick={() => void remove(plan)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isEmptyMoney(monthly) ? (
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-muted-foreground">Equivalente mensual</span>
          <span className="font-semibold tabular-nums text-neon-violet">
            {formatMoneyByCurrency(monthly)}
          </span>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-2 pt-3">
        {/* El par completo `h-9 md:h-8`: 36px con el dedo (a tono con los
            SimpleSelect `sm`) y los 32px de siempre en desktop. Con `h-8`
            pelado twMerge se comía el escalón táctil del primitivo. */}
        <Input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Concepto (ej: Hosting Vercel)"
          className="h-9 md:h-8"
        />
        {/* `flex-wrap`: en 375px el importe y la moneda se llevan casi todo el
            ancho de la card y a la frecuencia le quedaban 19px de texto, o sea
            'Me…'. Ahora se baja a un renglón propio y desde sm entra todo en
            una sola fila como antes. */}
        <div className="flex flex-wrap items-center gap-2">
          <MoneyInput
            value={amount}
            onValueChange={setAmount}
            placeholder="0"
            className="h-9 w-24 shrink-0 tabular-nums md:h-8"
            aria-label="Importe"
          />
          <SimpleSelect
            value={currency}
            onValueChange={(v) => setCurrency(v as Currency)}
            options={toOptions(['USD', 'ARS', 'EUR'] as const)}
            size="sm"
            className="w-24 shrink-0"
          />
          <SimpleSelect
            value={frequency}
            onValueChange={(v) => setFrequency(v as MaintenanceFrequency)}
            options={toOptions(MAINTENANCE_FREQUENCIES)}
            size="sm"
            className="min-w-32 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <SimpleSelect
            value={kind}
            onValueChange={(v) => setKind(v as ExpenseKind)}
            options={toOptions(EXPENSE_KINDS)}
            size="sm"
          />
          <Button
            type="submit"
            size="icon-sm"
            variant="outline"
            disabled={adding || !concept.trim() || !(Number(amount) > 0)}
            aria-label="Agregar costo fijo"
          >
            <Plus />
          </Button>
        </div>
        {/* El primer vencimiento se dice acá y no se adivina: es el dato del
            que depende todo el calendario del plan, y nada tiene que nacer
            vencido sin que nadie deba nada. */}
        <p className="text-xs text-muted-foreground">
          Primer vencimiento: {formatDate(firstDue)}. El día exacto y la fecha
          de baja se ajustan en Gastos.
        </p>
      </form>
    </DetailCard>
  )
}

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { useStore } from '@/lib/store'
import {
  expenseEntries,
  expensePeriods,
  monthlyValue,
  todayIso,
} from '@/lib/gastos'
import { formatDate, formatMoney, relativeDays } from '@/lib/format'
import { EXPENSE_KINDS, MAINTENANCE_FREQUENCIES } from '@/lib/types'
import type {
  Currency,
  ExpenseKind,
  FixedExpense,
  MaintenanceFrequency,
} from '@/lib/types'

/** Primer día del mes de hoy: el mismo default que la columna en la base. */
const firstOfThisMonth = () => `${todayIso().slice(0, 7)}-01`

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * Alta y edición de un gasto comprometido: el servidor, el sueldo del
 * empleado, el contador.
 *
 * Dos cosas que este diálogo NO hace, y no es un olvido:
 *
 *   - No registra un pago. Pagar un período es un movimiento de Caja con
 *     `fixedExpenseId` + `periodStart`, y esa es la única vía de escritura a
 *     `money_movements` que existe. Si acá hubiera un segundo camino, el
 *     mismo hosting se podría contar dos veces.
 *   - No pregunta de qué cuenta sale. Un plan en USD con cuenta sugerida en
 *     pesos es la forma más corta de cargar 20 pesos donde iban 20 dólares:
 *     la cuenta se elige en cada pago, con la plata a la vista.
 *
 * Lo que sí hace, y es el motivo de que sea un diálogo y no tres inputs
 * sueltos: muestra EN VIVO el calendario que el plan va a generar. El campo
 * «desde» no es decorativo — de ahí sale todo el calendario —, así que
 * cargar un arranque de 2023 nace con treinta períodos en rojo. Mejor
 * enterarse antes de guardar que después, mirando una pantalla incendiada.
 */
export function FixedExpenseDialog({
  expense,
  defaultProjectId = null,
  open,
  onOpenChange,
}: {
  /** Omitido = alta. */
  expense?: FixedExpense
  /** Preselección para el alta desde la ficha de un proyecto. */
  defaultProjectId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    projects,
    accounts,
    movements,
    proveedores,
    gastosReady,
    addFixedExpense,
    updateFixedExpense,
    deleteFixedExpense,
  } = useStore()
  const editing = Boolean(expense)

  const [concept, setConcept] = React.useState(expense?.concept ?? '')
  // El proveedor dejó de ser texto libre: ahora es una entidad. El campo
  // viejo (`vendor`) se sigue leyendo para las filas que no se migraron,
  // pero no se escribe más.
  const [proveedorId, setProveedorId] = React.useState(
    expense?.proveedorId ?? '',
  )
  const [kind, setKind] = React.useState<ExpenseKind>(expense?.kind ?? 'Otros')
  const [amount, setAmount] = React.useState(
    expense ? String(expense.amount) : '',
  )
  const [currency, setCurrency] = React.useState<Currency>(
    expense?.currency ?? 'ARS',
  )
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>(
    expense?.frequency ?? 'Mensual',
  )
  const [dueDay, setDueDay] = React.useState(String(expense?.dueDay ?? 1))
  const [startedOn, setStartedOn] = React.useState(
    expense?.startedOn ?? firstOfThisMonth(),
  )
  const [endedOn, setEndedOn] = React.useState(expense?.endedOn ?? '')
  const [projectId, setProjectId] = React.useState(
    expense?.projectId ?? defaultProjectId ?? '',
  )
  const [notes, setNotes] = React.useState(expense?.notes ?? '')
  const [saving, setSaving] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const amountNumber = Number(amount)
  const dueDayNumber = Number(dueDay)
  const validAmount = amountNumber > 0
  const validDueDay =
    Number.isInteger(dueDayNumber) && dueDayNumber >= 1 && dueDayNumber <= 28
  const validStart = startedOn.length === 10
  // Espeja el check `fixed_expenses_window` de la base: mejor decirlo acá que
  // dejar que vuelva como un error de Postgres.
  const windowOk = !endedOn || (validStart && endedOn >= startedOn)
  const valid =
    concept.trim().length > 0 && validAmount && validDueDay && validStart && windowOk

  /**
   * Los pagos ya registrados, sin filtrar por rango: el calendario mira toda
   * la historia, porque un pago de agosto tiene que tapar el período de
   * agosto aunque estemos en diciembre.
   */
  const entries = React.useMemo(
    () => expenseEntries({ movements, accounts }),
    [movements, accounts],
  )

  /**
   * El plan tal como quedaría si se guardara ahora mismo. Se arma en cada
   * render y se le pide el calendario a la misma función que usa la
   * pantalla: la previsualización no puede tener su propia aritmética, o
   * mostraría un futuro que después no se cumple.
   */
  const preview = React.useMemo(() => {
    if (!validStart || !validDueDay || !windowOk) return null
    const candidate: FixedExpense = {
      id: expense?.id ?? '',
      concept: concept.trim(),
      kind,
      vendor: expense?.vendor ?? '',
      proveedorId: proveedorId || null,
      projectId: projectId || null,
      amount: validAmount ? amountNumber : 0,
      currency,
      frequency,
      dueDay: dueDayNumber,
      startedOn,
      endedOn: endedOn || null,
      notes,
    }
    const periods = expensePeriods(candidate, entries)
    if (periods.length === 0) return null

    const overdue = periods.filter((p) => p.state === 'vencido')
    const paid = periods.filter((p) => p.state === 'pagado')
    const next = overdue[0] ?? periods.find((p) => p.state !== 'pagado') ?? null

    // Pagos de este plan que el calendario nuevo ya no reconoce: mover el
    // «desde» reacomoda todos los períodos y los deja colgando.
    const mine = expense
      ? entries.filter((e) => e.fixedExpenseId === expense.id)
      : []
    const orphans = mine.filter(
      (e) => !periods.some((p) => p.periodStart === e.periodStart),
    )

    return {
      first: periods[0],
      next,
      overdue,
      paid,
      orphans,
      monthly: monthlyValue(candidate),
    }
  }, [
    entries,
    expense,
    concept,
    kind,
    proveedorId,
    projectId,
    amountNumber,
    validAmount,
    currency,
    frequency,
    dueDayNumber,
    validDueDay,
    startedOn,
    endedOn,
    notes,
    validStart,
    windowOk,
  ])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving || !gastosReady) return
    setSaving(true)
    const payload = {
      concept: concept.trim(),
      kind,
      vendor: expense?.vendor ?? '',
      proveedorId: proveedorId || null,
      projectId: projectId || null,
      amount: amountNumber,
      currency,
      frequency,
      dueDay: dueDayNumber,
      startedOn,
      // Vacío es «sigue vigente», y eso en la base es null, no ''.
      endedOn: endedOn || null,
      notes: notes.trim(),
    }
    const ok = expense
      ? await updateFixedExpense(expense.id, payload)
      : await addFixedExpense(payload)
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editing ? 'Gasto fijo actualizado' : 'Gasto fijo creado', {
      description: payload.concept,
    })
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!expense || saving) return
    setSaving(true)
    const ok = await deleteFixedExpense(expense.id)
    setSaving(false)
    // Si tiene pagos, el FK es RESTRICT y el store ya avisó que la salida es
    // ponerle fecha de fin. El diálogo se queda abierto para que se pueda.
    if (!ok) return
    setConfirmingDelete(false)
    toast.success('Gasto fijo eliminado', { description: expense.concept })
    onOpenChange(false)
  }

  const projectName = projects.find((p) => p.id === projectId)?.name

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
            </DialogTitle>
            <DialogDescription>
              Es un compromiso, no plata que salió. Cada pago se registra
              después, desde Caja, eligiendo qué período salda.
            </DialogDescription>
          </DialogHeader>
          {/* El footer va FUERA del <form> para que sea hijo directo del
              DialogContent y quede clavado abajo del marco, arriba del
              teclado. El submit se mantiene con el par id/form del botón. */}
          <form id="fx-form" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="fx-concept">Concepto</FieldLabel>
                <Input
                  id="fx-concept"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Hosting Vercel / Sueldo de Juan"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fx-vendor">Proveedor</FieldLabel>
                  <SimpleSelect
                    id="fx-vendor"
                    value={proveedorId}
                    onValueChange={setProveedorId}
                    placeholder={
                      proveedores.length === 0
                        ? 'Todavía no hay proveedores'
                        : 'Sin proveedor'
                    }
                    options={[
                      { value: '', label: 'Sin proveedor' },
                      ...proveedores.map((p) => ({
                        value: p.id,
                        label: p.nombre,
                      })),
                    ]}
                  />
                  {/* La fila vieja puede tener el nombre como texto y todavía
                      sin enlazar: se muestra para que se vea qué había. */}
                  {!proveedorId && expense?.vendor ? (
                    <p className="text-xs text-muted-foreground">
                      Antes decía «{expense.vendor}». Elegilo de la lista o
                      creá el proveedor desde su sección.
                    </p>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="fx-kind">Rubro</FieldLabel>
                  <SimpleSelect
                    id="fx-kind"
                    value={kind}
                    onValueChange={(v) => setKind(v as ExpenseKind)}
                    options={toOptions(EXPENSE_KINDS)}
                  />
                </Field>
              </div>

              {/* Los dos rubros que se prestan a contar plata dos veces. */}
              {kind === 'Sueldos' ? (
                <p className="text-xs text-muted-foreground text-pretty">
                  Sueldos es el del empleado. Lo que se llevan los socios no es
                  un gasto: es un movimiento categoría Retiro a la cuenta de
                  Retiros, y cargarlo acá contaría esa plata dos veces.
                </p>
              ) : null}
              {kind === 'Comisiones por venta' ? (
                <p className="text-xs text-muted-foreground text-pretty">
                  Una comisión por venta rara vez es un compromiso mensual: es
                  un costo directo de un proyecto puntual y se carga como gasto
                  suelto desde Caja, imputado a ese proyecto.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fx-amount">Monto por período</FieldLabel>
                  <MoneyInput
                    id="fx-amount"
                    value={amount}
                    onValueChange={setAmount}
                    placeholder="0"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fx-currency">Moneda</FieldLabel>
                  <SimpleSelect
                    id="fx-currency"
                    value={currency}
                    onValueChange={(v) => setCurrency(v as Currency)}
                    options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fx-frequency">Frecuencia</FieldLabel>
                  <SimpleSelect
                    id="fx-frequency"
                    value={frequency}
                    onValueChange={(v) =>
                      setFrequency(v as MaintenanceFrequency)
                    }
                    options={toOptions(MAINTENANCE_FREQUENCIES)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fx-due-day">Vence el día</FieldLabel>
                  <Input
                    id="fx-due-day"
                    type="number"
                    min={1}
                    max={28}
                    step={1}
                    inputMode="numeric"
                    className="tabular-nums"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    aria-describedby="fx-due-day-hint"
                  />
                </Field>
              </div>
              <p
                id="fx-due-day-hint"
                className={`text-xs text-pretty ${
                  validDueDay ? 'text-muted-foreground' : 'text-red-300'
                }`}
              >
                Del 1 al 28, para que el día exista también en febrero. El
                vencimiento es siempre dentro del mes en que arranca el
                período: si el hosting de septiembre se paga en octubre, corré
                el «desde» un mes en vez de inventar un desfasaje.
              </p>

              <Field>
                <FieldLabel htmlFor="fx-project">Imputado a</FieldLabel>
                <SimpleSelect
                  id="fx-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Estructura (ningún proyecto)"
                  options={[
                    { value: '', label: 'Estructura (ningún proyecto)' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
              <p className="text-xs text-muted-foreground text-pretty">
                {projectId
                  ? `Costo directo de ${projectName ?? 'ese proyecto'}: si el proyecto se borra, este plan se va con él.`
                  : 'Estructura: el costo de tener la empresa abierta. No se prorratea sobre los proyectos.'}
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="fx-started">Desde</FieldLabel>
                  <Input
                    id="fx-started"
                    type="date"
                    value={startedOn}
                    onChange={(e) => setStartedOn(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fx-ended">Hasta (opcional)</FieldLabel>
                  <Input
                    id="fx-ended"
                    type="date"
                    value={endedOn}
                    onChange={(e) => setEndedOn(e.target.value)}
                  />
                </Field>
              </div>

              {!windowOk ? (
                <p className="text-xs text-red-300 text-pretty">
                  La fecha de fin no puede ser anterior al inicio.
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground text-pretty">
                    Dar de baja es poner una fecha de fin, no borrar: los pagos
                    anteriores quedan intactos y el plan deja de generar
                    vencimientos.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setEndedOn(endedOn ? '' : todayIso())}
                  >
                    {endedOn ? 'Reactivar' : 'Dar de baja hoy'}
                  </Button>
                </div>
              )}

              {/* ---------------------------------------------------------
                  El calendario que este plan va a generar, en vivo.
                  --------------------------------------------------------- */}
              {preview ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Primer vencimiento
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                      {formatDate(preview.first.dueDate)}
                    </span>
                  </div>
                  {preview.next ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {preview.overdue.length > 0
                          ? 'Lo primero a pagar'
                          : 'Próximo a pagar'}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {formatDate(preview.next.dueDate)}{' '}
                        <span className="font-normal text-muted-foreground">
                          ({relativeDays(preview.next.dueDate)})
                        </span>
                      </span>
                    </div>
                  ) : null}
                  {frequency !== 'Mensual' && validAmount ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        Equivalente mensual
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {formatMoney(preview.monthly.amount, currency)}
                      </span>
                    </div>
                  ) : null}
                  {preview.paid.length > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        Períodos ya pagados
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-emerald-300">
                        {preview.paid.length}
                      </span>
                    </div>
                  ) : null}

                  {preview.overdue.length > 0 ? (
                    <p className="mt-1 text-amber-300 text-pretty">
                      Nace con{' '}
                      <span className="font-semibold tabular-nums">
                        {plural(
                          preview.overdue.length,
                          'período vencido',
                          'períodos vencidos',
                        )}
                      </span>
                      {validAmount ? (
                        <>
                          {' '}
                          ={' '}
                          <span className="font-semibold tabular-nums">
                            {formatMoney(
                              preview.overdue.length * amountNumber,
                              currency,
                            )}
                          </span>{' '}
                          sin registrar
                        </>
                      ) : null}
                      , desde {formatDate(preview.overdue[0].dueDate)}. Van a
                      quedar en rojo hasta que se carguen los pagos. Si en
                      realidad empezás a pagarlo ahora, corré el «desde» al mes
                      en curso.
                    </p>
                  ) : null}

                  {preview.orphans.length > 0 ? (
                    <p className="mt-1 text-red-300 text-pretty">
                      {plural(preview.orphans.length, 'pago', 'pagos')} ya
                      registrados no caen en ningún período de este calendario:
                      moviste el inicio o la frecuencia y quedaron colgados. La
                      plata sigue descontada de la cuenta, pero deja de tapar
                      el período que tapaba.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Field>
                <FieldLabel htmlFor="fx-notes">Notas</FieldLabel>
                <Textarea
                  id="fx-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </Field>

              {!gastosReady ? (
                <p className="text-xs text-amber-300 text-pretty">
                  Falta correr <code>supabase/10_gastos.sql</code> en la base:
                  hasta entonces no hay dónde guardar un gasto fijo.
                </p>
              ) : null}
            </FieldGroup>
          </form>

          {/* `flex-col` (no el `flex-col-reverse` de la base) para que en el
              celular se respete el orden del DOM: Eliminar arriba y Guardar
              al pie, que es donde cae el pulgar. Sin gasto que borrar no hay
              nada que separar, así que el grupo vuelve a la derecha. */}
          <DialogFooter
            className={`mt-6 flex-col sm:flex-row ${
              editing ? 'sm:justify-between' : ''
            }`}
          >
            {editing ? (
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => setConfirmingDelete(true)}
                className="mt-4 sm:mt-0"
              >
                Eliminar
              </Button>
            ) : null}
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="flex-1 sm:flex-none"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="fx-form"
                disabled={saving || !valid || !gastosReady}
                className="flex-1 sm:flex-none"
              >
                {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar un plan es para el que se cargó mal hace dos minutos. El que
          ya tiene pagos no se borra: la base lo frena con el FK y lo que
          corresponde es la fecha de fin, que conserva el historial. */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar el gasto fijo?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="text-sm font-medium">{expense?.concept}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(expense?.amount ?? 0, expense?.currency)}
              </span>{' '}
              {expense?.frequency.toLowerCase()}, vence el día{' '}
              <span className="tabular-nums">{expense?.dueDay}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground text-pretty">
              {preview && preview.paid.length > 0
                ? `Tiene ${plural(preview.paid.length, 'período pagado', 'períodos pagados')}: la base no lo va a dejar borrar. Cerrá esto y ponele una fecha de fin — el plan deja de generar vencimientos y los pagos quedan donde están.`
                : 'No tiene pagos registrados todavía, así que no se pierde ninguna plata cargada. Si en algún momento se pagó, dale de baja con una fecha de fin en vez de borrarlo.'}
            </p>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              No, dejarlo
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              {saving ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

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
import { AccountSelect } from '@/components/caja/account-select'
import { useStore } from '@/lib/store'
import { formatDate, formatMoney, formatMoneyWithCode, todayIso } from '@/lib/format'
import {
  expenseEntries,
  expensePeriods,
  isActiveOn,
  payablePeriods,
  type ExpensePeriod,
} from '@/lib/gastos'
import { EXPENSE_KINDS, MOVEMENT_CATEGORIES } from '@/lib/types'
import type { ExpenseKind, MoneyMovement, MovementCategory } from '@/lib/types'

const round = (n: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

/**
 * Rates need far more precision than amounts: USD→ARS is ~1450, but the
 * same swap the other way round is ~0,00069.
 */
const asRate = (n: number) => String(round(n, 6))
const asAmount = (n: number) => String(round(n, 2))

/**
 * Which sides of a movement each category uses. This is the whole reason
 * the form stays readable: a gasto only ever asks where the money left
 * from, an ingreso only where it landed.
 *
 * El Ajuste usa los dos lados y no exige ninguno: una corrección de saldo
 * puede ir para arriba (entra a) o para abajo (sale de). Hasta hace poco
 * sólo tenía el lado de entrada, así que para bajar un saldo había que
 * cargar un 'Gasto' — y eso mete en el reporte de gastos plata que nunca se
 * gastó. Es la ÚNICA categoría con los dos lados opcionales: ver `sidesOk`.
 */
const shape: Record<MovementCategory, { from: boolean; to: boolean }> = {
  'Cambio de moneda': { from: true, to: true },
  Transferencia: { from: true, to: true },
  Gasto: { from: true, to: false },
  Retiro: { from: true, to: true },
  Inversión: { from: true, to: true },
  'Ingreso extra': { from: false, to: true },
  Ajuste: { from: true, to: true },
}

const hint: Record<MovementCategory, string> = {
  'Cambio de moneda': 'Sale de una cuenta y entra en otra moneda.',
  Transferencia: 'Mover plata entre dos cuentas propias.',
  Gasto: 'Plata que sale para afuera: hosting, impuestos, servicios.',
  Retiro: 'Lo que se llevan ustedes, a la cuenta de Retiros.',
  Inversión: 'Compra de cheques o cualquier plata que queda invertida.',
  'Ingreso extra': 'Plata que entra y no viene de un cobro de proyecto.',
  Ajuste:
    'Corrección de saldo cuando la cuenta no cierra: completá un solo lado, el de arriba para bajarla y el de abajo para subirla.',
}

/**
 * «Sale de» para un Gasto: las mismas cuentas que `AccountSelect`, pero sin
 * las de tipo Retiros.
 *
 * No va adentro de `AccountSelect` porque la regla es de esta categoría y de
 * ninguna otra: en un Retiro esa cuenta es justamente el destino correcto.
 * Es la mitad barata de la defensa contra el doble conteo — la plata que ya
 * se repartieron los socios no puede volver a salir como gasto de la
 * empresa. Importa más desde que los socios cobran por retiro y el empleado
 * por sueldo: los dos se parecen y uno solo es gasto.
 *
 * `keepId` es la cuenta que el movimiento YA tenía guardada. Se ofrece
 * aunque sea de Retiros (o esté archivada) porque si no, editar uno mal
 * cargado mostraría el campo vacío mintiendo sobre lo que hay en la base.
 * Los que están así los lista el cartel de /gastos, y se arreglan pasándolos
 * a categoría Retiro.
 */
function ExpenseFromSelect({
  id,
  value,
  onValueChange,
  excludeId,
  keepId,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  excludeId?: string
  keepId?: string
}) {
  const { accounts } = useStore()

  const options = accounts
    .filter((a) => a.id !== excludeId)
    .filter((a) => a.id === keepId || (!a.archived && a.kind !== 'Retiros'))
    .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))

  return (
    <SimpleSelect
      id={id}
      value={value}
      onValueChange={onValueChange}
      placeholder={options.length === 0 ? 'Sin cuentas' : 'Elegir cuenta'}
      options={options}
    />
  )
}

/** Cómo se lee un período en el select: por su vencimiento, no por su clave. */
function periodLabel(p: ExpensePeriod): string {
  const base = `Vence ${formatDate(p.dueDate)}`
  if (p.state === 'vencido') {
    const n = p.daysLate ?? 0
    return `${base} · vencido hace ${n} ${n === 1 ? 'día' : 'días'}`
  }
  return base
}

/**
 * Valores con los que abrir el diálogo ya cargado.
 *
 * Lo usa el botón «Pagar» de /gastos: en vez de un formulario propio —que
 * sería una segunda vía de escribir en `money_movements`, y con eso la mitad
 * del doble conteo— abre este mismo con el plan y el período puestos. El
 * rubro y el proyecto no viajan acá: salen del plan, que es de donde tienen
 * que salir para no poder contradecirlo.
 */
export interface MovementPreset {
  category?: MovementCategory
  fixedExpenseId?: string
  /** Si falta, se preselecciona el vencido más viejo del plan. */
  periodStart?: string
  concept?: string
}

export function MovementDialog({
  movement,
  preset,
  open,
  onOpenChange,
}: {
  /** Omit to create a new one. */
  movement?: MoneyMovement
  /** Sólo se lee al montar; el diálogo se monta con `key` al abrirse. */
  preset?: MovementPreset
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    accounts,
    projects,
    movements,
    fixedExpenses,
    gastosReady,
    addMovement,
    updateMovement,
    deleteMovement,
  } = useStore()
  const editing = Boolean(movement)
  const hoy = todayIso()

  // Los gastos ya registrados, SIN filtrar por rango: el calendario de un
  // plan necesita ver los pagos de meses anteriores. Con un rango de un mes,
  // el pago de agosto no taparía el período de agosto y el select ofrecería
  // pagarlo de nuevo.
  const entries = React.useMemo(
    () => expenseEntries({ movements, accounts }),
    [movements, accounts],
  )

  // El plan que viene preseteado desde /gastos, si hay. Se resuelve una vez,
  // antes de los estados iniciales.
  const presetPlan =
    fixedExpenses.find((e) => e.id === preset?.fixedExpenseId) ?? null

  const [category, setCategory] = React.useState<MovementCategory>(
    movement?.category ?? preset?.category ?? 'Cambio de moneda',
  )
  const [movedOn, setMovedOn] = React.useState(movement?.movedOn ?? todayIso())
  const [concept, setConcept] = React.useState(
    movement?.concept ?? preset?.concept ?? '',
  )
  const [fromId, setFromId] = React.useState(movement?.fromAccountId ?? '')
  const [amountOut, setAmountOut] = React.useState(
    movement ? String(movement.amountOut) : '',
  )
  const [toId, setToId] = React.useState(movement?.toAccountId ?? '')
  const [amountIn, setAmountIn] = React.useState(
    movement ? String(movement.amountIn) : '',
  )
  const [rate, setRate] = React.useState(
    movement && movement.amountOut > 0 && movement.amountIn > 0
      ? asRate(movement.amountIn / movement.amountOut)
      : '',
  )
  const [projectId, setProjectId] = React.useState(
    movement?.projectId ?? presetPlan?.projectId ?? '',
  )
  const [notes, setNotes] = React.useState(movement?.notes ?? '')

  // --- Gasto: rubro, plan y período ------------------------------------
  const [kind, setKind] = React.useState<ExpenseKind | ''>(
    movement?.expenseKind ?? presetPlan?.kind ?? '',
  )
  const [planId, setPlanId] = React.useState(
    movement?.fixedExpenseId ?? presetPlan?.id ?? '',
  )
  const [period, setPeriod] = React.useState(
    movement?.periodStart ??
      preset?.periodStart ??
      (presetPlan ? (payablePeriods(presetPlan, entries)[0]?.periodStart ?? '') : ''),
  )

  const [saving, setSaving] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const sides = shape[category]
  const fromAccount = accounts.find((a) => a.id === fromId)
  const toAccount = accounts.find((a) => a.id === toId)

  const isGasto = category === 'Gasto'
  const isAjuste = category === 'Ajuste'
  /** Los tres campos de gasto sólo existen si la migración 10 está corrida. */
  const showGasto = isGasto && gastosReady

  const plan = fixedExpenses.find((e) => e.id === planId) ?? null

  // Same currency on both sides means it's one amount, not two.
  // En un Ajuste no: los dos lados son alternativos, no las dos patas de una
  // misma operación, así que enlazar los montos escribiría un lado que el
  // usuario no cargó.
  const sameCurrency =
    sides.from &&
    sides.to &&
    !isAjuste &&
    !!fromAccount &&
    !!toAccount &&
    fromAccount.currency === toAccount.currency

  React.useEffect(() => {
    if (sameCurrency) setAmountIn(amountOut)
  }, [sameCurrency, amountOut])

  // Misma razón para la cotización: en una corrección de saldo no hay
  // conversión de nada, hay dos casillas y se usa una.
  const crossCurrency =
    sides.from &&
    sides.to &&
    !isAjuste &&
    !!fromAccount &&
    !!toAccount &&
    !sameCurrency

  // Amount, rate and result are three views of the same operation, so
  // editing any one of them keeps the other two honest. Whichever two the
  // user happens to know is the pair they can type.
  function changeAmountOut(value: string) {
    setAmountOut(value)
    if (!crossCurrency) return
    const nextOut = Number(value)
    if (nextOut <= 0) return
    if (Number(rate) > 0) setAmountIn(asAmount(nextOut * Number(rate)))
    else if (Number(amountIn) > 0) setRate(asRate(Number(amountIn) / nextOut))
  }

  function changeRate(value: string) {
    setRate(value)
    const nextRate = Number(value)
    const nextOut = Number(amountOut)
    if (nextRate > 0 && nextOut > 0) setAmountIn(asAmount(nextOut * nextRate))
  }

  function changeAmountIn(value: string) {
    setAmountIn(value)
    if (!crossCurrency) return
    const nextIn = Number(value)
    const nextOut = Number(amountOut)
    if (nextIn > 0 && nextOut > 0) setRate(asRate(nextIn / nextOut))
  }

  function changeCategory(next: MovementCategory) {
    setCategory(next)
    // Un Gasto no puede salir de la cuenta de Retiros. Si venía elegida de
    // otra categoría hay que soltarla, o el campo mostraría el placeholder
    // con un id cargado abajo.
    if (
      next === 'Gasto' &&
      fromId !== movement?.fromAccountId &&
      accounts.find((a) => a.id === fromId)?.kind === 'Retiros'
    ) {
      setFromId('')
    }
  }

  /**
   * Los períodos que se pueden elegir: `payablePeriods()` más el que este
   * mismo movimiento ya salda. Ese está 'pagado' justamente por él, así que
   * sin la excepción editar un pago abriría el select vacío y guardar le
   * borraría el período al plan.
   */
  const periodOptions = React.useMemo(() => {
    if (!plan) return []
    const own =
      movement && movement.fixedExpenseId === plan.id ? movement.periodStart : null
    return expensePeriods(plan, entries).filter(
      (p) => p.state !== 'pagado' || p.periodStart === own,
    )
  }, [plan, entries, movement])

  /**
   * Elegir un plan hereda el rubro y el proyecto (visibles y editables: el
   * plan sugiere, no manda) y preselecciona el vencido más viejo, que es lo
   * que corresponde saldar cuando hay mora.
   */
  function changePlan(id: string) {
    setPlanId(id)
    const next = fixedExpenses.find((e) => e.id === id) ?? null
    if (!next) {
      setPeriod('')
      return
    }
    setPeriod(payablePeriods(next, entries)[0]?.periodStart ?? '')
    setKind(next.kind)
    setProjectId(next.projectId ?? '')
    suggestAmount(next, fromAccount?.currency, true)
  }

  /**
   * El monto sugerido sale del plan SÓLO si la cuenta elegida está en la
   * misma moneda. Lo que se guarda es lo que realmente salió, en la moneda
   * de esa cuenta: escribir 20 en una cuenta en pesos porque el plan dice
   * USD 20 es la forma más corta de cargar veinte pesos donde iban veinte
   * dólares. Si no coinciden, el campo queda vacío y arriba se muestra el
   * comprometido para que se convierta a mano.
   */
  function suggestAmount(
    forPlan: { amount: number; currency: string },
    accountCurrency: string | undefined,
    force: boolean,
  ) {
    const matches = !!accountCurrency && accountCurrency === forPlan.currency
    if (matches) {
      if (force || !(Number(amountOut) > 0)) setAmountOut(asAmount(forPlan.amount))
      return
    }
    // No pisa un monto tipeado a mano: sólo limpia la sugerencia que dejó de
    // valer al cambiar de moneda.
    if (force || Number(amountOut) === forPlan.amount) setAmountOut('')
  }

  function changeFrom(id: string) {
    setFromId(id)
    if (!plan) return
    suggestAmount(plan, accounts.find((a) => a.id === id)?.currency, false)
  }

  const out = Number(amountOut)
  const income = Number(amountIn)

  // Un lado cargado a medias (cuenta sin monto) es un renglón basura: se
  // pide entero o vacío.
  const fromWhole = !!fromId && out > 0
  const toWhole = !!toId && income > 0
  const fromEmpty = !fromId && !(out > 0)
  const toEmpty = !toId && !(income > 0)

  /**
   * El Ajuste, y sólo el Ajuste, se conforma con un lado. Las otras seis
   * categorías siguen exigiendo los dos lados que declara `shape`: una
   * Transferencia guardada a medio cargar haría desaparecer plata entre dos
   * cuentas propias, que es exactamente el error que Caja existe para no
   * cometer.
   */
  const sidesOk = isAjuste
    ? (fromWhole || toWhole) && (fromWhole || fromEmpty) && (toWhole || toEmpty)
    : (!sides.from || fromWhole) && (!sides.to || toWhole)

  // Rubro obligatorio en los gastos nuevos. En los viejos no: nacieron sin la
  // columna y se clasifican desde el cartel de /gastos, no a la fuerza acá.
  // Y un pago imputado a un plan siempre dice qué período salda — lo pide la
  // base, así que mejor frenarlo antes que traducir el error después.
  const gastoOk =
    !showGasto || ((editing || kind !== '') && (!planId || period !== ''))

  const valid = Boolean(movedOn) && sidesOk && fromId !== toId && gastoOk

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    // Las tres claves de gasto viajan como `undefined` —no `null`— mientras
    // falte la migración: `pick()` descarta undefined, la clave no sale en el
    // payload y PostgREST no rechaza el movimiento ENTERO con PGRST204 contra
    // una base sin las columnas. El tipo las declara requeridas, así que el
    // cast vive acá, que es el único lugar donde «la columna todavía no
    // existe» es un caso conocido.
    const payload = {
      movedOn,
      category,
      concept: concept.trim(),
      fromAccountId: sides.from && fromId ? fromId : null,
      amountOut: sides.from && fromId ? out : 0,
      toAccountId: sides.to && toId ? toId : null,
      amountIn: sides.to && toId ? income : 0,
      projectId: projectId || null,
      notes: notes.trim(),
      expenseKind: gastosReady ? (isGasto ? kind || null : null) : undefined,
      fixedExpenseId: gastosReady ? (isGasto ? planId || null : null) : undefined,
      periodStart: gastosReady
        ? isGasto && planId
          ? period || null
          : null
        : undefined,
    } as Omit<MoneyMovement, 'id'>

    const ok = movement
      ? await updateMovement(movement.id, payload)
      : await addMovement(payload)
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editing ? 'Movimiento actualizado' : 'Movimiento registrado')
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!movement || saving) return
    setSaving(true)
    const ok = await deleteMovement(movement.id)
    setSaving(false)
    if (!ok) return
    setConfirmingDelete(false)
    toast.success('Movimiento eliminado')
    onOpenChange(false)
  }

  // Lo que el borrado le devuelve a cada cuenta, para poder mostrarlo antes
  // de tocar nada: los saldos son derivados, así que borrar acá los reescribe.
  const savedFrom = accounts.find((a) => a.id === movement?.fromAccountId)
  const savedTo = accounts.find((a) => a.id === movement?.toAccountId)

  // Los planes que se pueden pagar hoy, más el que el movimiento ya tenía
  // (un plan dado de baja sigue apareciendo mientras se edita su pago).
  const planOptions = fixedExpenses
    .filter((e) => isActiveOn(e, hoy) || e.id === planId)
    .map((e) => ({
      value: e.id,
      label: `${e.concept} · ${formatMoneyWithCode(e.amount, e.currency)}`,
    }))

  const currencyMismatch =
    !!plan && !!fromAccount && fromAccount.currency !== plan.currency

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar movimiento' : 'Registrar movimiento'}
            </DialogTitle>
            <DialogDescription>{hint[category]}</DialogDescription>
          </DialogHeader>
          {/* El footer va FUERA del <form> para que sea hijo directo del
              DialogContent y quede clavado abajo del marco, arriba del
              teclado. El submit se mantiene con el par id/form del botón. */}
          <form id="mov-form" onSubmit={submit}>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="mov-category">Tipo</FieldLabel>
                  <SimpleSelect
                    id="mov-category"
                    value={category}
                    onValueChange={(v) => changeCategory(v as MovementCategory)}
                    options={toOptions(MOVEMENT_CATEGORIES)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mov-date">Fecha</FieldLabel>
                  <Input
                    id="mov-date"
                    type="date"
                    value={movedOn}
                    onChange={(e) => setMovedOn(e.target.value)}
                  />
                </Field>
              </div>

              {showGasto ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="mov-kind">Rubro</FieldLabel>
                    <SimpleSelect
                      id="mov-kind"
                      value={kind}
                      onValueChange={(v) => setKind(v as ExpenseKind)}
                      placeholder="Elegir rubro"
                      options={toOptions(EXPENSE_KINDS)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="mov-plan">
                      ¿Paga un gasto fijo?
                    </FieldLabel>
                    <SimpleSelect
                      id="mov-plan"
                      value={planId}
                      onValueChange={changePlan}
                      placeholder="Ninguno"
                      options={[
                        { value: '', label: 'Ninguno — gasto suelto' },
                        ...planOptions,
                      ]}
                    />
                  </Field>

                  {plan ? (
                    <Field>
                      <FieldLabel htmlFor="mov-period">¿Qué período?</FieldLabel>
                      {periodOptions.length > 0 ? (
                        <SimpleSelect
                          id="mov-period"
                          value={period}
                          onValueChange={setPeriod}
                          placeholder="Elegir período"
                          options={periodOptions.map((p) => ({
                            value: p.periodStart,
                            label: periodLabel(p),
                          }))}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground text-pretty">
                          Este gasto fijo no tiene ningún período por pagar. Si
                          igual salió plata, cargala como gasto suelto.
                        </p>
                      )}
                    </Field>
                  ) : null}

                  {plan ? (
                    <p className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground text-pretty">
                      <span className="font-medium tabular-nums text-foreground">
                        Comprometido: {formatMoneyWithCode(plan.amount, plan.currency)}
                      </span>{' '}
                      por período.{' '}
                      {currencyMismatch
                        ? `La cuenta elegida está en ${fromAccount?.currency}: poné lo que salió de verdad, que es lo que se guarda.`
                        : 'Si salió otro monto, corregilo: se guarda lo que salió, no lo comprometido.'}
                    </p>
                  ) : null}
                </>
              ) : null}

              {sides.from ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mov-from">Sale de</FieldLabel>
                    {isGasto ? (
                      <ExpenseFromSelect
                        id="mov-from"
                        value={fromId}
                        onValueChange={changeFrom}
                        excludeId={toId || undefined}
                        keepId={movement?.fromAccountId ?? undefined}
                      />
                    ) : (
                      <AccountSelect
                        id="mov-from"
                        value={fromId}
                        onValueChange={changeFrom}
                        excludeId={toId || undefined}
                        allowNone={isAjuste}
                        noneLabel="No corresponde"
                      />
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mov-out">
                      Monto{fromAccount ? ` (${fromAccount.currency})` : ''}
                    </FieldLabel>
                    <MoneyInput
                      id="mov-out"
                      value={amountOut}
                      onValueChange={changeAmountOut}
                      placeholder="0"
                    />
                  </Field>
                </div>
              ) : null}

              {crossCurrency ? (
                <Field>
                  <FieldLabel htmlFor="mov-rate">
                    Cotización — 1 {fromAccount?.currency} en{' '}
                    {toAccount?.currency}
                  </FieldLabel>
                  <MoneyInput
                    id="mov-rate"
                    value={rate}
                    onValueChange={changeRate}
                    decimals={6}
                    placeholder="0"
                  />
                </Field>
              ) : null}

              {sides.to ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mov-to">Entra a</FieldLabel>
                    <AccountSelect
                      id="mov-to"
                      value={toId}
                      onValueChange={setToId}
                      excludeId={fromId || undefined}
                      allowNone={isAjuste}
                      noneLabel="No corresponde"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mov-in">
                      Monto{toAccount ? ` (${toAccount.currency})` : ''}
                    </FieldLabel>
                    <MoneyInput
                      id="mov-in"
                      value={amountIn}
                      onValueChange={changeAmountIn}
                      placeholder="0"
                      disabled={sameCurrency}
                    />
                  </Field>
                </div>
              ) : null}

              {crossCurrency && out > 0 && income > 0 ? (
                <p className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground text-pretty">
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(out, fromAccount?.currency)} →{' '}
                    {formatMoney(income, toAccount?.currency)}
                  </span>{' '}
                  — completá dos de los tres campos y el tercero se calcula
                  solo.
                </p>
              ) : null}

              <Field>
                <FieldLabel htmlFor="mov-concept">Concepto</FieldLabel>
                <Input
                  id="mov-concept"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Cambio en la cueva / Hosting de julio"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="mov-project">
                  Proyecto relacionado (opcional)
                </FieldLabel>
                <SimpleSelect
                  id="mov-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Ninguno"
                  options={[
                    { value: '', label: 'Ninguno' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="mov-notes">Observaciones</FieldLabel>
                <Textarea
                  id="mov-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </Field>
            </FieldGroup>
          </form>

          {/* `flex-col` (no el `flex-col-reverse` de la base) para que en el
              celular se respete el orden del DOM: Eliminar arriba y Guardar
              al pie, que es donde cae el pulgar. Sin movimiento que borrar no
              hay nada que separar, así que el grupo vuelve a la derecha. */}
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
                form="mov-form"
                disabled={saving || !valid}
                className="flex-1 sm:flex-none"
              >
                {saving ? 'Guardando...' : editing ? 'Guardar' : 'Registrar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Un movimiento borrado le mueve el saldo a las dos cuentas que tocaba,
          y el saldo no se guarda en ningún lado: se recalcula solo. Antes de
          eso se muestra exactamente qué cuenta cambia y por cuánto. */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar el movimiento?</DialogTitle>
            <DialogDescription>
              Se recalculan los saldos de las cuentas que tocaba. No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="text-sm font-medium">
              {movement?.concept || movement?.category}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {savedFrom && movement && movement.amountOut > 0 ? (
                <li className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">
                    Le vuelve a {savedFrom.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-300">
                    +{formatMoney(movement.amountOut, savedFrom.currency)}
                  </span>
                </li>
              ) : null}
              {savedTo && movement && movement.amountIn > 0 ? (
                <li className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">
                    Se le descuenta a {savedTo.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-red-300">
                    −{formatMoney(movement.amountIn, savedTo.currency)}
                  </span>
                </li>
              ) : null}
            </ul>
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

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
import { AccountSelect } from '@/components/caja/account-select'
import { useStore } from '@/lib/store'
import { formatMoney } from '@/lib/format'
import { MOVEMENT_CATEGORIES } from '@/lib/types'
import type { MoneyMovement, MovementCategory } from '@/lib/types'

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Which sides of a movement each category uses. This is the whole reason
 * the form stays readable: a gasto only ever asks where the money left
 * from, an ingreso only where it landed.
 */
const shape: Record<MovementCategory, { from: boolean; to: boolean }> = {
  'Cambio de moneda': { from: true, to: true },
  Transferencia: { from: true, to: true },
  Gasto: { from: true, to: false },
  Retiro: { from: true, to: true },
  Inversión: { from: true, to: true },
  'Ingreso extra': { from: false, to: true },
  Ajuste: { from: false, to: true },
}

const hint: Record<MovementCategory, string> = {
  'Cambio de moneda': 'Sale de una cuenta y entra en otra moneda.',
  Transferencia: 'Mover plata entre dos cuentas propias.',
  Gasto: 'Plata que sale para afuera: hosting, impuestos, servicios.',
  Retiro: 'Lo que se llevan ustedes, a la cuenta de Retiros.',
  Inversión: 'Compra de cheques o cualquier plata que queda invertida.',
  'Ingreso extra': 'Plata que entra y no viene de un cobro de proyecto.',
  Ajuste: 'Corrección de saldo cuando la cuenta no cierra.',
}

export function MovementDialog({
  movement,
  open,
  onOpenChange,
}: {
  /** Omit to create a new one. */
  movement?: MoneyMovement
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, projects, addMovement, updateMovement, deleteMovement } =
    useStore()
  const editing = Boolean(movement)

  const [category, setCategory] = React.useState<MovementCategory>(
    movement?.category ?? 'Cambio de moneda',
  )
  const [movedOn, setMovedOn] = React.useState(movement?.movedOn ?? todayIso())
  const [concept, setConcept] = React.useState(movement?.concept ?? '')
  const [fromId, setFromId] = React.useState(movement?.fromAccountId ?? '')
  const [amountOut, setAmountOut] = React.useState(
    movement ? String(movement.amountOut) : '',
  )
  const [toId, setToId] = React.useState(movement?.toAccountId ?? '')
  const [amountIn, setAmountIn] = React.useState(
    movement ? String(movement.amountIn) : '',
  )
  const [projectId, setProjectId] = React.useState(movement?.projectId ?? '')
  const [notes, setNotes] = React.useState(movement?.notes ?? '')
  const [saving, setSaving] = React.useState(false)

  const sides = shape[category]
  const fromAccount = accounts.find((a) => a.id === fromId)
  const toAccount = accounts.find((a) => a.id === toId)

  // Same currency on both sides means it's one amount, not two.
  const sameCurrency =
    sides.from &&
    sides.to &&
    !!fromAccount &&
    !!toAccount &&
    fromAccount.currency === toAccount.currency

  React.useEffect(() => {
    if (sameCurrency) setAmountIn(amountOut)
  }, [sameCurrency, amountOut])

  const out = Number(amountOut)
  const income = Number(amountIn)
  const valid =
    movedOn &&
    (!sides.from || (fromId && out > 0)) &&
    (!sides.to || (toId && income > 0)) &&
    fromId !== toId

  const rate =
    sides.from && sides.to && out > 0 && income > 0 && !sameCurrency
      ? income / out
      : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const payload = {
      movedOn,
      category,
      concept: concept.trim(),
      fromAccountId: sides.from ? fromId : null,
      amountOut: sides.from ? out : 0,
      toAccountId: sides.to ? toId : null,
      amountIn: sides.to ? income : 0,
      projectId: projectId || null,
      notes: notes.trim(),
    }
    if (movement) await updateMovement(movement.id, payload)
    else await addMovement(payload)
    setSaving(false)
    toast.success(editing ? 'Movimiento actualizado' : 'Movimiento registrado')
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!movement) return
    setSaving(true)
    await deleteMovement(movement.id)
    setSaving(false)
    toast.success('Movimiento eliminado')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar movimiento' : 'Registrar movimiento'}
          </DialogTitle>
          <DialogDescription>{hint[category]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="mov-category">Tipo</FieldLabel>
                <SimpleSelect
                  id="mov-category"
                  value={category}
                  onValueChange={(v) => setCategory(v as MovementCategory)}
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

            {sides.from ? (
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="mov-from">Sale de</FieldLabel>
                  <AccountSelect
                    id="mov-from"
                    value={fromId}
                    onValueChange={setFromId}
                    excludeId={toId || undefined}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mov-out">
                    Monto{fromAccount ? ` (${fromAccount.currency})` : ''}
                  </FieldLabel>
                  <Input
                    id="mov-out"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountOut}
                    onChange={(e) => setAmountOut(e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </div>
            ) : null}

            {sides.to ? (
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="mov-to">Entra a</FieldLabel>
                  <AccountSelect
                    id="mov-to"
                    value={toId}
                    onValueChange={setToId}
                    excludeId={fromId || undefined}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="mov-in">
                    Monto{toAccount ? ` (${toAccount.currency})` : ''}
                  </FieldLabel>
                  <Input
                    id="mov-in"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    placeholder="0"
                    disabled={sameCurrency}
                  />
                </Field>
              </div>
            ) : null}

            {rate ? (
              <p className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
                Cotización de esta operación:{' '}
                <span className="font-medium tabular-nums text-foreground">
                  1 {fromAccount?.currency} ={' '}
                  {formatMoney(rate, toAccount?.currency)}
                </span>
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

          <DialogFooter className="mt-6 sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => void handleDelete()}
              >
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !valid}>
                {saving ? 'Guardando...' : editing ? 'Guardar' : 'Registrar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

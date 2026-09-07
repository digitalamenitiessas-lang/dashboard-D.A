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
import { formatMoney } from '@/lib/format'
import type { Currency, Payment, PaymentMethod } from '@/lib/types'

const methods: PaymentMethod[] = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Mercado Pago',
  'Crypto',
  'PayPal',
]

export function EditPaymentDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, updatePayment, deletePayment } = useStore()
  const [concept, setConcept] = React.useState(payment.concept)
  const [amount, setAmount] = React.useState(String(payment.amount))
  const [currency, setCurrency] = React.useState<Currency>(payment.currency)
  const [paidDate, setPaidDate] = React.useState(payment.paidDate)
  const [method, setMethod] = React.useState<string>(payment.method ?? '')
  const [receipt, setReceipt] = React.useState(payment.receipt ?? '')
  const [notes, setNotes] = React.useState(payment.notes)
  const [accountId, setAccountId] = React.useState(payment.accountId ?? '')
  const [saving, setSaving] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  /** La cuenta tal como está guardada: es a la que le cambia el saldo. */
  const savedAccount = accounts.find((a) => a.id === payment.accountId)

  // An account holds one currency, so switching the currency can leave a
  // now-invalid account selected.
  React.useEffect(() => {
    const picked = accounts.find((a) => a.id === accountId)
    if (picked && picked.currency !== currency) setAccountId('')
  }, [currency, accountId, accounts])

  const valid = concept.trim() && Number(amount) > 0 && paidDate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const ok = await updatePayment(payment.id, {
      concept: concept.trim(),
      amount: Number(amount),
      currency,
      paidDate,
      method: (method || null) as PaymentMethod | null,
      receipt: receipt.trim() || null,
      notes: notes.trim(),
      accountId: accountId || null,
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Pago actualizado')
    onOpenChange(false)
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    const ok = await deletePayment(payment.id)
    setSaving(false)
    if (!ok) return
    setConfirmingDelete(false)
    toast.success('Pago eliminado')
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar pago</DialogTitle>
            <DialogDescription>
              Corregí el concepto, el importe o la fecha en que se cobró.
            </DialogDescription>
          </DialogHeader>
          {/* El footer va FUERA del <form> para que sea hijo directo del
              DialogContent y quede clavado abajo del marco, arriba del
              teclado. El submit se mantiene con el par id/form del botón. */}
          <form id="epay-form" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="epay-concept">Concepto</FieldLabel>
                <Input
                  id="epay-concept"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="epay-amount">Monto</FieldLabel>
                  <MoneyInput
                    id="epay-amount"
                    value={amount}
                    onValueChange={setAmount}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="epay-currency">Moneda</FieldLabel>
                  <SimpleSelect
                    id="epay-currency"
                    value={currency}
                    onValueChange={(v) => setCurrency(v as Currency)}
                    options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="epay-paid">Fecha de pago</FieldLabel>
                  <Input
                    id="epay-paid"
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="epay-method">Medio de pago</FieldLabel>
                  <SimpleSelect
                    id="epay-method"
                    value={method}
                    onValueChange={setMethod}
                    placeholder="Sin definir"
                    options={[
                      { value: '', label: 'Sin definir' },
                      ...methods.map((m) => ({ value: m, label: m })),
                    ]}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="epay-account">¿A qué cuenta entró?</FieldLabel>
                <AccountSelect
                  id="epay-account"
                  value={accountId}
                  onValueChange={setAccountId}
                  currency={currency}
                  allowNone
                  noneLabel="Sin asignar"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="epay-receipt">Comprobante</FieldLabel>
                <Input
                  id="epay-receipt"
                  value={receipt}
                  onChange={(e) => setReceipt(e.target.value)}
                  placeholder="N° de factura o referencia"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="epay-notes">Observaciones</FieldLabel>
                <Textarea
                  id="epay-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </Field>
            </FieldGroup>
          </form>
          {/* `flex-col` (no el `flex-col-reverse` de la base) para que en el
              celular se respete el orden del DOM: Eliminar arriba y Guardar
              al pie, que es donde cae el pulgar. */}
          <DialogFooter className="mt-6 flex-col sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => setConfirmingDelete(true)}
              className="mt-4 sm:mt-0"
            >
              Eliminar
            </Button>
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
                form="epay-form"
                disabled={saving || !valid}
                className="flex-1 sm:flex-none"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar un cobro le baja el saldo a la cuenta donde entró, y el saldo
          no está guardado: se recalcula solo. Se pregunta mostrando el importe
          y a qué cuenta le pega. */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar el cobro?</DialogTitle>
            <DialogDescription>
              Se recalcula el saldo de la cuenta donde había entrado. No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="text-sm font-medium">{payment.concept}</p>
            <p className="mt-1 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {savedAccount
                  ? `Se le descuenta a ${savedAccount.name}`
                  : 'Sin cuenta asignada: no mueve ningún saldo'}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-red-300">
                −{formatMoney(payment.amount, payment.currency)}
              </span>
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

'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { SimpleSelect } from '@/components/shared/simple-select'
import { AccountSelect } from '@/components/caja/account-select'
import { useStore } from '@/lib/store'
import type { Currency, PaymentMethod } from '@/lib/types'

const currencies: Currency[] = ['USD', 'ARS', 'EUR']
const methods: PaymentMethod[] = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Mercado Pago',
  'Crypto',
  'PayPal',
]

const todayIso = () => new Date().toISOString().slice(0, 10)

export function AddPaymentDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: string
}) {
  const { projects, accounts, addPayment } = useStore()
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? '')
  const [concept, setConcept] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [paidDate, setPaidDate] = React.useState(todayIso())
  const [method, setMethod] = React.useState<PaymentMethod>('Transferencia')
  const [receipt, setReceipt] = React.useState('')
  const [accountId, setAccountId] = React.useState('')

  React.useEffect(() => {
    if (open && defaultProjectId) setProjectId(defaultProjectId)
  }, [open, defaultProjectId])

  // An account holds one currency, so switching the currency can leave a
  // now-invalid account selected.
  React.useEffect(() => {
    const picked = accounts.find((a) => a.id === accountId)
    if (picked && picked.currency !== currency) setAccountId('')
  }, [currency, accountId, accounts])

  const valid = projectId && concept.trim() && Number(amount) > 0 && paidDate

  async function submit() {
    if (!valid) return
    await addPayment({
      projectId,
      concept: concept.trim(),
      amount: Number(amount),
      currency,
      paidDate,
      method,
      receipt: receipt.trim() || null,
      notes: '',
      accountId: accountId || null,
    })
    setConcept('')
    setAmount('')
    setPaidDate(todayIso())
    setReceipt('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus data-icon="inline-start" />
            Agregar pago
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Un pago es plata que ya entró: cargá el concepto, el monto y la
            fecha en que la cobraste.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!defaultProjectId ? (
            <Field>
              <FieldLabel>Proyecto</FieldLabel>
              <SimpleSelect
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Elegir proyecto"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="pay-concept">Concepto</FieldLabel>
            <Input
              id="pay-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej: Anticipo 50%"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="pay-amount">Monto</FieldLabel>
              <Input
                id="pay-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field>
              <FieldLabel>Moneda</FieldLabel>
              <SimpleSelect
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={currencies.map((c) => ({ value: c, label: c }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="pay-paid">Fecha de pago</FieldLabel>
              <Input
                id="pay-paid"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Medio de pago</FieldLabel>
              <SimpleSelect
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                options={methods.map((m) => ({ value: m, label: m }))}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pay-account">¿A qué cuenta entró?</FieldLabel>
            <AccountSelect
              id="pay-account"
              value={accountId}
              onValueChange={setAccountId}
              currency={currency}
              allowNone
              noneLabel="Definir después"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-receipt">Comprobante (opcional)</FieldLabel>
            <Input
              id="pay-receipt"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              placeholder="N° de factura o referencia"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!valid}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

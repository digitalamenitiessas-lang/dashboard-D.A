'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { SimpleSelect } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import { formatMoney } from '@/lib/format'
import type { Payment, PaymentMethod } from '@/lib/types'

const methods: PaymentMethod[] = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Mercado Pago',
  'Crypto',
  'PayPal',
]

export function CollectPaymentDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { markPaymentPaid } = useStore()
  const today = new Date().toISOString().slice(0, 10)
  const [paidDate, setPaidDate] = React.useState(today)
  const [method, setMethod] = React.useState<PaymentMethod>('Transferencia')
  const [receipt, setReceipt] = React.useState('')

  async function submit() {
    await markPaymentPaid(payment.id, {
      paidDate,
      method,
      receipt: receipt.trim() || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            {payment.concept} — {formatMoney(payment.amount, payment.currency)}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="collect-date">Fecha de cobro</FieldLabel>
            <Input
              id="collect-date"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Método de pago</FieldLabel>
            <SimpleSelect
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
              options={methods.map((m) => ({ value: m, label: m }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="collect-receipt">Comprobante (opcional)</FieldLabel>
            <Input
              id="collect-receipt"
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
          <Button onClick={() => void submit()}>Confirmar cobro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

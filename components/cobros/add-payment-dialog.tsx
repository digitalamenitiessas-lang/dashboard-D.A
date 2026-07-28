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
import { useStore } from '@/lib/store'
import type { Currency, PaymentStatus } from '@/lib/types'

const currencies: Currency[] = ['USD', 'ARS', 'EUR']
const statuses: PaymentStatus[] = ['Pendiente', 'Cobrado', 'Vencido']

export function AddPaymentDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: string
}) {
  const { projects, addPayment } = useStore()
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? '')
  const [concept, setConcept] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [dueDate, setDueDate] = React.useState('')
  const [status, setStatus] = React.useState<PaymentStatus>('Pendiente')

  React.useEffect(() => {
    if (open && defaultProjectId) setProjectId(defaultProjectId)
  }, [open, defaultProjectId])

  const valid = projectId && concept.trim() && Number(amount) > 0 && dueDate

  async function submit() {
    if (!valid) return
    await addPayment({
      projectId,
      concept: concept.trim(),
      amount: Number(amount),
      currency,
      dueDate,
      paidDate: status === 'Cobrado' ? dueDate : null,
      method: null,
      status,
      receipt: null,
      notes: '',
    })
    setConcept('')
    setAmount('')
    setDueDate('')
    setStatus('Pendiente')
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
            Definí el concepto, monto y vencimiento del cobro.
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
              <FieldLabel htmlFor="pay-due">Vencimiento</FieldLabel>
              <Input
                id="pay-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Estado</FieldLabel>
              <SimpleSelect
                value={status}
                onValueChange={(v) => setStatus(v as PaymentStatus)}
                options={statuses.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          </div>
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

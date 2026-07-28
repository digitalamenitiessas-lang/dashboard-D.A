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
import { useStore } from '@/lib/store'
import { formatMoney } from '@/lib/format'
import { MAINTENANCE_FREQUENCIES } from '@/lib/types'
import type { Currency, MaintenanceFrequency, Project } from '@/lib/types'

const todayIso = () => new Date().toISOString().slice(0, 10)

export function ActivateMaintenanceDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { activateMaintenance } = useStore()
  const m = project.maintenance
  const [amount, setAmount] = React.useState(String(m.amount || ''))
  const [currency, setCurrency] = React.useState<Currency>(m.currency)
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>(
    m.frequency,
  )
  const [dueDay, setDueDay] = React.useState(String(m.dueDay || 1))
  const [startDate, setStartDate] = React.useState(
    m.startDate ?? project.implementationDate ?? todayIso(),
  )
  const [services, setServices] = React.useState(m.services.join('\n'))

  const valid = Number(amount) > 0 && Number(dueDay) >= 1 && Number(dueDay) <= 28

  async function submit() {
    if (!valid) return
    await activateMaintenance(project.id, {
      implementationDate: project.implementationDate ?? startDate,
      startDate,
      amount: Number(amount),
      currency,
      frequency,
      dueDay: Number(dueDay),
      services: services
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    })
    toast.success('Mantenimiento activado', { description: project.name })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activar mantenimiento</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="am-amount">Importe</FieldLabel>
              <Input
                id="am-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="am-currency">Moneda</FieldLabel>
              <SimpleSelect
                id="am-currency"
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={toOptions(['USD', 'ARS', 'EUR'] as const)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="am-frequency">Frecuencia</FieldLabel>
              <SimpleSelect
                id="am-frequency"
                value={frequency}
                onValueChange={(v) => setFrequency(v as MaintenanceFrequency)}
                options={toOptions(MAINTENANCE_FREQUENCIES)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="am-dueday">Día de vencimiento</FieldLabel>
              <Input
                id="am-dueday"
                type="number"
                min="1"
                max="28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="am-start">Fecha de inicio</FieldLabel>
            <Input
              id="am-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="am-services">
              Servicios incluidos (uno por línea)
            </FieldLabel>
            <Textarea
              id="am-services"
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder={'Soporte prioritario\nBackups diarios'}
              rows={3}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!valid}>
            Activar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CollectMaintenanceDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { collectMaintenance } = useStore()
  const [date, setDate] = React.useState(todayIso())
  const [amount, setAmount] = React.useState(String(project.maintenance.amount))

  async function submit() {
    await collectMaintenance(project.id, { date, amount: Number(amount) })
    toast.success('Mantenimiento cobrado', {
      description: `${project.name} — ${formatMoney(
        Number(amount),
        project.maintenance.currency,
      )}`,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro de mantenimiento</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="cm-date">Fecha de cobro</FieldLabel>
              <Input
                id="cm-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cm-amount">Importe</FieldLabel>
              <Input
                id="cm-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!(Number(amount) > 0)}>
            Confirmar cobro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

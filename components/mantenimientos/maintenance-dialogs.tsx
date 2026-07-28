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
import { Switch } from '@/components/ui/switch'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { AccountSelect } from '@/components/caja/account-select'
import { useStore } from '@/lib/store'
import { formatMoney } from '@/lib/format'
import { MAINTENANCE_FREQUENCIES } from '@/lib/types'
import type {
  Currency,
  MaintenanceFrequency,
  PaymentMethod,
  Project,
} from '@/lib/types'

const todayIso = () => new Date().toISOString().slice(0, 10)

const methods: PaymentMethod[] = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Mercado Pago',
  'Crypto',
  'PayPal',
]

/** Projects already handed over: activating one shouldn't move its status. */
const DELIVERED = ['Implementado', 'En mantenimiento', 'Finalizado']

export function ActivateMaintenanceDialog({
  project,
  open,
  onOpenChange,
}: {
  /** Omit to let the dialog pick the project — that's the flow from the
   *  Mantenimientos header, where no project is selected yet. */
  project?: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { projects, activateMaintenance } = useStore()

  // Anything without a live plan can get one; being implemented is a hint,
  // not a gate. Pre-loading a plan before delivery is a legitimate thing.
  const selectable = projects.filter((p) => !p.maintenance.active)
  const [projectId, setProjectId] = React.useState(project?.id ?? '')
  const target = project ?? projects.find((p) => p.id === projectId)
  const m = target?.maintenance

  const [amount, setAmount] = React.useState(String(m?.amount || ''))
  const [currency, setCurrency] = React.useState<Currency>(m?.currency ?? 'USD')
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>(
    m?.frequency ?? 'Mensual',
  )
  const [dueDay, setDueDay] = React.useState(String(m?.dueDay || 1))
  const [startDate, setStartDate] = React.useState(
    m?.startDate ?? project?.implementationDate ?? todayIso(),
  )
  const [services, setServices] = React.useState(m?.services.join('\n') ?? '')
  const [markInMaintenance, setMarkInMaintenance] = React.useState(true)

  // Picking a project mid-dialog re-seeds whatever it already had stored,
  // and decides whether moving its status makes sense.
  React.useEffect(() => {
    if (project || !target) return
    setAmount(String(target.maintenance.amount || ''))
    setCurrency(target.maintenance.currency)
    setFrequency(target.maintenance.frequency)
    setDueDay(String(target.maintenance.dueDay || 1))
    setStartDate(
      target.maintenance.startDate ??
        target.implementationDate ??
        todayIso(),
    )
    setServices(target.maintenance.services.join('\n'))
    setMarkInMaintenance(
      DELIVERED.includes(target.status) || target.implementationDate !== null,
    )
  }, [project, target])

  const valid =
    !!target && Number(amount) > 0 && Number(dueDay) >= 1 && Number(dueDay) <= 28

  async function submit() {
    if (!valid || !target) return
    await activateMaintenance(
      target.id,
      {
        implementationDate: target.implementationDate ?? startDate,
        startDate,
        amount: Number(amount),
        currency,
        frequency,
        dueDay: Number(dueDay),
        services: services
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      { markProjectInMaintenance: markInMaintenance },
    )
    toast.success('Mantenimiento activado', { description: target.name })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activar mantenimiento</DialogTitle>
          <DialogDescription>
            {project
              ? project.name
              : 'Elegí el proyecto y definí cada cuánto y cuánto se cobra.'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!project ? (
            <Field>
              <FieldLabel htmlFor="am-project">Proyecto</FieldLabel>
              <SimpleSelect
                id="am-project"
                value={projectId}
                onValueChange={setProjectId}
                placeholder={
                  selectable.length === 0
                    ? 'Todos tienen plan activo'
                    : 'Elegir proyecto'
                }
                options={selectable.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${p.status}`,
                }))}
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="am-amount">Importe</FieldLabel>
              <MoneyInput
                id="am-amount"
                value={amount}
                onValueChange={setAmount}
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
          <Field>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Pasar el proyecto a «En mantenimiento»
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  {target
                    ? `Hoy está en «${target.status}». Desactivalo si querés dejar el plan armado sin mover el estado.`
                    : 'Cambia el estado del proyecto al activar el plan.'}
                </p>
              </div>
              <Switch
                checked={markInMaintenance}
                onCheckedChange={setMarkInMaintenance}
              />
            </div>
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
  const [method, setMethod] = React.useState<PaymentMethod>('Transferencia')
  const [receipt, setReceipt] = React.useState('')
  const [accountId, setAccountId] = React.useState('')

  async function submit() {
    await collectMaintenance(project.id, {
      date,
      amount: Number(amount),
      method,
      receipt: receipt.trim() || null,
      accountId: accountId || null,
    })
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
              <MoneyInput
                id="cm-amount"
                value={amount}
                onValueChange={setAmount}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="cm-method">Método de pago</FieldLabel>
            <SimpleSelect
              id="cm-method"
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
              options={methods.map((m) => ({ value: m, label: m }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-account">¿A qué cuenta entró?</FieldLabel>
            <AccountSelect
              id="cm-account"
              value={accountId}
              onValueChange={setAccountId}
              currency={project.maintenance.currency}
              allowNone
              noneLabel="Definir después"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-receipt">Comprobante (opcional)</FieldLabel>
            <Input
              id="cm-receipt"
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
          <Button onClick={() => void submit()} disabled={!(Number(amount) > 0)}>
            Confirmar cobro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

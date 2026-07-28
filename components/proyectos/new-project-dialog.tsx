'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { useStore } from '@/lib/store'
import { PROJECT_STATUSES } from '@/lib/types'
import type { Currency, Priority, Project, ProjectStatus, ProjectType } from '@/lib/types'

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Works both uncontrolled (renders its own trigger button) and controlled
 * (parent owns `open`/`onOpenChange` and supplies its own trigger).
 */
export function NewProjectDialog({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const { clients, addProject } = useStore()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : uncontrolledOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [type, setType] = React.useState<ProjectType>('terceros')
  const [clientId, setClientId] = React.useState<string>('')
  const [internalLead, setInternalLead] = React.useState('')
  const [status, setStatus] = React.useState<ProjectStatus>('Idea')
  const [priority, setPriority] = React.useState<Priority>('Media')
  const [startDate, setStartDate] = React.useState('')
  const [estimatedDelivery, setEstimatedDelivery] = React.useState('')
  const [quotedAmount, setQuotedAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [saving, setSaving] = React.useState(false)

  function reset() {
    setName('')
    setDescription('')
    setType('terceros')
    setClientId('')
    setInternalLead('')
    setStatus('Idea')
    setPriority('Media')
    setStartDate('')
    setEstimatedDelivery('')
    setQuotedAmount('')
    setCurrency('USD')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre del proyecto es obligatorio')
      return
    }
    setSaving(true)
    const client = clients.find((c) => c.id === clientId)
    const id = await addProject({
      name: name.trim(),
      description: description.trim(),
      type,
      clientId: type === 'terceros' ? clientId || null : null,
      ownerName:
        type === 'propio' ? 'Digital Amenities' : client?.name ?? 'Sin cliente',
      contactPerson: client?.contactPerson ?? '',
      internalLead: internalLead.trim() || 'Sin asignar',
      status,
      priority,
      startDate: startDate || null,
      estimatedDelivery: estimatedDelivery || null,
      quotedAmount: Number(quotedAmount) || 0,
      currency,
    })
    setSaving(false)
    if (!id) return // the store already surfaced the error
    toast.success('Proyecto creado', { description: name })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled ? null : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus data-icon="inline-start" />
          Nuevo proyecto
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
          <DialogDescription>
            Registrá un nuevo proyecto en el centro de control.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="np-name">Nombre</FieldLabel>
              <Input
                id="np-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Portal de Reservas"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="np-desc">Descripción</FieldLabel>
              <Textarea
                id="np-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción del proyecto"
                rows={2}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="np-type">Tipo</FieldLabel>
                <SimpleSelect
                  id="np-type"
                  value={type}
                  onValueChange={(v) => setType(v as ProjectType)}
                  options={[
                    { value: 'terceros', label: 'Para terceros' },
                    { value: 'propio', label: 'Propio' },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="np-client">Cliente</FieldLabel>
                <SimpleSelect
                  id="np-client"
                  value={clientId}
                  onValueChange={setClientId}
                  placeholder={type === 'propio' ? 'No aplica' : 'Seleccionar'}
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="np-status">Estado</FieldLabel>
                <SimpleSelect
                  id="np-status"
                  value={status}
                  onValueChange={(v) => setStatus(v as ProjectStatus)}
                  options={toOptions(PROJECT_STATUSES)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="np-priority">Prioridad</FieldLabel>
                <SimpleSelect
                  id="np-priority"
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                  options={toOptions(['Baja', 'Media', 'Alta', 'Crítica'] as const)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="np-lead">Responsable interno</FieldLabel>
              <Input
                id="np-lead"
                value={internalLead}
                onChange={(e) => setInternalLead(e.target.value)}
                placeholder="Ej: Sofía Ramírez"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="np-start">Fecha de inicio</FieldLabel>
                <Input
                  id="np-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="np-delivery">Entrega estimada</FieldLabel>
                <Input
                  id="np-delivery"
                  type="date"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="np-quoted">Importe cotizado</FieldLabel>
                <MoneyInput
                  id="np-quoted"
                  value={quotedAmount}
                  onValueChange={setQuotedAmount}
                  placeholder="0"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="np-currency">Moneda</FieldLabel>
                <SimpleSelect
                  id="np-currency"
                  value={currency}
                  onValueChange={(v) => setCurrency(v as Currency)}
                  options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando...' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

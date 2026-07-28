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
import { PRIORITIES, PROJECT_STATUSES } from '@/lib/types'
import type { Currency, Priority, Project, ProjectStatus, ProjectType } from '@/lib/types'

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { clients, updateProject } = useStore()

  const [name, setName] = React.useState(project.name)
  const [description, setDescription] = React.useState(project.description)
  const [type, setType] = React.useState<ProjectType>(project.type)
  const [clientId, setClientId] = React.useState(project.clientId ?? '')
  const [contactPerson, setContactPerson] = React.useState(project.contactPerson)
  const [internalLead, setInternalLead] = React.useState(project.internalLead)
  const [status, setStatus] = React.useState<ProjectStatus>(project.status)
  const [priority, setPriority] = React.useState<Priority>(project.priority)
  const [startDate, setStartDate] = React.useState(project.startDate ?? '')
  const [estimatedDelivery, setEstimatedDelivery] = React.useState(
    project.estimatedDelivery ?? '',
  )
  const [implementationDate, setImplementationDate] = React.useState(
    project.implementationDate ?? '',
  )
  const [quotedAmount, setQuotedAmount] = React.useState(String(project.quotedAmount))
  const [currency, setCurrency] = React.useState<Currency>(project.currency)
  const [saving, setSaving] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre del proyecto es obligatorio')
      return
    }
    setSaving(true)
    const client = clients.find((c) => c.id === clientId)
    await updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      type,
      clientId: type === 'terceros' ? clientId || null : null,
      ownerName:
        type === 'propio' ? 'Digital Amenities' : client?.name ?? project.ownerName,
      contactPerson: contactPerson.trim(),
      internalLead: internalLead.trim() || 'Sin asignar',
      status,
      priority,
      startDate: startDate || null,
      estimatedDelivery: estimatedDelivery || null,
      implementationDate: implementationDate || null,
      quotedAmount: Number(quotedAmount) || 0,
      currency,
    })
    setSaving(false)
    toast.success('Proyecto actualizado')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar proyecto</DialogTitle>
          <DialogDescription>
            Modificá los datos comerciales y de seguimiento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ep-name">Nombre</FieldLabel>
              <Input
                id="ep-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-desc">Descripción</FieldLabel>
              <Textarea
                id="ep-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ep-type">Tipo</FieldLabel>
                <SimpleSelect
                  id="ep-type"
                  value={type}
                  onValueChange={(v) => setType(v as ProjectType)}
                  options={[
                    { value: 'terceros', label: 'Para terceros' },
                    { value: 'propio', label: 'Propio' },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ep-client">Cliente</FieldLabel>
                <SimpleSelect
                  id="ep-client"
                  value={clientId}
                  onValueChange={setClientId}
                  placeholder={type === 'propio' ? 'No aplica' : 'Seleccionar'}
                  options={[
                    { value: '', label: 'Sin cliente' },
                    ...clients.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ep-status">Estado</FieldLabel>
                <SimpleSelect
                  id="ep-status"
                  value={status}
                  onValueChange={(v) => setStatus(v as ProjectStatus)}
                  options={toOptions(PROJECT_STATUSES)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ep-priority">Prioridad</FieldLabel>
                <SimpleSelect
                  id="ep-priority"
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                  options={toOptions(PRIORITIES)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ep-contact">Persona de contacto</FieldLabel>
                <Input
                  id="ep-contact"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ep-lead">Responsable interno</FieldLabel>
                <Input
                  id="ep-lead"
                  value={internalLead}
                  onChange={(e) => setInternalLead(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ep-start">Fecha de inicio</FieldLabel>
                <Input
                  id="ep-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ep-delivery">Entrega estimada</FieldLabel>
                <Input
                  id="ep-delivery"
                  type="date"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ep-impl">Fecha de implementación</FieldLabel>
                <Input
                  id="ep-impl"
                  type="date"
                  value={implementationDate}
                  onChange={(e) => setImplementationDate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ep-quoted">Importe cotizado</FieldLabel>
                <Input
                  id="ep-quoted"
                  type="number"
                  min="0"
                  value={quotedAmount}
                  onChange={(e) => setQuotedAmount(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ep-currency">Moneda</FieldLabel>
              <SimpleSelect
                id="ep-currency"
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={toOptions(['USD', 'ARS', 'EUR'] as const)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

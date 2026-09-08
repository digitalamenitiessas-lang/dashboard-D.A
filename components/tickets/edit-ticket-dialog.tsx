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
import {
  TICKET_GRADES,
  TICKET_GRADE_HINTS,
  TICKET_GRADE_LABELS,
  TICKET_KINDS,
} from '@/lib/types'
import type { Ticket, TicketGrade, TicketKind } from '@/lib/types'
import { isTicketOpen } from '@/lib/derive'

/**
 * Editar toca lo que se cargó mal: tipo, urgencia, título, detalle y a qué
 * proyecto pertenece. NO toca el estado — resolver y reabrir son botones
 * propios en la tarjeta, porque cada uno tiene su efecto (uno pide el qué
 * se hizo, el otro lo borra) y ninguno es un campo de formulario.
 *
 * En un ticket ya resuelto también se puede corregir el texto de la
 * resolución: es el registro histórico y tiene que poder quedar bien
 * escrito.
 */
export function EditTicketDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateTicket, projects } = useStore()
  const [projectId, setProjectId] = React.useState(ticket.projectId)
  const [kind, setKind] = React.useState<TicketKind>(ticket.kind)
  const [grade, setGrade] = React.useState<TicketGrade>(ticket.grade)
  const [title, setTitle] = React.useState(ticket.title)
  const [detail, setDetail] = React.useState(ticket.detail)
  const [resolution, setResolution] = React.useState(ticket.resolution)
  const [saving, setSaving] = React.useState(false)

  const abierto = isTicketOpen(ticket)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId) {
      toast.error('Elegí a qué proyecto pertenece')
      return
    }
    if (!title.trim()) {
      toast.error('El título es obligatorio')
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await updateTicket(ticket.id, {
      projectId,
      kind,
      grade,
      title: title.trim(),
      detail: detail.trim(),
      // La resolución sólo viaja si el ticket está resuelto: la base
      // rechaza una resolución escrita en un ticket abierto.
      ...(abierto ? {} : { resolution: resolution.trim() }),
    })
    setSaving(false)
    if (!ok) return
    toast.success('Ticket actualizado', { description: title })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar ticket</DialogTitle>
          <DialogDescription>
            {abierto
              ? 'Corregí lo que se cargó mal. Para cerrarlo usá el botón Resolver.'
              : 'Ticket ya resuelto: podés corregir el texto y la resolución.'}
          </DialogDescription>
        </DialogHeader>
        <form id="et-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="et-project">Proyecto</FieldLabel>
              <SimpleSelect
                id="et-project"
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Elegí el proyecto"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="et-kind">Tipo</FieldLabel>
                <SimpleSelect
                  id="et-kind"
                  value={kind}
                  onValueChange={(v) => setKind(v as TicketKind)}
                  options={toOptions(TICKET_KINDS)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="et-grade">Urgencia</FieldLabel>
                <SimpleSelect
                  id="et-grade"
                  value={String(grade)}
                  onValueChange={(v) => setGrade(Number(v) as TicketGrade)}
                  options={TICKET_GRADES.map((g) => ({
                    value: String(g),
                    label: TICKET_GRADE_LABELS[g],
                  }))}
                />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {TICKET_GRADE_HINTS[grade]}
            </p>
            <Field>
              <FieldLabel htmlFor="et-title">Título</FieldLabel>
              <Input
                id="et-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="et-detail">Detalle</FieldLabel>
              <Textarea
                id="et-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={4}
              />
            </Field>
            {abierto ? null : (
              <Field>
                <FieldLabel htmlFor="et-resolution">Cómo se resolvió</FieldLabel>
                <Textarea
                  id="et-resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                />
              </Field>
            )}
          </FieldGroup>
        </form>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="et-form" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

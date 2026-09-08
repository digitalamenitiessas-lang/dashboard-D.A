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
import { useStore } from '@/lib/store'
import {
  TICKET_GRADES,
  TICKET_GRADE_HINTS,
  TICKET_GRADE_LABELS,
  TICKET_KINDS,
} from '@/lib/types'
import type { TicketGrade, TicketKind } from '@/lib/types'

/**
 * `defaultProjectId` clava el ticket a un proyecto y esconde el selector —
 * es como entra desde la pestaña Tickets del detalle de un proyecto.
 *
 * Un ticket SIEMPRE va contra un proyecto, así que sin proyectos cargados
 * el botón queda deshabilitado con la explicación: es mejor que un diálogo
 * que se abre con un desplegable vacío y no deja guardar.
 */
export function NewTicketDialog({
  defaultProjectId,
  triggerLabel = 'Nuevo ticket',
  triggerVariant,
}: {
  defaultProjectId?: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
} = {}) {
  const { addTicket, projects, ticketsReady } = useStore()
  const [open, setOpen] = React.useState(false)
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? '')
  const [kind, setKind] = React.useState<TicketKind>('Pedido')
  const [grade, setGrade] = React.useState<TicketGrade>(1)
  const [title, setTitle] = React.useState('')
  const [detail, setDetail] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Dos motivos distintos para no dejar cargar, y conviene distinguirlos:
  // sin la migración no existe la tabla, sin proyectos no hay a qué colgar
  // el ticket. Un botón muerto sin explicación es lo que el repo evita.
  const bloqueo = !ticketsReady
    ? 'Falta correr supabase/11_tickets.sql en el SQL Editor de Supabase.'
    : projects.length === 0
      ? 'Primero cargá un proyecto: un ticket siempre va contra uno.'
      : null

  function reset() {
    setKind('Pedido')
    setGrade(1)
    setTitle('')
    setDetail('')
    setProjectId(defaultProjectId ?? '')
  }

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
    const ok = await addTicket({
      projectId,
      kind,
      grade,
      title: title.trim(),
      detail: detail.trim(),
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Ticket creado', {
      description:
        grade === 3
          ? `${title} — grado 3, ya salió el aviso al celular`
          : title,
    })
    reset()
    setOpen(false)
  }

  if (bloqueo) {
    return (
      <Button
        size="sm"
        variant={triggerVariant}
        disabled
        title={bloqueo}
        aria-label={`${triggerLabel} — ${bloqueo}`}
      >
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={triggerVariant} />}>
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo ticket</DialogTitle>
          <DialogDescription>
            Un reclamo, pedido o consulta de un cliente. Al guardarlo sale el
            aviso a los celulares del equipo.
          </DialogDescription>
        </DialogHeader>
        <form id="nt-form" onSubmit={handleSubmit}>
          <FieldGroup>
            {defaultProjectId ? null : (
              <Field>
                <FieldLabel htmlFor="nt-project">Proyecto</FieldLabel>
                <SimpleSelect
                  id="nt-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Elegí el proyecto"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nt-kind">Tipo</FieldLabel>
                <SimpleSelect
                  id="nt-kind"
                  value={kind}
                  onValueChange={(v) => setKind(v as TicketKind)}
                  options={toOptions(TICKET_KINDS)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="nt-grade">Urgencia</FieldLabel>
                <SimpleSelect
                  id="nt-grade"
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
              <FieldLabel htmlFor="nt-title">Título</FieldLabel>
              <Input
                id="nt-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: No le llegan los mails de reserva"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nt-detail">Detalle</FieldLabel>
              <Textarea
                id="nt-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Qué dijo el cliente, desde cuándo pasa, cómo reproducirlo..."
                rows={4}
              />
            </Field>
          </FieldGroup>
        </form>
        {/* El footer va FUERA del <form> para que sea hijo directo del
            DialogContent y quede clavado abajo del marco, arriba del
            teclado. El submit se mantiene con el par id/form del botón. */}
        <DialogFooter className="mt-6">
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancelar
          </DialogClose>
          <Button type="submit" form="nt-form" disabled={saving}>
            {saving ? 'Creando...' : 'Crear ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

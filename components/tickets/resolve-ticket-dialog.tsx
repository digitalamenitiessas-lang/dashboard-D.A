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
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/lib/store'
import type { Ticket } from '@/lib/types'

/**
 * Resolver pide el qué-se-hizo antes de cerrar. Es un campo y no un
 * `confirm()` por una razón concreta: el valor del registro de resueltos
 * está en poder leer, seis meses después, qué se terminó haciendo — sin
 * eso queda una lista de títulos y fechas que no le sirve a nadie.
 *
 * Igual es opcional: obligarlo haría que alguien escriba "listo" con tal
 * de sacarse el diálogo de encima, y un "listo" es peor que un vacío
 * porque parece información.
 */
export function ResolveTicketDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { resolveTicket } = useStore()
  const [resolution, setResolution] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const ok = await resolveTicket(ticket.id, resolution)
    setSaving(false)
    if (!ok) return // el store ya avisó (error, o que alguien lo resolvió antes)
    toast.success('Ticket resuelto', { description: ticket.title })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver ticket</DialogTitle>
          <DialogDescription>{ticket.title}</DialogDescription>
        </DialogHeader>
        <form id="rt-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rt-resolution">
                ¿Qué se hizo? (opcional)
              </FieldLabel>
              <Textarea
                id="rt-resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Ej: era el SMTP vencido, se renovó la clave y se probó con dos reservas"
                rows={4}
                autoFocus
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="rt-form" disabled={saving}>
            {saving ? 'Resolviendo...' : 'Marcar resuelto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

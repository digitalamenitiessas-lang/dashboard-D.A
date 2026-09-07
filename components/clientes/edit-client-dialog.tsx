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
import { useStore } from '@/lib/store'
import type { Client } from '@/lib/types'

export function EditClientDialog({
  client,
  open,
  onOpenChange,
}: {
  client: Client
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateClient } = useStore()
  const [name, setName] = React.useState(client.name)
  const [contactPerson, setContactPerson] = React.useState(client.contactPerson)
  const [phone, setPhone] = React.useState(client.phone)
  const [email, setEmail] = React.useState(client.email)
  const [notes, setNotes] = React.useState(client.notes)
  const [saving, setSaving] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre o razón social es obligatorio')
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await updateClient(client.id, {
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Cliente actualizado')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>Actualizá los datos de contacto.</DialogDescription>
        </DialogHeader>
        <form id="ec-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ec-name">Nombre o razón social</FieldLabel>
              <Input
                id="ec-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ec-contact">Persona de contacto</FieldLabel>
              <Input
                id="ec-contact"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ec-phone">Teléfono</FieldLabel>
                <Input
                  id="ec-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ec-email">Correo</FieldLabel>
                <Input
                  id="ec-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ec-notes">Notas</FieldLabel>
              <Textarea
                id="ec-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </Field>
          </FieldGroup>
        </form>
        {/* El footer va FUERA del <form> para que sea hijo directo del
            DialogContent y quede clavado abajo del marco, arriba del
            teclado. El submit se mantiene con el par id/form del botón. */}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="ec-form" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { useStore } from '@/lib/store'

export function NewClientDialog() {
  const { addClient } = useStore()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [contactPerson, setContactPerson] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  function reset() {
    setName('')
    setContactPerson('')
    setPhone('')
    setEmail('')
    setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre o razón social es obligatorio')
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await addClient({
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Cliente creado', { description: name })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Nuevo cliente
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Registrá los datos de contacto del cliente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nc-name">Nombre o razón social</FieldLabel>
              <Input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Hotel Costa Serena"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nc-contact">Persona de contacto</FieldLabel>
              <Input
                id="nc-contact"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Ej: Marina López"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="nc-phone">Teléfono</FieldLabel>
                <Input
                  id="nc-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+54 11 ..."
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="nc-email">Correo</FieldLabel>
                <Input
                  id="nc-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@empresa.com"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="nc-notes">Notas</FieldLabel>
              <Textarea
                id="nc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexto, preferencias, condiciones de pago..."
                rows={3}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando...' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

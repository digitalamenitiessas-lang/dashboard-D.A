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
import { TelefonoInput } from '@/components/shared/telefono-input'
import { PAIS_POR_DEFECTO, normalizarTelefono } from '@/lib/telefono'

export function NewClientDialog() {
  const { addClient } = useStore()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [contactPerson, setContactPerson] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [pais, setPais] = React.useState(PAIS_POR_DEFECTO)
  const [email, setEmail] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  function reset() {
    setName('')
    setContactPerson('')
    setPhone('')
    setPais(PAIS_POR_DEFECTO)
    setEmail('')
    setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre o razón social es obligatorio')
      return
    }
    // El teléfono es obligatorio y además tiene que poder interpretarse: un
    // número guardado que WhatsApp no puede abrir es lo mismo que no tenerlo,
    // pero peor, porque parece que está.
    const tel = normalizarTelefono(phone, pais)
    if (!tel) {
      toast.error(
        phone.trim()
          ? 'Revisá el teléfono: no se pudo interpretar'
          : 'El teléfono es obligatorio',
      )
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await addClient({
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      // Se guarda el internacional, que es lo que `wa.me` necesita. El
      // campo lo acepta de vuelta tal cual, así que editar funciona sin
      // conversiones: la normalización es idempotente.
      phone: tel,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Registrá los datos de contacto del cliente.
          </DialogDescription>
        </DialogHeader>
        <form id="nc-form" onSubmit={handleSubmit}>
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
            <Field>
              <FieldLabel htmlFor="nc-phone">Teléfono (WhatsApp)</FieldLabel>
              <TelefonoInput
                id="nc-phone"
                value={phone}
                onValueChange={setPhone}
                pais={pais}
                onPaisChange={setPais}
                required
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
        </form>
        {/* El footer va FUERA del <form> para que sea hijo directo del
            DialogContent y quede clavado abajo del marco, arriba del
            teclado. El submit se mantiene con el par id/form del botón. */}
        <DialogFooter className="mt-6">
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancelar
          </DialogClose>
          <Button type="submit" form="nc-form" disabled={saving}>
            {saving ? 'Creando...' : 'Crear cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

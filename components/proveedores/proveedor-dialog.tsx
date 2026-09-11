'use client'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
import type { Proveedor } from '@/lib/types'

/** Alta y edición de un proveedor. */
export function ProveedorDialog({
  proveedor,
  open,
  onOpenChange,
  triggerLabel = 'Nuevo proveedor',
}: {
  proveedor?: Proveedor
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
}) {
  const { proveedoresReady, addProveedor, updateProveedor, deleteProveedor } =
    useStore()

  const controlado = open !== undefined
  const [abierto, setAbierto] = React.useState(false)
  const visible = controlado ? open : abierto
  const setVisible = (v: boolean) => {
    if (controlado) onOpenChange?.(v)
    else setAbierto(v)
  }

  const editando = !!proveedor
  const [nombre, setNombre] = React.useState(proveedor?.nombre ?? '')
  const [cuit, setCuit] = React.useState(proveedor?.cuit ?? '')
  const [contacto, setContacto] = React.useState(proveedor?.contacto ?? '')
  const [telefono, setTelefono] = React.useState(proveedor?.telefono ?? '')
  const [email, setEmail] = React.useState(proveedor?.email ?? '')
  const [plazo, setPlazo] = React.useState(
    proveedor?.plazoDias === null || proveedor?.plazoDias === undefined
      ? ''
      : String(proveedor.plazoDias),
  )
  const [notas, setNotas] = React.useState(proveedor?.notas ?? '')
  const [confirmando, setConfirmando] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const plazoNum = plazo.trim() === '' ? null : Number(plazo)
  const plazoValido =
    plazoNum === null ||
    (Number.isInteger(plazoNum) && plazoNum >= 0 && plazoNum <= 365)
  const valid = nombre.trim() !== '' && plazoValido

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const datos = {
      nombre: nombre.trim(),
      cuit: cuit.trim(),
      contacto: contacto.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      plazoDias: plazoNum,
      notas: notas.trim(),
    }
    const ok = proveedor
      ? await updateProveedor(proveedor.id, datos)
      : await addProveedor(datos)
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editando ? 'Proveedor actualizado' : 'Proveedor creado', {
      description: datos.nombre,
    })
    setVisible(false)
  }

  async function borrar() {
    if (!proveedor || saving) return
    setSaving(true)
    const ok = await deleteProveedor(proveedor.id)
    setSaving(false)
    if (!ok) return
    toast.success('Proveedor eliminado', { description: proveedor.nombre })
    setVisible(false)
  }

  const cuerpo = (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {confirmando
            ? 'Eliminar proveedor'
            : editando
              ? 'Editar proveedor'
              : 'Nuevo proveedor'}
        </DialogTitle>
        <DialogDescription>
          {confirmando
            ? 'Se borra de forma definitiva.'
            : 'A quién le pagamos: hosting, herramientas, servicios.'}
        </DialogDescription>
      </DialogHeader>

      {confirmando && proveedor ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm leading-relaxed text-red-200 text-pretty">
          <p>
            <strong>{proveedor.nombre}</strong>
          </p>
          {/* La base lo frena sola si tiene facturas: el FK es RESTRICT
              porque esas facturas son historial de plata. */}
          <p className="mt-2 text-xs text-red-200/80">
            Si tiene facturas cargadas, la base no va a dejar borrarlo — esas
            facturas son el registro de lo que nos cobró. Los gastos fijos que
            lo tengan como proveedor quedan sin proveedor asignado.
          </p>
        </div>
      ) : (
        <form id="prov-form" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="prov-nombre">Nombre</FieldLabel>
              <Input
                id="prov-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Hostinger"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="prov-cuit">CUIT</FieldLabel>
                <Input
                  id="prov-cuit"
                  inputMode="numeric"
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                  placeholder="30-12345678-9"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prov-plazo">
                  Plazo de pago (días)
                </FieldLabel>
                <Input
                  id="prov-plazo"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="365"
                  value={plazo}
                  onChange={(e) => setPlazo(e.target.value)}
                  placeholder="30"
                  aria-invalid={!plazoValido || undefined}
                />
                <p
                  className={
                    plazoValido
                      ? 'text-xs text-muted-foreground'
                      : 'text-xs text-amber-300'
                  }
                >
                  {plazoValido
                    ? 'Vacío = contra presentación. Con plazo, cada factura suya arranca con su vencimiento ya calculado.'
                    : 'Tiene que ser un número entre 0 y 365.'}
                </p>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="prov-contacto">Contacto</FieldLabel>
              <Input
                id="prov-contacto"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Nombre de la persona"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="prov-tel">Teléfono</FieldLabel>
                <Input
                  id="prov-tel"
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prov-email">Correo</FieldLabel>
                <Input
                  id="prov-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="prov-notas">Notas</FieldLabel>
              <Textarea
                id="prov-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
              />
            </Field>
          </FieldGroup>
        </form>
      )}

      <DialogFooter className="mt-6">
        {confirmando ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => void borrar()}
              disabled={saving}
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </>
        ) : (
          <>
            {editando ? (
              <Button
                variant="ghost"
                className="text-red-300 hover:text-red-200"
                onClick={() => setConfirmando(true)}
              >
                <Trash2 data-icon="inline-start" />
                Eliminar
              </Button>
            ) : controlado ? (
              <Button variant="ghost" onClick={() => setVisible(false)}>
                Cancelar
              </Button>
            ) : (
              <DialogClose render={<Button type="button" variant="ghost" />}>
                Cancelar
              </DialogClose>
            )}
            <Button type="submit" form="prov-form" disabled={saving || !valid}>
              {saving ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  )

  if (controlado) {
    return (
      <Dialog open={visible} onOpenChange={setVisible}>
        {cuerpo}
      </Dialog>
    )
  }

  return (
    <Dialog open={visible} onOpenChange={setVisible}>
      <DialogTrigger
        render={<Button size="sm" disabled={!proveedoresReady} />}
      >
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      {cuerpo}
    </Dialog>
  )
}

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
import { normalizarProspecto } from '@/lib/mappers'
import { todayIso } from '@/lib/format'
import {
  SEGUIMIENTO_ESTADOS,
  SEGUIMIENTO_KINDS,
  type Seguimiento,
  type SeguimientoEstado,
  type SeguimientoKind,
} from '@/lib/types'

/**
 * Alta y edición de un contacto, en un solo componente.
 *
 * Sin `seguimiento` es alta y trae su propio botón; con `seguimiento` es
 * edición y lo abre quien lo llama. Es un formulario chico y los dos usos
 * comparten hasta la última validación: dos archivos serían dos lugares
 * donde arreglar el mismo bug.
 *
 * `prospectoInicial` precarga el nombre — así, desde un grupo ya existente,
 * cargar el contacto siguiente no obliga a volver a escribirlo (ni a
 * escribirlo distinto, que es el problema de fondo del texto libre).
 */
export function SeguimientoDialog({
  seguimiento,
  prospectoInicial,
  open,
  onOpenChange,
  triggerLabel = 'Nuevo contacto',
  triggerVariant,
}: {
  seguimiento?: Seguimiento
  prospectoInicial?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const { addSeguimiento, updateSeguimiento, seguimientos, seguimientosReady } =
    useStore()

  const controlado = open !== undefined
  const [abierto, setAbierto] = React.useState(false)
  const visible = controlado ? open : abierto
  const setVisible = (v: boolean) => {
    if (controlado) onOpenChange?.(v)
    else setAbierto(v)
  }

  const editando = !!seguimiento

  const [prospecto, setProspecto] = React.useState(
    seguimiento?.prospecto ?? prospectoInicial ?? '',
  )
  const [contactedOn, setContactedOn] = React.useState(
    seguimiento?.contactedOn ?? todayIso(),
  )
  const [kind, setKind] = React.useState<SeguimientoKind>(
    seguimiento?.kind ?? 'Reunión',
  )
  const [attendees, setAttendees] = React.useState(seguimiento?.attendees ?? '')
  const [summary, setSummary] = React.useState(seguimiento?.summary ?? '')
  const [estado, setEstado] = React.useState<SeguimientoEstado>(
    seguimiento?.estado ?? 'Pelota nuestra',
  )
  const [nextContactOn, setNextContactOn] = React.useState(
    seguimiento?.nextContactOn ?? '',
  )
  const [saving, setSaving] = React.useState(false)

  /**
   * Los prospectos ya cargados, para el autocompletado. Es la única defensa
   * real contra el costo del texto libre: si el nombre ya existe, el
   * navegador lo ofrece y nadie inventa una grafía nueva. Se muestra el
   * nombre tal como se escribió la última vez.
   */
  const prospectosConocidos = React.useMemo(() => {
    const porKey = new Map<string, string>()
    for (const s of seguimientos) porKey.set(s.prospectoKey, s.prospecto)
    return [...porKey.values()].sort((a, b) => a.localeCompare(b, 'es'))
  }, [seguimientos])

  /** ¿El nombre tipeado cae en un prospecto que ya existe? */
  const seSumaA = React.useMemo(() => {
    const key = normalizarProspecto(prospecto)
    if (!key) return null
    const match = seguimientos.find((s) => s.prospectoKey === key)
    return match && match.prospecto !== prospecto.trim() ? match.prospecto : null
  }, [prospecto, seguimientos])

  const fechaAlReves =
    nextContactOn !== '' && nextContactOn < contactedOn

  function reset() {
    setProspecto(prospectoInicial ?? '')
    setContactedOn(todayIso())
    setKind('Reunión')
    setAttendees('')
    setSummary('')
    setEstado('Pelota nuestra')
    setNextContactOn('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prospecto.trim()) {
      toast.error('Poné con quién fue el contacto')
      return
    }
    if (fechaAlReves) {
      toast.error('La fecha para retomar no puede ser anterior al contacto')
      return
    }
    if (saving) return
    setSaving(true)

    const datos = {
      prospecto: prospecto.trim(),
      contactedOn,
      kind,
      attendees: attendees.trim(),
      summary: summary.trim(),
      estado,
      nextContactOn: nextContactOn || null,
    }

    const ok = seguimiento
      ? await updateSeguimiento(seguimiento.id, datos)
      : await addSeguimiento(datos)

    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editando ? 'Seguimiento actualizado' : 'Contacto registrado', {
      description: datos.prospecto,
    })
    if (!editando) reset()
    setVisible(false)
  }

  const cuerpo = (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {editando ? 'Editar contacto' : 'Registrar contacto'}
        </DialogTitle>
        <DialogDescription>
          Una reunión, llamada o mail con un prospecto. Lo importante es de qué
          lado queda la pelota y para cuándo.
        </DialogDescription>
      </DialogHeader>
      <form id="sg-form" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sg-prospecto">Prospecto</FieldLabel>
            <Input
              id="sg-prospecto"
              value={prospecto}
              onChange={(e) => setProspecto(e.target.value)}
              placeholder="Ej: Hotel Mediterráneo"
              list="sg-prospectos"
              autoComplete="off"
            />
            {/* El navegador ofrece los que ya existen. Es lo que evita que
                el mismo prospecto termine escrito de tres formas. */}
            <datalist id="sg-prospectos">
              {prospectosConocidos.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {seSumaA ? (
              <p className="text-xs text-neon-blue">
                Se suma al hilo de «{seSumaA}».
              </p>
            ) : null}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sg-fecha">Cuándo fue</FieldLabel>
              <Input
                id="sg-fecha"
                type="date"
                value={contactedOn}
                onChange={(e) => setContactedOn(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sg-kind">Por dónde</FieldLabel>
              <SimpleSelect
                id="sg-kind"
                value={kind}
                onValueChange={(v) => setKind(v as SeguimientoKind)}
                options={toOptions(SEGUIMIENTO_KINDS)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="sg-attendees">Quiénes estuvieron</FieldLabel>
            <Input
              id="sg-attendees"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Ej: Matías y Joaco; por ellos, Laura (gerenta)"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="sg-summary">Qué se habló y cómo fue</FieldLabel>
            <Textarea
              id="sg-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Les mostramos el sistema de reservas. Interesados, pero quieren ver precios de la competencia primero..."
              rows={4}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sg-estado">Cómo quedó</FieldLabel>
              <SimpleSelect
                id="sg-estado"
                value={estado}
                onValueChange={(v) => setEstado(v as SeguimientoEstado)}
                options={toOptions(SEGUIMIENTO_ESTADOS)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sg-proximo">Retomar el</FieldLabel>
              <Input
                id="sg-proximo"
                type="date"
                value={nextContactOn}
                min={contactedOn}
                onChange={(e) => setNextContactOn(e.target.value)}
                aria-invalid={fechaAlReves || undefined}
                aria-describedby={fechaAlReves ? 'sg-proximo-error' : undefined}
              />
              {fechaAlReves ? (
                <p id="sg-proximo-error" role="alert" className="text-xs text-amber-300">
                  No puede ser anterior al contacto.
                </p>
              ) : null}
            </Field>
          </div>

          <p className="-mt-2 text-xs text-muted-foreground text-pretty">
            {estado === 'Pelota nuestra'
              ? 'Con la pelota de nuestro lado, la fecha para retomar avisa en la campana.'
              : estado === 'Pelota de ellos'
                ? 'Esperando respuesta de ellos: no avisa nada, no hay qué hacer hasta que contesten.'
                : 'Cerrado: no avisa aunque le quede fecha.'}
          </p>
        </FieldGroup>
      </form>
      {/* El footer va FUERA del <form> para que sea hijo directo del
          DialogContent y quede clavado abajo del marco, arriba del teclado.
          El submit se mantiene con el par id/form del botón. */}
      <DialogFooter className="mt-6">
        {controlado ? (
          <Button type="button" variant="ghost" onClick={() => setVisible(false)}>
            Cancelar
          </Button>
        ) : (
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancelar
          </DialogClose>
        )}
        <Button type="submit" form="sg-form" disabled={saving}>
          {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar'}
        </Button>
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
        render={
          <Button size="sm" variant={triggerVariant} disabled={!seguimientosReady} />
        }
      >
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      {cuerpo}
    </Dialog>
  )
}

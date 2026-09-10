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
import { MoneyInput } from '@/components/shared/money-input'
import { SimpleSelect } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import { estadoFactura, imputadoA } from '@/lib/facturas'
import { formatMoney, todayIso } from '@/lib/format'
import type { Factura, Project } from '@/lib/types'

/**
 * Alta y edición de una factura, en un solo componente.
 *
 * La MONEDA no se elige: es la del proyecto, y se muestra al lado del
 * importe. Una moneda propia abriría una tercera conversión —cotizado,
 * facturado y cobrado en tres monedas distintas— y este sistema no tiene
 * cotización cargada para resolverla. Con la del proyecto, el equivalente de
 * un cobro en otra moneda salda la factura sin ninguna cuenta extra.
 *
 * El ESTADO tampoco se elige, y no está por olvido: sale de los cobros
 * imputados. Se mueve imputando un cobro, que es lo que de verdad pasa.
 */
export function FacturaDialog({
  factura,
  proyectoFijo,
  open,
  onOpenChange,
  triggerLabel = 'Nueva factura',
  triggerVariant = 'outline',
}: {
  factura?: Factura
  /** Clava el proyecto y esconde el selector. */
  proyectoFijo?: Project
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const { projects, payments, facturasReady, addFactura, updateFactura, deleteFactura } =
    useStore()

  const controlado = open !== undefined
  const [abierto, setAbierto] = React.useState(false)
  const visible = controlado ? open : abierto
  const setVisible = (v: boolean) => {
    if (controlado) onOpenChange?.(v)
    else setAbierto(v)
  }

  const editando = !!factura

  const [projectId, setProjectId] = React.useState(
    factura?.projectId ?? proyectoFijo?.id ?? '',
  )
  const [numero, setNumero] = React.useState(factura?.numero ?? '')
  const [emitidaOn, setEmitidaOn] = React.useState(
    factura?.emitidaOn ?? todayIso(),
  )
  const [venceOn, setVenceOn] = React.useState(factura?.venceOn ?? '')
  const [importe, setImporte] = React.useState(
    factura ? String(factura.importe) : '',
  )
  const [notas, setNotas] = React.useState(factura?.notas ?? '')
  const [confirmandoBorrado, setConfirmandoBorrado] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Sólo los de terceros: un proyecto propio no se le factura a nadie, y la
  // regla ya está en el modelo (un propio no puede tener cliente).
  const facturables = projects.filter((p) => p.type === 'terceros')
  const project = proyectoFijo ?? projects.find((p) => p.id === projectId)

  const fechaAlReves = venceOn !== '' && venceOn < emitidaOn
  const valid =
    !!project &&
    numero.trim() !== '' &&
    Number(importe) > 0 &&
    emitidaOn !== '' &&
    !fechaAlReves

  /** Lo ya cobrado contra esta factura, para no dejar bajar el importe abajo. */
  const yaImputado =
    factura && project ? imputadoA(factura, payments, project) : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !project || saving) return
    setSaving(true)
    const datos = {
      projectId: project.id,
      numero: numero.trim(),
      emitidaOn,
      venceOn: venceOn || null,
      importe: Number(importe),
      notas: notas.trim(),
    }
    const ok = factura
      ? await updateFactura(factura.id, datos)
      : await addFactura(datos)
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editando ? 'Factura actualizada' : 'Factura registrada', {
      description: `${datos.numero} · ${formatMoney(datos.importe, project.currency)}`,
    })
    setVisible(false)
  }

  async function borrar() {
    if (!factura || saving) return
    setSaving(true)
    const ok = await deleteFactura(factura.id)
    setSaving(false)
    if (!ok) return
    toast.success('Factura eliminada', { description: factura.numero })
    setVisible(false)
  }

  const cuerpo = (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {confirmandoBorrado
            ? 'Eliminar factura'
            : editando
              ? 'Editar factura'
              : 'Nueva factura'}
        </DialogTitle>
        <DialogDescription>
          {confirmandoBorrado
            ? 'Se borra de forma definitiva.'
            : project
              ? `${project.name} · importe en ${project.currency}`
              : 'Elegí el proyecto que se factura.'}
        </DialogDescription>
      </DialogHeader>

      {confirmandoBorrado && factura ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm leading-relaxed text-red-200 text-pretty">
          <p>
            <strong>{factura.numero}</strong> ·{' '}
            {project ? formatMoney(factura.importe, project.currency) : ''}
          </p>
          <p className="mt-2 text-xs text-red-200/80">
            {yaImputado > 0
              ? 'Los cobros que la saldaban NO se borran: quedan sin imputar, porque esa plata entró igual. Van a aparecer como «cobros sin imputar» hasta que los asignes a otra factura.'
              : 'No tiene cobros imputados, así que no se pierde plata.'}
          </p>
        </div>
      ) : (
        <form id="fac-form" onSubmit={submit}>
          <FieldGroup>
            {proyectoFijo ? null : (
              <Field>
                <FieldLabel htmlFor="fac-project">Proyecto</FieldLabel>
                <SimpleSelect
                  id="fac-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Elegí el proyecto"
                  options={facturables.map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${p.currency}`,
                  }))}
                />
              </Field>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fac-numero">Número</FieldLabel>
                <Input
                  id="fac-numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ej: A-0001-00001234"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fac-importe">
                  Importe {project ? `(${project.currency})` : ''}
                </FieldLabel>
                <MoneyInput
                  id="fac-importe"
                  value={importe}
                  onValueChange={setImporte}
                  placeholder="0"
                />
                {editando && yaImputado > 0 && project ? (
                  <p
                    className={
                      Number(importe) < yaImputado
                        ? 'text-xs text-amber-300'
                        : 'text-xs text-muted-foreground'
                    }
                  >
                    Ya tiene {formatMoney(yaImputado, project.currency)}{' '}
                    imputados
                    {Number(importe) < yaImputado
                      ? ': con este importe queda cobrada de más.'
                      : '.'}
                  </p>
                ) : null}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fac-emitida">Fecha</FieldLabel>
                <Input
                  id="fac-emitida"
                  type="date"
                  value={emitidaOn}
                  onChange={(e) => setEmitidaOn(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fac-vence">Vence (opcional)</FieldLabel>
                <Input
                  id="fac-vence"
                  type="date"
                  value={venceOn}
                  min={emitidaOn}
                  onChange={(e) => setVenceOn(e.target.value)}
                  aria-invalid={fechaAlReves || undefined}
                />
                {fechaAlReves ? (
                  <p role="alert" className="text-xs text-amber-300">
                    No puede vencer antes de emitirse.
                  </p>
                ) : null}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="fac-notas">Notas</FieldLabel>
              <Textarea
                id="fac-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Qué cubre, condiciones, lo que haga falta..."
                rows={2}
              />
            </Field>

            {/* El estado no es un campo, y conviene decir por qué para que
                nadie lo busque. */}
            {editando && factura && project ? (
              <p className="text-xs text-muted-foreground text-pretty">
                Estado:{' '}
                <span className="font-medium text-foreground">
                  {estadoFactura(factura, payments, project)}
                </span>
                . No se elige: sale de los cobros que se le imputan, así que se
                mueve solo al registrar uno.
              </p>
            ) : null}
          </FieldGroup>
        </form>
      )}

      <DialogFooter className="mt-6">
        {confirmandoBorrado ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmandoBorrado(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => void borrar()}
              disabled={saving}
            >
              {saving ? 'Eliminando...' : 'Eliminar factura'}
            </Button>
          </>
        ) : (
          <>
            {editando ? (
              <Button
                variant="ghost"
                className="text-red-300 hover:text-red-200"
                onClick={() => setConfirmandoBorrado(true)}
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
            <Button type="submit" form="fac-form" disabled={saving || !valid}>
              {saving ? 'Guardando...' : editando ? 'Guardar' : 'Registrar'}
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
        render={
          <Button size="sm" variant={triggerVariant} disabled={!facturasReady} />
        }
      >
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      {cuerpo}
    </Dialog>
  )
}

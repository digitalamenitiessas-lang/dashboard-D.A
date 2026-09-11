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
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import { estadoFactura, imputadoA } from '@/lib/facturas'
import { formatMoney, todayIso } from '@/lib/format'
import type { Client, Currency, Factura } from '@/lib/types'

/**
 * Alta y edición de una factura de cliente.
 *
 * No es un comprobante de AFIP: es el registro de qué se le facturó a quién,
 * para saber qué está cobrado y qué no. Por eso alcanza con número,
 * concepto, importe y fecha.
 *
 * EL PROYECTO ES OPCIONAL, y esa es la parte importante. «Servicio de
 * hosting» no es un proyecto; obligar a inventarle uno para poder facturarlo
 * ensuciaría la lista de proyectos con cosas que no lo son. Con proyecto, la
 * factura suma a los números de ese proyecto; sin él, es un servicio suelto.
 *
 * EL ESTADO NO SE ELIGE: sale de los cobros imputados. Se mueve registrando
 * un cobro, que es lo que de verdad pasa.
 */
export function FacturaDialog({
  factura,
  cliente,
  open,
  onOpenChange,
  triggerLabel = 'Nueva factura',
  triggerVariant = 'outline',
}: {
  factura?: Factura
  /** Clava el cliente y esconde el selector. */
  cliente?: Client
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const {
    clients,
    projects,
    payments,
    facturasReady,
    addFactura,
    updateFactura,
    deleteFactura,
  } = useStore()

  const controlado = open !== undefined
  const [abierto, setAbierto] = React.useState(false)
  const visible = controlado ? open : abierto
  const setVisible = (v: boolean) => {
    if (controlado) onOpenChange?.(v)
    else setAbierto(v)
  }

  const editando = !!factura

  const [clienteId, setClienteId] = React.useState(
    factura?.clienteId ?? cliente?.id ?? '',
  )
  const [projectId, setProjectId] = React.useState(factura?.projectId ?? '')
  const [numero, setNumero] = React.useState(factura?.numero ?? '')
  const [concepto, setConcepto] = React.useState(factura?.concepto ?? '')
  const [emitidaOn, setEmitidaOn] = React.useState(
    factura?.emitidaOn ?? todayIso(),
  )
  const [venceOn, setVenceOn] = React.useState(factura?.venceOn ?? '')
  const [importe, setImporte] = React.useState(
    factura ? String(factura.importe) : '',
  )
  const [moneda, setMoneda] = React.useState<Currency>(factura?.moneda ?? 'USD')
  const [notas, setNotas] = React.useState(factura?.notas ?? '')
  const [confirmandoBorrado, setConfirmandoBorrado] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const elCliente = cliente ?? clients.find((c) => c.id === clienteId)

  /** Sólo los proyectos de ESE cliente: una factura no cruza clientes. */
  const proyectosDelCliente = React.useMemo(
    () => projects.filter((p) => p.clientId === (elCliente?.id ?? '')),
    [projects, elCliente],
  )
  const proyecto = proyectosDelCliente.find((p) => p.id === projectId)

  /**
   * Con proyecto, la moneda la manda el proyecto y el campo se bloquea: la
   * base lo exige con un trigger, porque «facturado» y «cotizado» del mismo
   * proyecto en monedas distintas harían que «sin facturar» reste peras con
   * manzanas.
   */
  React.useEffect(() => {
    if (proyecto) setMoneda(proyecto.currency)
  }, [proyecto])

  // Cambiar de cliente invalida un proyecto elegido del anterior.
  React.useEffect(() => {
    if (projectId && !proyectosDelCliente.some((p) => p.id === projectId)) {
      setProjectId('')
    }
  }, [projectId, proyectosDelCliente])

  const fechaAlReves = venceOn !== '' && venceOn < emitidaOn
  const valid =
    !!elCliente &&
    numero.trim() !== '' &&
    concepto.trim() !== '' &&
    Number(importe) > 0 &&
    emitidaOn !== '' &&
    !fechaAlReves

  const yaImputado = factura ? imputadoA(factura, payments) : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !elCliente || saving) return
    setSaving(true)
    const datos = {
      clienteId: elCliente.id,
      projectId: projectId || null,
      numero: numero.trim(),
      concepto: concepto.trim(),
      emitidaOn,
      venceOn: venceOn || null,
      importe: Number(importe),
      moneda,
      notas: notas.trim(),
    }
    const ok = factura
      ? await updateFactura(factura.id, datos)
      : await addFactura(datos)
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editando ? 'Factura actualizada' : 'Factura registrada', {
      description: `${datos.numero} · ${formatMoney(datos.importe, moneda)}`,
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
    <DialogContent className="sm:max-w-lg">
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
            : 'Lo que se le factura al cliente. Se cancela sola con los cobros que se le imputen.'}
        </DialogDescription>
      </DialogHeader>

      {confirmandoBorrado && factura ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm leading-relaxed text-red-200 text-pretty">
          <p>
            <strong>{factura.numero}</strong> ·{' '}
            {formatMoney(factura.importe, factura.moneda)}
            {factura.concepto ? ` · ${factura.concepto}` : ''}
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
            {cliente ? null : (
              <Field>
                <FieldLabel htmlFor="fac-cliente">Cliente</FieldLabel>
                <SimpleSelect
                  id="fac-cliente"
                  value={clienteId}
                  onValueChange={setClienteId}
                  placeholder="Elegí el cliente"
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="fac-concepto">Concepto</FieldLabel>
              <Input
                id="fac-concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: Servicio de hosting · septiembre"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="fac-project">
                Proyecto (opcional)
              </FieldLabel>
              <SimpleSelect
                id="fac-project"
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Sin proyecto — servicio suelto"
                options={[
                  { value: '', label: 'Sin proyecto — servicio suelto' },
                  ...proyectosDelCliente.map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${p.currency}`,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground text-pretty">
                {proyecto
                  ? `Suma a lo facturado de ${proyecto.name}, y va en ${proyecto.currency} como el proyecto.`
                  : 'Un servicio que no es parte de ningún desarrollo: hosting, soporte, dominio.'}
              </p>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fac-numero">Número</FieldLabel>
                <Input
                  id="fac-numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ej: 0001-00001234"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fac-moneda">Moneda</FieldLabel>
                <SimpleSelect
                  id="fac-moneda"
                  value={moneda}
                  onValueChange={(v) => setMoneda(v as Currency)}
                  options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                />
                {proyecto ? (
                  <p className="text-xs text-muted-foreground">
                    La manda el proyecto.
                  </p>
                ) : null}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fac-importe">
                  Importe ({moneda})
                </FieldLabel>
                <MoneyInput
                  id="fac-importe"
                  value={importe}
                  onValueChange={setImporte}
                  placeholder="0"
                />
                {editando && yaImputado > 0 ? (
                  <p
                    className={
                      Number(importe) < yaImputado
                        ? 'text-xs text-amber-300'
                        : 'text-xs text-muted-foreground'
                    }
                  >
                    Ya tiene {formatMoney(yaImputado, moneda)} cobrados
                    {Number(importe) < yaImputado
                      ? ': con este importe queda cobrada de más.'
                      : '.'}
                  </p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="fac-emitida">Fecha</FieldLabel>
                <Input
                  id="fac-emitida"
                  type="date"
                  value={emitidaOn}
                  onChange={(e) => setEmitidaOn(e.target.value)}
                />
              </Field>
            </div>

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

            <Field>
              <FieldLabel htmlFor="fac-notas">Notas</FieldLabel>
              <Textarea
                id="fac-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
              />
            </Field>

            {editando && factura ? (
              <p className="text-xs text-muted-foreground text-pretty">
                Estado:{' '}
                <span className="font-medium text-foreground">
                  {estadoFactura(factura, payments)}
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

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
import {
  estadoFacturaProveedor,
  pagadoDe,
  vencimientoSugerido,
} from '@/lib/proveedores'
import { formatMoney, todayIso } from '@/lib/format'
import type { Currency, FacturaProveedor, Proveedor } from '@/lib/types'

/**
 * Lo que nos factura un proveedor.
 *
 * El vencimiento arranca calculado con el plazo pactado con ese proveedor,
 * que es para lo que existe ese campo: cargar la factura de Hostinger no
 * debería obligar a hacer la cuenta de los 30 días a mano cada vez.
 *
 * El ESTADO no se elige: sale de los pagos imputados desde Caja.
 */
export function FacturaProveedorDialog({
  factura,
  proveedor,
  open,
  onOpenChange,
  triggerLabel = 'Nueva factura',
}: {
  factura?: FacturaProveedor
  proveedor: Proveedor
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
}) {
  const {
    projects,
    movements,
    proveedoresReady,
    addFacturaProveedor,
    updateFacturaProveedor,
    deleteFacturaProveedor,
  } = useStore()

  const controlado = open !== undefined
  const [abierto, setAbierto] = React.useState(false)
  const visible = controlado ? open : abierto
  const setVisible = (v: boolean) => {
    if (controlado) onOpenChange?.(v)
    else setAbierto(v)
  }

  const editando = !!factura
  const [numero, setNumero] = React.useState(factura?.numero ?? '')
  const [concepto, setConcepto] = React.useState(factura?.concepto ?? '')
  const [emitidaOn, setEmitidaOn] = React.useState(
    factura?.emitidaOn ?? todayIso(),
  )
  const [venceOn, setVenceOn] = React.useState(
    factura?.venceOn ?? vencimientoSugerido(proveedor, todayIso()) ?? '',
  )
  const [importe, setImporte] = React.useState(
    factura ? String(factura.importe) : '',
  )
  const [moneda, setMoneda] = React.useState<Currency>(factura?.moneda ?? 'USD')
  const [projectId, setProjectId] = React.useState(factura?.projectId ?? '')
  const [notas, setNotas] = React.useState(factura?.notas ?? '')
  const [confirmando, setConfirmando] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Al mover la fecha de emisión se recalcula el vencimiento, salvo en una
  // factura que ya existía: ahí la fecha cargada es un dato, no una
  // sugerencia, y pisarla sería perder lo que alguien escribió.
  React.useEffect(() => {
    if (editando) return
    const sug = vencimientoSugerido(proveedor, emitidaOn)
    if (sug) setVenceOn(sug)
  }, [emitidaOn, proveedor, editando])

  const fechaAlReves = venceOn !== '' && venceOn < emitidaOn
  const valid =
    concepto.trim() !== '' && Number(importe) > 0 && emitidaOn !== '' && !fechaAlReves

  const yaPagado = factura ? pagadoDe(factura, movements) : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const datos = {
      proveedorId: proveedor.id,
      numero: numero.trim(),
      concepto: concepto.trim(),
      emitidaOn,
      venceOn: venceOn || null,
      importe: Number(importe),
      moneda,
      projectId: projectId || null,
      notas: notas.trim(),
    }
    const ok = factura
      ? await updateFacturaProveedor(factura.id, datos)
      : await addFacturaProveedor(datos)
    setSaving(false)
    if (!ok) return
    toast.success(editando ? 'Factura actualizada' : 'Factura registrada', {
      description: `${proveedor.nombre} · ${formatMoney(datos.importe, moneda)}`,
    })
    setVisible(false)
  }

  async function borrar() {
    if (!factura || saving) return
    setSaving(true)
    const ok = await deleteFacturaProveedor(factura.id)
    setSaving(false)
    if (!ok) return
    toast.success('Factura eliminada')
    setVisible(false)
  }

  const cuerpo = (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {confirmando
            ? 'Eliminar factura'
            : editando
              ? 'Editar factura'
              : 'Nueva factura'}
        </DialogTitle>
        <DialogDescription>
          {confirmando
            ? 'Se borra de forma definitiva.'
            : `Lo que nos factura ${proveedor.nombre}. Queda abierta hasta que se pague desde Caja.`}
        </DialogDescription>
      </DialogHeader>

      {confirmando && factura ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm leading-relaxed text-red-200 text-pretty">
          <p>
            <strong>{factura.concepto}</strong> ·{' '}
            {formatMoney(factura.importe, factura.moneda)}
          </p>
          <p className="mt-2 text-xs text-red-200/80">
            {yaPagado > 0
              ? 'Los pagos que la saldaban NO se borran: siguen en Caja y quedan sin imputar, porque esa plata salió igual.'
              : 'No tiene pagos imputados, así que no se pierde nada.'}
          </p>
        </div>
      ) : (
        <form id="fp-form" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fp-concepto">Concepto</FieldLabel>
              <Input
                id="fp-concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: Hosting · septiembre"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fp-numero">
                  Número (si lo trae)
                </FieldLabel>
                <Input
                  id="fp-numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Opcional"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fp-moneda">Moneda</FieldLabel>
                <SimpleSelect
                  id="fp-moneda"
                  value={moneda}
                  onValueChange={(v) => setMoneda(v as Currency)}
                  options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fp-importe">Importe ({moneda})</FieldLabel>
                <MoneyInput
                  id="fp-importe"
                  value={importe}
                  onValueChange={setImporte}
                  placeholder="0"
                />
                {editando && yaPagado > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Ya tiene {formatMoney(yaPagado, moneda)} pagados.
                  </p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="fp-emitida">Fecha</FieldLabel>
                <Input
                  id="fp-emitida"
                  type="date"
                  value={emitidaOn}
                  onChange={(e) => setEmitidaOn(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fp-vence">Vence</FieldLabel>
                <Input
                  id="fp-vence"
                  type="date"
                  value={venceOn}
                  min={emitidaOn}
                  onChange={(e) => setVenceOn(e.target.value)}
                  aria-invalid={fechaAlReves || undefined}
                />
                <p
                  className={
                    fechaAlReves
                      ? 'text-xs text-amber-300'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {fechaAlReves
                    ? 'No puede vencer antes de emitirse.'
                    : proveedor.plazoDias !== null
                      ? `Calculado con el plazo de ${proveedor.plazoDias} días.`
                      : 'Sin plazo pactado con este proveedor.'}
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="fp-project">Proyecto (opcional)</FieldLabel>
                <SimpleSelect
                  id="fp-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Estructura"
                  options={[
                    { value: '', label: 'Estructura — sin proyecto' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="fp-notas">Notas</FieldLabel>
              <Textarea
                id="fp-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
              />
            </Field>

            {editando && factura ? (
              <p className="text-xs text-muted-foreground text-pretty">
                Estado:{' '}
                <span className="font-medium text-foreground">
                  {estadoFacturaProveedor(factura, movements)}
                </span>
                . No se elige: sale de los pagos que se le imputan desde Caja.
              </p>
            ) : null}
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
            <Button type="submit" form="fp-form" disabled={saving || !valid}>
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
          <Button size="sm" variant="outline" disabled={!proveedoresReady} />
        }
      >
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      {cuerpo}
    </Dialog>
  )
}

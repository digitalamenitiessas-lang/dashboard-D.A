'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { SimpleSelect } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { AccountSelect } from '@/components/caja/account-select'
import { useStore } from '@/lib/store'
import { formatMoney, todayIso } from '@/lib/format'
import { estadoFactura, saldoFactura } from '@/lib/facturas'
import type { Currency, PaymentMethod } from '@/lib/types'

const currencies: Currency[] = ['USD', 'ARS', 'EUR']
const methods: PaymentMethod[] = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Mercado Pago',
  'Crypto',
  'PayPal',
]

export function AddPaymentDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: string
}) {
  const { projects, accounts, payments, facturas, facturasReady, addPayment } =
    useStore()
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? '')
  const [concept, setConcept] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  /**
   * Cuánto de lo cotizado salda este cobro, en la moneda del PROYECTO.
   * Sólo aparece cuando el cobro viene en otra moneda — el caso real de la
   * empresa: se cotiza en dólares y el cliente paga en pesos al cambio.
   */
  const [applied, setApplied] = React.useState('')
  const [rate, setRate] = React.useState('')
  const [paidDate, setPaidDate] = React.useState(todayIso())
  const [method, setMethod] = React.useState<PaymentMethod>('Transferencia')
  const [receipt, setReceipt] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [facturaId, setFacturaId] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const project = projects.find((p) => p.id === projectId)

  React.useEffect(() => {
    if (open && defaultProjectId) setProjectId(defaultProjectId)
  }, [open, defaultProjectId])

  /**
   * La moneda arranca en la del PROYECTO, no en 'USD' fijo.
   *
   * Con el default en dólares, cargar un cobro en un proyecto en pesos dejaba
   * un cobro en USD sobre un proyecto en ARS: la deuda no bajaba, el saldo de
   * la cuenta quedaba mal, y el error se cargaba solo sin que nadie tocara
   * nada. Es el caso que el bug producía por descuido, no por decisión.
   */
  React.useEffect(() => {
    if (project) setCurrency(project.currency)
  }, [project])

  /** ¿El cobro entra en una moneda distinta a la que se cotizó? */
  const otraMoneda = !!project && currency !== project.currency

  /**
   * Las facturas de ESTE proyecto que todavía no están saldadas.
   *
   * Sólo del mismo proyecto: la base lo exige con un trigger, porque imputar
   * el cobro de un proyecto a la factura de otro haría mentir a las dos
   * pantallas a la vez —a una le sobra plata y a la otra le falta— sin nada
   * que lo delate. Acá el select directamente no las ofrece.
   *
   * Las saldadas tampoco: si ya está cancelada, imputarle otro cobro es casi
   * siempre un error de dedo.
   */
  const facturasAbiertas = React.useMemo(() => {
    if (!project) return []
    return facturas
      .filter((f) => f.projectId === project.id)
      .filter((f) => estadoFactura(f, payments, project) !== 'Cancelada')
  }, [facturas, payments, project])

  // Al cambiar de proyecto, una factura elegida del anterior deja de valer.
  React.useEffect(() => {
    setFacturaId('')
  }, [projectId])

  // Importe, cotización y equivalente son tres vistas de la misma operación,
  // así que editar cualquiera mantiene honestas a las otras dos. Es el mismo
  // patrón que ya usa el diálogo de movimientos de Caja para un cambio de
  // moneda: se tipean los dos que uno sabe y el tercero sale solo.
  const dec = (n: number) => (Math.round(n * 100) / 100).toString()

  function cambiarImporte(v: string) {
    setAmount(v)
    if (!otraMoneda) return
    const entra = Number(v)
    if (entra <= 0) return
    if (Number(rate) > 0) setApplied(dec(entra / Number(rate)))
    else if (Number(applied) > 0) setRate(dec(entra / Number(applied)))
  }

  function cambiarCotizacion(v: string) {
    setRate(v)
    const r = Number(v)
    const entra = Number(amount)
    if (r > 0 && entra > 0) setApplied(dec(entra / r))
  }

  function cambiarEquivalente(v: string) {
    setApplied(v)
    if (!otraMoneda) return
    const eq = Number(v)
    const entra = Number(amount)
    if (eq > 0 && entra > 0) setRate(dec(entra / eq))
  }

  // An account holds one currency, so switching the currency can leave a
  // now-invalid account selected.
  React.useEffect(() => {
    const picked = accounts.find((a) => a.id === accountId)
    if (picked && picked.currency !== currency) setAccountId('')
  }, [currency, accountId, accounts])

  const valid =
    !!projectId &&
    !!concept.trim() &&
    Number(amount) > 0 &&
    !!paidDate &&
    // En otra moneda el equivalente es obligatorio: sin él el cobro no
    // descuenta nada de la deuda, que es exactamente el agujero que se está
    // tapando. Mejor no dejar guardarlo que guardarlo y que no sirva.
    (!otraMoneda || Number(applied) > 0)

  // Sin este candado el botón sigue clickeable durante el await y un doble
  // click carga el mismo cobro dos veces: plata duplicada en la caja.
  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    const ok = await addPayment({
      projectId,
      concept: concept.trim(),
      amount: Number(amount),
      currency,
      appliedAmount: otraMoneda ? Number(applied) : null,
      facturaId: facturaId || null,
      paidDate,
      method,
      receipt: receipt.trim() || null,
      notes: '',
      accountId: accountId || null,
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    setConcept('')
    setAmount('')
    setApplied('')
    setRate('')
    setFacturaId('')
    setPaidDate(todayIso())
    setReceipt('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus data-icon="inline-start" />
            Agregar pago
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Un pago es plata que ya entró: cargá el concepto, el monto y la
            fecha en que la cobraste.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!defaultProjectId ? (
            <Field>
              <FieldLabel>Proyecto</FieldLabel>
              <SimpleSelect
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Elegir proyecto"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="pay-concept">Concepto</FieldLabel>
            <Input
              id="pay-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej: Anticipo 50%"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pay-amount">Monto</FieldLabel>
              <MoneyInput
                id="pay-amount"
                value={amount}
                onValueChange={cambiarImporte}
                placeholder="0"
              />
            </Field>
            <Field>
              <FieldLabel>Moneda</FieldLabel>
              <SimpleSelect
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={currencies.map((c) => ({ value: c, label: c }))}
              />
            </Field>
          </div>

          {/* Imputar el cobro a una factura. Es lo que hace que el estado de
              la factura se mueva solo: Pendiente → Parcial → Cancelada sale de
              comparar su importe con lo imputado, así que no hay ningún estado
              que actualizar a mano ni que se pueda desincronizar. */}
          {facturasReady && project ? (
            <Field>
              <FieldLabel htmlFor="pay-factura">
                Factura que salda (opcional)
              </FieldLabel>
              <SimpleSelect
                id="pay-factura"
                value={facturaId}
                onValueChange={setFacturaId}
                placeholder={
                  facturasAbiertas.length === 0
                    ? 'Este proyecto no tiene facturas abiertas'
                    : 'Sin imputar'
                }
                options={[
                  { value: '', label: 'Sin imputar' },
                  ...facturasAbiertas.map((f) => ({
                    value: f.id,
                    label: `${f.numero} · falta ${formatMoney(
                      saldoFactura(f, payments, project),
                      project.currency,
                    )}`,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground text-pretty">
                {facturaId
                  ? 'Al guardar, esta factura se recalcula sola.'
                  : 'Sin imputar, la plata entra igual pero no salda ninguna factura.'}
              </p>
            </Field>
          ) : null}

          {/* Sólo cuando el cobro entra en otra moneda que la cotizada. Es el
              caso real: se cotiza en dólares y pagan en pesos al cambio del
              día. Dos montos y no una cotización guardada — la cotización es
              la división de los dos, y así queda como dato de lo que
              efectivamente pasó ese día. */}
          {otraMoneda && project ? (
            <div className="flex flex-col gap-3 rounded-xl border border-neon-blue/25 bg-neon-blue/[0.06] p-3">
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                El proyecto está cotizado en{' '}
                <span className="font-medium text-foreground">
                  {project.currency}
                </span>{' '}
                y este cobro entra en{' '}
                <span className="font-medium text-foreground">{currency}</span>.
                Completá dos de los dos campos y el otro se calcula solo.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="pay-rate">
                    Cotización ({currency} por {project.currency})
                  </FieldLabel>
                  <MoneyInput
                    id="pay-rate"
                    value={rate}
                    onValueChange={cambiarCotizacion}
                    placeholder="0"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pay-applied">
                    Equivale a ({project.currency})
                  </FieldLabel>
                  <MoneyInput
                    id="pay-applied"
                    value={applied}
                    onValueChange={cambiarEquivalente}
                    placeholder="0"
                  />
                  {Number(applied) > 0 ? null : (
                    <p className="text-xs text-amber-300">
                      Sin esto el cobro no descuenta nada de la deuda.
                    </p>
                  )}
                </Field>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pay-paid">Fecha de pago</FieldLabel>
              <Input
                id="pay-paid"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Medio de pago</FieldLabel>
              <SimpleSelect
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                options={methods.map((m) => ({ value: m, label: m }))}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pay-account">¿A qué cuenta entró?</FieldLabel>
            <AccountSelect
              id="pay-account"
              value={accountId}
              onValueChange={setAccountId}
              currency={currency}
              allowNone
              noneLabel="Definir después"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-receipt">Comprobante (opcional)</FieldLabel>
            <Input
              id="pay-receipt"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              placeholder="N° de factura o referencia"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !valid}>
            {saving ? 'Registrando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

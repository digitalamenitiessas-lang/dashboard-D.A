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
import { Switch } from '@/components/ui/switch'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { AccountSelect } from '@/components/caja/account-select'
import { useStore } from '@/lib/store'
import { hasMaintenancePlan } from '@/lib/derive'
import { Trash2 } from 'lucide-react'
import { formatDate, formatMoney, todayIso } from '@/lib/format'
import { MAINTENANCE_FREQUENCIES } from '@/lib/types'
import type {
  Currency,
  MaintenanceCharge,
  MaintenanceFrequency,
  MaintenanceStatus,
  PaymentMethod,
  Project,
} from '@/lib/types'

const methods: PaymentMethod[] = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Mercado Pago',
  'Crypto',
  'PayPal',
]

/** Projects already handed over: activating one shouldn't move its status. */
const DELIVERED = ['Implementado', 'En mantenimiento', 'Finalizado']

export function ActivateMaintenanceDialog({
  project,
  open,
  onOpenChange,
}: {
  /** Omit to let the dialog pick the project — that's the flow from the
   *  Mantenimientos header, where no project is selected yet. */
  project?: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { projects, activateMaintenance } = useStore()

  // Los que todavía no tienen NINGÚN plan cargado. Antes preguntaba por
  // `active`, así que un plan pausado aparecía acá como si no existiera y se
  // le podía cargar otro encima, pisando el importe y las fechas del que ya
  // estaba. Un plan parado se edita, no se vuelve a crear.
  const selectable = projects.filter((p) => !hasMaintenancePlan(p.maintenance))
  const [projectId, setProjectId] = React.useState(project?.id ?? '')
  const target = project ?? projects.find((p) => p.id === projectId)
  const m = target?.maintenance

  const [amount, setAmount] = React.useState(String(m?.amount || ''))
  const [currency, setCurrency] = React.useState<Currency>(m?.currency ?? 'USD')
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>(
    m?.frequency ?? 'Mensual',
  )
  const [dueDay, setDueDay] = React.useState(String(m?.dueDay || 1))
  // El último día de la ventana. Arranca en 10 porque es como cobra la
  // empresa —«entre el 1 y el 10»— y porque el caso de un solo día se
  // expresa poniendo el mismo número en los dos.
  const [dueDayTo, setDueDayTo] = React.useState(
    String(m?.dueDayTo ?? Math.max(m?.dueDay ?? 1, 10)),
  )
  const [startDate, setStartDate] = React.useState(
    m?.startDate ?? project?.implementationDate ?? todayIso(),
  )
  const [services, setServices] = React.useState(m?.services.join('\n') ?? '')
  const [markInMaintenance, setMarkInMaintenance] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // Picking a project mid-dialog re-seeds whatever it already had stored,
  // and decides whether moving its status makes sense.
  React.useEffect(() => {
    if (project || !target) return
    setAmount(String(target.maintenance.amount || ''))
    setCurrency(target.maintenance.currency)
    setFrequency(target.maintenance.frequency)
    setDueDay(String(target.maintenance.dueDay || 1))
    setDueDayTo(
      String(
        target.maintenance.dueDayTo ??
          Math.max(target.maintenance.dueDay || 1, 10),
      ),
    )
    setStartDate(
      target.maintenance.startDate ??
        target.implementationDate ??
        todayIso(),
    )
    setServices(target.maintenance.services.join('\n'))
    setMarkInMaintenance(
      DELIVERED.includes(target.status) || target.implementationDate !== null,
    )
  }, [project, target])

  const valid =
    !!target &&
    Number(amount) > 0 &&
    Number(dueDay) >= 1 &&
    Number(dueDay) <= 28 &&
    Number(dueDayTo) >= Number(dueDay) &&
    Number(dueDayTo) <= 28

  async function submit() {
    if (!valid || !target || saving) return
    setSaving(true)
    const ok = await activateMaintenance(
      target.id,
      {
        implementationDate: target.implementationDate ?? startDate,
        startDate,
        amount: Number(amount),
        currency,
        frequency,
        dueDay: Number(dueDay),
        dueDayTo: Number(dueDayTo),
        services: services
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      { markProjectInMaintenance: markInMaintenance },
    )
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Mantenimiento activado', { description: target.name })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activar mantenimiento</DialogTitle>
          <DialogDescription>
            {project
              ? project.name
              : 'Elegí el proyecto y definí cada cuánto y cuánto se cobra.'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!project ? (
            <Field>
              <FieldLabel htmlFor="am-project">Proyecto</FieldLabel>
              <SimpleSelect
                id="am-project"
                value={projectId}
                onValueChange={setProjectId}
                placeholder={
                  selectable.length === 0
                    ? 'Todos tienen plan activo'
                    : 'Elegir proyecto'
                }
                options={selectable.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${p.status}`,
                }))}
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="am-amount">Importe</FieldLabel>
              <MoneyInput
                id="am-amount"
                value={amount}
                onValueChange={setAmount}
                placeholder="0"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="am-currency">Moneda</FieldLabel>
              <SimpleSelect
                id="am-currency"
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={toOptions(['USD', 'ARS', 'EUR'] as const)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="am-frequency">Frecuencia</FieldLabel>
              <SimpleSelect
                id="am-frequency"
                value={frequency}
                onValueChange={(v) => setFrequency(v as MaintenanceFrequency)}
                options={toOptions(MAINTENANCE_FREQUENCIES)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="am-dueday">Cobra desde el día</FieldLabel>
              <Input
                id="am-dueday"
                type="number"
                // Sin esto iOS abre el teclado alfanumérico completo para
                // tipear un número del 1 al 28.
                inputMode="numeric"
                min="1"
                max="28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="am-duedayto">Hasta el día</FieldLabel>
            <Input
              id="am-duedayto"
              type="number"
              inputMode="numeric"
              min="1"
              max="28"
              value={dueDayTo}
              onChange={(e) => setDueDayTo(e.target.value)}
            />
            {/* La ventana es lo que evita la mora fantasma: recién pasado
                este día el período cuenta como vencido y dispara el aviso. */}
            <p
              className={
                Number(dueDayTo) < Number(dueDay)
                  ? 'text-xs text-amber-300'
                  : 'text-xs text-muted-foreground'
              }
            >
              {Number(dueDayTo) < Number(dueDay)
                ? 'No puede cerrar antes de abrir.'
                : `Se cobra ${Number(dueDayTo) === Number(dueDay) ? `el día ${dueDay}` : `del ${dueDay} al ${dueDayTo}`} de cada período. Después de esa fecha cuenta como vencido y avisa.`}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="am-start">Fecha de inicio</FieldLabel>
            <Input
              id="am-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="am-services">
              Servicios incluidos (uno por línea)
            </FieldLabel>
            <Textarea
              id="am-services"
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder={'Soporte prioritario\nBackups diarios'}
              rows={3}
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Pasar el proyecto a «En mantenimiento»
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  {target
                    ? `Hoy está en «${target.status}». Desactivalo si querés dejar el plan armado sin mover el estado.`
                    : 'Cambia el estado del proyecto al activar el plan.'}
                </p>
              </div>
              <Switch
                checked={markInMaintenance}
                onCheckedChange={setMarkInMaintenance}
              />
            </div>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !valid}>
            {saving ? 'Activando...' : 'Activar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CollectMaintenanceDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { collectMaintenance } = useStore()
  const [date, setDate] = React.useState(todayIso())
  const [amount, setAmount] = React.useState(String(project.maintenance.amount))
  const [method, setMethod] = React.useState<PaymentMethod>('Transferencia')
  const [receipt, setReceipt] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const valid = Number(amount) > 0

  // Sin este candado el botón sigue clickeable durante el await y un doble
  // click carga el mismo cobro dos veces: plata duplicada en la caja.
  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    const ok = await collectMaintenance(project.id, {
      date,
      amount: Number(amount),
      method,
      receipt: receipt.trim() || null,
      accountId: accountId || null,
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Mantenimiento cobrado', {
      description: `${project.name} — ${formatMoney(
        Number(amount),
        project.maintenance.currency,
      )}`,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro de mantenimiento</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="cm-date">Fecha de cobro</FieldLabel>
              <Input
                id="cm-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cm-amount">Importe</FieldLabel>
              <MoneyInput
                id="cm-amount"
                value={amount}
                onValueChange={setAmount}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="cm-method">Método de pago</FieldLabel>
            <SimpleSelect
              id="cm-method"
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
              options={methods.map((m) => ({ value: m, label: m }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-account">¿A qué cuenta entró?</FieldLabel>
            <AccountSelect
              id="cm-account"
              value={accountId}
              onValueChange={setAccountId}
              currency={project.maintenance.currency}
              allowNone
              noneLabel="Definir después"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cm-receipt">Comprobante (opcional)</FieldLabel>
            <Input
              id="cm-receipt"
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
            {saving ? 'Registrando...' : 'Confirmar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'Activo',
  'Pausado',
  'Cancelado',
]

/**
 * Editar el PLAN: cuánto se cobra, cada cuánto, qué día, desde cuándo y en
 * qué estado está.
 *
 * No existía. `updateMaintenance` estaba en el store desde siempre pero sin
 * un solo llamador, así que corregir un importe mal cargado —o pausar un
 * plan— exigía SQL a mano.
 *
 * Dos cosas que el diálogo dice en voz alta porque no son obvias y cambian
 * plata:
 *
 * - Editar el importe es RETROACTIVO. La mora se calcula como «períodos sin
 *   cobrar × importe actual» (`maintenancePeriods()` en lib/derive.ts), así
 *   que corregir el número también corrige lo que se muestra como adeudado
 *   de los períodos viejos. Para un número mal tipeado es exactamente lo que
 *   se quiere; para una suba de precio pactada desde tal mes, no.
 * - Mover la fecha de inicio, la frecuencia o el día corre TODO el
 *   calendario, porque la serie de vencimientos sale de esos tres datos y
 *   nunca del último cobro.
 */
export function EditMaintenanceDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateMaintenance, updateProject } = useStore()
  const m = project.maintenance

  // El plan NO tiene nombre propio: lo que se ve en la tarjeta es el nombre
  // del PROYECTO, que vive en otra tabla y se guarda con otra mutación. Se
  // ofrece igual porque es lo que uno viene a corregir junto con el importe,
  // pero el label dice de qué nombre se trata: cambiarlo acá lo cambia en
  // toda la app, no sólo en Mantenimientos.
  const [name, setName] = React.useState(project.name)
  const [amount, setAmount] = React.useState(String(m.amount || ''))
  const [currency, setCurrency] = React.useState<Currency>(m.currency)
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>(
    m.frequency,
  )
  const [dueDay, setDueDay] = React.useState(String(m.dueDay || 1))
  const [dueDayTo, setDueDayTo] = React.useState(
    String(m.dueDayTo ?? m.dueDay ?? 1),
  )
  const [startDate, setStartDate] = React.useState(
    m.startDate ?? m.implementationDate ?? todayIso(),
  )
  const [status, setStatus] = React.useState<MaintenanceStatus>(m.status)
  const [services, setServices] = React.useState(m.services.join('\n'))
  const [saving, setSaving] = React.useState(false)

  const valid =
    name.trim() !== '' &&
    Number(amount) > 0 &&
    Number(dueDay) >= 1 &&
    Number(dueDay) <= 28 &&
    Number(dueDayTo) >= Number(dueDay) &&
    Number(dueDayTo) <= 28

  const cambiaPlata =
    Number(amount) !== m.amount || currency !== m.currency
  const cambiaCalendario =
    frequency !== m.frequency ||
    Number(dueDay) !== m.dueDay ||
    Number(dueDayTo) !== (m.dueDayTo ?? m.dueDay) ||
    startDate !== (m.startDate ?? m.implementationDate ?? '')

  async function submit() {
    if (!valid || saving) return
    setSaving(true)

    // El nombre primero y sólo si cambió: es otra tabla, y un update de
    // proyecto por cada guardado del plan ensuciaría `updated_at` y el
    // orden de «actualizados recientemente» sin que nadie haya tocado nada.
    if (name.trim() !== project.name) {
      const okName = await updateProject(project.id, { name: name.trim() })
      if (!okName) {
        setSaving(false)
        return
      }
    }

    const ok = await updateMaintenance(project.id, {
      amount: Number(amount),
      currency,
      frequency,
      dueDay: Number(dueDay),
      dueDayTo: Number(dueDayTo),
      startDate,
      status,
      services: services
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Mantenimiento actualizado', { description: project.name })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar mantenimiento</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="em-name">Nombre del proyecto</FieldLabel>
            <Input
              id="em-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name.trim() !== project.name ? (
              <p className="text-xs text-amber-300 text-pretty">
                Es el nombre del proyecto: cambia en toda la app, no sólo acá.
              </p>
            ) : null}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="em-amount">Importe por período</FieldLabel>
              <MoneyInput
                id="em-amount"
                value={amount}
                onValueChange={setAmount}
                placeholder="0"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="em-currency">Moneda</FieldLabel>
              <SimpleSelect
                id="em-currency"
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={toOptions(['USD', 'ARS', 'EUR'] as const)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="em-frequency">Frecuencia</FieldLabel>
              <SimpleSelect
                id="em-frequency"
                value={frequency}
                onValueChange={(v) => setFrequency(v as MaintenanceFrequency)}
                options={toOptions(MAINTENANCE_FREQUENCIES)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="em-dueday">Cobra desde el día</FieldLabel>
              <Input
                id="em-dueday"
                type="number"
                inputMode="numeric"
                min="1"
                max="28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="em-duedayto">Hasta el día</FieldLabel>
            <Input
              id="em-duedayto"
              type="number"
              inputMode="numeric"
              min="1"
              max="28"
              value={dueDayTo}
              onChange={(e) => setDueDayTo(e.target.value)}
            />
            <p
              className={
                Number(dueDayTo) < Number(dueDay)
                  ? 'text-xs text-amber-300'
                  : 'text-xs text-muted-foreground'
              }
            >
              {Number(dueDayTo) < Number(dueDay)
                ? 'No puede cerrar antes de abrir.'
                : `Se cobra ${Number(dueDayTo) === Number(dueDay) ? `el día ${dueDay}` : `del ${dueDay} al ${dueDayTo}`} de cada período. Después de esa fecha cuenta como vencido y avisa.`}
            </p>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="em-start">Fecha de inicio</FieldLabel>
              <Input
                id="em-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="em-status">Estado</FieldLabel>
              <SimpleSelect
                id="em-status"
                value={status}
                onValueChange={(v) => setStatus(v as MaintenanceStatus)}
                options={toOptions(MAINTENANCE_STATUSES)}
              />
            </Field>
          </div>

          {status !== 'Activo' ? (
            <p className="-mt-2 text-xs text-amber-300 text-pretty">
              Fuera de «Activo» el plan deja de contar para la mora, el
              próximo cobro, las alertas y el aviso diario al celular. El
              historial de lo ya cobrado queda intacto.
            </p>
          ) : null}

          <Field>
            <FieldLabel htmlFor="em-services">
              Servicios incluidos (uno por línea)
            </FieldLabel>
            <Textarea
              id="em-services"
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder={'Soporte prioritario\nBackups diarios'}
              rows={3}
            />
          </Field>

          {/* Lo que no es obvio y mueve plata, dicho antes de guardar y no
              después. Sólo aparece si de verdad cambió algo. */}
          {cambiaPlata || cambiaCalendario ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3 text-xs leading-relaxed text-amber-100/90 text-pretty">
              {cambiaPlata ? (
                <p>
                  Cambiar el importe es <strong>retroactivo</strong>: lo
                  adeudado se calcula como períodos sin cobrar × importe
                  actual, así que también cambia lo que figura como deuda
                  vieja. Si es una corrección, es lo que querés; si es un
                  aumento desde tal mes, no.
                </p>
              ) : null}
              {cambiaCalendario ? (
                <p className={cambiaPlata ? 'mt-2' : undefined}>
                  Cambiar la frecuencia, el día o la fecha de inicio corre{' '}
                  <strong>todo el calendario</strong> de vencimientos, incluidos
                  los pasados. Los cobros ya registrados no se tocan, pero
                  pueden pasar a cubrir otro período.
                </p>
              ) : null}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !valid}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


/**
 * Editar o borrar un cobro YA REGISTRADO.
 *
 * Es el agujero de corrección de datos más caro que tenía la app: un cobro
 * con el importe, la fecha o la cuenta equivocados ensucia al mismo tiempo
 * el saldo de Caja (`accountBalances()` lo suma a su cuenta), el total
 * cobrado de /cobros, y el conteo de períodos vencidos de /mantenimientos
 * (porque un cobro tapa el período en el que cae). Hasta ahora sólo se
 * arreglaba por SQL a mano.
 *
 * La moneda NO se edita. Un cobro está en la moneda del plan, y dejar
 * cambiarla acá permitiría convertir ARS 200.000 en USD 200.000 con un
 * click — la única regla que toda la app respeta es no mezclar monedas. Si
 * la moneda quedó mal, se borra el cobro y se carga de nuevo con el plan ya
 * corregido.
 */
export function EditMaintenanceChargeDialog({
  charge,
  projectName,
  open,
  onOpenChange,
}: {
  charge: MaintenanceCharge
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateMaintenanceCharge, deleteMaintenanceCharge, cajaReady } =
    useStore()

  const [date, setDate] = React.useState(charge.chargedOn)
  const [amount, setAmount] = React.useState(String(charge.amount))
  const [method, setMethod] = React.useState<PaymentMethod | ''>(
    charge.method ?? '',
  )
  const [receipt, setReceipt] = React.useState(charge.receipt ?? '')
  const [accountId, setAccountId] = React.useState(charge.accountId ?? '')
  // La columna existía en la base, en el tipo y en el mapper desde el día
  // uno, pero no había forma de escribirla: el alta no la manda y no tenía
  // campo en ningún diálogo. Es el lugar natural para dejar dicho POR QUÉ se
  // corrigió un importe, que es justamente lo que trae a alguien acá.
  const [notes, setNotes] = React.useState(charge.notes ?? '')
  const [confirmandoBorrado, setConfirmandoBorrado] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const valid = Number(amount) > 0 && date !== ''

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    const ok = await updateMaintenanceCharge(charge.id, {
      chargedOn: date,
      amount: Number(amount),
      method: method || null,
      receipt: receipt.trim() || null,
      notes: notes.trim(),
      // Sin el módulo de caja corrido, la columna no existe y mandarla haría
      // fallar el guardado entero. Mismo cuidado que en el diálogo de caja.
      ...(cajaReady ? { accountId: accountId || null } : {}),
    })
    setSaving(false)
    if (!ok) return
    toast.success('Cobro corregido', {
      description: `${projectName} · ${formatMoney(Number(amount), charge.currency)}`,
    })
    onOpenChange(false)
  }

  async function borrar() {
    if (saving) return
    setSaving(true)
    const ok = await deleteMaintenanceCharge(charge.id)
    setSaving(false)
    if (!ok) return
    toast.success('Cobro eliminado', {
      description: `${projectName} · ${formatMoney(charge.amount, charge.currency)}`,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirmandoBorrado ? 'Eliminar cobro' : 'Corregir cobro'}
          </DialogTitle>
          <DialogDescription>
            {confirmandoBorrado
              ? 'Se va a borrar de forma definitiva.'
              : `${projectName} · registrado el ${formatDate(charge.chargedOn)}`}
          </DialogDescription>
        </DialogHeader>

        {confirmandoBorrado ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm leading-relaxed text-red-200 text-pretty">
            <p>
              <strong>
                {formatMoney(charge.amount, charge.currency)}
              </strong>{' '}
              del {formatDate(charge.chargedOn)} en {projectName}.
            </p>
            {/* Un cobro no es sólo una fila: es plata que figura en un saldo
                y un período que figura como cubierto. Que se sepa antes. */}
            <p className="mt-2 text-xs text-red-200/80">
              Se descuenta del saldo de su cuenta en Caja, baja el total
              cobrado del proyecto, y el período que estaba tapando vuelve a
              contar como vencido. Esto último suele ser justo lo que se
              busca, pero conviene saberlo.
            </p>
          </div>
        ) : (
          <FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ec-date">Fecha</FieldLabel>
                <Input
                  id="ec-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ec-amount">
                  Importe ({charge.currency})
                </FieldLabel>
                <MoneyInput
                  id="ec-amount"
                  value={amount}
                  onValueChange={setAmount}
                  placeholder="0"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ec-method">Medio de pago</FieldLabel>
              <SimpleSelect
                id="ec-method"
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                options={toOptions(methods)}
              />
            </Field>
            {cajaReady ? (
              <Field>
                <FieldLabel htmlFor="ec-account">Cuenta donde entró</FieldLabel>
                <AccountSelect
                  id="ec-account"
                  value={accountId}
                  onValueChange={setAccountId}
                  currency={charge.currency}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="ec-receipt">Comprobante</FieldLabel>
              <Input
                id="ec-receipt"
                value={receipt}
                onChange={(e) => setReceipt(e.target.value)}
                placeholder="Nº de factura o link"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ec-notes">Notas</FieldLabel>
              <Textarea
                id="ec-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: estaba cargado 200.000 por error, el acordado es 150.000"
                rows={2}
              />
            </Field>
          </FieldGroup>
        )}

        <DialogFooter className="mt-6">
          {confirmandoBorrado ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirmandoBorrado(false)}
              >
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={() => void borrar()}
                disabled={saving}
              >
                {saving ? 'Eliminando...' : 'Eliminar cobro'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="text-red-300 hover:text-red-200"
                onClick={() => setConfirmandoBorrado(true)}
              >
                <Trash2 data-icon="inline-start" />
                Eliminar
              </Button>
              <Button onClick={() => void submit()} disabled={saving || !valid}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

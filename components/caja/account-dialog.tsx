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
import { useStore } from '@/lib/store'
import { accountBalances } from '@/lib/caja'
import { formatMoney } from '@/lib/format'
import { ACCOUNT_KINDS } from '@/lib/types'
import type { Account, AccountKind, Currency } from '@/lib/types'

export function AccountDialog({
  account,
  open,
  onOpenChange,
}: {
  /** Omit to create a new one. */
  account?: Account
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    accounts,
    payments,
    maintenanceCharges,
    movements,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useStore()
  const editing = Boolean(account)

  const [name, setName] = React.useState(account?.name ?? '')
  const [kind, setKind] = React.useState<AccountKind>(account?.kind ?? 'Banco')
  const [currency, setCurrency] = React.useState<Currency>(
    account?.currency ?? 'ARS',
  )
  const [notes, setNotes] = React.useState(account?.notes ?? '')
  const [archived, setArchived] = React.useState(account?.archived ?? false)
  const [saving, setSaving] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  /**
   * Todo lo que ya está imputado a esta cuenta. Los montos se guardan en la
   * moneda de la cuenta, sin repetirla: si la cuenta cambia de moneda, cada
   * uno de estos importes pasa a leerse en la nueva sin haber cambiado de
   * valor, y USD 3.000 se convierten en ARS 3.000 de la nada.
   */
  const history = account
    ? payments.filter((p) => p.accountId === account.id).length +
      maintenanceCharges.filter((c) => c.accountId === account.id).length +
      movements.filter(
        (m) => m.fromAccountId === account.id || m.toAccountId === account.id,
      ).length
    : 0
  const currencyLocked = editing && history > 0

  /** El saldo es derivado: acá se recalcula para poder mostrarlo al borrar. */
  const balance = account
    ? accountBalances({
        accounts,
        movements,
        payments,
        maintenanceCharges,
      }).find((b) => b.account.id === account.id)?.balance ?? 0
    : 0

  const valid = name.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      kind,
      // Con historial cargado la moneda no se toca: se manda la que ya tenía.
      currency: currencyLocked && account ? account.currency : currency,
      notes: notes.trim(),
      archived,
      sortOrder: account?.sortOrder ?? 99,
    }
    const ok = account
      ? await updateAccount(account.id, payload)
      : await addAccount(payload)
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada')
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!account || saving) return
    setSaving(true)
    const ok = await deleteAccount(account.id)
    setSaving(false)
    if (!ok) return
    setConfirmingDelete(false)
    toast.success('Cuenta eliminada', { description: account.name })
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
            <DialogDescription>
              Una cuenta es un lugar donde la plata puede estar parada. El saldo
              se calcula solo, no se carga.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="acc-name">Nombre</FieldLabel>
                <Input
                  id="acc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Banco Galicia / Caja USD"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="acc-kind">Tipo</FieldLabel>
                  <SimpleSelect
                    id="acc-kind"
                    value={kind}
                    onValueChange={(v) => setKind(v as AccountKind)}
                    options={toOptions(ACCOUNT_KINDS)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="acc-currency">Moneda</FieldLabel>
                  {currencyLocked ? (
                    <Input
                      id="acc-currency"
                      value={account?.currency ?? currency}
                      readOnly
                      disabled
                      aria-describedby="acc-currency-hint"
                    />
                  ) : (
                    <SimpleSelect
                      id="acc-currency"
                      value={currency}
                      onValueChange={(v) => setCurrency(v as Currency)}
                      options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                    />
                  )}
                </Field>
              </div>
              {currencyLocked ? (
                <p
                  id="acc-currency-hint"
                  className="text-xs text-amber-300 text-pretty"
                >
                  La moneda quedó fija: esta cuenta ya tiene{' '}
                  <span className="tabular-nums">{history}</span>{' '}
                  {history === 1 ? 'movimiento imputado' : 'movimientos imputados'}
                  . Los importes están guardados en{' '}
                  {account?.currency ?? currency} sin conversión, así que
                  cambiarla los reinterpretaría uno por uno. Si la moneda está
                  mal, archivá esta cuenta y creá la correcta.
                </p>
              ) : editing ? (
                <p className="text-xs text-muted-foreground text-pretty">
                  Todavía no hay nada imputado, así que la moneda se puede
                  corregir sin romper ningún saldo.
                </p>
              ) : null}
              <Field>
                <FieldLabel htmlFor="acc-notes">Notas</FieldLabel>
                <Textarea
                  id="acc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </Field>
              {editing ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Archivada</p>
                    <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                      Deja de ofrecerse al cargar, pero conserva su historial y
                      su saldo.
                    </p>
                  </div>
                  <Switch checked={archived} onCheckedChange={setArchived} />
                </div>
              ) : null}
            </FieldGroup>

            <DialogFooter className="mt-6 sm:justify-between">
              {editing ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Eliminar
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !valid}>
                  {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Borrar una cuenta desarma un saldo entero, así que se pregunta
          mostrando de cuánta plata estamos hablando. */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar la cuenta?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="text-sm font-medium">{account?.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Saldo actual{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(balance, account?.currency)}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground text-pretty">
              {history > 0
                ? `Tiene ${history} ${
                    history === 1 ? 'movimiento imputado' : 'movimientos imputados'
                  }. Los cobros que apuntaban acá quedan sin cuenta asignada, y si hay movimientos de caja la base directamente no la deja borrar: en ese caso archivala.`
                : 'No tiene nada imputado todavía.'}
            </p>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              No, dejarla
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              {saving ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

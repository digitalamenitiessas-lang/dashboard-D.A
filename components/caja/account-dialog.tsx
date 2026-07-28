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
  const { addAccount, updateAccount, deleteAccount } = useStore()
  const editing = Boolean(account)

  const [name, setName] = React.useState(account?.name ?? '')
  const [kind, setKind] = React.useState<AccountKind>(account?.kind ?? 'Banco')
  const [currency, setCurrency] = React.useState<Currency>(
    account?.currency ?? 'ARS',
  )
  const [notes, setNotes] = React.useState(account?.notes ?? '')
  const [archived, setArchived] = React.useState(account?.archived ?? false)
  const [saving, setSaving] = React.useState(false)

  const valid = name.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      kind,
      currency,
      notes: notes.trim(),
      archived,
      sortOrder: account?.sortOrder ?? 99,
    }
    if (account) await updateAccount(account.id, payload)
    else await addAccount(payload)
    setSaving(false)
    toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada')
    onOpenChange(false)
  }

  async function handleDelete() {
    if (!account) return
    setSaving(true)
    await deleteAccount(account.id)
    setSaving(false)
    onOpenChange(false)
  }

  return (
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
                <SimpleSelect
                  id="acc-currency"
                  value={currency}
                  onValueChange={(v) => setCurrency(v as Currency)}
                  options={toOptions(['USD', 'ARS', 'EUR'] as const)}
                />
              </Field>
            </div>
            {editing ? (
              <p className="text-xs text-muted-foreground text-pretty">
                Cambiar la moneda no reconvierte los movimientos ya cargados:
                los montos quedan como están y pasan a leerse en la moneda
                nueva.
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
                onClick={() => void handleDelete()}
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
  )
}

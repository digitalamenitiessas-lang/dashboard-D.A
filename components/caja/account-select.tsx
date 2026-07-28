'use client'

import { SimpleSelect } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import type { Currency } from '@/lib/types'

/**
 * Picks an account. Filtering by currency matters: an account holds one
 * currency, so a cobro in USD can only land in a USD account.
 */
export function AccountSelect({
  id,
  value,
  onValueChange,
  currency,
  excludeId,
  allowNone = false,
  noneLabel = 'Sin asignar',
  className,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  /** When set, only accounts in this currency are offered. */
  currency?: Currency
  /** Hides one account, so a movement can't point at itself. */
  excludeId?: string
  allowNone?: boolean
  noneLabel?: string
  className?: string
}) {
  const { accounts } = useStore()

  const options = accounts
    .filter((a) => !a.archived)
    .filter((a) => (currency ? a.currency === currency : true))
    .filter((a) => a.id !== excludeId)
    .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))

  return (
    <SimpleSelect
      id={id}
      value={value}
      onValueChange={onValueChange}
      placeholder={options.length === 0 ? 'Sin cuentas' : 'Elegir cuenta'}
      className={className}
      options={
        allowNone ? [{ value: '', label: noneLabel }, ...options] : options
      }
    />
  )
}

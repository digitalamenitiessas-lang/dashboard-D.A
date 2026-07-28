import type { Currency } from './types'

const currencyLocale: Record<Currency, string> = {
  USD: 'en-US',
  ARS: 'es-AR',
  EUR: 'de-DE',
}

export function formatMoney(amount: number, currency: Currency = 'USD') {
  return new Intl.NumberFormat(currencyLocale[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * "USD 15.000" instead of "$15,000". USD and ARS share the `$` symbol, so any
 * figure shown next to another currency has to spell the code out.
 */
export function formatMoneyWithCode(amount: number, currency: Currency) {
  return new Intl.NumberFormat(currencyLocale[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatDateShort(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
  }).format(d)
}

/** Days between today and the given date (positive = future). */
export function daysUntil(iso: string | null | undefined, today = new Date()) {
  if (!iso) return null
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return null
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

export function relativeDays(iso: string | null | undefined) {
  const n = daysUntil(iso)
  if (n === null) return '—'
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n === -1) return 'Ayer'
  if (n > 0) return `En ${n} días`
  return `Hace ${Math.abs(n)} días`
}

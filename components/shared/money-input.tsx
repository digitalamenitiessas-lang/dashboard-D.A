'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'

/**
 * Money typed the way it reads: 3.700.000,50.
 *
 * `type="number"` can't show separators — browsers reject anything that
 * isn't a bare number — so this is a text input that formats while you
 * type and hands the parent a plain numeric string (`"3700000.5"`), which
 * `Number()` parses directly.
 *
 * Argentine convention: "." groups thousands and "," separates decimals.
 * A typed "." is read as grouping and dropped, so both 3.700.000 and
 * 3700000 land on the same number.
 */

const groupThousands = (digits: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** `"3700000.5"` → `"3.700.000,5"` */
function toDisplay(raw: string): string {
  if (!raw) return ''
  const [whole = '', fraction] = raw.split('.')
  const digits = whole.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  const grouped = groupThousands(digits)
  if (fraction === undefined) return grouped
  return `${grouped || '0'},${fraction}`
}

/** `"3.700.000,5"` → `"3700000.5"` */
function toRaw(display: string, decimals: number): string {
  const cleaned = display.replace(/[^\d,]/g, '')
  if (!cleaned) return ''
  const [whole = '', ...rest] = cleaned.split(',')
  const digits = whole.replace(/^0+(?=\d)/, '')
  if (rest.length === 0) return digits
  const fraction = rest.join('').slice(0, decimals)
  return `${digits || '0'}.${fraction}`
}

/** Digits and commas are what the caret should stick to; dots move around. */
const countSignificant = (text: string) => text.replace(/[^\d,]/g, '').length

export function MoneyInput({
  value,
  onValueChange,
  decimals = 2,
  ...props
}: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** Plain numeric string, e.g. "3700000.5". */
  value: string
  onValueChange: (value: string) => void
  /** How many decimal places to keep. Rates need more than money does. */
  decimals?: number
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [caret, setCaret] = React.useState<number | null>(null)
  const display = toDisplay(value)

  // Re-inserting separators shifts everything after the caret, so it gets
  // restored by position among the digits rather than by raw offset.
  React.useLayoutEffect(() => {
    if (caret === null || !ref.current) return
    ref.current.setSelectionRange(caret, caret)
    setCaret(null)
  }, [caret, display])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value
    const cursor = event.target.selectionStart ?? typed.length
    const significantBefore = countSignificant(typed.slice(0, cursor))

    const raw = toRaw(typed, decimals)
    onValueChange(raw)

    const formatted = toDisplay(raw)
    let seen = 0
    let position = formatted.length
    if (significantBefore === 0) {
      position = 0
    } else {
      for (let i = 0; i < formatted.length; i++) {
        if (/[\d,]/.test(formatted[i])) seen++
        if (seen === significantBefore) {
          position = i + 1
          break
        }
      }
    }
    setCaret(position)
  }

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      className={props.className ?? 'tabular-nums'}
    />
  )
}

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
 * Argentine convention: "." groups thousands and "," separates decimals, so
 * both 3.700.000 and 3700000 land on the same number. Pasted text can come
 * in the English convention instead — see `decimalMark()` for how the two
 * are told apart.
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

/**
 * Which of the two marks in the text is the decimal one, or "" when the
 * text carries no decimals at all.
 *
 * The mark has to be guessed because more than one convention reaches this
 * input. Typing gives the Argentine one (3.700.000,50), but pasting brings
 * whatever the invoice, the spreadsheet or the exchange site used — and,
 * notably, the very format this component hands back to its parent
 * ("1234.56"), which used to be read as 123456.
 *
 *   - Both marks present: the one that comes last is the decimal, the other
 *     groups thousands. Works for 1.234,56 and for 1,234.56 alike.
 *   - Only a ".", with exactly one or two digits to the end: decimal. Three
 *     digits (1.500, 3.700.000) is grouping, which keeps the Argentine
 *     reading intact.
 *   - Anything else: no decimals, and any "." is grouping.
 *
 * `guessing` turns the second rule off. It only ever makes sense on text
 * that arrived whole — a paste. While someone edits character by character
 * the text is the app's own display being taken apart, and there the
 * Argentine reading is the only right one: backspacing over 3.700.000
 * passes through "3.700.00", which no one means as three thousand seven
 * hundred pesos with change.
 */
function decimalMark(text: string, guessing = true): '' | ',' | '.' {
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (!guessing) return comma >= 0 ? ',' : ''
  if (comma >= 0) return comma > dot ? ',' : '.'
  return /\.\d{1,2}$/.test(text) ? '.' : ''
}

/**
 * `"3.700.000,5"` → `"3700000.5"`, and also `"1,234.56"` → `"1234.56"`.
 *
 * The minus sign is dropped on purpose: this input is for amounts, and the
 * sign is never the user's to type — each screen knows whether what it is
 * loading comes in or goes out (a movement has its own origin and
 * destination). Letting a stray "-" through would silently turn a cobro
 * into a discount.
 */
function toRaw(display: string, decimals: number, guessing = true): string {
  const mark = decimalMark(display, guessing)
  const cut = mark ? display.lastIndexOf(mark) : -1
  const whole = cut < 0 ? display : display.slice(0, cut)
  const digits = whole.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (cut < 0) return digits
  const fraction = display
    .slice(cut + 1)
    .replace(/\D/g, '')
    .slice(0, decimals)
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

    // One character in or out is someone typing or deleting; anything bigger
    // arrived as a block (a paste, or a selection replaced), and only there
    // is it worth guessing whether a "." means decimals.
    const pasted = Math.abs(typed.length - display.length) > 1
    const raw = toRaw(typed, decimals, pasted)
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

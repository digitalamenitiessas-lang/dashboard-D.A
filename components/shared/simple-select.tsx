'use client'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Seleccionar',
  className,
  id,
  size = 'default',
}: {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  id?: string
  size?: 'sm' | 'default'
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as string)}>
      <SelectTrigger id={id} size={size} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder}>
          {(v: string | null) =>
            options.find((o) => o.value === v)?.label ?? placeholder
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function toOptions<T extends string>(values: readonly T[]): SelectOption[] {
  return values.map((v) => ({ value: v, label: v }))
}

'use client'

import * as React from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SimpleSelect } from '@/components/shared/simple-select'
import {
  PAISES,
  PAIS_POR_DEFECTO,
  formatearTelefono,
  normalizarTelefono,
} from '@/lib/telefono'
import { cn } from '@/lib/utils'

/**
 * Un teléfono que WhatsApp pueda abrir.
 *
 * Se escribe como sale —0381 15-555-1234, 381 5551234, lo que sea— y abajo
 * se muestra el número internacional que va a quedar guardado. Esa vista
 * previa no es decoración: es lo único que convierte una regla que nadie se
 * acuerda (sacar el 0, sacar el 15, meter el 9) en algo que se confirma de
 * un vistazo. Sin ella, el error aparece recién el día que alguien toca el
 * botón para reclamar un pago y WhatsApp dice que el número no existe.
 *
 * Guarda SIEMPRE el internacional (`549381...`). El campo acepta de vuelta
 * ese formato, así que editar un cliente ya cargado funciona sin
 * conversiones raras: la normalización es idempotente.
 */
export function TelefonoInput({
  id,
  value,
  onValueChange,
  pais,
  onPaisChange,
  required = false,
}: {
  id?: string
  /** Lo que la persona escribe, tal cual. */
  value: string
  onValueChange: (value: string) => void
  pais: string
  onPaisChange: (codigo: string) => void
  required?: boolean
}) {
  const normalizado = normalizarTelefono(value, pais)
  const escribioAlgo = value.trim() !== ''
  const ejemplo =
    PAISES.find((p) => p.codigo === pais)?.ejemplo ?? '0381 15-555-1234'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <SimpleSelect
          value={pais}
          onValueChange={onPaisChange}
          className="w-32 shrink-0"
          options={PAISES.map((p) => ({
            value: p.codigo,
            label: `+${p.codigo} ${p.nombre}`,
          }))}
        />
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={ejemplo}
          aria-invalid={(escribioAlgo && !normalizado) || undefined}
          aria-describedby={id ? `${id}-estado` : undefined}
        />
      </div>

      <p
        id={id ? `${id}-estado` : undefined}
        role={escribioAlgo && !normalizado ? 'alert' : undefined}
        className={cn(
          'flex items-center gap-1.5 text-xs',
          !escribioAlgo && 'text-muted-foreground',
          escribioAlgo && normalizado && 'text-neon-green',
          escribioAlgo && !normalizado && 'text-amber-300',
        )}
      >
        {!escribioAlgo ? (
          <>
            {required ? 'Obligatorio. ' : ''}Escribilo como salga: le sacamos
            el 0 y el 15 solos.
          </>
        ) : normalizado ? (
          <>
            <Check className="size-3.5 shrink-0" />
            <span className="tabular-nums">
              WhatsApp va a abrir {formatearTelefono(normalizado)}
            </span>
          </>
        ) : (
          <>
            <TriangleAlert className="size-3.5 shrink-0" />
            No parece un número válido. Ejemplo: {ejemplo}
          </>
        )}
      </p>
    </div>
  )
}

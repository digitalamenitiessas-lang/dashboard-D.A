'use client'

import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Sugerencia } from '@/lib/cotizacion'

/**
 * Ofrece la cotización del BNA para el campo que está al lado.
 *
 * Es un botón y no un autocompletado silencioso a propósito: el número que
 * se guarda tiene que ser el de la operación real, y hay veces que no
 * coincide con el del banco. Que haya que tocarlo deja claro que fue una
 * decisión y no un default que nadie miró.
 *
 * Cuando el dato está viejo —el reloj no corrió, o es lunes y la última es
 * del viernes— se pinta en ámbar en vez de esconderse: una cotización
 * desactualizada sirve igual como punto de partida, siempre que se sepa.
 */
export function CotizacionHint({
  sugerencia,
  onUsar,
  yaUsada,
  className,
}: {
  sugerencia: Sugerencia | null
  onUsar: (valor: number) => void
  /** El campo ya tiene este valor: no tiene sentido ofrecerlo de nuevo. */
  yaUsada?: boolean
  className?: string
}) {
  if (!sugerencia) return null

  if (yaUsada) {
    return (
      <p
        className={cn(
          'mt-1 flex items-center gap-1.5 text-[11px]',
          sugerencia.vieja ? 'text-amber-300' : 'text-muted-foreground',
          className,
        )}
      >
        {sugerencia.vieja ? <TriangleAlert className="size-3 shrink-0" /> : null}
        {sugerencia.etiqueta}
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onUsar(sugerencia.valor)}
      className={cn(
        'mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]',
        'transition-colors',
        sugerencia.vieja
          ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
          : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground',
        className,
      )}
    >
      {sugerencia.vieja ? <TriangleAlert className="size-3 shrink-0" /> : null}
      <span className="tabular-nums">Usar {sugerencia.etiqueta}</span>
    </button>
  )
}

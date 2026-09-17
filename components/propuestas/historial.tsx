'use client'

/**
 * Las propuestas que ya se mandaron.
 *
 * Dos acciones por fila: volver a bajar el PDF —que se redibuja del contenido
 * guardado, sin pasar por la IA ni tomar un número nuevo— y borrar.
 *
 * El borrado confirma adentro de la propia fila y no en un diálogo aparte. Es
 * el patrón del resto del sistema (`proveedor-dialog.tsx`), y acá además evita
 * la confusión de una modal que no dice cuál de las diez filas está por
 * borrar: la que se transformó es la que se va.
 */

import * as React from 'react'
import { FileDown, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { numeroPropuesta } from '@/lib/propuesta/pdf'
import type { PropuestaEmitida } from '@/lib/propuesta/schema'

function Fila({
  propuesta: p,
  onBajar,
  onBorrar,
}: {
  propuesta: PropuestaEmitida
  onBajar: () => void
  onBorrar: () => Promise<void>
}) {
  const [confirmando, setConfirmando] = React.useState(false)
  const [trabajando, setTrabajando] = React.useState(false)

  if (confirmando) {
    return (
      <li className="flex flex-col gap-3 bg-red-500/[0.07] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <p className="text-sm">
          ¿Borrar la propuesta {numeroPropuesta(p.numero)} de{' '}
          <span className="font-medium">{p.clienteNombre}</span>?{' '}
          <span className="text-muted-foreground">
            No se puede deshacer, y el número {numeroPropuesta(p.numero)} no se
            vuelve a usar.
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={trabajando}
            onClick={() => setConfirmando(false)}
          >
            Volver
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={trabajando}
            onClick={async () => {
              setTrabajando(true)
              await onBorrar()
              // No se apaga `confirmando` a mano: si salió bien la fila ya no
              // existe, y si falló el store avisó con un toast y conviene que
              // el botón siga ahí para reintentar.
              setTrabajando(false)
            }}
          >
            {trabajando ? 'Borrando…' : 'Borrar'}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 p-3 sm:p-4">
      <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs tabular-nums text-muted-foreground">
        {numeroPropuesta(p.numero)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.clienteNombre}</p>
        <p className="truncate text-xs text-muted-foreground">
          {p.titulo} · {formatDate(p.emitidaOn)} ·{' '}
          {p.plantilla === 'larga' ? 'Propuesta' : 'Presupuesto'}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {p.moneda}{' '}
        {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(
          p.total,
        )}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Volver a bajar la propuesta ${numeroPropuesta(p.numero)}`}
        title="Volver a bajar"
        onClick={onBajar}
      >
        <FileDown />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Borrar la propuesta ${numeroPropuesta(p.numero)}`}
        title="Borrar"
        className="text-muted-foreground hover:text-red-400"
        onClick={() => setConfirmando(true)}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

export function HistorialPropuestas({
  propuestas,
  onBajar,
  onBorrar,
}: {
  propuestas: PropuestaEmitida[]
  onBajar: (id: string) => void
  onBorrar: (id: string) => Promise<void>
}) {
  if (propuestas.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        Ya mandadas{' '}
        <span className="font-normal text-muted-foreground">
          ({propuestas.length})
        </span>
      </h2>
      <ul className="glass flex flex-col divide-y divide-white/5 overflow-hidden rounded-2xl">
        {propuestas.map((p) => (
          <Fila
            key={p.id}
            propuesta={p}
            onBajar={() => onBajar(p.id)}
            onBorrar={() => onBorrar(p.id)}
          />
        ))}
      </ul>
    </section>
  )
}

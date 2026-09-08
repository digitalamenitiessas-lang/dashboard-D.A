'use client'

import * as React from 'react'
import {
  CalendarClock,
  Handshake,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { LinkedText } from '@/components/shared/linked-text'
import { SeguimientoDialog } from '@/components/seguimientos/seguimiento-dialog'
import { useStore } from '@/lib/store'
import { agruparSeguimientos } from '@/lib/derive'
import { formatDate, relativeDays, daysUntil } from '@/lib/format'
import { seguimientoEstadoStyles } from '@/lib/status'
import { cn } from '@/lib/utils'
import type { Seguimiento } from '@/lib/types'

/**
 * La pestaña «Seguimientos»: los acercamientos comerciales, agrupados por
 * prospecto.
 *
 * Un renglón de la base es un CONTACTO; lo que se ve acá es el hilo. El
 * estado de cada prospecto sale del contacto más reciente y no de una
 * columna aparte — ver `agruparSeguimientos()` en `lib/derive.ts`.
 */
export function SeguimientosPanel({
  query,
  estadoFilter,
}: {
  query: string
  estadoFilter: string
}) {
  const { seguimientos, seguimientosReady, deleteSeguimiento } = useStore()
  const [editTarget, setEditTarget] = React.useState<Seguimiento | null>(null)
  const [nuevoPara, setNuevoPara] = React.useState<string | null>(null)

  const grupos = React.useMemo(
    () => agruparSeguimientos(seguimientos),
    [seguimientos],
  )

  const q = query.trim().toLowerCase()
  const filtrados = grupos.filter((g) => {
    if (estadoFilter !== 'todos' && g.estado !== estadoFilter) return false
    if (!q) return true
    return (
      g.prospecto.toLowerCase().includes(q) ||
      g.contactos.some(
        (c) =>
          c.summary.toLowerCase().includes(q) ||
          c.attendees.toLowerCase().includes(q),
      )
    )
  })

  async function handleDelete(c: Seguimiento) {
    if (!(await deleteSeguimiento(c.id))) return
    toast.success('Contacto eliminado', {
      description: `${c.kind} con ${c.prospecto} del ${formatDate(c.contactedOn)}`,
    })
  }

  if (!seguimientosReady) {
    return (
      <Empty className="glass rounded-2xl">
        <EmptyHeader>
          <EmptyTitle>Falta correr la migración</EmptyTitle>
          <EmptyDescription>
            La tabla de seguimientos todavía no existe en la base. Corré{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
              supabase/12_seguimientos.sql
            </code>{' '}
            desde el SQL Editor de Supabase y recargá esta página. El resto de
            la app funciona normal mientras tanto.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (filtrados.length === 0) {
    return (
      <Empty className="glass rounded-2xl">
        <EmptyHeader>
          <EmptyTitle>
            {grupos.length === 0 ? 'Sin seguimientos' : 'Sin resultados'}
          </EmptyTitle>
          <EmptyDescription>
            {grupos.length === 0
              ? 'Registrá una reunión o llamada con un prospecto y acá va a quedar el hilo completo de cómo viene la negociación.'
              : 'Ajustá la búsqueda o el filtro de estado.'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {filtrados.map((g) => {
          const d = daysUntil(g.proximoContacto)
          // Sólo apura si la pelota es nuestra: si esperan ellos no hay nada
          // que hacer, y pintarlo de ámbar sería pedir una acción que no
          // existe. Mismo criterio que usa el motor de alertas.
          const apura = g.estado === 'Pelota nuestra' && d !== null && d <= 7
          return (
            <section key={g.key} className="glass flex flex-col rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neon-violet/10 text-neon-violet ring-1 ring-neon-violet/20">
                    <Handshake className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-extrabold">
                      {g.prospecto}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {g.contactos.length} contacto
                      {g.contactos.length === 1 ? '' : 's'} · último{' '}
                      {formatDate(g.ultimo.contactedOn)}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn('shrink-0 font-medium', seguimientoEstadoStyles[g.estado])}
                >
                  {g.estado}
                </Badge>
              </div>

              {g.proximoContacto ? (
                <div
                  className={cn(
                    'mt-4 flex items-center gap-1.5 rounded-xl border p-2.5 text-xs tabular-nums',
                    apura
                      ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200'
                      : 'border-white/5 bg-white/[0.02] text-muted-foreground',
                  )}
                >
                  <CalendarClock className="size-3.5 shrink-0" />
                  Retomar {relativeDays(g.proximoContacto).toLowerCase()} (
                  {formatDate(g.proximoContacto)})
                </div>
              ) : null}

              <ul className="mt-4 flex flex-col divide-y divide-white/5">
                {g.contactos.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium">
                        {c.kind}
                        <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                          {formatDate(c.contactedOn)}
                        </span>
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="size-10 md:size-7"
                          aria-label={`Editar contacto del ${formatDate(c.contactedOn)} con ${c.prospecto}`}
                          onClick={() => setEditTarget(c)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="size-10 md:size-7"
                          aria-label={`Eliminar contacto del ${formatDate(c.contactedOn)} con ${c.prospecto}`}
                          onClick={() => void handleDelete(c)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    {c.attendees ? (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground text-pretty">
                        <Users className="mt-0.5 size-3.5 shrink-0" />
                        {c.attendees}
                      </p>
                    ) : null}
                    {c.summary ? (
                      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                        <LinkedText text={c.summary} />
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {/* Precargado con el nombre del grupo: el contacto siguiente no
                  obliga a volver a escribirlo — ni a escribirlo distinto, que
                  es lo que partiría el hilo en dos. */}
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                onClick={() => setNuevoPara(g.prospecto)}
              >
                <Plus data-icon="inline-start" />
                Otro contacto con {g.prospecto}
              </Button>
            </section>
          )
        })}
      </div>

      {editTarget ? (
        <SeguimientoDialog
          key={editTarget.id}
          seguimiento={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      ) : null}

      {nuevoPara !== null ? (
        <SeguimientoDialog
          key={`nuevo-${nuevoPara}`}
          prospectoInicial={nuevoPara}
          open={nuevoPara !== null}
          onOpenChange={(o) => !o && setNuevoPara(null)}
        />
      ) : null}
    </>
  )
}

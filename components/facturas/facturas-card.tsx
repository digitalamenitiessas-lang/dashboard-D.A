'use client'

import * as React from 'react'
import Link from 'next/link'
import { Pencil, Receipt, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailCard } from '@/components/proyectos/detail-parts'
import { FacturaDialog } from '@/components/facturas/factura-dialog'
import { useStore } from '@/lib/store'
import {
  estadoFactura,
  imputadoA,
  resumenFacturacion,
  saldoFactura,
} from '@/lib/facturas'
import { formatDate, formatMoney, formatMoneyWithCode } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Factura, FacturaEstado, Project } from '@/lib/types'

const estadoStyles: Record<FacturaEstado, string> = {
  Pendiente: 'bg-amber-400/12 text-amber-300 border-amber-400/25',
  Parcial: 'bg-neon-blue/10 text-neon-blue border-neon-blue/25',
  Cancelada: 'bg-neon-green/12 text-neon-green border-neon-green/30',
}

/**
 * Las facturas de un proyecto, con su estado calculado.
 *
 * El estado no sale de ninguna columna: se compara el importe de cada
 * factura con lo que se le imputó de cobros. Registrar un cobro imputado la
 * mueve sola, y editarlo o borrarlo también — no hay ningún estado guardado
 * que pueda quedar diciendo otra cosa.
 */
export function FacturasCard({ project }: { project: Project }) {
  const { payments, facturas, facturasReady } = useStore()
  const [editando, setEditando] = React.useState<Factura | null>(null)

  const resumen = React.useMemo(
    () => resumenFacturacion(project, facturas, payments),
    [project, facturas, payments],
  )
  const pagos = payments.filter((p) => p.projectId === project.id)

  if (!facturasReady) {
    return (
      <DetailCard title="Facturas" icon={Receipt}>
        <p className="py-2 text-sm text-muted-foreground text-pretty">
          Falta correr{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
            supabase/16_facturas.sql
          </code>{' '}
          desde el SQL Editor de Supabase. El resto de la app funciona normal
          mientras tanto.
        </p>
      </DetailCard>
    )
  }

  return (
    <>
      <DetailCard
        title="Facturas"
        icon={Receipt}
        action={
          <FacturaDialog proyectoFijo={project} triggerLabel="Nueva factura" />
        }
      >
        {/* Los tres números, con nombres que no se pisan. «Pendiente de
            cobro» es la deuda de verdad —lo facturado que no se cobró— y
            «sin facturar» es trabajo acordado que todavía no se le pasó al
            cliente. Sin el segundo, pasar la deuda a medirse contra las
            facturas haría desaparecer de la vista lo que falta facturar. */}
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Facturado</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatMoneyWithCode(resumen.facturado, project.currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Pendiente de cobro</p>
            <p
              className={cn(
                'mt-0.5 text-sm font-semibold tabular-nums',
                resumen.pendienteDeCobro > 0 && 'text-amber-300',
              )}
            >
              {formatMoneyWithCode(resumen.pendienteDeCobro, project.currency)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Sin facturar</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
              {formatMoneyWithCode(resumen.sinFacturar, project.currency)}
            </p>
          </div>
        </div>

        {/* Plata que entró y no salda ninguna factura. No se pierde: se
            muestra, con el mismo criterio que los cobros sin cuenta. */}
        {resumen.sinImputar.length > 0 ? (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              <span className="tabular-nums">{resumen.sinImputar.length}</span>{' '}
              cobro(s) sin imputar a ninguna factura:{' '}
              {resumen.sinImputar
                .map(
                  (p) =>
                    `${p.concept} (${formatMoneyWithCode(p.amount, p.currency)})`,
                )
                .join(', ')}
              . Entró la plata pero no salda nada — se asignan editando el
              cobro desde{' '}
              <Link href="/cobros" className="text-neon-blue hover:underline">
                Cobros
              </Link>
              .
            </p>
          </div>
        ) : null}

        {resumen.facturas.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground text-pretty">
            Sin facturas cargadas. Al registrarlas, el estado de cada una sale
            solo de los cobros que se le imputen.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {resumen.facturas.map((f) => {
              const estado = estadoFactura(f, pagos, project)
              const imputado = imputadoA(f, pagos, project)
              const saldo = saldoFactura(f, pagos, project)
              return (
                <li key={f.id} className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.numero}</p>
                      <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {formatDate(f.emitidaOn)}
                        {f.venceOn ? ` · vence ${formatDate(f.venceOn)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('font-medium', estadoStyles[estado])}
                      >
                        {estado}
                      </Badge>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="size-10 md:size-7"
                        aria-label={`Editar factura ${f.numero}`}
                        onClick={() => setEditando(f)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      {estado === 'Cancelada'
                        ? 'Cobrada'
                        : `Cobrado ${formatMoney(imputado, project.currency)} · falta ${formatMoney(saldo, project.currency)}`}
                    </span>
                    <span className="font-semibold">
                      {formatMoney(f.importe, project.currency)}
                    </span>
                  </div>
                  {f.notas ? (
                    <p className="text-xs text-muted-foreground text-pretty">
                      {f.notas}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </DetailCard>

      {editando ? (
        <FacturaDialog
          key={editando.id}
          factura={editando}
          proyectoFijo={project}
          open={!!editando}
          onOpenChange={(o) => !o && setEditando(null)}
        />
      ) : null}
    </>
  )
}

'use client'

import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DetailCard } from '@/components/proyectos/detail-parts'
import { useStore } from '@/lib/store'
import { estadoFactura, resumenFacturacion, saldoFactura } from '@/lib/facturas'
import { formatDate, formatMoney, formatMoneyWithCode } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FacturaEstado, Project } from '@/lib/types'

const estadoStyles: Record<FacturaEstado, string> = {
  Pendiente: 'bg-amber-400/12 text-amber-300 border-amber-400/25',
  Parcial: 'bg-neon-blue/10 text-neon-blue border-neon-blue/25',
  Cancelada: 'bg-neon-green/12 text-neon-green border-neon-green/30',
}

/**
 * Las facturas de ESTE proyecto, en el detalle del proyecto.
 *
 * Es una vista de lectura: cargar y editar facturas se hace desde la ficha
 * del cliente, que es donde viven. Acá interesa otra cosa —cuánto de lo
 * cotizado ya se facturó y cuánto falta— y por eso el número que manda es
 * «sin facturar», que sólo tiene sentido contra un presupuesto.
 *
 * Sólo aparecen las facturas que apuntan a este proyecto. Una de servicio
 * suelto del mismo cliente no es de acá: sumarla haría que «sin facturar»
 * diera de menos.
 */
export function FacturasProyecto({ project }: { project: Project }) {
  const { payments, facturas, facturasReady, clients } = useStore()
  if (!facturasReady) return null

  const resumen = resumenFacturacion(project, facturas, payments)
  const cliente = clients.find((c) => c.id === project.clientId)

  return (
    <DetailCard title="Facturas de este proyecto" icon={Receipt}>
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

      {resumen.facturas.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground text-pretty">
          Sin facturas de este proyecto.{' '}
          {cliente ? (
            <>
              Se cargan desde la ficha de{' '}
              <Link
                href={`/clientes/${cliente.id}`}
                className="text-neon-blue hover:underline"
              >
                {cliente.name}
              </Link>
              .
            </>
          ) : (
            'Asignale un cliente al proyecto para poder facturarlo.'
          )}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {resumen.facturas.map((f) => {
            const estado = estadoFactura(f, payments)
            return (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{f.concepto || f.numero}</p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {f.numero} · {formatDate(f.emitidaOn)}
                    {estado !== 'Cancelada'
                      ? ` · falta ${formatMoney(saldoFactura(f, payments), f.moneda)}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('font-medium', estadoStyles[estado])}
                  >
                    {estado}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(f.importe, f.moneda)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DetailCard>
  )
}

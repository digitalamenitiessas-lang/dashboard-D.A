'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  Pencil,
  Phone,
  Receipt,
  TriangleAlert,
  Truck,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { DetailCard, InfoRow } from '@/components/proyectos/detail-parts'
import { ProveedorDialog } from '@/components/proveedores/proveedor-dialog'
import { FacturaProveedorDialog } from '@/components/proveedores/factura-proveedor-dialog'
import { useStore } from '@/lib/store'
import {
  estadoFacturaProveedor,
  pagadoDe,
  resumenProveedor,
  saldoFacturaProveedor,
  type FacturaProveedorEstado,
} from '@/lib/proveedores'
import { formatDate, formatMoney, formatMoneyWithCode } from '@/lib/format'
import { formatMoneyByCurrency, isEmptyMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { FacturaProveedor } from '@/lib/types'

const estadoStyles: Record<FacturaProveedorEstado, string> = {
  Pendiente: 'bg-amber-400/12 text-amber-300 border-amber-400/25',
  Parcial: 'bg-neon-blue/10 text-neon-blue border-neon-blue/25',
  Pagada: 'bg-neon-green/12 text-neon-green border-neon-green/30',
}

export default function ProveedorDetallePage() {
  const params = useParams<{ id: string }>()
  const { proveedores, facturasProveedor, movements, accounts, projects } =
    useStore()
  const [editando, setEditando] = React.useState(false)
  const [editandoFactura, setEditandoFactura] =
    React.useState<FacturaProveedor | null>(null)

  const proveedor = proveedores.find((p) => p.id === params.id)

  if (!proveedor) {
    return (
      <Empty className="glass rounded-2xl">
        <EmptyHeader>
          <EmptyTitle>Proveedor no encontrado</EmptyTitle>
          <EmptyDescription>Puede que se haya eliminado.</EmptyDescription>
        </EmptyHeader>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/proveedores" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Volver
        </Button>
      </Empty>
    )
  }

  const resumen = resumenProveedor(proveedor, facturasProveedor, movements)
  const cuentaDe = (id: string | null) =>
    id ? accounts.find((a) => a.id === id) : undefined
  const nombreCuenta = (id: string | null) => cuentaDe(id)?.name ?? '—'
  const nombreProyecto = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? '—') : 'Estructura'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2 mb-2"
          nativeButton={false}
          render={<Link href="/proveedores" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Proveedores
        </Button>
        <PageHeader
          title={proveedor.nombre}
          description={proveedor.contacto || 'Sin contacto asignado'}
        >
          <FacturaProveedorDialog proveedor={proveedor} />
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            <Pencil data-icon="inline-start" />
            Editar
          </Button>
        </PageHeader>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Facturado"
          value={formatMoneyByCurrency(resumen.facturado)}
          icon={Receipt}
          accent="neutral"
        />
        <StatCard
          label="Le debemos"
          value={formatMoneyByCurrency(resumen.pendienteDePago)}
          icon={Wallet}
          accent={isEmptyMoney(resumen.pendienteDePago) ? 'neutral' : 'red'}
        />
        <StatCard
          label="Pagos hechos"
          value={resumen.pagos.length}
          accent="neutral"
        />
      </div>

      <DetailCard title="Datos" icon={Truck}>
        <InfoRow label="CUIT">{proveedor.cuit || '—'}</InfoRow>
        <InfoRow label="Contacto">{proveedor.contacto || '—'}</InfoRow>
        <InfoRow label="Teléfono">
          {proveedor.telefono ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Phone className="size-3.5" />
              {proveedor.telefono}
            </span>
          ) : (
            '—'
          )}
        </InfoRow>
        <InfoRow label="Correo">
          {proveedor.email ? (
            <a
              href={`mailto:${proveedor.email}`}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-neon-green"
            >
              <Mail className="size-3.5" />
              {proveedor.email}
            </a>
          ) : (
            '—'
          )}
        </InfoRow>
        <InfoRow label="Plazo de pago">
          {proveedor.plazoDias === null
            ? 'Contra presentación'
            : `${proveedor.plazoDias} días`}
        </InfoRow>
        {proveedor.notas ? (
          <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground text-pretty">
            {proveedor.notas}
          </p>
        ) : null}
      </DetailCard>

      <DetailCard
        title="Facturas"
        icon={Receipt}
        action={
          <FacturaProveedorDialog
            proveedor={proveedor}
            triggerLabel="Nueva factura"
          />
        }
      >
        {resumen.facturas.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground text-pretty">
            Sin facturas. Cargá lo que te factura y queda abierta hasta que la
            pagues desde Caja.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {resumen.facturas.map((f) => {
              const estado = estadoFacturaProveedor(f, movements)
              const saldo = saldoFacturaProveedor(f, movements)
              return (
                <li key={f.id} className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {f.concepto}
                      </p>
                      <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {f.numero ? `${f.numero} · ` : ''}
                        {formatDate(f.emitidaOn)}
                        {f.venceOn ? ` · vence ${formatDate(f.venceOn)}` : ''}
                        {` · ${nombreProyecto(f.projectId)}`}
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
                        aria-label={`Editar factura ${f.concepto}`}
                        onClick={() => setEditandoFactura(f)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      {estado === 'Pagada'
                        ? 'Pagada'
                        : `Pagado ${formatMoney(pagadoDe(f, movements), f.moneda)} · falta ${formatMoney(saldo, f.moneda)}`}
                    </span>
                    <span className="font-semibold">
                      {formatMoneyWithCode(f.importe, f.moneda)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DetailCard>

      <DetailCard title="Pagos" icon={Wallet}>
        {/* Los pagos SON movimientos de Caja: se cargan desde ahí, con la
            cuenta de la que sale la plata. Acá se ven, no se cargan — si se
            pudieran cargar desde dos lados, el saldo de una cuenta tendría
            dos orígenes. */}
        {resumen.sinImputar.length > 0 ? (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              <span className="tabular-nums">{resumen.sinImputar.length}</span>{' '}
              pago(s) sin imputar a ninguna factura. La plata salió igual — se
              asignan editando el movimiento en{' '}
              <Link href="/caja" className="text-neon-blue hover:underline">
                Caja
              </Link>
              .
            </p>
          </div>
        ) : null}

        {resumen.pagos.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground text-pretty">
            Sin pagos registrados. Se cargan desde{' '}
            <Link href="/caja" className="text-neon-blue hover:underline">
              Caja
            </Link>
            , como un gasto, eligiendo este proveedor y la factura que salda.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {resumen.pagos.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{m.concept || 'Pago'}</p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {formatDate(m.movedOn)} · {nombreCuenta(m.fromAccountId)}
                    {m.facturaProveedorId ? '' : ' · sin imputar'}
                  </p>
                </div>
                {/* El monto de un movimiento está en la moneda de la cuenta
                    de la que salió, no en una fija. Y con código, porque esta
                    lista mezcla pagos desde cuentas en monedas distintas. */}
                <span className="shrink-0 text-sm font-semibold tabular-nums text-red-300">
                  −
                  {formatMoneyWithCode(
                    m.amountOut,
                    cuentaDe(m.fromAccountId)?.currency ?? 'USD',
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      {editando ? (
        <ProveedorDialog
          proveedor={proveedor}
          open={editando}
          onOpenChange={setEditando}
        />
      ) : null}

      {editandoFactura ? (
        <FacturaProveedorDialog
          key={editandoFactura.id}
          factura={editandoFactura}
          proveedor={proveedor}
          open={!!editandoFactura}
          onOpenChange={(o) => !o && setEditandoFactura(null)}
        />
      ) : null}
    </div>
  )
}

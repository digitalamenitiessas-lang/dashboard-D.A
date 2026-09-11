'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, Search, Truck, Wallet } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { ProveedorDialog } from '@/components/proveedores/proveedor-dialog'
import { useStore } from '@/lib/store'
import { resumenProveedor } from '@/lib/proveedores'
import { formatMoneyByCurrency, isEmptyMoney, mergeMoney } from '@/lib/money'

/**
 * Proveedores: el espejo de Clientes, del lado de lo que sale.
 *
 * Entrando a cada uno están sus facturas y los pagos que le hicimos. Los
 * pagos no viven acá: son movimientos de Caja, así que el saldo de cada
 * cuenta sigue saliendo de un solo lugar.
 */
export default function ProveedoresPage() {
  const { proveedores, facturasProveedor, movements, proveedoresReady } =
    useStore()
  const [query, setQuery] = React.useState('')

  const enriquecidos = React.useMemo(
    () =>
      proveedores.map((p) => ({
        proveedor: p,
        ...resumenProveedor(p, facturasProveedor, movements),
      })),
    [proveedores, facturasProveedor, movements],
  )

  const q = query.trim().toLowerCase()
  const filtrados = enriquecidos.filter(({ proveedor }) => {
    if (!q) return true
    return (
      proveedor.nombre.toLowerCase().includes(q) ||
      proveedor.cuit.toLowerCase().includes(q) ||
      proveedor.contacto.toLowerCase().includes(q)
    )
  })

  const totalPendiente = mergeMoney(...enriquecidos.map((e) => e.pendienteDePago))
  const conDeuda = enriquecidos.filter(
    (e) => !isEmptyMoney(e.pendienteDePago),
  ).length

  if (!proveedoresReady) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Proveedores"
          description="A quiénes les pagamos y qué les debemos."
        />
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Falta correr la migración</EmptyTitle>
            <EmptyDescription>
              Corré{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                supabase/18_proveedores.sql
              </code>{' '}
              desde el SQL Editor de Supabase y recargá. El resto de la app
              funciona normal mientras tanto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proveedores"
        description="A quiénes les pagamos, qué nos facturan y qué les debemos."
      >
        <ProveedorDialog />
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Proveedores"
          value={proveedores.length}
          icon={Truck}
          accent="blue"
        />
        <StatCard
          label="Pendiente de pago"
          value={formatMoneyByCurrency(totalPendiente)}
          icon={Wallet}
          accent={isEmptyMoney(totalPendiente) ? 'neutral' : 'red'}
        />
        <StatCard
          label="Con deuda"
          value={conDeuda}
          accent={conDeuda ? 'red' : 'neutral'}
        />
      </div>

      <div className="flex justify-end">
        <InputGroup className="sm:w-72">
          <InputGroupInput
            placeholder="Buscar por nombre, CUIT o contacto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </div>

      {filtrados.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>
              {proveedores.length === 0 ? 'Sin proveedores' : 'Sin resultados'}
            </EmptyTitle>
            <EmptyDescription>
              {proveedores.length === 0
                ? 'Cargá los que ya te facturan: hosting, dominios, herramientas. Si tenías gastos fijos con proveedor escrito a mano, la migración ya los dio de alta.'
                : 'Ajustá la búsqueda.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtrados.map(({ proveedor, facturas, pendienteDePago }) => (
            <li key={proveedor.id}>
              <Link
                href={`/proveedores/${proveedor.id}`}
                className="glass flex items-center gap-4 rounded-2xl p-4 transition-colors hover:border-white/15"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20">
                  <Truck className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-extrabold">
                    {proveedor.nombre}
                  </p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {proveedor.cuit || 'Sin CUIT'}
                    {proveedor.plazoDias !== null
                      ? ` · ${proveedor.plazoDias} días de plazo`
                      : ''}
                    {` · ${facturas.length} factura${facturas.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted-foreground">
                    Le debemos
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoneyByCurrency(pendienteDePago)}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

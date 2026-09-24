'use client'

/**
 * El flujo de todos los meses, de un vistazo.
 *
 * Lo que entra son los mantenimientos; lo que sale, los gastos fijos. Las dos
 * cuentas ya existían —`monthlyMaintenanceValue()` y `committedMonthly()`, las
 * mismas que usan /mantenimientos y /gastos— así que acá no se recalcula nada:
 * si se recalculara, el día que alguien toque una de las dos el dashboard
 * empezaría a decir un número distinto al de la pantalla del módulo.
 *
 * TODO NORMALIZADO A UN MES. Un plan anual de USD 1.200 cuenta como USD 100 por
 * mes, que es lo que hace comparable un trimestral con un mensual. Pero el
 * renglón de cada plan aclara la frecuencia real: si dijera sólo «USD 100» daría
 * a entender que ese cliente paga todos los meses, y no paga.
 *
 * Y nunca se suman monedas distintas, como en todo el resto: si hay ingresos en
 * dólares y gastos en pesos, el neto sale por moneda. No se convierte con la
 * cotización a propósito — mezclar deja un número que parece exacto y no lo es.
 */

import { Repeat } from 'lucide-react'

import { SectionCard } from '@/components/dashboard/section-card'
import { useStore } from '@/lib/store'
import { frequencyMonths, monthlyMaintenanceValue } from '@/lib/derive'
import { committedMonthly } from '@/lib/gastos'
import { formatMoneyWithCode } from '@/lib/format'
import {
  formatMoneyByCurrency,
  isEmptyMoney,
  subtractMoney,
  sumByCurrency,
} from '@/lib/money'

/** Cuántos planes se listan antes de resumir el resto en un renglón. */
const TOPE = 5

export function FlujoMensual() {
  const { projects, fixedExpenses, gastosReady } = useStore()

  const planes = projects
    .map((p) => ({ project: p, mensual: monthlyMaintenanceValue(p) }))
    .filter((x) => x.mensual > 0)
    .sort((a, b) => b.mensual - a.mensual)

  const entra = sumByCurrency(
    planes.map((x) => ({
      amount: x.mensual,
      currency: x.project.maintenance.currency,
    })),
  )

  // Sin la migración de gastos la lista viene vacía, y un «sale: —» ahí
  // estaría mintiendo: no es que no haya gastos, es que no se sabe.
  const sale = gastosReady ? committedMonthly(fixedExpenses) : null
  const neto = sale ? subtractMoney(entra, sale) : null

  const visibles = planes.slice(0, TOPE)
  const resto = planes.slice(TOPE)

  return (
    <SectionCard title="Flujo mensual" icon={Repeat} href="/mantenimientos">
      {/* Los tres números en fila cuando hay ancho, apilados en el teléfono.
          En fila se comparan de un vistazo, que es justo lo que se pidió. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra
          etiqueta="Entra"
          hint="Mantenimientos activos"
          valor={isEmptyMoney(entra) ? '—' : formatMoneyByCurrency(entra)}
          tono="text-neon-green"
        />
        {sale ? (
          <Cifra
            etiqueta="Sale"
            hint="Gastos fijos comprometidos"
            valor={isEmptyMoney(sale) ? '—' : formatMoneyByCurrency(sale)}
            tono="text-red-300"
          />
        ) : null}
        {neto ? (
          <Cifra
            etiqueta="Neto"
            hint="Por mes, antes de proyectos"
            valor={isEmptyMoney(neto) ? '—' : formatMoneyByCurrency(neto)}
            tono=""
          />
        ) : null}
      </div>

      {planes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavía no hay planes de mantenimiento activos.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 border-t border-white/5 pt-3.5 sm:grid-cols-2">
          {visibles.map(({ project, mensual }) => {
            const m = project.maintenance
            const esMensual = frequencyMonths[m.frequency] === 1
            return (
              <li
                key={project.id}
                className="flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{project.name}</p>
                  {/* Sin esto, un plan anual se lee como que cobra todos los
                      meses. El número grande es el prorrateado; el chico, lo
                      que el cliente paga de verdad y cada cuánto. */}
                  {!esMensual ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {m.frequency} · {formatMoneyWithCode(m.amount, m.currency)}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoneyWithCode(mensual, m.currency)}
                </span>
              </li>
            )
          })}

          {resto.length > 0 ? (
            <li className="text-xs text-muted-foreground">
              y {resto.length} plan{resto.length === 1 ? '' : 'es'} más
            </li>
          ) : null}
        </ul>
      )}
    </SectionCard>
  )
}

function Cifra({
  etiqueta,
  hint,
  valor,
  tono,
}: {
  etiqueta: string
  hint: string
  valor: string
  tono: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </p>
      {/* `text-pretty` y no `truncate`: con dos monedas el valor es
          «USD 500 · ARS 800.000» y cortarlo escondería media respuesta. */}
      <p className={`mt-1 text-lg font-semibold tabular-nums text-pretty ${tono}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

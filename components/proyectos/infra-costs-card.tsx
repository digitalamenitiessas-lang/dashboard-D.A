'use client'

import * as React from 'react'
import { CircleDollarSign, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { MoneyInput } from '@/components/shared/money-input'
import { DetailCard } from '@/components/proyectos/detail-parts'
import { useStore } from '@/lib/store'
import { monthlyInfraCost } from '@/lib/derive'
import { formatMoney } from '@/lib/format'
import { formatMoneyByCurrency, isEmptyMoney } from '@/lib/money'
import { MAINTENANCE_FREQUENCIES } from '@/lib/types'
import type { Currency, MaintenanceFrequency, Project } from '@/lib/types'

/** Recurring infra spend for one project, with inline add/remove. */
export function InfraCostsCard({ project }: { project: Project }) {
  const { addInfraCost, deleteInfraCost } = useStore()
  const [concept, setConcept] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [frequency, setFrequency] = React.useState<MaintenanceFrequency>('Mensual')
  const [adding, setAdding] = React.useState(false)

  const costs = project.infrastructure.costs
  const monthly = monthlyInfraCost(project)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!concept.trim() || !(Number(amount) > 0)) return
    setAdding(true)
    await addInfraCost(project.id, {
      concept: concept.trim(),
      amount: Number(amount),
      currency,
      frequency,
    })
    setConcept('')
    setAmount('')
    setAdding(false)
  }

  return (
    <DetailCard title="Costos de infraestructura" icon={CircleDollarSign}>
      {costs.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Sin costos cargados.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {costs.map((c) => (
            <li key={c.id} className="group flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm">{c.concept}</p>
                <p className="text-xs text-muted-foreground">{c.frequency}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {formatMoney(c.amount, c.currency)}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Eliminar costo: ${c.concept}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => void deleteInfraCost(project.id, c.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isEmptyMoney(monthly) ? (
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-muted-foreground">Equivalente mensual</span>
          <span className="font-semibold tabular-nums text-neon-violet">
            {formatMoneyByCurrency(monthly)}
          </span>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-2 pt-3">
        <Input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Concepto (ej: Hosting Vercel)"
          className="h-8"
        />
        <div className="flex items-center gap-2">
          <MoneyInput
            value={amount}
            onValueChange={setAmount}
            placeholder="0"
            className="h-8 w-24 tabular-nums"
            aria-label="Importe"
          />
          <SimpleSelect
            value={currency}
            onValueChange={(v) => setCurrency(v as Currency)}
            options={toOptions(['USD', 'ARS', 'EUR'] as const)}
            size="sm"
            className="w-24"
          />
          <SimpleSelect
            value={frequency}
            onValueChange={(v) => setFrequency(v as MaintenanceFrequency)}
            options={toOptions(MAINTENANCE_FREQUENCIES)}
            size="sm"
          />
          <Button
            type="submit"
            size="icon-sm"
            variant="outline"
            disabled={adding || !concept.trim() || !(Number(amount) > 0)}
            aria-label="Agregar costo"
          >
            <Plus />
          </Button>
        </div>
      </form>
    </DetailCard>
  )
}

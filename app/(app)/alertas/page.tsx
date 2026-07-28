'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  BellRing,
  CircleCheck,
  Info,
  TriangleAlert,
} from 'lucide-react'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { SectionCard } from '@/components/dashboard/section-card'
import { useStore } from '@/lib/store'
import { buildAlerts, type AlertItem, type AlertLevel } from '@/lib/derive'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const levelLabel: Record<AlertLevel, string> = {
  critical: 'Crítica',
  warning: 'Advertencia',
  info: 'Informativa',
}

const levelStyles: Record<AlertLevel, string> = {
  critical: 'border-destructive/30 bg-destructive/10',
  warning: 'border-amber-400/25 bg-amber-400/10',
  info: 'border-neon-blue/25 bg-neon-blue/10',
}

const levelDot: Record<AlertLevel, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-300',
  info: 'bg-neon-blue',
}

const levelText: Record<AlertLevel, string> = {
  critical: 'text-red-300',
  warning: 'text-amber-300',
  info: 'text-neon-blue',
}

export default function AlertasPage() {
  const { projects, payments, notes, activity, tasks } = useStore()
  const [levelFilter, setLevelFilter] = React.useState<string>('todas')
  const [categoryFilter, setCategoryFilter] = React.useState('todas')

  const alerts = buildAlerts({ projects, payments, notes, tasks })

  const categories = Array.from(new Set(alerts.map((a) => a.category))).sort()

  const filtered = alerts.filter((a) => {
    if (levelFilter !== 'todas' && a.level !== levelFilter) return false
    if (categoryFilter !== 'todas' && a.category !== categoryFilter) return false
    return true
  })

  const counts: Record<AlertLevel, number> = {
    critical: alerts.filter((a) => a.level === 'critical').length,
    warning: alerts.filter((a) => a.level === 'warning').length,
    info: alerts.filter((a) => a.level === 'info').length,
  }

  // Group the filtered set by category for readability.
  const grouped = filtered.reduce<Record<string, AlertItem[]>>((acc, a) => {
    ;(acc[a.category] ??= []).push(a)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alertas"
        description="Todo lo que requiere atención: cobros, mantenimientos, proyectos e infraestructura."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total alertas"
          value={alerts.length}
          icon={BellRing}
          accent={alerts.length ? 'blue' : 'neutral'}
        />
        <StatCard
          label="Críticas"
          value={counts.critical}
          icon={TriangleAlert}
          accent={counts.critical ? 'red' : 'neutral'}
        />
        <StatCard label="Advertencias" value={counts.warning} accent="neutral" />
        <StatCard
          label="Informativas"
          value={counts.info}
          icon={Info}
          accent="neutral"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ToggleGroup
          value={[levelFilter]}
          onValueChange={(v) => setLevelFilter((v[0] as string) ?? 'todas')}
          className="w-fit"
        >
          <ToggleGroupItem value="todas">Todas</ToggleGroupItem>
          <ToggleGroupItem value="critical">Críticas</ToggleGroupItem>
          <ToggleGroupItem value="warning">Advertencias</ToggleGroupItem>
          <ToggleGroupItem value="info">Info</ToggleGroupItem>
        </ToggleGroup>

        <SimpleSelect
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          className="lg:w-56"
          options={[
            { value: 'todas', label: 'Todas las categorías' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>
              {alerts.length === 0 ? 'Todo en orden' : 'Sin resultados'}
            </EmptyTitle>
            <EmptyDescription>
              {alerts.length === 0
                ? 'No hay pagos vencidos, bloqueos ni vencimientos próximos.'
                : 'Ninguna alerta coincide con los filtros aplicados.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                {category}
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px]">
                  {items.length}
                </span>
              </h2>
              <ul className="flex flex-col gap-2.5">
                {items.map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3.5',
                      levelStyles[a.level],
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        levelDot[a.level],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-pretty">{a.title}</p>
                        <span
                          className={cn('text-[11px] font-medium', levelText[a.level])}
                        >
                          {levelLabel[a.level]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                        {a.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {a.date ? (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {formatDate(a.date)}
                        </span>
                      ) : null}
                      {a.projectId ? (
                        <Link
                          href={`/proyectos/${a.projectId}`}
                          className="text-muted-foreground transition-colors hover:text-neon-green"
                          aria-label="Ver proyecto"
                        >
                          <ArrowUpRight className="size-4" />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Historial de actividad" icon={CircleCheck}>
        <ul className="flex flex-col divide-y divide-white/5">
          {activity.slice(0, 15).map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {a.type}
              </span>
              {a.projectId ? (
                <Link
                  href={`/proyectos/${a.projectId}`}
                  className="min-w-0 flex-1 truncate text-sm transition-colors hover:text-neon-green"
                >
                  {a.message}
                </Link>
              ) : (
                <p className="min-w-0 flex-1 truncate text-sm">{a.message}</p>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(a.date)}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

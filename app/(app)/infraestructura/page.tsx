'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CircleDollarSign,
  Cloud,
  Database,
  ExternalLink,
  GitBranch,
  Globe,
  Search,
  Server,
  Zap,
} from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { SectionCard } from '@/components/dashboard/section-card'
import { useStore } from '@/lib/store'
import { monthlyInfraCost } from '@/lib/derive'
import { formatDate, relativeDays, daysUntil } from '@/lib/format'
import {
  formatMoneyByCurrency,
  isEmptyMoney,
  mergeMoney,
} from '@/lib/money'
import { cn } from '@/lib/utils'

/** Projects only appear here once they have something deployed to track. */
function hasInfra(infra: { repo: string; hosting: string; domain: string; productionUrl: string }) {
  return Boolean(infra.repo || infra.hosting || infra.domain || infra.productionUrl)
}

export default function InfraestructuraPage() {
  const { projects } = useStore()
  const [query, setQuery] = React.useState('')

  const withInfra = projects.filter((p) => hasInfra(p.infrastructure))

  const filtered = withInfra.filter((p) => {
    if (!query) return true
    const q = query.toLowerCase()
    const i = p.infrastructure
    return (
      p.name.toLowerCase().includes(q) ||
      i.domain.toLowerCase().includes(q) ||
      i.hosting.toLowerCase().includes(q) ||
      i.database.toLowerCase().includes(q) ||
      i.deployPlatform.toLowerCase().includes(q) ||
      i.externalServices.some((s) => s.toLowerCase().includes(q))
    )
  })

  // Monthly-normalized infrastructure spend across every project.
  const monthlyCost = mergeMoney(...projects.map(monthlyInfraCost))

  const domains = projects
    .filter((p) => p.infrastructure.domain && p.infrastructure.domainExpiry)
    .map((p) => ({
      project: p,
      domain: p.infrastructure.domain,
      expiry: p.infrastructure.domainExpiry as string,
    }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry))

  const expiringSoon = domains.filter(
    (d) => (daysUntil(d.expiry) ?? 999) <= 30,
  ).length

  const allServices = new Set(
    projects.flatMap((p) => p.infrastructure.externalServices),
  )
  const allAutomations = projects.flatMap((p) =>
    p.infrastructure.automations.map((a) => ({ project: p, automation: a })),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Infraestructura"
        description="Entornos, dominios, servicios y costos técnicos de cada proyecto."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Costo mensual"
          value={formatMoneyByCurrency(monthlyCost)}
          hint="Hosting, DB, APIs e IA"
          icon={CircleDollarSign}
          accent="violet"
        />
        <StatCard
          label="Proyectos desplegados"
          value={withInfra.length}
          icon={Server}
          accent="blue"
        />
        <StatCard
          label="Dominios por vencer"
          value={expiringSoon}
          hint="Próximos 30 días"
          icon={Globe}
          accent={expiringSoon ? 'red' : 'neutral'}
        />
        <StatCard
          label="Servicios externos"
          value={allServices.size}
          icon={Zap}
          accent="green"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Vencimiento de dominios" icon={Globe}>
          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin dominios registrados.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {domains.map(({ project, domain, expiry }) => {
                const d = daysUntil(expiry) ?? 999
                const critical = d < 0
                const warning = d >= 0 && d <= 30
                return (
                  <li
                    key={project.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{domain}</p>
                      <Link
                        href={`/proyectos/${project.id}`}
                        className="truncate text-xs text-muted-foreground transition-colors hover:text-neon-green"
                      >
                        {project.name}
                      </Link>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums">{formatDate(expiry)}</p>
                      <p
                        className={cn(
                          'text-xs',
                          critical
                            ? 'text-red-300'
                            : warning
                              ? 'text-amber-300'
                              : 'text-muted-foreground',
                        )}
                      >
                        {relativeDays(expiry)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Automatizaciones activas" icon={Zap}>
          {allAutomations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin automatizaciones registradas.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {allAutomations.map(({ project, automation }, i) => (
                <li key={`${project.id}-${i}`} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-neon-green" />
                  <div className="min-w-0">
                    <p className="text-sm text-pretty">{automation}</p>
                    <Link
                      href={`/proyectos/${project.id}`}
                      className="text-xs text-muted-foreground transition-colors hover:text-neon-green"
                    >
                      {project.name}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="flex justify-end">
        <InputGroup className="sm:w-72">
          <InputGroupInput
            placeholder="Buscar por stack, dominio o servicio..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </div>

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin infraestructura</EmptyTitle>
            <EmptyDescription>
              Ningún proyecto coincide con la búsqueda.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Deploy</TableHead>
                <TableHead>Hosting</TableHead>
                <TableHead>Base de datos</TableHead>
                <TableHead>Servicios</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead className="text-right">Costo/mes</TableHead>
                <TableHead className="text-right">Enlaces</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const i = p.infrastructure
                const cost = monthlyInfraCost(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/proyectos/${p.id}`}
                        className="transition-colors hover:text-neon-green"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.deployPlatform || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {i.hosting ? <Cloud className="size-3.5" /> : null}
                        {i.hosting || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {i.database ? <Database className="size-3.5" /> : null}
                        {i.database || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {i.externalServices.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {i.externalServices.map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.techLead || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isEmptyMoney(cost) ? '—' : formatMoneyByCurrency(cost)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {i.productionUrl ? (
                          <a
                            href={i.productionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-neon-blue"
                            aria-label={`Producción de ${p.name}`}
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                        {i.repo ? (
                          <a
                            href={
                              /^https?:\/\//.test(i.repo)
                                ? i.repo
                                : `https://${i.repo}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-neon-blue"
                            aria-label={`Repositorio de ${p.name}`}
                          >
                            <GitBranch className="size-4" />
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

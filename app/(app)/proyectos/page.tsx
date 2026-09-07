'use client'

import * as React from 'react'
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { SimpleSelect } from '@/components/shared/simple-select'
import { ProjectCard } from '@/components/proyectos/project-card'
import { ProjectTable } from '@/components/proyectos/project-table'
import { NewProjectDialog } from '@/components/proyectos/new-project-dialog'
import { useStore } from '@/lib/store'
import { ACTIVE_STATUSES } from '@/lib/status'
import { PROJECT_STATUSES } from '@/lib/types'
import type { ProjectType } from '@/lib/types'

type TypeFilter = 'todos' | ProjectType
type ViewMode = 'tarjetas' | 'tabla'

export default function ProyectosPage() {
  const { projects, clients, payments } = useStore()
  const [query, setQuery] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('todos')
  const [statusFilter, setStatusFilter] = React.useState<string>('todos')
  const [view, setView] = React.useState<ViewMode>('tarjetas')
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const clientName = React.useCallback(
    (id: string | null) =>
      id ? clients.find((c) => c.id === id)?.name ?? 'Sin cliente' : 'Interno',
    [clients],
  )

  const filtered = React.useMemo(() => {
    return projects.filter((p) => {
      if (typeFilter !== 'todos' && p.type !== typeFilter) return false
      if (statusFilter === 'activos' && !ACTIVE_STATUSES.includes(p.status))
        return false
      if (
        statusFilter !== 'todos' &&
        statusFilter !== 'activos' &&
        p.status !== statusFilter
      )
        return false
      if (query) {
        const q = query.toLowerCase()
        const hay =
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          clientName(p.clientId).toLowerCase().includes(q)
        if (!hay) return false
      }
      return true
    })
  }, [projects, typeFilter, statusFilter, query, clientName])

  const statusOptions = [
    { value: 'todos', label: 'Todos los estados' },
    { value: 'activos', label: 'Solo activos' },
    ...PROJECT_STATUSES.map((s) => ({ value: s, label: s })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proyectos"
        description="Todos los desarrollos propios y de clientes en un solo lugar."
      >
        <Button onClick={() => setDialogOpen(true)}>
          <Plus data-icon="inline-start" />
          Nuevo proyecto
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ToggleGroup
          value={[typeFilter]}
          onValueChange={(v) => {
            const next = (v[0] as TypeFilter) ?? 'todos'
            setTypeFilter(next)
          }}
          className="w-fit"
        >
          <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
          <ToggleGroupItem value="propio">Propios</ToggleGroupItem>
          <ToggleGroupItem value="terceros">Terceros</ToggleGroupItem>
        </ToggleGroup>

        {/* Los filtros secundarios comparten renglón en vez de apilarse:
            eran cuatro filas antes de ver el primer proyecto. */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-row sm:items-center">
          <InputGroup className="min-w-full sm:w-64 sm:min-w-0">
            <InputGroupInput
              placeholder="Buscar proyectos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          <SimpleSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={statusOptions}
            className="flex-1 sm:w-48 sm:flex-none"
          />
          {/* La vista tabla son 9 columnas: abajo de sm no se ofrece. */}
          <ToggleGroup
            value={[view]}
            onValueChange={(v) => setView((v[0] as ViewMode) ?? 'tarjetas')}
            className="hidden w-fit sm:flex"
          >
            <ToggleGroupItem value="tarjetas" aria-label="Vista en tarjetas">
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="tabla" aria-label="Vista en tabla">
              <List />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin resultados</EmptyTitle>
            <EmptyDescription>
              Ajustá los filtros o creá un nuevo proyecto para empezar.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === 'tabla' ? (
        <>
          {/* El toggle de vista está oculto abajo de sm, pero el estado puede
              venir en 'tabla' desde una pantalla más ancha: ahí caen las
              tarjetas, que es lo único usable a 375px. */}
          <div className="grid grid-cols-1 gap-4 sm:hidden">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                payments={payments}
                clientName={clientName(p.clientId)}
              />
            ))}
          </div>
          <div className="hidden sm:block">
            <ProjectTable
              projects={filtered}
              payments={payments}
              clientName={clientName}
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              payments={payments}
              clientName={clientName(p.clientId)}
            />
          ))}
        </div>
      )}

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

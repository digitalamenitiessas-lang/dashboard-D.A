'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Building2,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  Search,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/shared/page-header'
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { ProjectCard } from '@/components/proyectos/project-card'
import { ProjectTable } from '@/components/proyectos/project-table'
import { NewProjectDialog } from '@/components/proyectos/new-project-dialog'
import { NewClientDialog } from '@/components/clientes/new-client-dialog'
import { ClientsPanel } from '@/components/clientes/clients-panel'
import { useStore } from '@/lib/store'
import { projectFinance } from '@/lib/derive'
import { formatMoneyByCurrency, mergeMoney } from '@/lib/money'
import { ACTIVE_STATUSES } from '@/lib/status'
import { PROJECT_STATUSES } from '@/lib/types'
import type { Project } from '@/lib/types'

type Vista = 'propios' | 'clientes'
type ViewMode = 'tarjetas' | 'tabla'

const VISTAS: Vista[] = ['propios', 'clientes']

/**
 * Proyectos y clientes, unificados.
 *
 * Eran dos pantallas y la separación no se sostenía: un cliente sin sus
 * proyectos no dice nada, y un proyecto de terceros sin su cliente tampoco.
 * Ahora es una sola sección con el corte que de verdad importa para la
 * empresa —lo que se construye para uno mismo contra lo que se hace para
 * afuera— y cada pestaña con sus propios totales, que es lo que hace útil
 * separarlas: mezclados, el «total cotizado» sumaba producto propio con
 * trabajo facturable y no contestaba ninguna de las dos preguntas.
 *
 * El corte no es un filtro de pantalla sino el modelo: los diálogos de
 * proyecto fuerzan `clientId = type === 'terceros' ? clientId : null`, así
 * que un proyecto propio no puede tener cliente ni aparecer en la otra
 * pestaña.
 */
function ProyectosContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { projects, clients, payments } = useStore()

  // La pestaña vive en la URL para que se pueda compartir el link y para que
  // /clientes —que ahora redirige acá— aterrice donde corresponde.
  const vistaParam = searchParams.get('vista')
  const vista: Vista = VISTAS.includes(vistaParam as Vista)
    ? (vistaParam as Vista)
    : 'clientes'

  const [query, setQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('todos')
  const [view, setView] = React.useState<ViewMode>('tarjetas')
  const [dialogOpen, setDialogOpen] = React.useState(false)

  function cambiarVista(next: Vista) {
    // `replace` y no `push`: alternar pestañas no es navegación, y con push
    // el botón Atrás del celular tendría que deshacer diez toques antes de
    // salir de la pantalla.
    router.replace(next === 'clientes' ? '/proyectos' : `/proyectos?vista=${next}`, {
      scroll: false,
    })
  }

  const clientName = React.useCallback(
    (id: string | null) =>
      id ? (clients.find((c) => c.id === id)?.name ?? 'Sin cliente') : 'Interno',
    [clients],
  )

  const matchesStatus = React.useCallback(
    (p: Project) => {
      if (statusFilter === 'todos') return true
      if (statusFilter === 'activos') return ACTIVE_STATUSES.includes(p.status)
      return p.status === statusFilter
    },
    [statusFilter],
  )

  const propios = React.useMemo(
    () => projects.filter((p) => p.type === 'propio'),
    [projects],
  )
  const terceros = React.useMemo(
    () => projects.filter((p) => p.type === 'terceros'),
    [projects],
  )

  const propiosFiltrados = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return propios.filter((p) => {
      if (!matchesStatus(p)) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      )
    })
  }, [propios, matchesStatus, query])

  // Totales de la pestaña de clientes. Los propios no se miden en plata:
  // no se le facturan a nadie, así que un «cotizado» ahí sería un número
  // inventado. Se miden en avance, que es lo que de verdad se sigue.
  const tercerosFin = React.useMemo(
    () => terceros.map((p) => projectFinance(p, payments)),
    [terceros, payments],
  )
  const tercerosQuoted = mergeMoney(...tercerosFin.map((f) => f.quotedByCurrency))
  const tercerosPaid = mergeMoney(...tercerosFin.map((f) => f.paidByCurrency))

  const propiosActivos = propios.filter((p) =>
    ACTIVE_STATUSES.includes(p.status),
  ).length
  const propiosEnLaCalle = propios.filter((p) =>
    ['Implementado', 'En mantenimiento', 'Finalizado'].includes(p.status),
  ).length
  // Promedio de avance de los que todavía se están construyendo. Incluir los
  // terminados lo empujaría al 100% y dejaría de decir cuánto falta.
  const enCurso = propios.filter(
    (p) => !['Implementado', 'En mantenimiento', 'Finalizado'].includes(p.status),
  )
  const avancePromedio = enCurso.length
    ? Math.round(
        enCurso.reduce((s, p) => s + p.development.progress, 0) / enCurso.length,
      )
    : null

  const statusOptions = [
    { value: 'todos', label: 'Todos los estados' },
    { value: 'activos', label: 'Solo activos' },
    ...PROJECT_STATUSES.map((s) => ({ value: s, label: s })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proyectos y clientes"
        description="Lo que construimos para nosotros y lo que hacemos para clientes, separado."
      >
        {vista === 'clientes' ? <NewClientDialog /> : null}
        <Button onClick={() => setDialogOpen(true)}>
          <Plus data-icon="inline-start" />
          Nuevo proyecto
        </Button>
      </PageHeader>

      <Tabs value={vista} onValueChange={(v) => cambiarVista(v as Vista)}>
        <TabsList>
          <TabsTrigger value="clientes" className="flex-none">
            <Building2 data-icon="inline-start" />
            De clientes ({terceros.length})
          </TabsTrigger>
          <TabsTrigger value="propios" className="flex-none">
            <FolderKanban data-icon="inline-start" />
            Propios ({propios.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {vista === 'clientes' ? (
            <>
              <StatCard
                label="Clientes"
                value={clients.length}
                icon={Building2}
                accent="blue"
              />
              <StatCard
                label="Proyectos de terceros"
                value={terceros.length}
                accent="neutral"
              />
              <StatCard
                label="Cotizado"
                value={formatMoneyByCurrency(tercerosQuoted)}
                accent="neutral"
              />
              <StatCard
                label="Cobrado"
                value={formatMoneyByCurrency(tercerosPaid)}
                icon={Wallet}
                accent="green"
              />
            </>
          ) : (
            <>
              <StatCard
                label="Desarrollos propios"
                value={propios.length}
                icon={FolderKanban}
                accent="violet"
              />
              <StatCard
                label="Activos"
                value={propiosActivos}
                accent={propiosActivos ? 'green' : 'neutral'}
              />
              <StatCard
                label="Avance promedio"
                value={avancePromedio === null ? '—' : `${avancePromedio}%`}
                hint={
                  avancePromedio === null
                    ? 'Nada en curso'
                    : `${enCurso.length} en curso`
                }
                accent="blue"
              />
              <StatCard
                label="En la calle"
                value={propiosEnLaCalle}
                icon={Wrench}
                hint="Implementados o en mantenimiento"
                accent={propiosEnLaCalle ? 'green' : 'neutral'}
              />
            </>
          )}
        </div>

        {/* Los filtros son compartidos por las dos pestañas a propósito:
            buscar «MALALA» tiene que encontrarlo esté donde esté, sin que
            haya que acordarse de en qué pestaña vive cada proyecto. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-full sm:w-64 sm:min-w-0">
            <InputGroupInput
              placeholder={
                vista === 'clientes'
                  ? 'Buscar cliente, contacto o proyecto...'
                  : 'Buscar proyectos propios...'
              }
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
          {/* El toggle de vista es sólo de la pestaña Propios: en la de
              clientes los proyectos van adentro de la ficha de cada uno y
              una tabla plana rompería justamente el agrupado. */}
          {vista === 'propios' ? (
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
          ) : null}
        </div>

        <TabsContent value="clientes" className="mt-4">
          <ClientsPanel
            query={query}
            statusFilter={statusFilter}
            matchesStatus={matchesStatus}
          />
        </TabsContent>

        <TabsContent value="propios" className="mt-4">
          {propiosFiltrados.length === 0 ? (
            <Empty className="glass rounded-2xl">
              <EmptyHeader>
                <EmptyTitle>
                  {propios.length === 0
                    ? 'Sin desarrollos propios'
                    : 'Sin resultados'}
                </EmptyTitle>
                <EmptyDescription>
                  {propios.length === 0
                    ? 'Un proyecto propio es producto de Digital Amenities: no tiene cliente y no se factura a nadie.'
                    : 'Ajustá la búsqueda o el filtro de estado.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : view === 'tabla' ? (
            <>
              {/* El toggle está oculto abajo de sm, pero el estado puede venir
                  en 'tabla' desde una pantalla más ancha: ahí caen las
                  tarjetas, que es lo único usable a 375px. */}
              <div className="grid grid-cols-1 gap-4 sm:hidden">
                {propiosFiltrados.map((p) => (
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
                  projects={propiosFiltrados}
                  payments={payments}
                  clientName={clientName}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {propiosFiltrados.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  payments={payments}
                  clientName={clientName(p.clientId)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

/**
 * `useSearchParams()` obliga a un límite de Suspense. El fallback es la
 * cáscara de la pantalla y no un spinner: el store ya tiene su propio gate
 * de carga, y meter un segundo estado de «cargando» haría parpadear dos
 * veces la misma pantalla.
 */
export default function ProyectosPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Proyectos y clientes"
            description="Lo que construimos para nosotros y lo que hacemos para clientes, separado."
          />
        </div>
      }
    >
      <ProyectosContent />
    </React.Suspense>
  )
}

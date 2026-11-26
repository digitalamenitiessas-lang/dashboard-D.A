'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowUp,
  CalendarClock,
  Check,
  Flag,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { SimpleSelect } from '@/components/shared/simple-select'
import { MetaDialog } from '@/components/tablero/meta-dialog'
import { TareaDialog } from '@/components/tablero/tarea-dialog'
import { useStore } from '@/lib/store'
import {
  ESTADOS_TAREA,
  avanceDeMeta,
  etiquetaEstado,
  porFecha,
  urgencia,
  useTablero,
  type EstadoTarea,
  type Meta,
  type Tablero,
  type TareaEquipo,
} from '@/lib/tablero'
import { daysUntil, formatDateShort, relativeDays } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Cuántos días se siguen viendo las tareas hechas en su columna. */
const DIAS_HECHAS_A_LA_VISTA = 14

const colorColumna: Record<EstadoTarea, string> = {
  pendiente: 'bg-muted-foreground',
  en_curso: 'bg-neon-blue',
  bloqueada: 'bg-red-400',
  hecha: 'bg-neon-green',
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return (partes.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}

export default function TableroPage() {
  const tablero = useTablero()
  const { cargando, falta, yo, miembros, metas, tareas } = tablero

  const [persona, setPersona] = React.useState('todos')
  const [metaFiltro, setMetaFiltro] = React.useState('todas')
  const [verTodasHechas, setVerTodasHechas] = React.useState(false)

  const [tareaAbierta, setTareaAbierta] = React.useState(false)
  const [tareaEditada, setTareaEditada] = React.useState<TareaEquipo | null>(null)
  const [tareaInicial, setTareaInicial] = React.useState<{
    metaId?: string | null
    estado?: EstadoTarea
  }>({})
  const [metaAbierta, setMetaAbierta] = React.useState(false)
  const [metaEditada, setMetaEditada] = React.useState<Meta | null>(null)
  const [nombreAbierto, setNombreAbierto] = React.useState(false)

  // Con muchas metas, el tablero queda varias pantallas más abajo: al
  // tocar una, se filtra y se baja hasta sus tareas para que se note.
  const tableroRef = React.useRef<HTMLDivElement>(null)
  const elegirMeta = (id: string) => {
    const siguiente = metaFiltro === id ? 'todas' : id
    setMetaFiltro(siguiente)
    if (siguiente === 'todas') return
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() =>
      tableroRef.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' }),
    )
  }
  const verMetas = () => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' })
  }
  const metaElegida = metas.find((m) => m.id === metaFiltro) ?? null

  const nuevaTarea = (inicial: { metaId?: string | null; estado?: EstadoTarea } = {}) => {
    setTareaEditada(null)
    setTareaInicial({
      metaId: inicial.metaId ?? (metaFiltro !== 'todas' && metaFiltro !== 'sin' ? metaFiltro : null),
      estado: inicial.estado,
    })
    setTareaAbierta(true)
  }
  const editarTarea = (t: TareaEquipo) => {
    setTareaEditada(t)
    setTareaAbierta(true)
  }
  const nuevaMeta = () => {
    setMetaEditada(null)
    setMetaAbierta(true)
  }
  const editarMeta = (m: Meta) => {
    setMetaEditada(m)
    setMetaAbierta(true)
  }

  const visibles = React.useMemo(
    () =>
      tareas.filter((t) => {
        if (persona === 'yo' && t.responsableId !== yo) return false
        if (persona === 'nadie' && t.responsableId) return false
        if (!['todos', 'yo', 'nadie'].includes(persona) && t.responsableId !== persona) return false
        if (metaFiltro === 'sin' && t.metaId) return false
        if (!['todas', 'sin'].includes(metaFiltro) && t.metaId !== metaFiltro) return false
        return true
      }),
    [tareas, persona, metaFiltro, yo],
  )

  const metasActivas = metas.filter((m) => m.estado === 'activa')
  const misVencidas = tareas.filter(
    (t) => t.responsableId === yo && urgencia(t) === 'vencida',
  ).length

  if (cargando) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Tablero del equipo" description="Cargando…" />
      </div>
    )
  }

  if (falta) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Tablero del equipo" />
        <div className="glass rounded-2xl p-6 text-sm">
          <p className="font-semibold">Falta preparar la base de datos.</p>
          <p className="mt-2 text-muted-foreground">
            Corré <code className="rounded bg-white/10 px-1">supabase/28_tablero.sql</code> en el
            SQL Editor de Supabase y recargá esta página.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tablero del equipo"
        description="En qué está cada uno y para cuándo. Si una tarea se acerca a su fecha sin estar hecha, a su responsable le llega un aviso."
      >
        <Button size="sm" variant="outline" onClick={nuevaMeta}>
          <Flag data-icon="inline-start" />
          Nueva meta
        </Button>
        <Button size="sm" onClick={() => nuevaTarea()}>
          <Plus data-icon="inline-start" />
          Nueva tarea
        </Button>
      </PageHeader>

      {misVencidas > 0 ? (
        <button
          type="button"
          onClick={() => setPersona('yo')}
          className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-left text-sm text-red-200 transition-colors hover:bg-destructive/15"
        >
          Tenés {misVencidas} tarea{misVencidas === 1 ? '' : 's'} vencida
          {misVencidas === 1 ? '' : 's'}. Terminala{misVencidas === 1 ? '' : 's'} o cambiale
          {misVencidas === 1 ? '' : 's'} la fecha para que deje{misVencidas === 1 ? '' : 'n'} de
          avisar.
        </button>
      ) : null}

      <MetasFila
        metas={metasActivas}
        tareas={tareas}
        seleccionada={metaFiltro}
        onSeleccionar={elegirMeta}
        onEditar={editarMeta}
        onNueva={nuevaMeta}
        onNuevaTarea={(metaId) => nuevaTarea({ metaId })}
      />

      <div ref={tableroRef} className="scroll-mt-[calc(5rem+env(safe-area-inset-top))]">
        <Tabs defaultValue="tablero" className="gap-4">
          {metaElegida ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-neon-violet/30 bg-neon-violet/10 px-4 py-2.5 text-sm">
              <Target className="size-4 shrink-0 text-neon-violet" />
              <span className="min-w-[min(14rem,100%)] flex-1">
                <span className="text-muted-foreground">Tareas de la meta </span>
                <span className="font-semibold">{metaElegida.titulo}</span>
              </span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={verMetas}>
                  <ArrowUp data-icon="inline-start" />
                  Metas
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMetaFiltro('todas')}>
                  <X data-icon="inline-start" />
                  Ver todas
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <TabsList>
              <TabsTrigger value="tablero">Tablero</TabsTrigger>
              <TabsTrigger value="personas">Por persona</TabsTrigger>
            </TabsList>
            <div className="grid grid-cols-2 gap-2 md:w-[28rem]">
              <SimpleSelect
                size="sm"
                value={persona}
                onValueChange={setPersona}
                options={[
                  { value: 'todos', label: 'Todo el equipo' },
                  { value: 'yo', label: 'Mis tareas' },
                  ...miembros
                    .filter((m) => m.userId !== yo)
                    .map((m) => ({ value: m.userId, label: m.nombre })),
                  { value: 'nadie', label: 'Sin responsable' },
                ]}
              />
              <SimpleSelect
                size="sm"
                value={metaFiltro}
                onValueChange={setMetaFiltro}
                options={[
                  { value: 'todas', label: 'Todas las metas' },
                  ...metas.map((m) => ({
                    value: m.id,
                    label: m.estado === 'activa' ? m.titulo : `${m.titulo} (${m.estado})`,
                  })),
                  { value: 'sin', label: 'Sin meta' },
                ]}
              />
            </div>
          </div>

          <TabsContent value="tablero">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {ESTADOS_TAREA.map(({ value }) => (
                <Columna
                  key={value}
                  estado={value}
                  tareas={visibles.filter((t) => t.estado === value)}
                  tablero={tablero}
                  verTodasHechas={verTodasHechas}
                  onVerTodasHechas={() => setVerTodasHechas(true)}
                  onAgregar={() => nuevaTarea({ estado: value })}
                  onEditar={editarTarea}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="personas">
            <PorPersona
              tablero={tablero}
              tareas={visibles}
              persona={persona}
              onEditar={editarTarea}
              onCambiarNombre={() => setNombreAbierto(true)}
            />
          </TabsContent>
        </Tabs>
      </div>

      <TareaDialog
        open={tareaAbierta}
        onOpenChange={setTareaAbierta}
        tablero={tablero}
        tarea={tareaEditada}
        inicial={tareaInicial}
      />
      <MetaDialog
        open={metaAbierta}
        onOpenChange={setMetaAbierta}
        tablero={tablero}
        meta={metaEditada}
      />
      <NombreDialog open={nombreAbierto} onOpenChange={setNombreAbierto} tablero={tablero} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

function MetasFila({
  metas,
  tareas,
  seleccionada,
  onSeleccionar,
  onEditar,
  onNueva,
  onNuevaTarea,
}: {
  metas: Meta[]
  tareas: TareaEquipo[]
  seleccionada: string
  onSeleccionar: (id: string) => void
  onEditar: (m: Meta) => void
  onNueva: () => void
  onNuevaTarea: (metaId: string) => void
}) {
  if (metas.length === 0) {
    return (
      <button
        type="button"
        onClick={onNueva}
        className="glass flex items-center gap-3 rounded-2xl border-dashed p-4 text-left text-sm transition-colors hover:border-white/20"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neon-violet/10 text-neon-violet ring-1 ring-neon-violet/20">
          <Target className="size-4" />
        </span>
        <span>
          <span className="font-semibold">Todavía no hay metas.</span>{' '}
          <span className="text-muted-foreground">
            Cargá lo que el equipo quiere lograr y colgale las tareas: así se ve cuánto falta.
          </span>
        </span>
      </button>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Metas activas
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metas.map((m) => {
          const avance = avanceDeMeta(m.id, tareas)
          const dias = daysUntil(m.fechaObjetivo)
          const elegida = seleccionada === m.id
          return (
            <div
              key={m.id}
              className={cn(
                'glass flex flex-col gap-3 rounded-2xl p-4 transition-colors',
                elegida ? 'border-neon-violet/50 ring-1 ring-neon-violet/40' : 'hover:border-white/15',
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onSeleccionar(m.id)}
                  className="min-w-0 flex-1 text-left"
                  title={elegida ? 'Ver todas las tareas' : 'Ver sólo las tareas de esta meta'}
                >
                  <p className="font-semibold leading-snug text-pretty">{m.titulo}</p>
                  {m.fechaObjetivo ? (
                    <p
                      className={cn(
                        'mt-1 flex items-center gap-1 text-xs',
                        dias !== null && dias < 0 ? 'text-red-300' : 'text-muted-foreground',
                      )}
                    >
                      <CalendarClock className="size-3.5" />
                      {formatDateShort(m.fechaObjetivo)} · {relativeDays(m.fechaObjetivo)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Sin fecha objetivo</p>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button size="icon-sm" variant="ghost" aria-label="Opciones de la meta" />}
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onNuevaTarea(m.id)}>
                      <Plus />
                      Agregar tarea
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditar(m)}>
                      <Pencil />
                      Editar meta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-col gap-1.5">
                <Progress value={avance.porcentaje} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {avance.total === 0
                    ? 'Sin tareas todavía'
                    : `${avance.hechas} de ${avance.total} tareas hechas · ${avance.porcentaje}%`}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Columnas                                                            */
/* ------------------------------------------------------------------ */

function Columna({
  estado,
  tareas,
  tablero,
  verTodasHechas,
  onVerTodasHechas,
  onAgregar,
  onEditar,
}: {
  estado: EstadoTarea
  tareas: TareaEquipo[]
  tablero: Tablero
  verTodasHechas: boolean
  onVerTodasHechas: () => void
  onAgregar: () => void
  onEditar: (t: TareaEquipo) => void
}) {
  const [encima, setEncima] = React.useState(false)

  // Las hechas se ven un par de semanas y después se esconden: si no, la
  // columna crece para siempre y tapa lo que importa.
  let lista = [...tareas].sort(porFecha)
  let escondidas = 0
  if (estado === 'hecha') {
    lista = [...tareas].sort((a, b) => (b.hechaAt ?? '').localeCompare(a.hechaAt ?? ''))
    if (!verTodasHechas) {
      const corte = Date.now() - DIAS_HECHAS_A_LA_VISTA * 86400000
      const recientes = lista.filter((t) => !t.hechaAt || new Date(t.hechaAt).getTime() >= corte)
      escondidas = lista.length - recientes.length
      lista = recientes
    }
  }

  async function soltar(e: React.DragEvent) {
    e.preventDefault()
    setEncima(false)
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    const tarea = tablero.tareas.find((t) => t.id === id)
    if (!tarea || tarea.estado === estado) return
    if (await tablero.moverTarea(id, estado)) {
      toast.success(`${etiquetaEstado(estado)}: ${tarea.titulo}`)
    }
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => void soltar(e)}
      className={cn(
        'glass flex min-h-40 flex-col gap-3 rounded-2xl p-3 transition-colors',
        encima && 'border-neon-blue/50 bg-neon-blue/5',
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <span className={cn('size-2 rounded-full', colorColumna[estado])} />
        <h3 className="text-sm font-semibold">{etiquetaEstado(estado)}</h3>
        <span className="text-xs text-muted-foreground">{tareas.length}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          aria-label={`Agregar tarea en ${etiquetaEstado(estado)}`}
          onClick={onAgregar}
        >
          <Plus />
        </Button>
      </header>

      <div className="flex flex-col gap-2">
        {lista.map((t) => (
          <TarjetaTarea key={t.id} tarea={t} tablero={tablero} onEditar={onEditar} />
        ))}
        {lista.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            {estado === 'en_curso' ? 'Nadie tiene nada en curso' : 'Nada por acá'}
          </p>
        ) : null}
        {escondidas > 0 ? (
          <Button size="sm" variant="ghost" className="text-xs" onClick={onVerTodasHechas}>
            Ver {escondidas} hecha{escondidas === 1 ? '' : 's'} hace más de{' '}
            {DIAS_HECHAS_A_LA_VISTA} días
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function ChipFecha({ tarea }: { tarea: TareaEquipo }) {
  if (!tarea.fechaLimite) return null
  const u = urgencia(tarea)
  const d = daysUntil(tarea.fechaLimite) ?? 0
  const texto =
    tarea.estado === 'hecha'
      ? formatDateShort(tarea.fechaLimite)
      : u === 'vencida'
        ? `Vencida hace ${Math.abs(d)} d`
        : u === 'hoy'
          ? 'Vence hoy'
          : d === 1
            ? 'Vence mañana'
            : formatDateShort(tarea.fechaLimite)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        u === 'vencida' && 'bg-destructive/15 text-red-300',
        (u === 'hoy' || u === 'pronto') && 'bg-amber-400/15 text-amber-300',
        (u === 'normal' || u === 'sin-fecha') && 'bg-white/5 text-muted-foreground',
      )}
    >
      <CalendarClock className="size-3" />
      {texto}
    </span>
  )
}

function TarjetaTarea({
  tarea,
  tablero,
  onEditar,
}: {
  tarea: TareaEquipo
  tablero: Tablero
  onEditar: (t: TareaEquipo) => void
}) {
  const { projects } = useStore()
  const responsable = tablero.miembros.find((m) => m.userId === tarea.responsableId)
  const meta = tablero.metas.find((m) => m.id === tarea.metaId)
  const proyecto = projects.find((p) => p.id === tarea.projectId)
  const esMia = tarea.responsableId === tablero.yo

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', tarea.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onEditar(tarea)}
      className={cn(
        'group cursor-pointer rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.05]',
        tarea.estado === 'hecha' && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <p
          className={cn(
            'min-w-0 flex-1 text-sm leading-snug font-medium text-pretty',
            tarea.estado === 'hecha' && 'line-through',
          )}
        >
          {tarea.titulo}
        </p>
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="-mt-0.5 -mr-1 opacity-70 group-hover:opacity-100"
                  aria-label="Mover tarea"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* GroupLabel de Base UI exige un Group alrededor. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mover a</DropdownMenuLabel>
                {ESTADOS_TAREA.filter((e) => e.value !== tarea.estado).map((e) => (
                  <DropdownMenuItem
                    key={e.value}
                    onClick={() => void tablero.moverTarea(tarea.id, e.value)}
                  >
                    {e.value === 'hecha' ? (
                      <Check />
                    ) : (
                      <span className={cn('mx-1 size-2 rounded-full', colorColumna[e.value])} />
                    )}
                    {e.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEditar(tarea)}>
                <Pencil />
                Editar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {tarea.detalle ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tarea.detalle}</p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <ChipFecha tarea={tarea} />
        {/* El texto va en su propio span con truncate: el Badge centra su
            contenido, y truncado a sí mismo cortaba el principio. */}
        {meta ? (
          <Badge variant="outline" className="max-w-44 justify-start text-[11px]" title={meta.titulo}>
            <Flag />
            <span className="truncate">{meta.titulo}</span>
          </Badge>
        ) : null}
        {proyecto ? (
          <Badge variant="outline" className="max-w-44 justify-start text-[11px]" title={proyecto.name}>
            <FolderKanban />
            <span className="truncate">{proyecto.name}</span>
          </Badge>
        ) : null}
        <span
          className={cn(
            'ml-auto flex size-6 items-center justify-center rounded-md text-[10px] font-semibold',
            esMia ? 'bg-neon-violet/20 text-neon-violet' : 'bg-white/10 text-muted-foreground',
          )}
          title={responsable ? responsable.nombre : 'Sin responsable'}
        >
          {responsable ? iniciales(responsable.nombre) : '—'}
        </span>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Por persona                                                         */
/* ------------------------------------------------------------------ */

const ordenEstado: Record<EstadoTarea, number> = {
  en_curso: 0,
  bloqueada: 1,
  pendiente: 2,
  hecha: 3,
}

function PorPersona({
  tablero,
  tareas,
  persona,
  onEditar,
  onCambiarNombre,
}: {
  tablero: Tablero
  tareas: TareaEquipo[]
  persona: string
  onEditar: (t: TareaEquipo) => void
  onCambiarNombre: () => void
}) {
  const { miembros, yo } = tablero

  // Primero vos, después el resto por nombre.
  let gente = [...miembros].sort((a, b) =>
    a.userId === yo ? -1 : b.userId === yo ? 1 : a.nombre.localeCompare(b.nombre),
  )
  if (persona === 'yo') gente = gente.filter((m) => m.userId === yo)
  else if (!['todos', 'nadie'].includes(persona)) gente = gente.filter((m) => m.userId === persona)
  else if (persona === 'nadie') gente = []

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {gente.map((m) => {
        const suyas = tareas.filter((t) => t.responsableId === m.userId && t.estado !== 'hecha')
        const enCurso = suyas.filter((t) => t.estado === 'en_curso').length
        const vencidas = suyas.filter((t) => urgencia(t) === 'vencida').length
        const lista = [...suyas].sort(
          (a, b) => ordenEstado[a.estado] - ordenEstado[b.estado] || porFecha(a, b),
        )
        const esYo = m.userId === yo
        return (
          <section key={m.userId} className="glass flex flex-col gap-3 rounded-2xl p-4">
            <header className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-xl text-xs font-semibold',
                  esYo ? 'bg-neon-violet/20 text-neon-violet' : 'bg-white/10 text-muted-foreground',
                )}
              >
                {iniciales(m.nombre)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{m.nombre}</span>
                  {esYo ? <span className="text-xs font-normal text-muted-foreground">(vos)</span> : null}
                  {esYo ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Cambiar mi nombre"
                      onClick={onCambiarNombre}
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {enCurso} en curso · {suyas.length} abiertas
                  {vencidas ? <span className="text-red-300"> · {vencidas} vencida{vencidas === 1 ? '' : 's'}</span> : null}
                </p>
              </div>
            </header>

            {lista.length === 0 ? (
              <p className="rounded-xl bg-white/[0.03] px-3 py-4 text-center text-xs text-muted-foreground">
                {esYo
                  ? 'No tenés tareas abiertas. Cargá en qué estás trabajando.'
                  : 'Sin tareas abiertas cargadas.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {lista.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onEditar(t)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/5"
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', colorColumna[t.estado])} title={etiquetaEstado(t.estado)} />
                      <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                      <ChipFecha tarea={t} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
      {gente.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {persona === 'nadie'
            ? 'Las tareas sin responsable se ven en la pestaña Tablero.'
            : 'No hay nadie para mostrar.'}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground lg:col-span-2">
        Los avisos de tareas llegan a los celulares donde cada uno activó las notificaciones.{' '}
        <Link href="/alertas" className="underline underline-offset-2">
          Ver estado de los avisos
        </Link>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mi nombre                                                           */
/* ------------------------------------------------------------------ */

function NombreDialog({
  open,
  onOpenChange,
  tablero,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tablero: Tablero
}) {
  const actual = tablero.miembros.find((m) => m.userId === tablero.yo)?.nombre ?? ''
  const [nombre, setNombre] = React.useState(actual)
  const [guardando, setGuardando] = React.useState(false)

  React.useEffect(() => {
    if (open) setNombre(actual)
  }, [open, actual])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error('Poné un nombre')
      return
    }
    setGuardando(true)
    const ok = await tablero.cambiarMiNombre(nombre)
    setGuardando(false)
    if (ok) {
      toast.success('Nombre actualizado')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tu nombre en el tablero</DialogTitle>
          <DialogDescription>Es como te ve el resto del equipo.</DialogDescription>
        </DialogHeader>
        <form id="nombre-form" onSubmit={guardar}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </form>
        <DialogFooter className="mt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="nombre-form" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

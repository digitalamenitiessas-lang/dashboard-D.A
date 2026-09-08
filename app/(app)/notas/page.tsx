'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  Handshake,
  Lightbulb,
  Pencil,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { LinkedText } from '@/components/shared/linked-text'
import { SimpleSelect } from '@/components/shared/simple-select'
import { StatCard } from '@/components/shared/stat-card'
import { PriorityChip } from '@/components/shared/status-chip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NewNoteDialog } from '@/components/notas/new-note-dialog'
import { EditNoteDialog } from '@/components/notas/edit-note-dialog'
import { SeguimientoDialog } from '@/components/seguimientos/seguimiento-dialog'
import { SeguimientosPanel } from '@/components/seguimientos/seguimientos-panel'
import { agruparSeguimientos } from '@/lib/derive'
import { SEGUIMIENTO_ESTADOS } from '@/lib/types'
import { useStore } from '@/lib/store'
import type { Note } from '@/lib/types'
import { formatDate, relativeDays, daysUntil } from '@/lib/format'
import { NOTE_CATEGORIES } from '@/lib/types'
import { cn } from '@/lib/utils'

type Vista = 'notas' | 'seguimientos'

export default function NotasPage() {
  const router = useRouter()
  const { notes, addNote, deleteNote, convertNoteToProject, seguimientos } =
    useStore()
  const [vista, setVista] = React.useState<Vista>('notas')
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('todas')
  const [estadoFilter, setEstadoFilter] = React.useState('todos')
  const [editTarget, setEditTarget] = React.useState<Note | null>(null)

  const filtered = notes.filter((n) => {
    if (categoryFilter !== 'todas' && n.category !== categoryFilter) return false
    if (query) {
      const q = query.toLowerCase()
      const hay =
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q))
      if (!hay) return false
    }
    return true
  })

  const withReminder = notes.filter(
    (n) => n.reminderDate && (daysUntil(n.reminderDate) ?? 99) <= 7,
  ).length
  const converted = notes.filter((n) => n.convertedToProjectId).length
  const ideas = notes.filter(
    (n) => n.category === 'Idea' || n.category === 'Proyecto potencial',
  ).length

  // El estado de cada prospecto sale de su contacto más reciente, así que
  // los conteos se leen del agrupado y no de las filas sueltas: contar filas
  // daría «tres pelotas nuestras» cuando son tres contactos del mismo
  // prospecto.
  const prospectos = agruparSeguimientos(seguimientos)
  const pelotaNuestra = prospectos.filter(
    (g) => g.estado === 'Pelota nuestra',
  ).length
  const esperandoRespuesta = prospectos.filter(
    (g) => g.estado === 'Pelota de ellos',
  ).length
  const porRetomar = prospectos.filter(
    (g) =>
      g.estado === 'Pelota nuestra' &&
      (daysUntil(g.proximoContacto) ?? 99) <= 7,
  ).length
  const ganados = prospectos.filter((g) => g.estado === 'Ganado').length

  async function handleConvert(noteId: string, title: string) {
    const newId = await convertNoteToProject(noteId)
    if (!newId) return // the store already surfaced the error
    toast.success('Nota convertida en proyecto', { description: title })
    router.push(`/proyectos/${newId}`)
  }

  /**
   * Una nota no mueve plata, así que no se pregunta antes: se borra y se
   * ofrece deshacer. Vuelve con otro id y otra fecha de creación, que es
   * todo lo que se pierde.
   */
  async function handleDelete(note: Note) {
    if (!(await deleteNote(note.id))) return
    toast.success('Nota eliminada', {
      description: note.title,
      action: {
        label: 'Deshacer',
        onClick: () =>
          void addNote({
            projectId: note.projectId,
            title: note.title,
            content: note.content,
            author: note.author,
            priority: note.priority,
            category: note.category,
            tags: note.tags,
            reminderDate: note.reminderDate,
          }),
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notas y seguimientos"
        description="Ideas y pendientes del equipo, y cómo viene cada acercamiento comercial."
      >
        {vista === 'notas' ? <NewNoteDialog /> : <SeguimientoDialog />}
      </PageHeader>

      <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
        <TabsList>
          <TabsTrigger value="notas" className="flex-none">
            <Lightbulb data-icon="inline-start" />
            Notas e ideas ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="seguimientos" className="flex-none">
            <Handshake data-icon="inline-start" />
            Seguimientos ({prospectos.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {vista === 'notas' ? (
            <>
              <StatCard label="Total notas" value={notes.length} icon={Lightbulb} accent="blue" />
              <StatCard label="Ideas y oportunidades" value={ideas} accent="violet" />
              <StatCard
                label="Recordatorios próximos"
                value={withReminder}
                icon={Bell}
                accent={withReminder ? 'green' : 'neutral'}
              />
              <StatCard label="Convertidas en proyecto" value={converted} accent="neutral" />
            </>
          ) : (
            <>
              <StatCard
                label="La pelota es nuestra"
                value={pelotaNuestra}
                icon={Handshake}
                accent={pelotaNuestra ? 'blue' : 'neutral'}
                hint="Dependen de que hagamos algo"
              />
              <StatCard
                label="Esperando respuesta"
                value={esperandoRespuesta}
                accent="neutral"
                hint="No hay nada que hacer"
              />
              <StatCard
                label="Para retomar"
                value={porRetomar}
                icon={CalendarClock}
                accent={porRetomar ? 'green' : 'neutral'}
                hint="En los próximos 7 días"
              />
              <StatCard label="Ganados" value={ganados} accent="violet" />
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <InputGroup className="sm:w-64">
            <InputGroupInput
              placeholder={
                vista === 'notas'
                  ? 'Buscar por título, contenido o etiqueta...'
                  : 'Buscar prospecto, participantes o lo hablado...'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          {vista === 'notas' ? (
            <SimpleSelect
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              className="sm:w-52"
              options={[
                { value: 'todas', label: 'Todas las categorías' },
                ...NOTE_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
            />
          ) : (
            <SimpleSelect
              value={estadoFilter}
              onValueChange={setEstadoFilter}
              className="sm:w-52"
              options={[
                { value: 'todos', label: 'Todos los estados' },
                ...SEGUIMIENTO_ESTADOS.map((e) => ({ value: e, label: e })),
              ]}
            />
          )}
        </div>

        <TabsContent value="seguimientos" className="mt-4">
          <SeguimientosPanel query={query} estadoFilter={estadoFilter} />
        </TabsContent>

        <TabsContent value="notas" className="mt-4">

      {filtered.length === 0 ? (
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Sin notas</EmptyTitle>
            <EmptyDescription>
              Creá una nota para guardar ideas, pendientes o info de reuniones.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((note) => {
            const reminderDays = daysUntil(note.reminderDate)
            const reminderSoon =
              reminderDays !== null && reminderDays <= 7
            return (
              <article
                key={note.id}
                className="glass flex flex-col gap-3 rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="font-medium">
                    {note.category}
                  </Badge>
                  <PriorityChip priority={note.priority} />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-extrabold text-pretty">
                    {note.title}
                  </h2>
                  <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-muted-foreground text-pretty">
                    <LinkedText text={note.content} />
                  </p>
                </div>

                {note.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {note.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}

                {note.reminderDate ? (
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      reminderSoon ? 'text-amber-300' : 'text-muted-foreground',
                    )}
                  >
                    <Bell className="size-3.5" />
                    Recordatorio {relativeDays(note.reminderDate).toLowerCase()} (
                    {formatDate(note.reminderDate)})
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {note.author} · {formatDate(note.createdAt)}
                  </span>
                  {/* Era el blanco más chico del área (24px): mismo ícono,
                      40px de área en el celular y 28 en escritorio. */}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-10 md:size-7"
                    aria-label={`Editar nota: ${note.title}`}
                    onClick={() => setEditTarget(note)}
                  >
                    <Pencil />
                  </Button>
                </div>

                {note.convertedToProjectId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    nativeButton={false}
                    render={
                      <Link href={`/proyectos/${note.convertedToProjectId}`} />
                    }
                  >
                    Ver proyecto
                    <ArrowUpRight data-icon="inline-end" />
                  </Button>
                ) : (
                  // Eliminar quedaba a 8px de la acción más usada: más aire y
                  // los dos botones a tamaño táctil.
                  <div className="flex items-center gap-3">
                    <Button
                      className="flex-1"
                      onClick={() => void handleConvert(note.id, note.title)}
                    >
                      <Sparkles data-icon="inline-start" />
                      Convertir en proyecto
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar nota: ${note.title}`}
                      onClick={() => void handleDelete(note)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
        </TabsContent>
      </Tabs>

      {editTarget ? (
        <EditNoteDialog
          key={editTarget.id}
          note={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      ) : null}
    </div>
  )
}

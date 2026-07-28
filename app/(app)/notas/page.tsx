'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowUpRight,
  Bell,
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
import { NewNoteDialog } from '@/components/notas/new-note-dialog'
import { EditNoteDialog } from '@/components/notas/edit-note-dialog'
import { useStore } from '@/lib/store'
import type { Note } from '@/lib/types'
import { formatDate, relativeDays, daysUntil } from '@/lib/format'
import { NOTE_CATEGORIES } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function NotasPage() {
  const router = useRouter()
  const { notes, deleteNote, convertNoteToProject } = useStore()
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('todas')
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

  async function handleConvert(noteId: string, title: string) {
    const newId = await convertNoteToProject(noteId)
    if (!newId) return // the store already surfaced the error
    toast.success('Nota convertida en proyecto', { description: title })
    router.push(`/proyectos/${newId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notas e ideas"
        description="Ideas de producto, recordatorios, reuniones y pendientes del equipo."
      >
        <NewNoteDialog />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total notas" value={notes.length} icon={Lightbulb} accent="blue" />
        <StatCard label="Ideas y oportunidades" value={ideas} accent="violet" />
        <StatCard
          label="Recordatorios próximos"
          value={withReminder}
          icon={Bell}
          accent={withReminder ? 'green' : 'neutral'}
        />
        <StatCard label="Convertidas en proyecto" value={converted} accent="neutral" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <InputGroup className="sm:w-64">
          <InputGroupInput
            placeholder="Buscar por título, contenido o etiqueta..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <SimpleSelect
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          className="sm:w-52"
          options={[
            { value: 'todas', label: 'Todas las categorías' },
            ...NOTE_CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>

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
                  <Button
                    size="icon-xs"
                    variant="ghost"
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => void handleConvert(note.id, note.title)}
                    >
                      <Sparkles data-icon="inline-start" />
                      Convertir en proyecto
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Eliminar nota"
                      onClick={async () => {
                        await deleteNote(note.id)
                        toast.success('Nota eliminada')
                      }}
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

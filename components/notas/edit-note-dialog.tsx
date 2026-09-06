'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import { NOTE_CATEGORIES, PRIORITIES } from '@/lib/types'
import type { Note, Priority } from '@/lib/types'

export function EditNoteDialog({
  note,
  open,
  onOpenChange,
}: {
  note: Note
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateNote, projects } = useStore()
  const [title, setTitle] = React.useState(note.title)
  const [content, setContent] = React.useState(note.content)
  const [author, setAuthor] = React.useState(note.author)
  const [priority, setPriority] = React.useState<Priority>(note.priority)
  const [category, setCategory] = React.useState<Note['category']>(note.category)
  const [tags, setTags] = React.useState(note.tags.join(', '))
  const [reminderDate, setReminderDate] = React.useState(note.reminderDate ?? '')
  const [projectId, setProjectId] = React.useState(note.projectId ?? '')
  const [saving, setSaving] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('El título es obligatorio')
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await updateNote(note.id, {
      title: title.trim(),
      content: content.trim(),
      author: author.trim() || 'Equipo interno',
      priority,
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      reminderDate: reminderDate || null,
      projectId: projectId || null,
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Nota actualizada')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar nota</DialogTitle>
          <DialogDescription>
            Actualizá el contenido, la categoría o el recordatorio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="en-project">Proyecto (opcional)</FieldLabel>
              <SimpleSelect
                id="en-project"
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Sin proyecto"
                options={[
                  { value: '', label: 'Sin proyecto' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="en-title">Título</FieldLabel>
              <Input
                id="en-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="en-content">Contenido</FieldLabel>
              <Textarea
                id="en-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="en-category">Categoría</FieldLabel>
                <SimpleSelect
                  id="en-category"
                  value={category}
                  onValueChange={(v) => setCategory(v as Note['category'])}
                  options={toOptions(NOTE_CATEGORIES)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="en-priority">Prioridad</FieldLabel>
                <SimpleSelect
                  id="en-priority"
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                  options={toOptions(PRIORITIES)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="en-author">Autor</FieldLabel>
              <Input
                id="en-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="en-tags">Etiquetas</FieldLabel>
                <Input
                  id="en-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="ia, cliente"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="en-reminder">Recordatorio</FieldLabel>
                <Input
                  id="en-reminder"
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

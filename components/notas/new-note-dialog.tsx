'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect, toOptions } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import { NOTE_CATEGORIES } from '@/lib/types'
import type { Note, Priority } from '@/lib/types'

/**
 * `defaultProjectId` pins the note to a project and hides the selector —
 * used from the project detail to log a meeting or an idea for it.
 */
export function NewNoteDialog({
  defaultProjectId,
  triggerLabel = 'Nueva nota',
  triggerVariant,
}: {
  defaultProjectId?: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
} = {}) {
  const { addNote, projects } = useStore()
  const [open, setOpen] = React.useState(false)
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? '')
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [author, setAuthor] = React.useState('')
  const [priority, setPriority] = React.useState<Priority>('Media')
  const [category, setCategory] = React.useState<Note['category']>('Idea')
  const [tags, setTags] = React.useState('')
  const [reminderDate, setReminderDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  function reset() {
    setTitle('')
    setContent('')
    setAuthor('')
    setPriority('Media')
    setCategory('Idea')
    setTags('')
    setReminderDate('')
    setProjectId(defaultProjectId ?? '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('El título es obligatorio')
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await addNote({
      projectId: projectId || null,
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
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Nota creada', { description: title })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={triggerVariant} />}>
        <Plus data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva nota</DialogTitle>
          <DialogDescription>
            Registrá una idea, recordatorio o pendiente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {defaultProjectId ? null : (
              <Field>
                <FieldLabel htmlFor="nn-project">Proyecto (opcional)</FieldLabel>
                <SimpleSelect
                  id="nn-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Sin proyecto"
                  options={[
                    { value: '', label: 'Sin proyecto' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="nn-title">Título</FieldLabel>
              <Input
                id="nn-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Idea de módulo de reportes"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nn-content">Contenido</FieldLabel>
              <Textarea
                id="nn-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Desarrollá la idea o el pendiente..."
                rows={4}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="nn-category">Categoría</FieldLabel>
                <SimpleSelect
                  id="nn-category"
                  value={category}
                  onValueChange={(v) => setCategory(v as Note['category'])}
                  options={toOptions(NOTE_CATEGORIES)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="nn-priority">Prioridad</FieldLabel>
                <SimpleSelect
                  id="nn-priority"
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                  options={toOptions(['Baja', 'Media', 'Alta', 'Crítica'] as const)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="nn-author">Autor</FieldLabel>
              <Input
                id="nn-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Ej: Sofía Ramírez"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="nn-tags">Etiquetas</FieldLabel>
                <Input
                  id="nn-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="ia, cliente, upsell"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="nn-reminder">Recordatorio</FieldLabel>
                <Input
                  id="nn-reminder"
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando...' : 'Crear nota'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

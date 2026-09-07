'use client'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task, TaskKind } from '@/lib/types'

const dotByKind: Record<TaskKind, string> = {
  interno: 'border-neon-blue/60',
  cliente: 'border-neon-violet/60',
  bloqueador: 'border-red-400/60',
}

const checkedByKind: Record<TaskKind, string> = {
  interno: 'bg-neon-blue border-neon-blue',
  cliente: 'bg-neon-violet border-neon-violet',
  bloqueador: 'bg-red-400 border-red-400',
}

/**
 * Editable checklist for one kind of task within a project.
 * Completed items sink to the bottom and keep their completion date.
 */
export function TaskList({
  projectId,
  kind,
  tasks,
  placeholder,
  empty = 'Sin pendientes',
}: {
  projectId: string
  kind: TaskKind
  tasks: Task[]
  placeholder: string
  empty?: string
}) {
  const { addTask, toggleTask, deleteTask } = useStore()
  const [draft, setDraft] = React.useState('')
  const [adding, setAdding] = React.useState(false)

  const items = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.createdAt.localeCompare(b.createdAt)
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (!title || adding) return
    setAdding(true)
    const ok = await addTask(projectId, kind, title)
    setAdding(false)
    // Si falló, el texto queda escrito: el store ya avisó qué pasó.
    if (!ok) return
    setDraft('')
  }

  /**
   * Un pendiente no mueve plata, así que no hace falta preguntar antes: se
   * borra y se ofrece deshacer, que es lo que la gente busca cuando erra el
   * click. El pendiente vuelve como nuevo, sin la fecha de completado.
   */
  async function remove(task: Task) {
    if (!(await deleteTask(task.id))) return
    toast.success('Pendiente eliminado', {
      description: task.title,
      action: {
        label: 'Deshacer',
        onClick: () => void addTask(task.projectId, task.kind, task.title),
      },
    })
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((task) => (
            <li key={task.id} className="group flex items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                aria-label={
                  task.done ? `Reabrir: ${task.title}` : `Completar: ${task.title}`
                }
                onClick={() => void toggleTask(task.id, !task.done)}
                // El cuadradito sigue midiendo 16px, pero el blanco que se
                // toca es de 36: el `-m-2` deja el área afuera del flujo, así
                // que el dibujo queda donde estaba (los 2px del `mt-0.5`
                // salen solos del centrado).
                className="-m-2 flex size-9 shrink-0 items-center justify-center"
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                    task.done ? checkedByKind[kind] : dotByKind[kind],
                  )}
                >
                  {task.done ? (
                    <svg
                      viewBox="0 0 12 12"
                      className="size-3 text-background"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 6.5 5 9l4.5-5.5" />
                    </svg>
                  ) : null}
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm text-pretty',
                    task.done && 'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                </p>
                {task.done && task.doneAt ? (
                  <p className="text-[11px] text-muted-foreground">
                    Completado {formatDate(task.doneAt)}
                  </p>
                ) : null}
              </div>

              {/* Se esconde por PUNTERO, no por ancho: en un celular no hay
                  hover y `focus-visible` no dispara con un toque, así que con
                  `opacity-0` pelado el botón quedaba invisible pero
                  clickeable — o no podías borrar, o borrabas sin querer. */}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Eliminar: ${task.title}`}
                className="-mr-1 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
                onClick={() => void remove(task)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        {/* El par completo `h-9 md:h-8`: 36px con el dedo, a tono con el
            botón `icon-sm` de al lado, y los 32px de siempre en desktop. */}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-9 md:h-8"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="outline"
          disabled={!draft.trim() || adding}
          aria-label="Agregar"
        >
          <Plus />
        </Button>
      </form>
    </div>
  )
}

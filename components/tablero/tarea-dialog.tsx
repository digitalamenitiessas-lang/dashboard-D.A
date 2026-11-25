'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect } from '@/components/shared/simple-select'
import { useStore } from '@/lib/store'
import {
  ESTADOS_TAREA,
  type EstadoTarea,
  type Tablero,
  type TareaEquipo,
} from '@/lib/tablero'

/**
 * Alta y edición de una tarea. Con `tarea` edita; sin ella, crea con los
 * `inicial` que le pase la pantalla (la meta que se está mirando, la
 * columna donde se tocó «+»).
 *
 * El responsable arranca en quien la carga: la idea del tablero es que
 * cada uno diga en qué está, no repartir trabajo.
 */
export function TareaDialog({
  open,
  onOpenChange,
  tablero,
  tarea,
  inicial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tablero: Tablero
  tarea?: TareaEquipo | null
  inicial?: { metaId?: string | null; estado?: EstadoTarea }
}) {
  const { projects } = useStore()
  const { miembros, metas, yo, guardarTarea, borrarTarea } = tablero

  const [titulo, setTitulo] = React.useState('')
  const [detalle, setDetalle] = React.useState('')
  const [estado, setEstado] = React.useState<EstadoTarea>('pendiente')
  const [responsableId, setResponsableId] = React.useState('')
  const [metaId, setMetaId] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [fechaLimite, setFechaLimite] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)

  // Se rearma cada vez que se abre: el mismo diálogo sirve para varias
  // tareas y no tiene que arrastrar lo de la anterior.
  React.useEffect(() => {
    if (!open) return
    setTitulo(tarea?.titulo ?? '')
    setDetalle(tarea?.detalle ?? '')
    setEstado(tarea?.estado ?? inicial?.estado ?? 'pendiente')
    setResponsableId(tarea ? (tarea.responsableId ?? '') : (yo ?? ''))
    setMetaId(tarea?.metaId ?? inicial?.metaId ?? '')
    setProjectId(tarea?.projectId ?? '')
    setFechaLimite(tarea?.fechaLimite ?? '')
  }, [open, tarea, inicial?.estado, inicial?.metaId, yo])

  const metasElegibles = metas.filter((m) => m.estado === 'activa' || m.id === metaId)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) {
      toast.error('Poné qué hay que hacer')
      return
    }
    if (guardando) return
    setGuardando(true)
    const ok = await guardarTarea(
      {
        titulo,
        detalle,
        estado,
        responsableId: responsableId || null,
        metaId: metaId || null,
        projectId: projectId || null,
        fechaLimite: fechaLimite || null,
      },
      tarea?.id,
    )
    setGuardando(false)
    if (!ok) return
    toast.success(tarea ? 'Tarea guardada' : 'Tarea creada', { description: titulo.trim() })
    onOpenChange(false)
  }

  async function borrar() {
    if (!tarea) return
    if (!window.confirm(`¿Borrar «${tarea.titulo}»? No se puede deshacer.`)) return
    if (await borrarTarea(tarea.id)) {
      toast.success('Tarea borrada', { description: tarea.titulo })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tarea ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            Qué vas a hacer y para cuándo. Si se acerca la fecha y no está hecha, al
            responsable le llega un aviso.
          </DialogDescription>
        </DialogHeader>
        <form id="tarea-form" onSubmit={guardar}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tarea-titulo">Qué hay que hacer</FieldLabel>
              <Input
                id="tarea-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Mandar la propuesta a Reproducir"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tarea-detalle">Detalle (opcional)</FieldLabel>
              <Textarea
                id="tarea-detalle"
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder="Lo que haga falta para entenderla"
                rows={3}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="tarea-responsable">Responsable</FieldLabel>
                <SimpleSelect
                  id="tarea-responsable"
                  value={responsableId}
                  onValueChange={setResponsableId}
                  placeholder="Sin responsable"
                  options={[
                    { value: '', label: 'Sin responsable' },
                    ...miembros.map((m) => ({
                      value: m.userId,
                      label: m.userId === yo ? `${m.nombre} (vos)` : m.nombre,
                    })),
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tarea-fecha">Para cuándo</FieldLabel>
                <Input
                  id="tarea-fecha"
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                />
                {!fechaLimite ? (
                  <FieldDescription>Sin fecha no hay avisos.</FieldDescription>
                ) : null}
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="tarea-estado">Estado</FieldLabel>
                <SimpleSelect
                  id="tarea-estado"
                  value={estado}
                  onValueChange={(v) => setEstado(v as EstadoTarea)}
                  options={ESTADOS_TAREA.map((e) => ({ value: e.value, label: e.label }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tarea-meta">Meta</FieldLabel>
                <SimpleSelect
                  id="tarea-meta"
                  value={metaId}
                  onValueChange={setMetaId}
                  placeholder="Sin meta"
                  options={[
                    { value: '', label: 'Sin meta' },
                    ...metasElegibles.map((m) => ({ value: m.id, label: m.titulo })),
                  ]}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="tarea-proyecto">Proyecto (opcional)</FieldLabel>
              <SimpleSelect
                id="tarea-proyecto"
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Sin proyecto"
                options={[
                  { value: '', label: 'Sin proyecto' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter className="mt-6">
          {tarea ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-red-300 hover:text-red-200"
              onClick={() => void borrar()}
            >
              <Trash2 data-icon="inline-start" />
              Borrar
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="tarea-form" disabled={guardando}>
            {guardando ? 'Guardando...' : tarea ? 'Guardar' : 'Crear tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

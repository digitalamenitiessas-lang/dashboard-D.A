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
import type { EstadoMeta, Meta, Tablero } from '@/lib/tablero'

const ESTADOS_META: { value: EstadoMeta; label: string }[] = [
  { value: 'activa', label: 'Activa' },
  { value: 'lograda', label: 'Lograda' },
  { value: 'archivada', label: 'Archivada' },
]

export function MetaDialog({
  open,
  onOpenChange,
  tablero,
  meta,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tablero: Tablero
  meta?: Meta | null
}) {
  const { guardarMeta, borrarMeta, tareas } = tablero
  const [titulo, setTitulo] = React.useState('')
  const [detalle, setDetalle] = React.useState('')
  const [fechaObjetivo, setFechaObjetivo] = React.useState('')
  const [estado, setEstado] = React.useState<EstadoMeta>('activa')
  const [guardando, setGuardando] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setTitulo(meta?.titulo ?? '')
    setDetalle(meta?.detalle ?? '')
    setFechaObjetivo(meta?.fechaObjetivo ?? '')
    setEstado(meta?.estado ?? 'activa')
  }, [open, meta])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) {
      toast.error('Poné cuál es la meta')
      return
    }
    if (guardando) return
    setGuardando(true)
    const ok = await guardarMeta(
      { titulo, detalle, fechaObjetivo: fechaObjetivo || null, estado },
      meta?.id,
    )
    setGuardando(false)
    if (!ok) return
    toast.success(meta ? 'Meta guardada' : 'Meta creada', { description: titulo.trim() })
    onOpenChange(false)
  }

  async function borrar() {
    if (!meta) return
    const cuantas = tareas.filter((t) => t.metaId === meta.id).length
    const aviso = cuantas
      ? `¿Borrar la meta «${meta.titulo}»? Sus ${cuantas} tarea(s) no se borran: quedan sin meta.`
      : `¿Borrar la meta «${meta.titulo}»?`
    if (!window.confirm(aviso)) return
    if (await borrarMeta(meta.id)) {
      toast.success('Meta borrada', { description: meta.titulo })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta ? 'Editar meta' : 'Nueva meta'}</DialogTitle>
          <DialogDescription>
            Un objetivo del equipo con fecha. Las tareas que cuelgan de la meta muestran
            cuánto falta para lograrla.
          </DialogDescription>
        </DialogHeader>
        <form id="meta-form" onSubmit={guardar}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="meta-titulo">Meta</FieldLabel>
              <Input
                id="meta-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Cerrar 3 clientes nuevos antes de fin de año"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="meta-detalle">Detalle (opcional)</FieldLabel>
              <Textarea
                id="meta-detalle"
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder="Por qué importa, cómo se mide"
                rows={3}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="meta-fecha">Fecha objetivo</FieldLabel>
                <Input
                  id="meta-fecha"
                  type="date"
                  value={fechaObjetivo}
                  onChange={(e) => setFechaObjetivo(e.target.value)}
                />
              </Field>
              {meta ? (
                <Field>
                  <FieldLabel htmlFor="meta-estado">Estado</FieldLabel>
                  <SimpleSelect
                    id="meta-estado"
                    value={estado}
                    onValueChange={(v) => setEstado(v as EstadoMeta)}
                    options={ESTADOS_META}
                  />
                  <FieldDescription>
                    Lograda o archivada sale de la fila de metas activas.
                  </FieldDescription>
                </Field>
              ) : null}
            </div>
          </FieldGroup>
        </form>
        <DialogFooter className="mt-6">
          {meta ? (
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
          <Button type="submit" form="meta-form" disabled={guardando}>
            {guardando ? 'Guardando...' : meta ? 'Guardar' : 'Crear meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

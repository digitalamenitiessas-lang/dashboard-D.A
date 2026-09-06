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
import { useStore } from '@/lib/store'
import type { Project } from '@/lib/types'

export function EditDevelopmentDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateDevelopment } = useStore()
  const dev = project.development
  const [stage, setStage] = React.useState(dev.stage)
  const [progress, setProgress] = React.useState(String(dev.progress))
  const [nextGoal, setNextGoal] = React.useState(dev.nextGoal)
  const [saving, setSaving] = React.useState(false)

  const pct = Number(progress)
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 100

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) {
      toast.error('El avance debe estar entre 0 y 100')
      return
    }
    if (saving) return
    setSaving(true)
    const ok = await updateDevelopment(project.id, {
      stage: stage.trim(),
      progress: pct,
      nextGoal: nextGoal.trim(),
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Desarrollo actualizado')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Estado del desarrollo</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ed-stage">Etapa actual</FieldLabel>
              <Input
                id="ed-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                placeholder="Ej: Integración de pagos"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ed-progress">Avance (%)</FieldLabel>
              <Input
                id="ed-progress"
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ed-goal">Próximo objetivo</FieldLabel>
              <Textarea
                id="ed-goal"
                value={nextGoal}
                onChange={(e) => setNextGoal(e.target.value)}
                rows={2}
                placeholder="Qué sigue después de esta etapa"
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !valid}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

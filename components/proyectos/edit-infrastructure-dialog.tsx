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

const toLines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

export function EditInfrastructureDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { updateInfrastructure } = useStore()
  const i = project.infrastructure

  const [productionUrl, setProductionUrl] = React.useState(i.productionUrl)
  const [stagingUrl, setStagingUrl] = React.useState(i.stagingUrl)
  const [repo, setRepo] = React.useState(i.repo)
  const [deployPlatform, setDeployPlatform] = React.useState(i.deployPlatform)
  const [hosting, setHosting] = React.useState(i.hosting)
  const [domain, setDomain] = React.useState(i.domain)
  const [domainExpiry, setDomainExpiry] = React.useState(i.domainExpiry ?? '')
  const [database, setDatabase] = React.useState(i.database)
  const [techLead, setTechLead] = React.useState(i.techLead)
  const [externalServices, setExternalServices] = React.useState(
    i.externalServices.join('\n'),
  )
  const [automations, setAutomations] = React.useState(i.automations.join('\n'))
  const [saving, setSaving] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const ok = await updateInfrastructure(project.id, {
      productionUrl: productionUrl.trim(),
      stagingUrl: stagingUrl.trim(),
      repo: repo.trim(),
      deployPlatform: deployPlatform.trim(),
      hosting: hosting.trim(),
      domain: domain.trim(),
      domainExpiry: domainExpiry || null,
      database: database.trim(),
      techLead: techLead.trim(),
      externalServices: toLines(externalServices),
      automations: toLines(automations),
    })
    setSaving(false)
    if (!ok) return // el store ya explicó el error con un toast rojo
    toast.success('Infraestructura actualizada')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar infraestructura</DialogTitle>
          <DialogDescription>
            No guardes contraseñas ni tokens acá.
          </DialogDescription>
        </DialogHeader>
        <form id="ei-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ei-prod">URL de producción</FieldLabel>
              <Input
                id="ei-prod"
                value={productionUrl}
                onChange={(e) => setProductionUrl(e.target.value)}
                placeholder="https://app.cliente.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ei-staging">URL de pruebas</FieldLabel>
              <Input
                id="ei-staging"
                value={stagingUrl}
                onChange={(e) => setStagingUrl(e.target.value)}
                placeholder="https://staging.cliente.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ei-repo">Repositorio</FieldLabel>
              <Input
                id="ei-repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="github.com/usuario/repo"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ei-deploy">Plataforma de deploy</FieldLabel>
                <Input
                  id="ei-deploy"
                  value={deployPlatform}
                  onChange={(e) => setDeployPlatform(e.target.value)}
                  placeholder="Vercel"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ei-hosting">Hosting</FieldLabel>
                <Input
                  id="ei-hosting"
                  value={hosting}
                  onChange={(e) => setHosting(e.target.value)}
                  placeholder="Vercel + Supabase"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ei-domain">Dominio</FieldLabel>
                <Input
                  id="ei-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="cliente.com"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ei-expiry">Vence el</FieldLabel>
                <Input
                  id="ei-expiry"
                  type="date"
                  value={domainExpiry}
                  onChange={(e) => setDomainExpiry(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ei-db">Base de datos</FieldLabel>
                <Input
                  id="ei-db"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="Supabase Postgres"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ei-lead">Responsable técnico</FieldLabel>
                <Input
                  id="ei-lead"
                  value={techLead}
                  onChange={(e) => setTechLead(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ei-services">
                Servicios externos (uno por línea)
              </FieldLabel>
              <Textarea
                id="ei-services"
                value={externalServices}
                onChange={(e) => setExternalServices(e.target.value)}
                rows={3}
                placeholder={'Stripe\nResend'}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ei-automations">
                Automatizaciones (una por línea)
              </FieldLabel>
              <Textarea
                id="ei-automations"
                value={automations}
                onChange={(e) => setAutomations(e.target.value)}
                rows={3}
                placeholder={'Email de confirmación\nRecordatorio 24h antes'}
              />
            </Field>
          </FieldGroup>
        </form>
        {/* El footer va FUERA del <form> para que sea hijo directo del
            DialogContent y quede clavado abajo del marco, arriba del
            teclado. El submit se mantiene con el par id/form del botón. */}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="ei-form" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

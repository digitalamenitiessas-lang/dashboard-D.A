'use client'

/**
 * El formulario de la propuesta.
 *
 * Es una pila de secciones y no un diálogo: hay demasiado para editar, y en un
 * teléfono una modal con cuarenta campos no se puede usar.
 *
 * Las secciones que sólo imprime la plantilla larga se muestran igual con la
 * corta, plegadas. Es el motivo de haber elegido un solo esquema: cambiar de
 * plantilla no tiene que perder nada de lo ya escrito.
 */

import * as React from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect } from '@/components/shared/simple-select'
import { ListaEtapas, ListaItems, ListaTexto } from './listas'
import {
  sinPrecio,
  subtotal,
  type PropuestaEditable,
} from '@/lib/propuesta/editar'
import type { Plantilla } from '@/lib/propuesta/schema'
import type { Client } from '@/lib/types'

const OTRO = '__otro__'

function Seccion({
  titulo,
  hint,
  children,
}: {
  titulo: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function EditorPropuesta({
  propuesta,
  onChange,
  plantilla,
  clients,
}: {
  propuesta: PropuestaEditable
  onChange: (p: PropuestaEditable) => void
  plantilla: Plantilla
  clients: Client[]
}) {
  // Con la plantilla corta las secciones largas arrancan plegadas, pero se
  // pueden abrir: a veces se cotiza corto y se quiere dejar anotado el alcance.
  const [largasAbiertas, setLargasAbiertas] = React.useState(plantilla === 'larga')
  React.useEffect(() => {
    if (plantilla === 'larga') setLargasAbiertas(true)
  }, [plantilla])

  const set = <K extends keyof PropuestaEditable>(
    k: K,
    v: PropuestaEditable[K],
  ) => onChange({ ...propuesta, [k]: v })

  const total = React.useMemo(() => subtotal(propuesta.items), [propuesta.items])
  const faltanPrecios = sinPrecio(propuesta.items)

  // El cliente puede no estar cargado en el sistema: se cotiza todo el tiempo
  // a gente que todavía no es cliente.
  const elegido = clients.find((c) => c.name === propuesta.cliente.empresa)

  return (
    <div className="flex flex-col gap-4">
      {propuesta.faltantes.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <TriangleAlert className="size-4" />
            Faltan {propuesta.faltantes.length}{' '}
            {propuesta.faltantes.length === 1 ? 'dato' : 'datos'}
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-amber-100/90">
            {propuesta.faltantes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => set('faltantes', [])}
            className="self-start text-xs text-amber-200/70 underline underline-offset-2 transition-colors hover:text-amber-100"
          >
            Ya está, ocultar
          </button>
        </section>
      ) : null}

      <Seccion titulo="Cliente">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pr-empresa">Empresa</FieldLabel>
            <SimpleSelect
              id="pr-empresa"
              value={elegido ? elegido.name : OTRO}
              onValueChange={(v) =>
                set('cliente', {
                  ...propuesta.cliente,
                  empresa: v === OTRO ? '' : v,
                })
              }
              options={[
                ...clients.map((c) => ({ value: c.name, label: c.name })),
                { value: OTRO, label: 'Otro (escribir a mano)' },
              ]}
            />
          </Field>
          {!elegido ? (
            <Field>
              <FieldLabel htmlFor="pr-empresa-libre">Nombre de la empresa</FieldLabel>
              <Input
                id="pr-empresa-libre"
                value={propuesta.cliente.empresa}
                placeholder="Hotel Las Lomas S.A."
                onChange={(e) =>
                  set('cliente', { ...propuesta.cliente, empresa: e.target.value })
                }
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pr-nombre">Persona de contacto</FieldLabel>
              <Input
                id="pr-nombre"
                value={propuesta.cliente.nombre}
                placeholder="Juan Pérez"
                onChange={(e) =>
                  set('cliente', { ...propuesta.cliente, nombre: e.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pr-contacto">Mail o teléfono</FieldLabel>
              <Input
                id="pr-contacto"
                value={propuesta.cliente.contacto}
                onChange={(e) =>
                  set('cliente', { ...propuesta.cliente, contacto: e.target.value })
                }
              />
            </Field>
          </div>
        </FieldGroup>
      </Seccion>

      <Seccion titulo="Encabezado">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pr-titulo">Título</FieldLabel>
            <Input
              id="pr-titulo"
              value={propuesta.titulo}
              placeholder="Sistema de gestión a medida"
              onChange={(e) => set('titulo', e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pr-resumen">
              {plantilla === 'larga' ? 'Objetivo' : 'Bajada'}
            </FieldLabel>
            <Textarea
              id="pr-resumen"
              rows={3}
              value={propuesta.resumen}
              onChange={(e) => set('resumen', e.target.value)}
            />
          </Field>
        </FieldGroup>
      </Seccion>

      <Seccion
        titulo="Ítems y honorarios"
        hint={
          faltanPrecios > 0
            ? `${faltanPrecios} ${faltanPrecios === 1 ? 'ítem no tiene' : 'ítems no tienen'} precio. Se imprimen, pero no suman al total.`
            : undefined
        }
      >
        <ListaItems
          items={propuesta.items}
          moneda={propuesta.moneda}
          onChange={(items) => set('items', items)}
        />
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Total
          </span>
          {/* Con el código de moneda siempre: USD y ARS comparten el «$». */}
          <span className="text-lg font-semibold tabular-nums">
            {propuesta.moneda}{' '}
            {new Intl.NumberFormat('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(total)}
          </span>
        </div>
      </Seccion>

      <Seccion titulo="Condiciones">
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="pr-moneda">Moneda</FieldLabel>
              <SimpleSelect
                id="pr-moneda"
                value={propuesta.moneda}
                onValueChange={(v) => set('moneda', v as PropuestaEditable['moneda'])}
                options={[
                  { value: 'USD', label: 'USD · dólares' },
                  { value: 'ARS', label: 'ARS · pesos' },
                  { value: 'EUR', label: 'EUR · euros' },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pr-validez">Validez (días)</FieldLabel>
              <Input
                id="pr-validez"
                inputMode="numeric"
                className="tabular-nums"
                value={propuesta.validezDias}
                placeholder="Sin vencimiento"
                onChange={(e) => set('validezDias', e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pr-plazo">Plazo de entrega</FieldLabel>
              <Input
                id="pr-plazo"
                value={propuesta.plazoEntrega}
                placeholder="8 semanas"
                onChange={(e) => set('plazoEntrega', e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Los precios incluyen impuestos</p>
              <p className="text-xs text-muted-foreground">
                Cambia lo que dice el recuadro del total en el PDF.
              </p>
            </div>
            <Switch
              checked={propuesta.incluyeImpuestos}
              onCheckedChange={(v) => set('incluyeImpuestos', v)}
            />
          </div>

          <Field>
            <FieldLabel>Forma de pago</FieldLabel>
            <ListaTexto
              valores={propuesta.formaDePago}
              onChange={(v) => set('formaDePago', v)}
              placeholder="50% al inicio"
              agregarLabel="Agregar condición"
              vaciaLabel="Sin condiciones de pago cargadas."
            />
          </Field>
        </FieldGroup>
      </Seccion>

      <section className="glass flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setLargasAbiertas((v) => !v)}
          className="flex items-center justify-between gap-2 text-left"
        >
          <span>
            <span className="text-sm font-semibold">Alcance, etapas y supuestos</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {plantilla === 'larga'
                ? 'Se imprimen en la propuesta larga.'
                : 'El presupuesto corto no los imprime, pero se guardan por si cambiás de plantilla.'}
            </span>
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${largasAbiertas ? 'rotate-180' : ''}`}
          />
        </button>

        {largasAbiertas ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pr-present">Presentación</FieldLabel>
              <Textarea
                id="pr-present"
                rows={4}
                value={propuesta.presentacion}
                onChange={(e) => set('presentacion', e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Alcance del trabajo</FieldLabel>
              <ListaTexto
                valores={propuesta.alcance}
                onChange={(v) => set('alcance', v)}
                placeholder="Panel de administración de usuarios"
                agregarLabel="Agregar entregable"
                vaciaLabel="Sin alcance cargado."
              />
            </Field>
            <Field>
              <FieldLabel>Fuera de alcance</FieldLabel>
              <ListaTexto
                valores={propuesta.fueraDeAlcance}
                onChange={(v) => set('fueraDeAlcance', v)}
                placeholder="Migración de datos históricos"
                agregarLabel="Agregar exclusión"
                vaciaLabel="Sin exclusiones. Conviene poner al menos una."
              />
            </Field>
            <Field>
              <FieldLabel>Etapas</FieldLabel>
              <ListaEtapas
                etapas={propuesta.etapas}
                onChange={(v) => set('etapas', v)}
              />
            </Field>
            <Field>
              <FieldLabel>Supuestos</FieldLabel>
              <ListaTexto
                valores={propuesta.supuestos}
                onChange={(v) => set('supuestos', v)}
                placeholder="El cliente provee los accesos"
                agregarLabel="Agregar supuesto"
                vaciaLabel="Sin supuestos."
              />
            </Field>
          </FieldGroup>
        ) : null}
      </section>

      <Seccion titulo="Notas">
        <Textarea
          rows={3}
          value={propuesta.notas}
          placeholder="Lo que quede por aclarar al pie del documento."
          onChange={(e) => set('notas', e.target.value)}
        />
      </Seccion>
    </div>
  )
}

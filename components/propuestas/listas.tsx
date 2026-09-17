'use client'

/**
 * Las tres listas de largo variable de una propuesta.
 *
 * Están juntas porque son la misma idea tres veces —una fila, un botón de
 * quitar, un botón de agregar abajo— y separarlas en tres archivos escondería
 * que comparten forma.
 *
 * Las `key` son el índice del array. Suena a antipatrón, pero acá es lo
 * correcto: los inputs están totalmente controlados por el valor de la lista, y
 * las filas sólo se agregan o se borran por una acción explícita — nunca se
 * reordenan solas mientras alguien escribe. La alternativa, un id por fila,
 * mete un campo que no existe en el esquema y hay que acordarse de sacarlo
 * antes de armar el PDF.
 */

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/shared/money-input'
import {
  agregar,
  cambiar,
  etapaVacia,
  itemVacio,
  quitar,
  type ItemEditable,
} from '@/lib/propuesta/editar'
import type { EtapaPropuesta } from '@/lib/propuesta/schema'

function BotonQuitar({ onClick, que }: { onClick: () => void; que: string }) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={`Quitar ${que}`}
      onClick={onClick}
      className="shrink-0 text-muted-foreground hover:text-red-400"
    >
      <Trash2 />
    </Button>
  )
}

function BotonAgregar({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onClick}>
      <Plus data-icon="inline-start" />
      {children}
    </Button>
  )
}

function Vacia({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

// ---------------------------------------------------------------------

export function ListaTexto({
  valores,
  onChange,
  placeholder,
  agregarLabel,
  vaciaLabel,
}: {
  valores: string[]
  onChange: (valores: string[]) => void
  placeholder: string
  agregarLabel: string
  vaciaLabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {valores.length === 0 ? <Vacia>{vaciaLabel}</Vacia> : null}
      {valores.map((valor, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={valor}
            placeholder={placeholder}
            onChange={(e) =>
              onChange(valores.map((v, j) => (j === i ? e.target.value : v)))
            }
          />
          <BotonQuitar que="la línea" onClick={() => onChange(quitar(valores, i))} />
        </div>
      ))}
      <div>
        <BotonAgregar onClick={() => onChange(agregar(valores, ''))}>
          {agregarLabel}
        </BotonAgregar>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------

export function ListaItems({
  items,
  moneda,
  onChange,
}: {
  items: ItemEditable[]
  moneda: string
  onChange: (items: ItemEditable[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3"
        >
          <div className="flex items-start gap-2">
            <Input
              value={item.descripcion}
              placeholder="Qué se entrega"
              className="font-medium"
              onChange={(e) =>
                onChange(cambiar(items, i, { descripcion: e.target.value }))
              }
            />
            <BotonQuitar que="el ítem" onClick={() => onChange(quitar(items, i))} />
          </div>

          <Input
            value={item.detalle}
            placeholder="Detalle (opcional)"
            className="text-sm"
            onChange={(e) =>
              onChange(cambiar(items, i, { detalle: e.target.value }))
            }
          />

          {/* En el teléfono las tres van una debajo de otra; recién a partir
              de 640px entran en fila. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[6rem_1fr_1fr]">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Cantidad
              </span>
              <Input
                value={item.cantidad}
                inputMode="numeric"
                className="tabular-nums"
                onChange={(e) =>
                  onChange(cambiar(items, i, { cantidad: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Unitario ({moneda})
              </span>
              <MoneyInput
                value={item.precioUnitario}
                placeholder="A definir"
                className="tabular-nums"
                onValueChange={(v) =>
                  onChange(cambiar(items, i, { precioUnitario: v }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Importe
              </span>
              <div className="flex h-11 items-center justify-end rounded-md border border-white/5 bg-white/[0.02] px-3 text-sm tabular-nums md:h-8">
                {item.precioUnitario.trim() === '' ? (
                  // Vacío no comunica que falta; decirlo, sí.
                  <span className="text-amber-300">Falta el precio</span>
                ) : (
                  <span className="font-semibold">
                    {new Intl.NumberFormat('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(
                      (Number(item.cantidad) || 1) * Number(item.precioUnitario),
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div>
        <BotonAgregar onClick={() => onChange(agregar(items, itemVacio()))}>
          Agregar ítem
        </BotonAgregar>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------

export function ListaEtapas({
  etapas,
  onChange,
}: {
  etapas: EtapaPropuesta[]
  onChange: (etapas: EtapaPropuesta[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {etapas.length === 0 ? (
        <Vacia>Sin etapas. La propuesta se puede mandar igual.</Vacia>
      ) : null}
      {etapas.map((etapa, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3"
        >
          <div className="flex items-start gap-2">
            <Input
              value={etapa.nombre}
              placeholder={`Etapa ${i + 1}`}
              className="font-medium"
              onChange={(e) =>
                onChange(cambiar(etapas, i, { nombre: e.target.value }))
              }
            />
            <Input
              value={etapa.plazo}
              placeholder="Plazo"
              className="sm:w-40"
              onChange={(e) =>
                onChange(cambiar(etapas, i, { plazo: e.target.value }))
              }
            />
            <BotonQuitar que="la etapa" onClick={() => onChange(quitar(etapas, i))} />
          </div>
          <Input
            value={etapa.descripcion}
            placeholder="Qué pasa en esta etapa"
            className="text-sm"
            onChange={(e) =>
              onChange(cambiar(etapas, i, { descripcion: e.target.value }))
            }
          />
        </div>
      ))}
      <div>
        <BotonAgregar onClick={() => onChange(agregar(etapas, etapaVacia()))}>
          Agregar etapa
        </BotonAgregar>
      </div>
    </div>
  )
}

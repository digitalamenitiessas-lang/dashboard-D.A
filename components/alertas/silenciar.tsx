'use client'

/**
 * Callar una alerta, y la lista de las que están calladas.
 *
 * Silenciar acá apaga las dos cosas a la vez: el cartel de esta pantalla y el
 * push que llega al celular. Funciona porque el id de la alerta y el asunto
 * del aviso son la misma cadena —`mnt-<proyecto>`, `dom-<proyecto>`—, algo que
 * ya era así antes de que existiera esto.
 */

import * as React from 'react'
import { BellOff, BellRing, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PLAZOS, textoSilencio, type Aviso } from '@/lib/avisos'
import { useStore } from '@/lib/store'

export function SilenciarBoton({
  asunto,
  titulo,
}: {
  asunto: string
  titulo: string
}) {
  const { silenciarAviso } = useStore()
  const [trabajando, setTrabajando] = React.useState(false)

  async function silenciar(dias: number | null, label: string) {
    setTrabajando(true)
    const ok = await silenciarAviso(asunto, dias, titulo)
    setTrabajando(false)
    if (!ok) return // el store ya avisó con un toast rojo
    toast.success('Aviso silenciado', {
      description:
        dias === null
          ? 'No vuelve a sonar, salvo que la situación empeore.'
          : `${label}. Vuelve antes si empeora.`,
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={trabajando}
            aria-label={`Silenciar: ${titulo}`}
            title="Silenciar este aviso"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <BellOff />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PLAZOS.map((p) => (
          <DropdownMenuItem
            key={p.label}
            onClick={() => void silenciar(p.dias, p.label)}
          >
            {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AvisosSilenciados({ avisos }: { avisos: Aviso[] }) {
  const { reactivarAviso } = useStore()
  const [abierto, setAbierto] = React.useState(false)

  if (avisos.length === 0) return null

  async function reactivar(a: Aviso) {
    const ok = await reactivarAviso(a.asunto)
    if (ok) toast.success('Aviso reactivado', { description: a.titulo })
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl p-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <BellOff className="size-4" />
          Silenciados
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px]">
            {avisos.length}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto ? (
        <ul className="flex flex-col divide-y divide-white/5">
          {avisos.map((a) => (
            <li key={a.asunto} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{a.titulo || a.asunto}</p>
                <p className="text-xs text-muted-foreground">
                  {textoSilencio(a)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void reactivar(a)}
                className="shrink-0"
              >
                <BellRing data-icon="inline-start" />
                Reactivar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

'use client'

import * as React from 'react'
import { BellOff, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * Cartel para cuando la cadena del push está cortada.
 *
 * Existe porque ya pasó: la configuración de `app_settings` quedó sin
 * cargar, `despachar_push()` volvía en silencio, pg_cron informaba
 * `succeeded` una vez por minuto y veintidós avisos se juntaron en la
 * cola durante días. Nadie se enteró hasta que alguien preguntó por qué
 * no llegaba nada.
 *
 * El diagnóstico viene de `push_estado()`, que es `security definer`:
 * devuelve si hay configuración y cuántos dispositivos hay, nunca los
 * valores de los secretos.
 */

interface Estado {
  configurado: boolean
  dispositivos: number
  enCola: number
  atascados: number
  ultimoError: string | null
}

export function PushHealth({ className }: { className?: string }) {
  const [estado, setEstado] = React.useState<Estado | null>(null)

  React.useEffect(() => {
    let vivo = true
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('push_estado')
      // Si falta correr 21_push_arreglos.sql la función no existe. Eso no
      // es un problema que haya que gritarle al usuario: simplemente no
      // hay diagnóstico disponible y el cartel no se muestra.
      if (!vivo || error || !data) return
      setEstado(data as Estado)
    })()
    return () => {
      vivo = false
    }
  }, [])

  if (!estado) return null

  const problema = !estado.configurado
    ? {
        titulo: 'Los avisos no se están mandando',
        detalle:
          'Falta la configuración del despachador en la base. Corré «npm run push:sql» y pegá el insert que imprime en el SQL Editor.',
        grave: true,
      }
    : estado.atascados > 0
      ? {
          titulo: `${estado.atascados} aviso(s) trabados en la cola`,
          detalle:
            estado.ultimoError ??
            'El despachador corre cada minuto, así que algo está fallando al mandar. Mirá cron.job_run_details y net._http_response.',
          grave: true,
        }
      : estado.dispositivos === 0
        ? {
            titulo: 'Ningún dispositivo recibe avisos',
            detalle:
              'Los avisos se están generando pero no hay a quién mandárselos. Activalos con la campana del menú, en cada celular.',
            grave: false,
          }
        : null

  if (!problema) return null

  return (
    <div
      className={cn(
        'glass flex items-start gap-3 rounded-2xl p-4',
        problema.grave
          ? 'border-destructive/25 bg-destructive/5'
          : 'border-amber-400/25 bg-amber-400/5',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-xl',
          problema.grave
            ? 'bg-destructive/10 text-red-300'
            : 'bg-amber-400/10 text-amber-300',
        )}
      >
        {problema.grave ? (
          <TriangleAlert className="size-4" />
        ) : (
          <BellOff className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            problema.grave ? 'text-red-300' : 'text-amber-300',
          )}
        >
          {problema.titulo}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
          {problema.detalle}
        </p>
        {estado.configurado && estado.enCola > 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {estado.enCola} en cola · {estado.dispositivos} dispositivo(s)
          </p>
        ) : null}
      </div>
    </div>
  )
}

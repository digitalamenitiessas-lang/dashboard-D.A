'use client'

import * as React from 'react'
import { BellOff, BellRing, Share, SquarePlus } from 'lucide-react'
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
import {
  activatePush,
  currentSubscription,
  deactivatePush,
  isIos,
  isStandalone,
  pushSupport,
  registerServiceWorker,
} from '@/lib/push'
import { cn } from '@/lib/utils'

/**
 * Activa o desactiva los avisos en ESTE dispositivo.
 *
 * Es por dispositivo y no por usuario a propósito: toda la empresa entra
 * con la misma cuenta, así que cada celular tiene que darse de alta una
 * vez y el aviso le llega a todos los que estén dados de alta.
 *
 * En iPhone no alcanza con dar permiso: Safari no expone la API de push
 * a una pestaña común, hay que agregar la app a la pantalla de inicio
 * primero. Cuando ese es el caso mostramos las instrucciones en vez de
 * un botón que no puede funcionar.
 *
 * Se dibuja como una fila con etiqueta, para el menú: en el header era
 * una campana de 32px pegada a la campana de alertas, y el que se
 * equivocaba de campana se daba de baja de los avisos sin querer.
 */
export function PushToggle() {
  const [activo, setActivo] = React.useState(false)
  const [trabajando, setTrabajando] = React.useState(false)
  const [ayudaIos, setAyudaIos] = React.useState(false)
  // Se resuelve en el cliente: en el servidor no hay navigator.
  const [listo, setListo] = React.useState(false)

  React.useEffect(() => {
    let vivo = true
    void (async () => {
      await registerServiceWorker()
      const sub = await currentSubscription()
      if (!vivo) return
      setActivo(!!sub)
      setListo(true)
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function alternar() {
    const soporte = pushSupport()

    if (!soporte.ok && soporte.reason === 'instalar-en-inicio') {
      setAyudaIos(true)
      return
    }

    setTrabajando(true)
    try {
      if (activo) {
        const r = await deactivatePush()
        if (!r.ok) {
          toast.error('No se pudo desactivar', { description: r.message })
          return
        }
        setActivo(false)
        toast.success('Avisos desactivados en este dispositivo')
      } else {
        const r = await activatePush()
        if (!r.ok) {
          toast.error('No se pudieron activar', { description: r.message })
          return
        }
        setActivo(true)
        toast.success('Avisos activados en este dispositivo')
      }
    } finally {
      setTrabajando(false)
    }
  }

  // Hasta saber el estado real no se pinta nada: un botón que dice
  // "activar" y después salta a "activado" al segundo es peor que nada.
  if (!listo) return null

  return (
    <>
      {/* min-h en vez de h: así el alto táctil de 44px no depende de la
          variante del Button ni pelea con ella. */}
      <Button
        variant="ghost"
        onClick={() => void alternar()}
        disabled={trabajando}
        aria-pressed={activo}
        title={activo ? 'Avisos activados en este dispositivo' : 'Activar avisos en este dispositivo'}
        className="min-h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:text-foreground lg:min-h-10"
      >
        {activo ? (
          <BellRing className="size-4.5 shrink-0 text-neon-green" />
        ) : (
          <BellOff className="size-4.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          Avisos en este dispositivo
        </span>
        <span
          className={cn(
            'shrink-0 text-[11px]',
            activo ? 'text-neon-green' : 'text-muted-foreground',
          )}
        >
          {activo ? 'Activados' : 'Desactivados'}
        </span>
      </Button>

      <Dialog open={ayudaIos} onOpenChange={setAyudaIos}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregala a la pantalla de inicio</DialogTitle>
            <DialogDescription>
              En iPhone los avisos sólo funcionan con la app instalada. Es
              una vez por celular y no ocupa casi nada.
            </DialogDescription>
          </DialogHeader>

          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/5 tabular-nums">
                1
              </span>
              <span className="flex items-center gap-1.5">
                Tocá <Share className="size-4 shrink-0" /> Compartir, abajo en Safari.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/5 tabular-nums">
                2
              </span>
              <span className="flex items-center gap-1.5">
                Elegí <SquarePlus className="size-4 shrink-0" /> «Agregar a inicio».
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/5 tabular-nums">
                3
              </span>
              <span>Abrí la app desde el ícono nuevo y volvé a tocar la campana.</span>
            </li>
          </ol>

          <p className="text-xs text-muted-foreground text-pretty">
            Tiene que ser desde Safari: Chrome en iPhone no puede instalar
            aplicaciones. En Android alcanza con tocar la campana.
          </p>

          <DialogFooter>
            <Button onClick={() => setAyudaIos(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Cartel para invitar a instalar la app cuando todavía se está mirando
 * desde el navegador. Sólo aparece donde tiene sentido: en un celular,
 * sin instalar, y una vez — si lo cerraste, no vuelve a molestar.
 */
export function InstallHint() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (isStandalone()) return
    if (!isIos()) return
    try {
      if (localStorage.getItem('da:install-hint') === 'oculto') return
    } catch {
      // Modo privado o cookies bloqueadas: mostramos igual, no es grave.
    }
    setVisible(true)
  }, [])

  if (!visible) return null

  return (
    <div className="glass flex items-center gap-3 rounded-2xl border-neon-blue/20 bg-neon-blue/5 p-3 text-sm">
      <SquarePlus className="size-4 shrink-0 text-neon-blue" />
      <p className="min-w-0 flex-1 text-pretty">
        Agregá la app a la pantalla de inicio para recibir avisos:{' '}
        <span className="font-medium">Compartir → Agregar a inicio</span>.
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => {
          setVisible(false)
          try {
            localStorage.setItem('da:install-hint', 'oculto')
          } catch {
            // Si no se puede recordar, vuelve a aparecer. Aceptable.
          }
        }}
      >
        Listo
      </Button>
    </div>
  )
}

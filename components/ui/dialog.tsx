"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * El diálogo son DOS cajas, no una: un MARCO que no scrollea y una ZONA
 * SCROLLEABLE adentro.
 *
 * Antes el Popup era las dos cosas a la vez y eso rompía el caso que más
 * importa acá: la app se usa instalada en el celular, y con el teclado
 * abierto el DialogFooter —último hijo del mismo scroller— quedaba detrás
 * del teclado. Scrollear no salvaba nada: el footer bajaba junto con el
 * contenido. Lo mismo le pasaba a la X de cerrar (`absolute` con el scroller
 * como bloque contenedor: se iba para arriba con el scroll).
 *
 * Ahora:
 * - el marco es `fixed`, `overflow-hidden` y `flex flex-col`, con el tope de
 *   alto en `safe-dialog-frame` (app/globals.css), que descuenta las áreas
 *   seguras y mide en `dvh` sobre el viewport ya encogido por el teclado;
 * - el header y el contenido viven en un div interno que scrollea;
 * - el DialogFooter va FUERA de ese div, clavado abajo del marco, así el
 *   botón de guardar siempre queda arriba del teclado;
 * - la X queda `absolute` contra el marco, o sea fija.
 *
 * Para que el footer quede afuera tiene que ser hijo directo del
 * DialogContent, y acá se lo separa de los demás hijos. Los diálogos que
 * todavía lo tienen adentro de su `<form>` no se rompen: en ese caso el
 * scroller lo deja `sticky` contra su propio borde de abajo, que es el mismo
 * resultado visual. El objetivo igual es sacarlos del form.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const hijos = React.Children.toArray(children)
  const esFooter = (hijo: React.ReactNode) =>
    React.isValidElement(hijo) && hijo.type === DialogFooter
  const footer = hijos.filter(esFooter)
  const cuerpo = hijos.filter((hijo) => !esFooter(hijo))

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // El marco: no scrollea, no crece más allá del área segura, y le
          // come el `mt-*` al footer que quede clavado abajo (los llamadores
          // lo traen pensando en un footer al final de un formulario).
          "safe-dialog-frame fixed left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none [&>[data-slot=dialog-footer]]:mt-0 sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {/* La zona que scrollea. `min-h-0` es lo que le permite achicarse
            cuando el contenido pasa el tope del marco (sin eso el mínimo
            automático del flex item lo empuja hacia afuera y desborda). Sin
            `flex-1`, a propósito: así un diálogo corto sigue midiendo lo que
            mide su contenido y no se estira a pantalla completa.
            Los `[&_[data-slot=dialog-footer]]:*` son la red para los
            diálogos que todavía tienen el footer adentro del <form>: lo
            pegan al borde de abajo del scroller, a sangre y con blur para
            que el contenido no se transparente por atrás. */}
        <div
          data-slot="dialog-body"
          className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-4 [&_[data-slot=dialog-footer]]:sticky [&_[data-slot=dialog-footer]]:-bottom-4 [&_[data-slot=dialog-footer]]:z-10 [&_[data-slot=dialog-footer]]:-mx-4 [&_[data-slot=dialog-footer]]:-mb-4 [&_[data-slot=dialog-footer]]:supports-backdrop-filter:backdrop-blur-md"
        >
          {cuerpo}
        </div>
        {footer}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 z-20"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      // Sin márgenes negativos propios: como hijo directo del DialogContent
      // ya nace a sangre, pegado al borde de abajo del marco y afuera del
      // scroller. Los `-mx-4 -mb-4` los pone el scroller sólo para los
      // diálogos que todavía lo tienen adentro del <form>.
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // `pr-8` reserva el ancho de la X, que vive en la esquina del marco y
      // se le monta encima: sin esto un título un poco más largo se mete
      // abajo del botón de cerrar.
      className={cn(
        "pr-8 text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

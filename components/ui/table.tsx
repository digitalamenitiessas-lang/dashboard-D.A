"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      // overscroll-x-contain: arrastrar la tabla al costado en iOS no dispara
      // el gesto de "volver atras" del navegador.
      className="relative w-full overflow-x-auto overscroll-x-contain"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

// Fondo opaco para las celdas fijas: la card es `glass` (translucida), asi que
// sin esto el contenido que scrollea por debajo se ve a traves de la columna.
const stickyCell = "sticky left-0 bg-[oklch(0.22_0.008_265)]"

/**
 * `nowrap` viene en true para no cambiar ninguna tabla existente, pero se puede
 * apagar celda por celda (o columna por columna) cuando el texto es largo y
 * conviene que baje de renglon en vez de estirar la tabla sin techo.
 * `sticky` fija la celda a la izquierda: usalo en la primera columna, en el
 * TableHead y en el TableCell de la misma columna.
 */
type TableCellExtras = {
  nowrap?: boolean
  sticky?: boolean
}

function TableHead({
  className,
  nowrap = true,
  sticky = false,
  ...props
}: React.ComponentProps<"th"> & TableCellExtras) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium text-foreground [&:has([role=checkbox])]:pr-0",
        nowrap && "whitespace-nowrap",
        sticky && `${stickyCell} z-20`,
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  nowrap = true,
  sticky = false,
  ...props
}: React.ComponentProps<"td"> & TableCellExtras) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle [&:has([role=checkbox])]:pr-0",
        nowrap && "whitespace-nowrap",
        sticky && `${stickyCell} z-10`,
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

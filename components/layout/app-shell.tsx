'use client'

import * as React from 'react'
import Link from 'next/link'
import { Menu, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { SidebarNav } from './sidebar-nav'
import { AlertsMenu } from './alerts-menu'
import { PushToggle } from './push-toggle'
import { UserMenu } from './user-menu'
import { StoreGate } from './store-gate'
import { BrandMark } from './brand-mark'

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <BrandMark className="h-4.5 text-foreground" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-sm font-extrabold tracking-tight">
          Digital Amenities
        </span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">
          Centro de Control
        </span>
      </span>
    </Link>
  )
}

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode
  userEmail: string
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      {/* En un iPad apaisado la muesca queda a la izquierda, y ahí vive esta
          barra: sin el inset, los ítems del menú quedan debajo del borde. */}
      <aside className="glass-strong sticky top-0 hidden h-svh flex-col border-r border-white/5 pl-[env(safe-area-inset-left)] lg:flex">
        <div className="flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-white/5 px-5 pt-[env(safe-area-inset-top)]">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SidebarNav />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        {/*
          La altura crece con el hueco de la barra de estado y el padding
          empuja el contenido hacia abajo: el fondo del header llega hasta
          el borde de la pantalla, pero los botones quedan debajo de la
          hora. En cualquier pantalla sin muesca los env() valen 0 y esto
          es exactamente un header de 4rem.
        */}
        <header className="glass-strong sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b border-white/5 pt-[env(safe-area-inset-top)] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] lg:pl-[calc(1.5rem+env(safe-area-inset-left))] lg:pr-[calc(1.5rem+env(safe-area-inset-right))]">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú" />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 overflow-y-auto border-white/10 bg-background/95 p-0 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-xl"
            >
              <SheetTitle className="sr-only">Navegación</SheetTitle>
              <div className="flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-white/5 px-5 pt-[env(safe-area-inset-top)]">
                <Brand />
              </div>
              <div className="px-3 py-4">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground sm:flex">
            <Search className="size-4" />
            <span>Buscar proyectos, clientes...</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <PushToggle />
            <AlertsMenu />
            <UserMenu email={userEmail} />
          </div>
        </header>

        {/* Abajo, la barra de gestos del iPhone se come lo último de la
            pantalla si el contenido llega hasta el borde. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <StoreGate>{children}</StoreGate>
        </main>
      </div>
    </div>
  )
}

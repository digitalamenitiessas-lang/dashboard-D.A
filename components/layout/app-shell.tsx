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
      <aside className="glass-strong sticky top-0 hidden h-svh flex-col border-r border-white/5 lg:flex">
        <div className="flex h-16 items-center border-b border-white/5 px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="glass-strong sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/5 px-4 lg:px-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú" />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-white/10 bg-background/95 p-0 backdrop-blur-xl">
              <SheetTitle className="sr-only">Navegación</SheetTitle>
              <div className="flex h-16 items-center border-b border-white/5 px-5">
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
            <AlertsMenu />
            <UserMenu email={userEmail} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <StoreGate>{children}</StoreGate>
        </main>
      </div>
    </div>
  )
}

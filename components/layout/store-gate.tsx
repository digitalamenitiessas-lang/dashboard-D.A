'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'

/**
 * Holds the page back until the first load resolves, so screens don't flash
 * an "empty" state before the data arrives.
 */
export function StoreGate({ children }: { children: React.ReactNode }) {
  const { loading, error, refresh } = useStore()

  if (loading) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Cargando datos...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl p-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-red-300 ring-1 ring-destructive/20">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="font-display text-base font-extrabold">
          No se pudo cargar la información
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">{error}</p>
        <Button variant="outline" onClick={() => void refresh()}>
          Reintentar
        </Button>
      </div>
    )
  }

  return <>{children}</>
}

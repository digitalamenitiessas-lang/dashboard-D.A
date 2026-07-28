'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useStore } from '@/lib/store'
import { buildAlerts, type AlertLevel } from '@/lib/derive'
import { cn } from '@/lib/utils'

const dot: Record<AlertLevel, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-300',
  info: 'bg-neon-blue',
}

export function AlertsMenu() {
  const { projects, notes, tasks } = useStore()
  const alerts = buildAlerts({ projects, notes, tasks })
  const criticalCount = alerts.filter((a) => a.level === 'critical').length

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Alertas" />
        }
      >
        <Bell />
        {alerts.length > 0 ? (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-background',
              criticalCount > 0 ? 'bg-red-400' : 'bg-neon-green',
            )}
          >
            {alerts.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
          <p className="text-sm font-semibold">Alertas</p>
          <span className="text-xs text-muted-foreground">{alerts.length} activas</span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sin alertas. Todo en orden.
            </p>
          ) : (
            alerts.slice(0, 6).map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2.5 border-b border-white/5 px-3 py-2.5 last:border-0"
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot[a.level])} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-white/5 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            nativeButton={false}
            render={<Link href="/alertas" />}
          >
            Ver todas las alertas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

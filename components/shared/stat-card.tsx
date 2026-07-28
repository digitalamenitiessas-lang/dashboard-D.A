import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Accent = 'green' | 'blue' | 'violet' | 'neutral' | 'red'

const accentText: Record<Accent, string> = {
  green: 'text-neon-green',
  blue: 'text-neon-blue',
  violet: 'text-neon-violet',
  neutral: 'text-foreground',
  red: 'text-red-300',
}

const accentIconBg: Record<Accent, string> = {
  green: 'bg-neon-green/10 text-neon-green ring-neon-green/20',
  blue: 'bg-neon-blue/10 text-neon-blue ring-neon-blue/20',
  violet: 'bg-neon-violet/10 text-neon-violet ring-neon-violet/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
  red: 'bg-destructive/10 text-red-300 ring-destructive/20',
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'neutral',
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  accent?: Accent
  className?: string
}) {
  return (
    <div
      className={cn(
        'glass relative overflow-hidden rounded-2xl p-4 transition-colors hover:border-white/15',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p
            className={cn(
              'mt-2 font-display text-2xl font-extrabold tabular-nums',
              accentText[accent],
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl ring-1',
              accentIconBg[accent],
            )}
          >
            <Icon className="size-4.5" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

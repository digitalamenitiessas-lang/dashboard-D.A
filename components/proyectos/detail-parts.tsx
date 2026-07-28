import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InfoRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2.5', className)}>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      {/* Karla's default figures are proportional, so right-aligned values
          need tabular figures to line up down the column. */}
      <span className="min-w-0 text-right text-sm font-medium tabular-nums break-words">
        {children}
      </span>
    </div>
  )
}

export function DetailCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string
  icon?: LucideIcon
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          <h3 className="font-display text-sm font-extrabold">{title}</h3>
        </div>
        {action}
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  )
}

export function TodoList({
  items,
  tone = 'neutral',
  empty = 'Sin pendientes',
}: {
  items: string[]
  tone?: 'internal' | 'client' | 'blocker' | 'neutral'
  empty?: string
}) {
  const dot: Record<string, string> = {
    internal: 'bg-neon-blue',
    client: 'bg-neon-violet',
    blocker: 'bg-red-400',
    neutral: 'bg-muted-foreground',
  }
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-2 py-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', dot[tone])} />
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  )
}

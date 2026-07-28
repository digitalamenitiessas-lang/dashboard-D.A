import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionCard({
  title,
  icon: Icon,
  href,
  children,
  className,
}: {
  title: string
  icon?: LucideIcon
  href?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('glass flex flex-col rounded-2xl', className)}>
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {href ? (
          <Link
            href={href}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-neon-green"
          >
            Ver todo
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  )
}

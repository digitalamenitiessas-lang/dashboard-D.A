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
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {href ? (
          // El área tocable del enlace era la caja del texto (62x16): los
          // márgenes negativos le dan 44px de alto sin mover nada de lugar.
          <Link
            href={href}
            className="-my-1.5 -mr-2 flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-neon-green md:min-h-0"
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

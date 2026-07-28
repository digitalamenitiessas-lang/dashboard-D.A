'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navItems } from '@/lib/nav'
import { cn } from '@/lib/utils'

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              active
                ? 'bg-neon-green/10 text-foreground'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-neon-green transition-all',
                active ? 'opacity-100 shadow-[0_0_10px_var(--neon-green)]' : 'opacity-0',
              )}
              aria-hidden
            />
            <Icon
              className={cn(
                'size-4.5 shrink-0 transition-colors',
                active ? 'text-neon-green' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'

/** Initials from the email local part, e.g. "matias.w@…" -> "MW". */
function initials(email: string) {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0])
  return (letters.join('') || local.slice(0, 2)).toUpperCase()
}

export function UserMenu({ email }: { email: string }) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            // `md:h-auto` además de `h-auto`: el Button ahora trae el par
            // `h-10 md:h-8`, y sin apagar el segundo el avatar de 28px más el
            // py-1.5 se desbordaba de una caja de 32px en escritorio.
            className="h-auto gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 md:h-auto"
          />
        }
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-neon-violet/20 text-xs font-semibold text-neon-violet">
          {initials(email)}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
          {email}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="border-b border-white/5 px-2 py-1.5">
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

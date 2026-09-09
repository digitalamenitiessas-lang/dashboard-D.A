'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { linkWhatsapp } from '@/lib/telefono'

/**
 * Abre el chat de WhatsApp con ese cliente y el mensaje ya escrito.
 *
 * NO manda nada. `wa.me` abre la conversación con el texto puesto; quien
 * escribe lo lee, lo edita si quiere, y recién ahí toca enviar. Esa es la
 * diferencia entre una comodidad y un botón peligroso, y por eso el mensaje
 * puede traer el monto adeudado sin riesgo: siempre pasa por un par de ojos.
 *
 * Si el teléfono no se puede interpretar, el botón NO se renderiza. Un botón
 * que abre WhatsApp diciendo «el número no existe» es peor que no tenerlo:
 * hace perder el tiempo justo cuando uno está por reclamar un pago. Que
 * falte el botón manda a cargar bien el teléfono, que es lo que corresponde.
 */
export function WhatsappButton({
  telefono,
  mensaje,
  label = 'WhatsApp',
  size = 'sm',
  variant = 'outline',
  className,
}: {
  telefono: string | null
  mensaje: string
  label?: string
  size?: 'sm' | 'default' | 'icon-sm'
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
}) {
  const href = linkWhatsapp(telefono, mensaje)
  if (!href) return null

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      nativeButton={false}
      render={
        <Link href={href} target="_blank" rel="noopener noreferrer" />
      }
    >
      <MessageCircle data-icon="inline-start" />
      {label}
    </Button>
  )
}

import { cn } from '@/lib/utils'

/**
 * Free text with any pasted URL turned into a real link, so a link
 * dropped into a description or a note works without a dedicated field.
 *
 * Only http(s) is matched — never `javascript:` and friends — and the
 * trailing punctuation of a sentence is left out of the href.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)\]}])/gi

export function LinkedText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  if (!text) return null

  // A capturing split keeps the matches in the resulting array.
  const parts = text.split(URL_PATTERN)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        // Odd indexes are the captured URLs.
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              'font-medium text-neon-blue underline decoration-neon-blue/40',
              'underline-offset-2 transition-colors hover:text-neon-green',
              'hover:decoration-neon-green/40',
            )}
          >
            {part.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  )
}

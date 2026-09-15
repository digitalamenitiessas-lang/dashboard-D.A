'use client'

import * as React from 'react'
import { ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { entregarRecibo, numeroFormateado, precargarPdf, type Recibo } from '@/lib/recibo'

/**
 * Emite el recibo de un cobro y lo entrega: hoja de compartir en el
 * celular, descarga en la computadora.
 *
 * No pasa por `useStore` a propósito. Un recibo no es estado de la app —
 * nadie lo lista ni lo filtra desde acá— sino un documento que se genera
 * y se va. Meterlo en el store obligaría a cargar la tabla entera en cada
 * arranque para algo que se usa una vez por cobro.
 *
 * La emisión la hace `emitir_recibo()` en la base y no este componente:
 * así el número correlativo y la foto de los importes salen de un solo
 * lugar, y dos personas tocando el botón a la vez no se pisan. La función
 * es idempotente por cobro — si ya tiene recibo, devuelve el que hay.
 */

/** La fila de `recibos` como la devuelve PostgREST. */
interface ReciboRow {
  id: string
  numero: number
  payment_id: string
  emitido_on: string
  cliente_nombre: string
  concepto: string
  importe: number | string
  moneda: Recibo['moneda']
  importe_saldado: number | string | null
  moneda_saldada: Recibo['moneda'] | null
  cotizacion: number | string | null
  factura_numero: string
  notas: string
}

const num = (v: number | string | null) => (v === null ? null : Number(v))

function mapRecibo(r: ReciboRow): Recibo {
  return {
    id: r.id,
    numero: r.numero,
    paymentId: r.payment_id,
    emitidoOn: r.emitido_on,
    clienteNombre: r.cliente_nombre,
    concepto: r.concepto,
    importe: Number(r.importe),
    moneda: r.moneda,
    importeSaldado: num(r.importe_saldado),
    monedaSaldada: r.moneda_saldada,
    cotizacion: num(r.cotizacion),
    facturaNumero: r.factura_numero,
    notas: r.notas,
  }
}

export function ReciboButton({
  paymentId,
  concepto,
  className,
}: {
  paymentId: string
  /** Sólo para la etiqueta accesible: «Recibo de …». */
  concepto: string
  className?: string
}) {
  const [trabajando, setTrabajando] = React.useState(false)

  // jsPDF pesa, y `navigator.share` exige el gesto del usuario: si el
  // import se resolviera recién en el click, Safari lo tomaría como una
  // llamada fuera del gesto y no abriría la hoja de compartir. Se
  // precarga al montar para que el click llegue entero.
  React.useEffect(() => {
    precargarPdf()
  }, [])

  async function emitir() {
    setTrabajando(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .rpc('emitir_recibo', { p_payment_id: paymentId })
        .single<ReciboRow>()

      if (error || !data) {
        toast.error('No se pudo emitir el recibo', {
          description: error?.message ?? 'La base no devolvió el comprobante.',
        })
        return
      }

      const recibo = mapRecibo(data)
      const destino = await entregarRecibo(recibo)

      if (destino === 'cancelado') return
      toast.success(`Recibo N° ${numeroFormateado(recibo.numero)}`, {
        description:
          destino === 'compartido' ? 'Listo para mandar' : 'Descargado en tu equipo',
      })
    } catch (e) {
      toast.error('No se pudo generar el PDF', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={trabajando}
      className={className}
      aria-label={`Emitir recibo de ${concepto}`}
      title="Emitir recibo"
      onClick={() => void emitir()}
    >
      <ReceiptText />
    </Button>
  )
}

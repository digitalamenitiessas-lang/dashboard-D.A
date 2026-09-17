'use client'

/**
 * Propuestas y presupuestos.
 *
 * El flujo es de tres pasos y uno solo cuesta plata: se escribe en criollo lo
 * que se acordó, la IA lo ordena, se corrige a mano, y se baja el PDF. Recién
 * al bajarlo la propuesta se guarda y toma número — un borrador que nunca
 * llegó a papel no es una propuesta.
 */

import * as React from 'react'
import { Download, FileDown, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { SimpleSelect } from '@/components/shared/simple-select'
import { EditorPropuesta } from '@/components/propuestas/editor'
import { useStore } from '@/lib/store'
import { formatDate } from '@/lib/format'
import {
  aEditable,
  aPropuesta,
  sePuedeEmitir,
  type PropuestaEditable,
} from '@/lib/propuesta/editar'
import {
  borrarBorrador,
  guardarBorrador,
  leerBorrador,
} from '@/lib/propuesta/borrador'
import {
  entregarPropuesta,
  numeroPropuesta,
  precargarPdf,
} from '@/lib/propuesta/pdf'
import { PropuestaSchema, type Plantilla } from '@/lib/propuesta/schema'

const EJEMPLO = `Reunión con Juan del Hotel Las Lomas. Quieren un sistema para manejar reservas y huéspedes, hoy usan una planilla.

Cotizamos 8500 dólares el desarrollo, más 300 por mes de mantenimiento a partir de la implementación. 50% al arranque y el resto contra entrega. Plazo 12 semanas. La propuesta vale 15 días.`

export default function PropuestasPage() {
  const { clients, propuestas, propuestasReady, emitirPropuesta } = useStore()

  const [texto, setTexto] = React.useState('')
  const [plantilla, setPlantilla] = React.useState<Plantilla>('corta')
  const [generando, setGenerando] = React.useState(false)
  const [bajando, setBajando] = React.useState(false)
  const [propuesta, setPropuesta] = React.useState<PropuestaEditable | null>(null)
  const [hayBorrador, setHayBorrador] = React.useState(false)

  // El import de jspdf se resuelve al abrir la pantalla y no en el click: en
  // Safari el `await` se come el gesto del usuario y la hoja de compartir no
  // llega a abrirse.
  React.useEffect(() => {
    precargarPdf()
    setHayBorrador(leerBorrador() !== null)
  }, [])

  // Autoguardado del borrador. Con retardo, para no escribir en cada tecla.
  React.useEffect(() => {
    if (!propuesta) return
    const t = setTimeout(
      () => guardarBorrador({ plantilla, texto, propuesta }),
      600,
    )
    return () => clearTimeout(t)
  }, [propuesta, plantilla, texto])

  function retomar() {
    const b = leerBorrador()
    if (!b) return
    setTexto(b.texto)
    setPlantilla(b.plantilla)
    setPropuesta(b.propuesta)
    setHayBorrador(false)
  }

  function descartar() {
    borrarBorrador()
    setHayBorrador(false)
  }

  function empezarDeNuevo() {
    setPropuesta(null)
    setTexto('')
    borrarBorrador()
  }

  async function generar() {
    setGenerando(true)
    try {
      const res = await fetch('/api/propuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, plantilla }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error('No se pudo armar la propuesta', {
          description: data?.error ?? `El servidor respondió ${res.status}.`,
        })
        return
      }

      // Se revalida también acá: el endpoint ya lo hizo, pero esto es lo que
      // convierte `unknown` en el tipo, y cuesta nada.
      const ok = PropuestaSchema.safeParse(data?.propuesta)
      if (!ok.success) {
        toast.error('La respuesta vino con una forma rara', {
          description: 'Probá de nuevo.',
        })
        return
      }
      setPropuesta(aEditable(ok.data))
      setHayBorrador(false)
    } catch {
      toast.error('No se pudo contactar al servidor', {
        description: 'Revisá la conexión y probá de nuevo.',
      })
    } finally {
      setGenerando(false)
    }
  }

  async function bajar() {
    if (!propuesta) return
    setBajando(true)
    try {
      const limpia = aPropuesta(propuesta)
      // Primero se guarda, porque el número va impreso en el PDF. Si el dibujo
      // fallara después, queda registrada y se puede volver a bajar desde el
      // historial; al revés, un PDF sin número no sirve.
      const emitida = await emitirPropuesta(limpia, plantilla)
      if (!emitida) return // el store ya avisó con un toast rojo

      const destino = await entregarPropuesta(limpia, emitida.numero, plantilla)
      borrarBorrador()
      if (destino === 'cancelado') return
      toast.success(`Propuesta N° ${numeroPropuesta(emitida.numero)}`, {
        description:
          destino === 'compartido' ? 'Lista para mandar' : 'Descargada en tu equipo',
      })
    } catch (e) {
      toast.error('No se pudo generar el PDF', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBajando(false)
    }
  }

  async function volverABajar(id: string) {
    const emitida = propuestas.find((p) => p.id === id)
    if (!emitida) return
    // El contenido guardado puede ser de una versión vieja del esquema.
    const ok = PropuestaSchema.safeParse(emitida.contenido)
    if (!ok.success) {
      toast.error('Esta propuesta quedó guardada con otro formato', {
        description: 'No se puede volver a dibujar. Hacela de nuevo.',
      })
      return
    }
    // Sin pasar por la IA y sin tomar un número nuevo: es el mismo papel.
    await entregarPropuesta(ok.data, emitida.numero, emitida.plantilla)
  }

  if (!propuestasReady) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Propuestas"
          description="Presupuestos y propuestas comerciales para mandarle al cliente."
        />
        <Empty className="glass rounded-2xl">
          <EmptyHeader>
            <EmptyTitle>Falta correr una migración</EmptyTitle>
            <EmptyDescription>
              Ejecutá <code>supabase/23_propuestas.sql</code> en el editor SQL de
              Supabase y recargá la página.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Propuestas"
        description="Contá lo que se acordó, revisalo, y bajá el PDF para mandar."
      >
        {propuesta ? (
          <Button variant="ghost" size="sm" onClick={empezarDeNuevo}>
            <RotateCcw data-icon="inline-start" />
            Empezar de nuevo
          </Button>
        ) : null}
      </PageHeader>

      {hayBorrador && !propuesta ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Tenés una propuesta sin terminar.{' '}
            <span className="text-muted-foreground">
              Se guardó sola en este navegador.
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={descartar}>
              Descartar
            </Button>
            <Button size="sm" variant="outline" onClick={retomar}>
              <Undo2 data-icon="inline-start" />
              Retomar
            </Button>
          </div>
        </div>
      ) : null}

      {!propuesta ? (
        <section className="glass flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Qué se acordó</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Escribilo como se lo contarías a un compañero. No hace falta que
                sea prolijo.
              </p>
            </div>
            <SimpleSelect
              value={plantilla}
              onValueChange={(v) => setPlantilla(v as Plantilla)}
              className="sm:w-56"
              options={[
                { value: 'corta', label: 'Presupuesto · una hoja' },
                { value: 'larga', label: 'Propuesta · documento largo' },
              ]}
            />
          </div>

          <Textarea
            rows={10}
            value={texto}
            placeholder={EJEMPLO}
            onChange={(e) => setTexto(e.target.value)}
            className="font-normal"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {texto.trim().length < 40
                ? 'Contá un poco más: qué se va a hacer, para quién y por cuánto.'
                : 'No se inventan precios: lo que no esté escrito queda marcado para completar.'}
            </p>
            <Button
              onClick={() => void generar()}
              disabled={generando || texto.trim().length < 40}
            >
              <Sparkles data-icon="inline-start" />
              {generando ? 'Armando la propuesta…' : 'Armar propuesta'}
            </Button>
          </div>
        </section>
      ) : (
        <>
          <EditorPropuesta
            propuesta={propuesta}
            onChange={setPropuesta}
            plantilla={plantilla}
            clients={clients}
          />

          <div className="glass sticky bottom-0 z-10 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <SimpleSelect
              value={plantilla}
              onValueChange={(v) => setPlantilla(v as Plantilla)}
              className="sm:w-56"
              options={[
                { value: 'corta', label: 'Presupuesto · una hoja' },
                { value: 'larga', label: 'Propuesta · documento largo' },
              ]}
            />
            <Button
              onClick={() => void bajar()}
              disabled={bajando || !sePuedeEmitir(propuesta)}
            >
              <Download data-icon="inline-start" />
              {bajando ? 'Generando…' : 'Bajar PDF'}
            </Button>
          </div>
        </>
      )}

      {propuestas.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Ya mandadas</h2>
          <ul className="glass flex flex-col divide-y divide-white/5 rounded-2xl">
            {propuestas.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 p-3 sm:p-4"
              >
                <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs tabular-nums text-muted-foreground">
                  {numeroPropuesta(p.numero)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.clienteNombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.titulo} · {formatDate(p.emitidaOn)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {p.moneda}{' '}
                  {new Intl.NumberFormat('es-AR', {
                    maximumFractionDigits: 0,
                  }).format(p.total)}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Volver a bajar la propuesta ${numeroPropuesta(p.numero)}`}
                  title="Volver a bajar"
                  onClick={() => void volverABajar(p.id)}
                >
                  <FileDown />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

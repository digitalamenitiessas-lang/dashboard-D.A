'use client'

/**
 * El papel de Digital Amenities: lo que comparten todos los documentos que
 * salen para afuera.
 *
 * Esto vivía adentro de `lib/recibo.ts`, que era el único PDF del sistema.
 * Al aparecer el segundo —las propuestas— quedaban dos caminos: copiar los
 * helpers, y que el día que cambie el logo o el margen haya que acordarse de
 * los dos lugares; o sacarlos acá. Se sacaron acá.
 *
 * Todo se arma en el navegador y no en el servidor porque el destino habitual
 * es mandarlo por WhatsApp desde el celular: generarlo del lado del cliente
 * permite pasárselo directo a la hoja de compartir del sistema, sin que el
 * archivo dé la vuelta por ningún lado.
 */

import { BRAND_NAME, BRAND_PATH, BRAND_VIEWBOX } from './brand'

/** El tipo del documento de jspdf, sin cargar la librería para tenerlo. */
type Doc = InstanceType<typeof import('jspdf').jsPDF>

// ---------------------------------------------------------------------
// Medidas y paleta
//
// Milímetros sobre A4. Son los números del recibo, que es el documento que
// ya está en producción: cualquier papel nuevo arranca igual para que los
// dos se vean de la misma familia.
// ---------------------------------------------------------------------

export const TINTA = '#111111'
export const GRIS = '#6b7280'

export const M = 20 // margen
export const ANCHO = 210
export const ALTO = 297
export const UTIL = ANCHO - M * 2

/**
 * La `y` más baja donde todavía se puede escribir cuerpo. Debajo de eso está
 * la franja del pie, que se pinta aparte y no se puede pisar.
 */
export const PISO = ALTO - M - 12

// ---------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------

/**
 * Con centavos, a diferencia de `formatMoney()` de `lib/format.ts`, que
 * redondea a entero. Un documento que va a un cliente los necesita: en un
 * papel firmado, «305.000» y «305.000,50» no son lo mismo.
 */
export const miles = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')))

/**
 * Deja el texto en lo que las fuentes base de jsPDF saben dibujar.
 *
 * jsPDF con Helvetica codifica en WinAnsi (Latin-1). Una comilla tipográfica,
 * una raya larga, unos puntos suspensivos de un solo carácter o cualquier
 * emoji no salen mal: salen como basura, o directamente no salen — y nadie lo
 * ve hasta que el PDF ya está en el teléfono del cliente.
 *
 * Importa sobre todo en textos que escribió un modelo de lenguaje, que produce
 * “comillas curvas” y rayas largas sin que nadie se lo pida. El prompt también
 * lo pide, pero pedirlo no es garantizarlo.
 */
export function sanear(texto: string): string {
  return texto
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/€/g, 'EUR ')
    // Lo que sobrevive a todo lo anterior y sigue fuera de Latin-1 no se puede
    // dibujar. Se tira: un cuadradito negro en una propuesta es peor que una
    // palabra de menos.
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '')
}

// ---------------------------------------------------------------------
// El logo
// ---------------------------------------------------------------------

/**
 * El monograma como PNG, a la resolución que se le pida.
 *
 * Se pide bien grande (el triple del tamaño impreso) porque el PDF lo
 * escala y un logo pixelado en un comprobante se nota enseguida.
 *
 * Se rasteriza a partir del mismo path que usa el header de la app
 * (`lib/brand.ts`): jsPDF no dibuja paths SVG, y mandar una imagen aparte
 * significaría que el logo del papel y el de la pantalla puedan quedar
 * distintos.
 */
export function monogramaPng(alturaPx: number, color: string): string | null {
  if (typeof document === 'undefined') return null
  const escala = alturaPx / BRAND_VIEWBOX.height
  const anchoPx = Math.ceil(BRAND_VIEWBOX.width * escala)

  const canvas = document.createElement('canvas')
  canvas.width = anchoPx
  canvas.height = alturaPx
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof Path2D === 'undefined') return null

  ctx.scale(escala, escala)
  ctx.fillStyle = color
  ctx.fill(new Path2D(BRAND_PATH))
  return canvas.toDataURL('image/png')
}

/** El ancho impreso que le corresponde a un monograma de tal alto. */
export const anchoLogo = (alto: number) =>
  (BRAND_VIEWBOX.width / BRAND_VIEWBOX.height) * alto

// ---------------------------------------------------------------------
// El encabezado de marca
// ---------------------------------------------------------------------

/**
 * Membrete + título del documento + los datos de la derecha, y la línea que
 * los separa del cuerpo. Devuelve la `y` donde empieza el cuerpo.
 *
 * `alias` es el nombre con el que jsPDF guarda el PNG del logo adentro del
 * archivo. En un documento de una hoja da igual, y por eso el recibo no lo
 * manda: sin alias, jsPDF vuelve a incrustar la imagen entera **en cada
 * página**, y una propuesta de siete hojas pasa de unos 40 kB a más de medio
 * mega. Con alias, la incrusta una vez y después la referencia.
 */
export function encabezado(
  doc: Doc,
  y: number,
  opts: { titulo: string; referencia?: string; fecha?: string; alias?: string },
): number {
  const logo = monogramaPng(240, TINTA)
  if (logo) {
    const alto = 16
    if (opts.alias) {
      doc.addImage(logo, 'PNG', M, y, anchoLogo(alto), alto, opts.alias, 'FAST')
    } else {
      doc.addImage(logo, 'PNG', M, y, anchoLogo(alto), alto)
    }
  }

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(TINTA)
  doc.text(BRAND_NAME.toUpperCase(), M + 16, y + 7)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text('Desarrollo de software', M + 16, y + 11.5)

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(TINTA)
  doc.text(opts.titulo, ANCHO - M, y + 6, { align: 'right' })
  if (opts.referencia) {
    doc.setFontSize(11)
    doc.text(opts.referencia, ANCHO - M, y + 12.5, { align: 'right' })
  }
  if (opts.fecha) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
    doc.text(opts.fecha, ANCHO - M, y + 17.5, { align: 'right' })
  }

  y += 26
  doc.setDrawColor(TINTA).setLineWidth(0.6).line(M, y, ANCHO - M, y)
  return y + 12
}

// ---------------------------------------------------------------------
// La hoja: el cursor que sabe pasar de página
//
// El recibo entra siempre en una carilla y por eso no necesitaba nada de
// esto. Una propuesta larga no: hay que poder escribir sin pensar dónde
// termina el papel.
// ---------------------------------------------------------------------

export interface Hoja {
  doc: Doc
  /** Dónde se escribe lo próximo. Mutable a propósito. */
  y: number
  /** El alias del logo, para no re-incrustarlo en cada página. */
  readonly alias: string
}

/**
 * Si el bloque de `alto` mm no entra en lo que queda de página, salta a la
 * siguiente y deja un membrete flaco arriba. Devuelve si saltó, que es lo que
 * necesita saber una tabla para repetir su cabecera.
 *
 * Es para **bloques atómicos**: una fila, un recuadro, un título. Nunca para
 * un párrafo entero — uno de noventa líneas no entra en ninguna página y
 * saltaría para siempre. Los párrafos se paginan renglón por renglón, ver
 * `parrafo()`.
 */
export function asegurarEspacio(h: Hoja, alto: number): boolean {
  if (h.y + alto <= PISO) return false

  h.doc.addPage()
  const logo = monogramaPng(120, GRIS)
  if (logo) {
    const alto = 7
    h.doc.addImage(logo, 'PNG', M, M - 2, anchoLogo(alto), alto, h.alias, 'FAST')
  }
  h.doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  h.doc.text(BRAND_NAME, M + 8, M + 3)
  h.y = M + 14
  return true
}

/**
 * Un párrafo, paginado renglón por renglón. Devuelve cuánto bajó la `y`.
 */
export function parrafo(
  h: Hoja,
  texto: string,
  opts: {
    size?: number
    estilo?: 'normal' | 'bold' | 'italic'
    color?: string
    interlinea?: number
    sangria?: number
  } = {},
): void {
  const size = opts.size ?? 9.5
  const interlinea = opts.interlinea ?? size * 0.48
  const sangria = opts.sangria ?? 0
  const limpio = sanear(texto).trim()
  if (!limpio) return

  h.doc
    .setFont('helvetica', opts.estilo ?? 'normal')
    .setFontSize(size)
    .setTextColor(opts.color ?? TINTA)

  const lineas = h.doc.splitTextToSize(limpio, UTIL - sangria) as string[]
  for (const linea of lineas) {
    if (asegurarEspacio(h, interlinea)) {
      // Saltar de página resetea la fuente al estado que dejó el membrete.
      h.doc
        .setFont('helvetica', opts.estilo ?? 'normal')
        .setFontSize(size)
        .setTextColor(opts.color ?? TINTA)
    }
    h.doc.text(linea, M + sangria, h.y)
    h.y += interlinea
  }
}

/**
 * Un ítem de lista con viñeta, paginado.
 *
 * La viñeta se dibuja como un círculo y no como el carácter «•»: ese carácter
 * queda fuera de Latin-1 y `sanear()` lo tiraría, o peor, saldría distinto
 * según la fuente. Un `circle()` se ve igual en todos lados.
 */
export function vineta(h: Hoja, texto: string, size = 9.5): void {
  const interlinea = size * 0.48
  const limpio = sanear(texto).trim()
  if (!limpio) return

  const fijarFuente = () =>
    h.doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(TINTA)

  fijarFuente()
  const lineas = h.doc.splitTextToSize(limpio, UTIL - 5) as string[]

  lineas.forEach((linea, i) => {
    // Saltar de página resetea la fuente al estado que dejó el membrete.
    if (asegurarEspacio(h, interlinea)) fijarFuente()
    if (i === 0) {
      // Después del posible salto, para que el punto acompañe al renglón.
      h.doc.setFillColor(GRIS).circle(M + 1.4, h.y - size * 0.11, 0.5, 'F')
      fijarFuente()
    }
    h.doc.text(linea, M + 5, h.y)
    h.y += interlinea
  })

  h.y += 1.5
}

/**
 * La última pasada, justo antes de cerrar el archivo.
 *
 * jsPDF sabe cuántas páginas hay recién cuando terminaste de escribir, así que
 * el «Página 3 de 7» no se puede pintar sobre la marcha. Se recorren todas al
 * final con `setPage()`.
 *
 * Ojo: `setPage()` **no** restaura el estado gráfico. Si no se vuelve a fijar
 * fuente, tamaño y color adentro del bucle, el pie hereda lo último que se
 * haya pintado en el documento — que puede ser un título de 24 puntos.
 */
export function numerarPaginas(
  doc: Doc,
  opts: { pie: string; desde?: number },
): void {
  const total = doc.getNumberOfPages()
  for (let p = opts.desde ?? 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(sanear(opts.pie), M, 282)
    if (total > 1) {
      doc.text(`Página ${p} de ${total}`, ANCHO - M, 282, { align: 'right' })
    }
  }
}

// ---------------------------------------------------------------------
// La entrega
// ---------------------------------------------------------------------

/**
 * ¿Conviene abrir la hoja de compartir del sistema, o descargar y listo?
 *
 * En el teléfono conviene: es el camino a WhatsApp, que es como termina
 * llegándole el papel al cliente. En una computadora no. Chrome y Edge en
 * Windows declaran `canShare` igual, así que preguntarle sólo a él abría el
 * panel de compartir de Windows: un rodeo largo para algo que en un
 * escritorio se espera que sea una descarga y nada más.
 *
 * `userAgentData.mobile` es el dato directo, pero lo dan sólo los navegadores
 * Chromium. Para el resto —Safari incluido, que es justo el que importa en
 * iPhone y iPad— se mira el puntero: `coarse` es un dedo. Un notebook con
 * pantalla táctil y mouse reporta `fine`, así que no se hace pasar por
 * teléfono.
 */
function conviene_compartir(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false
  }

  const ua = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData
  if (typeof ua?.mobile === 'boolean') return ua.mobile

  return (
    window.matchMedia?.('(pointer: coarse)').matches === true &&
    navigator.maxTouchPoints > 0
  )
}

/**
 * Lo entrega por donde se pueda: la hoja de compartir del sistema en el
 * celular, una descarga en la computadora.
 *
 * `navigator.share` exige el gesto del usuario, y el `await` del import de
 * jsPDF lo consume en Safari. Por eso el que llama tiene que haber
 * precargado el módulo con `precargarPdf()` al abrir la pantalla: así el
 * import ya está resuelto y el click llega entero hasta acá.
 */
export async function entregarPdf(
  blob: Blob,
  nombre: string,
  compartir: { title: string; text: string },
): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const archivo = new File([blob], nombre, { type: 'application/pdf' })

  if (conviene_compartir() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], ...compartir })
      return 'compartido'
    } catch (e) {
      // Cerrar la hoja de compartir tira AbortError. No es un error que
      // haya que mostrarle a nadie: el usuario decidió no mandarlo.
      if ((e as Error)?.name === 'AbortError') return 'cancelado'
      // Cualquier otra cosa (permisos, tipo no soportado) cae a la descarga.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  // El revoke inmediato le gana a la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'descargado'
}

/** Resuelve el import pesado antes de que haga falta. Ver `entregarPdf`. */
export function precargarPdf() {
  void import('jspdf')
}

/** Abre un A4 vacío con el cursor arriba de todo. */
export async function nuevaHoja(alias = 'da-mono'): Promise<Hoja> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  return { doc: doc as unknown as Doc, y: M, alias }
}

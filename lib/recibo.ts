'use client'

/**
 * El recibo que se le entrega al cliente, en PDF.
 *
 * Queda acá sólo lo que es del recibo: su forma, su layout y el importe en
 * letras. El papel compartido con los demás documentos —el membrete, la
 * paleta, el monograma, la entrega— vive en `lib/pdf.ts`.
 *
 * Se arma en el navegador y no en el servidor porque el destino habitual
 * es mandarlo por WhatsApp desde el celular: generarlo acá permite
 * pasárselo directo a la hoja de compartir del sistema, sin que el
 * archivo dé la vuelta por ningún lado. En la computadora, donde no hay
 * hoja de compartir, se descarga.
 */

import { BRAND_NAME } from './brand'
import {
  ANCHO,
  GRIS,
  M,
  TINTA,
  UTIL,
  encabezado,
  entregarPdf,
  fechaLarga,
  miles,
} from './pdf'
import type { Currency } from './types'

// Lo importa `components/cobros/recibo-button.tsx` desde acá: el botón no
// tiene por qué saber que el PDF se dibuja en otro módulo.
export { precargarPdf } from './pdf'

export interface Recibo {
  id: string
  numero: number
  paymentId: string
  emitidoOn: string
  clienteNombre: string
  concepto: string
  importe: number
  moneda: Currency
  /** Cuánto saldaba de la deuda original, cuando se cobró en otra moneda. */
  importeSaldado: number | null
  monedaSaldada: Currency | null
  cotizacion: number | null
  facturaNumero: string
  notas: string
}

const NOMBRE_MONEDA: Record<Currency, { singular: string; plural: string; centavos: string }> = {
  ARS: { singular: 'peso', plural: 'pesos', centavos: 'centavos' },
  USD: { singular: 'dólar', plural: 'dólares', centavos: 'centavos' },
  EUR: { singular: 'euro', plural: 'euros', centavos: 'céntimos' },
}

// ---------------------------------------------------------------------
// Importe en letras
//
// Va en el recibo porque es lo que vuelve difícil discutir una cifra
// después: un "1.530" mal leído es ambiguo, "mil quinientos treinta" no.
// ---------------------------------------------------------------------

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
const DIEZ_A_QUINCE = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince']
const DIECI = ['', '', '', '', '', '', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

/** 0–999 en letras. `apocope` convierte "uno" en "un" (un mil, veintiún mil). */
function centenasEnLetras(n: number, apocope = false): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'

  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c > 0) partes.push(CENTENAS[c])

  if (resto > 0) {
    if (resto < 10) {
      partes.push(apocope && resto === 1 ? 'un' : UNIDADES[resto])
    } else if (resto <= 15) {
      partes.push(DIEZ_A_QUINCE[resto - 10])
    } else if (resto < 20) {
      // Dieciséis lleva tilde; diecisiete, dieciocho y diecinueve no.
      partes.push(DIECI[resto - 10])
    } else if (resto < 30) {
      // Los veinti- van pegados: veintiuno, veintidós, veintitrés.
      const u = resto - 20
      if (u === 0) partes.push('veinte')
      else if (u === 1) partes.push(apocope ? 'veintiún' : 'veintiuno')
      else if (u === 2) partes.push('veintidós')
      else if (u === 3) partes.push('veintitrés')
      else if (u === 6) partes.push('veintiséis')
      else partes.push('veinti' + UNIDADES[u])
    } else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${apocope && u === 1 ? 'un' : UNIDADES[u]}`)
    }
  }

  return partes.join(' ')
}

/**
 * La parte entera en letras. Hasta miles de millones, de sobra para acá.
 *
 * `apocope` es para cuando le sigue el nombre de la moneda: se dice «un
 * peso» y «veintiún pesos», no «uno peso». Lo pide el llamador porque el
 * mismo número suelto sí es «uno».
 */
export function enteroEnLetras(n: number, apocope = false): string {
  if (n === 0) return 'cero'

  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []

  if (millones > 0) {
    partes.push(
      millones === 1 ? 'un millón' : `${centenasEnLetras(millones, true)} millones`,
    )
  }
  if (miles > 0) {
    partes.push(miles === 1 ? 'mil' : `${centenasEnLetras(miles, true)} mil`)
  }
  // La apócope sólo le toca al último grupo, que es el que queda pegado al
  // sustantivo: «un millón doscientos un pesos».
  if (resto > 0) partes.push(centenasEnLetras(resto, apocope))

  return partes.join(' ')
}

/** ¿Un millón redondo? Entonces va «de»: «dos millones DE pesos». */
const pideDe = (n: number) => n >= 1_000_000 && n % 1_000_000 === 0

/** «USD 1.530,50» → «un mil quinientos treinta dólares con cincuenta centavos». */
export function importeEnLetras(monto: number, moneda: Currency): string {
  const nombre = NOMBRE_MONEDA[moneda] ?? NOMBRE_MONEDA.USD
  const entero = Math.floor(Math.abs(monto))
  // Los centavos se redondean, no se truncan: el recibo tiene que decir
  // exactamente el número que figura en cifras, arriba.
  const centavos = Math.round((Math.abs(monto) - entero) * 100)

  const de = pideDe(entero) ? 'de ' : ''
  const texto =
    `${enteroEnLetras(entero, true)} ${de}` +
    `${entero === 1 ? nombre.singular : nombre.plural}`

  if (centavos === 0) return texto

  // «con un centavo», no «con uno centavos».
  const nombreCentavo =
    centavos === 1 ? nombre.centavos.replace(/s$/, '') : nombre.centavos
  return `${texto} con ${enteroEnLetras(centavos, true)} ${nombreCentavo}`
}

/** «0001». Cuatro dígitos, que es lo que hace que un talonario se vea serio. */
export const numeroFormateado = (n: number) => String(n).padStart(4, '0')

// ---------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------

export async function construirReciboPdf(recibo: Recibo): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  let y = encabezado(doc, M, {
    titulo: 'RECIBO',
    referencia: `N° ${numeroFormateado(recibo.numero)}`,
    fecha: fechaLarga(recibo.emitidoOn),
  })

  // ---- A quién y por qué -------------------------------------------
  const dato = (etiqueta: string, valor: string) => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text(etiqueta.toUpperCase(), M, y)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(TINTA)
    const lineas = doc.splitTextToSize(valor, UTIL) as string[]
    doc.text(lineas, M, y + 5)
    y += 5 + lineas.length * 5.5 + 5
  }

  dato('Recibimos de', recibo.clienteNombre)
  dato('En concepto de', recibo.concepto)
  if (recibo.facturaNumero) dato('Factura', recibo.facturaNumero)

  // ---- El importe ----------------------------------------------------
  y += 2
  const altoCaja = recibo.cotizacion ? 34 : 26
  doc.setFillColor(245, 245, 245).setDrawColor(220, 220, 220).setLineWidth(0.3)
  doc.roundedRect(M, y, UTIL, altoCaja, 2, 2, 'FD')

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text('IMPORTE RECIBIDO', M + 6, y + 8)
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(TINTA)
  doc.text(`${recibo.moneda} ${miles(recibo.importe)}`, M + 6, y + 18)

  // La conversión, cuando se cobró en una moneda distinta a la facturada.
  // Es el dato que evita la discusión tres meses después.
  if (recibo.cotizacion && recibo.importeSaldado && recibo.monedaSaldada) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(GRIS)
    doc.text(
      `Cancela ${recibo.monedaSaldada} ${miles(recibo.importeSaldado)} — cotización ${miles(recibo.cotizacion)} (Banco Nación)`,
      M + 6,
      y + 27,
    )
  }
  y += altoCaja + 8

  // ---- En letras -----------------------------------------------------
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text('SON', M, y)
  doc.setFont('helvetica', 'italic').setFontSize(10).setTextColor(TINTA)
  const letras = doc.splitTextToSize(
    importeEnLetras(recibo.importe, recibo.moneda).replace(/^./, (c) => c.toUpperCase()) + '.',
    UTIL,
  ) as string[]
  doc.text(letras, M, y + 5)
  y += 5 + letras.length * 5 + 8

  if (recibo.notas) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text('OBSERVACIONES', M, y)
    doc.setFontSize(9.5).setTextColor(TINTA)
    const notas = doc.splitTextToSize(recibo.notas, UTIL) as string[]
    doc.text(notas, M, y + 5)
    y += 5 + notas.length * 4.5 + 6
  }

  // ---- Firma ---------------------------------------------------------
  const yFirma = Math.max(y + 18, 200)
  doc.setDrawColor(180, 180, 180).setLineWidth(0.3)
  doc.line(ANCHO - M - 60, yFirma, ANCHO - M, yFirma)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text(BRAND_NAME, ANCHO - M - 30, yFirma + 4.5, { align: 'center' })

  // ---- Pie -----------------------------------------------------------
  doc.setFontSize(7.5).setTextColor(GRIS)
  doc.text(
    'Documento no válido como factura. Comprobante de pago emitido por Digital Amenities.',
    ANCHO / 2,
    282,
    { align: 'center' },
  )

  return doc.output('blob')
}

export const nombreArchivo = (recibo: Recibo) =>
  `Recibo-${numeroFormateado(recibo.numero)}-${recibo.clienteNombre.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`

/** Arma el PDF y lo entrega: hoja de compartir en el celular, descarga en la compu. */
export async function entregarRecibo(
  recibo: Recibo,
): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const blob = await construirReciboPdf(recibo)
  const n = numeroFormateado(recibo.numero)
  return entregarPdf(blob, nombreArchivo(recibo), {
    title: `Recibo N° ${n}`,
    text: `Recibo N° ${n} — ${BRAND_NAME}`,
  })
}

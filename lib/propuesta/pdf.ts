'use client'

/**
 * La propuesta en PDF, en sus dos formas.
 *
 * El presupuesto corto es una carilla con los números, para cotizar rápido por
 * WhatsApp. La propuesta larga lleva portada, presentación, alcance y etapas,
 * para cuando el cliente pide algo formal. Comparten el mismo dato y los
 * mismos bloques: cambia qué se imprime, no qué existe.
 *
 * El papel —membrete, paleta, paginado, entrega— sale de `lib/pdf.ts`, que es
 * el mismo que usa el recibo.
 */

import { BRAND_NAME } from '@/lib/brand'
import {
  ANCHO,
  GRIS,
  type Hoja,
  M,
  TINTA,
  UTIL,
  anchoLogo,
  asegurarEspacio,
  encabezado,
  entregarPdf,
  fechaLarga,
  miles,
  monogramaPng,
  nuevaHoja,
  numerarPaginas,
  parrafo,
  sanear,
  vineta,
} from '@/lib/pdf'
import { todayIso } from '@/lib/format'
import {
  type Plantilla,
  type Propuesta,
  itemsSinPrecio,
  totalPropuesta,
} from './schema'

export { precargarPdf } from '@/lib/pdf'

/** «0001», igual que el talonario de recibos. */
export const numeroPropuesta = (n: number) => String(n).padStart(4, '0')

// ---------------------------------------------------------------------
// La tabla de ítems
//
// Se dibuja a mano. No hay jspdf-autotable en el proyecto y no hace falta
// agregarlo para cuatro columnas: lo único que la librería resolvería es
// justo lo que acá hay que controlar, que es el corte entre páginas.
// ---------------------------------------------------------------------

const COL = {
  desc: M,
  anchoDesc: 86,
  cant: M + 102,   // borde derecho
  unit: M + 136,   // borde derecho
  imp: M + 170,    // borde derecho, contra el margen
} as const

function cabeceraTabla(h: Hoja, moneda: string): void {
  h.doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(GRIS)
  h.doc.text('DETALLE', COL.desc, h.y)
  h.doc.text('CANT.', COL.cant, h.y, { align: 'right' })
  h.doc.text(`UNITARIO (${moneda})`, COL.unit, h.y, { align: 'right' })
  h.doc.text(`IMPORTE (${moneda})`, COL.imp, h.y, { align: 'right' })
  h.y += 2.5
  h.doc.setDrawColor(210, 210, 210).setLineWidth(0.3)
  h.doc.line(M, h.y, ANCHO - M, h.y)
  h.y += 5
}

function tablaItems(h: Hoja, p: Propuesta): void {
  asegurarEspacio(h, 20)
  cabeceraTabla(h, p.moneda)

  for (const item of p.items) {
    h.doc.setFont('helvetica', 'normal').setFontSize(9.5)
    const desc = h.doc.splitTextToSize(
      sanear(item.descripcion) || 'Sin detalle',
      COL.anchoDesc,
    ) as string[]
    const detalle = item.detalle
      ? (h.doc.splitTextToSize(sanear(item.detalle), COL.anchoDesc) as string[])
      : []

    // La fila entera se pide de una: una fila partida al medio por un salto de
    // página es exactamente lo que hace que una tabla no se pueda leer.
    const alto = desc.length * 4.6 + detalle.length * 3.8 + 3
    if (asegurarEspacio(h, alto)) cabeceraTabla(h, p.moneda)

    h.doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(TINTA)
    h.doc.text(desc, COL.desc, h.y)

    const importe =
      item.precioUnitario === null ? null : item.cantidad * item.precioUnitario

    h.doc.text(String(item.cantidad), COL.cant, h.y, { align: 'right' })
    h.doc.text(
      item.precioUnitario === null ? '—' : miles(item.precioUnitario),
      COL.unit,
      h.y,
      { align: 'right' },
    )
    h.doc.setFont('helvetica', 'bold')
    h.doc.text(importe === null ? '—' : miles(importe), COL.imp, h.y, {
      align: 'right',
    })

    h.y += desc.length * 4.6

    if (detalle.length) {
      h.doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
      h.doc.text(detalle, COL.desc, h.y)
      h.y += detalle.length * 3.8
    }
    h.y += 3
  }
}

function bloqueTotal(h: Hoja, p: Propuesta): void {
  const total = totalPropuesta(p.items)
  const sinPrecio = itemsSinPrecio(p.items)
  const alto = sinPrecio ? 22 : 16

  asegurarEspacio(h, alto + 4)
  h.y += 2

  h.doc.setFillColor(245, 245, 245).setDrawColor(220, 220, 220).setLineWidth(0.3)
  h.doc.roundedRect(M, h.y, UTIL, alto, 2, 2, 'FD')

  h.doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  h.doc.text(
    p.incluyeImpuestos ? 'TOTAL (IMPUESTOS INCLUIDOS)' : 'TOTAL + IMPUESTOS',
    M + 6,
    h.y + 7,
  )
  h.doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(TINTA)
  // Siempre con el código de moneda: USD y ARS comparten el «$», y un «$625»
  // en un papel que sale para afuera se lee como pesos.
  h.doc.text(`${p.moneda} ${miles(total)}`, ANCHO - M - 6, h.y + 9.5, {
    align: 'right',
  })

  if (sinPrecio) {
    // Que el papel diga la verdad sale más barato que un total silenciosamente
    // incompleto.
    h.doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    h.doc.text(
      `No incluye ${sinPrecio} ${sinPrecio === 1 ? 'ítem sin precio definido' : 'ítems sin precio definido'}.`,
      M + 6,
      h.y + 17,
    )
  }

  h.y += alto + 8
}

// ---------------------------------------------------------------------
// Bloques de texto
// ---------------------------------------------------------------------

function seccion(h: Hoja, titulo: string): void {
  // Reserva el título más dos renglones: un encabezado solo al pie de una
  // página, con su contenido en la siguiente, se lee como un error.
  asegurarEspacio(h, 16)
  h.y += 3
  h.doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(TINTA)
  h.doc.text(sanear(titulo).toUpperCase(), M, h.y)
  h.y += 2
  h.doc.setDrawColor(210, 210, 210).setLineWidth(0.3)
  h.doc.line(M, h.y, ANCHO - M, h.y)
  h.y += 6
}

function lista(h: Hoja, titulo: string, entradas: string[]): void {
  const limpias = entradas.map((e) => e.trim()).filter(Boolean)
  if (!limpias.length) return
  seccion(h, titulo)
  for (const entrada of limpias) vineta(h, entrada)
  h.y += 3
}

function etapas(h: Hoja, p: Propuesta): void {
  const conDatos = p.etapas.filter((e) => e.nombre.trim() || e.descripcion.trim())
  if (!conDatos.length) return
  seccion(h, 'Etapas y plazos')

  conDatos.forEach((etapa, i) => {
    asegurarEspacio(h, 12)
    h.doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(TINTA)
    h.doc.text(`${i + 1}. ${sanear(etapa.nombre) || 'Etapa'}`, M, h.y)
    if (etapa.plazo.trim()) {
      h.doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(GRIS)
      h.doc.text(sanear(etapa.plazo), ANCHO - M, h.y, { align: 'right' })
    }
    h.y += 5
    if (etapa.descripcion.trim()) {
      parrafo(h, etapa.descripcion, { size: 9, color: GRIS, sangria: 5 })
    }
    h.y += 3
  })
}

/** La portada de la propuesta larga. Sin membrete: el logo es el protagonista. */
function portada(h: Hoja, p: Propuesta): void {
  const logo = monogramaPng(600, TINTA)
  if (logo) {
    const alto = 34
    h.doc.addImage(
      logo, 'PNG', (ANCHO - anchoLogo(alto)) / 2, 78, anchoLogo(alto), alto,
      h.alias, 'FAST',
    )
  }

  h.doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(GRIS)
  h.doc.text(BRAND_NAME.toUpperCase(), ANCHO / 2, 124, { align: 'center' })

  h.doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(TINTA)
  const titulo = h.doc.splitTextToSize(
    sanear(p.titulo) || 'Propuesta de trabajo',
    UTIL - 20,
  ) as string[]
  h.doc.text(titulo, ANCHO / 2, 158, { align: 'center' })

  const destinatario = p.cliente.empresa.trim() || p.cliente.nombre.trim()
  if (destinatario) {
    h.doc.setFont('helvetica', 'normal').setFontSize(12).setTextColor(GRIS)
    h.doc.text(
      `Preparada para ${sanear(destinatario)}`,
      ANCHO / 2,
      158 + titulo.length * 9 + 6,
      { align: 'center' },
    )
  }

  h.doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
  h.doc.text(fechaLarga(todayIso()), ANCHO / 2, 250, { align: 'center' })

  h.doc.addPage()
  h.y = M
}

/** Cliente, validez y plazo: el bloque de datos que abre el cuerpo. */
function datosCliente(h: Hoja, p: Propuesta): void {
  const filas: [string, string][] = []
  const quien = [p.cliente.nombre, p.cliente.empresa]
    .map((x) => x.trim())
    .filter(Boolean)
  if (quien.length) filas.push(['Para', quien.join(' · ')])
  if (p.cliente.contacto.trim()) filas.push(['Contacto', p.cliente.contacto])
  if (p.plazoEntrega.trim()) filas.push(['Plazo de entrega', p.plazoEntrega])

  for (const [etiqueta, valor] of filas) {
    asegurarEspacio(h, 11)
    h.doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    h.doc.text(etiqueta.toUpperCase(), M, h.y)
    h.doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(TINTA)
    const lineas = h.doc.splitTextToSize(sanear(valor), UTIL) as string[]
    h.doc.text(lineas, M, h.y + 4.5)
    h.y += 4.5 + lineas.length * 5 + 4
  }
  h.y += 2
}

function cierre(h: Hoja, p: Propuesta): void {
  lista(h, 'Forma de pago', p.formaDePago)

  if (p.validezDias !== null) {
    asegurarEspacio(h, 10)
    h.doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
    h.doc.text(
      `Esta propuesta tiene una validez de ${p.validezDias} ${p.validezDias === 1 ? 'día' : 'días'} desde la fecha de emisión.`,
      M,
      h.y,
    )
    h.y += 8
  }

  if (p.notas.trim()) {
    seccion(h, 'Notas')
    parrafo(h, p.notas, { size: 9 })
  }
}

// ---------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------

export async function construirPropuestaPdf(
  p: Propuesta,
  numero: number,
  plantilla: Plantilla,
): Promise<Blob> {
  const h = await nuevaHoja()
  const ref = `N° ${numeroPropuesta(numero)}`

  if (plantilla === 'larga') {
    portada(h, p)
    h.y = encabezado(h.doc, M, { titulo: 'PROPUESTA', referencia: ref, alias: h.alias })

    datosCliente(h, p)
    if (p.presentacion.trim()) {
      seccion(h, 'Presentación')
      parrafo(h, p.presentacion)
      h.y += 3
    }
    if (p.resumen.trim()) {
      seccion(h, 'Objetivo')
      parrafo(h, p.resumen)
      h.y += 3
    }
    lista(h, 'Alcance del trabajo', p.alcance)
    lista(h, 'Fuera de alcance', p.fueraDeAlcance)
    etapas(h, p)

    seccion(h, 'Honorarios')
    tablaItems(h, p)
    bloqueTotal(h, p)

    cierre(h, p)
    lista(h, 'Supuestos', p.supuestos)
  } else {
    h.y = encabezado(h.doc, M, {
      titulo: 'PRESUPUESTO',
      referencia: ref,
      fecha: fechaLarga(todayIso()),
      alias: h.alias,
    })

    if (p.titulo.trim()) {
      h.doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(TINTA)
      const t = h.doc.splitTextToSize(sanear(p.titulo), UTIL) as string[]
      h.doc.text(t, M, h.y)
      h.y += t.length * 6 + 4
    }
    if (p.resumen.trim()) {
      parrafo(h, p.resumen, { size: 9, color: GRIS })
      h.y += 4
    }

    datosCliente(h, p)
    tablaItems(h, p)
    bloqueTotal(h, p)
    cierre(h, p)
  }

  // Al final de todo: recién acá jspdf sabe cuántas páginas hay. `desde: 2`
  // deja la portada sin folio, que es lo que se espera de una portada.
  numerarPaginas(h.doc, {
    pie: `${BRAND_NAME} · Propuesta ${numeroPropuesta(numero)}`,
    desde: plantilla === 'larga' ? 2 : 1,
  })

  return h.doc.output('blob')
}

export const nombreArchivoPropuesta = (p: Propuesta, numero: number) => {
  const quien = (p.cliente.empresa.trim() || p.cliente.nombre.trim() || 'Cliente')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
  return `Propuesta-${numeroPropuesta(numero)}-${quien}.pdf`
}

export async function entregarPropuesta(
  p: Propuesta,
  numero: number,
  plantilla: Plantilla,
): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const blob = await construirPropuestaPdf(p, numero, plantilla)
  const n = numeroPropuesta(numero)
  return entregarPdf(blob, nombreArchivoPropuesta(p, numero), {
    title: `Propuesta N° ${n}`,
    text: `Propuesta N° ${n} — ${BRAND_NAME}`,
  })
}

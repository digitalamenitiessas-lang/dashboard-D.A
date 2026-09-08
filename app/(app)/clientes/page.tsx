import { redirect } from 'next/navigation'

/**
 * Clientes dejó de ser una pantalla propia: ahora es una pestaña de
 * /proyectos, porque un cliente sin sus proyectos no dice nada.
 *
 * La ruta sobrevive sólo como redirección. No es cortesía: la URL está en
 * marcadores, en el historial del navegador de cada celular y en la pantalla
 * de inicio de quien instaló la PWA. Un 404 ahí sería un «se rompió la app»
 * para alguien que no cambió nada.
 */
export default function ClientesPage() {
  redirect('/proyectos?vista=clientes')
}

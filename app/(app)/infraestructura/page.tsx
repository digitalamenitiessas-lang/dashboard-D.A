import { redirect } from 'next/navigation'

/**
 * Infraestructura dejó de ser una sección propia.
 *
 * Mostraba tres cosas —vencimiento de dominios, servicios externos y
 * automatizaciones— y sólo la primera hacía algo: alimentar el aviso de
 * «dominio por vencer». Las otras dos eran información de referencia que ya
 * se ve en la pestaña Infra de cada proyecto, que es además donde se edita.
 *
 * Lo que NO se fue: los datos, la pestaña del proyecto, y el aviso de
 * dominios en la campana y en el push diario. Se fue la pantalla que los
 * repetía.
 *
 * La ruta sobrevive como redirección porque el push de «dominio por vencer»
 * apunta acá (`revisar_vencimientos()` en supabase/20_push.sql): tocar esa
 * notificación tiene que llevar a algún lado, no a un 404.
 */
export default function InfraestructuraPage() {
  redirect('/proyectos')
}

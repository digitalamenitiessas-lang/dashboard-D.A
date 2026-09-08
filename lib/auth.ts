import type { User } from '@supabase/supabase-js'

/** La ruta donde se elige una contraseña propia. Sin ñ ni acentos: es una URL. */
export const RUTA_CAMBIAR_PASSWORD = '/cambiar-contrasena'

/**
 * Mínimo de caracteres: los mismos 6 que Supabase acepta por defecto.
 *
 * Que coincidan no es casualidad ni pereza, es lo que evita el peor de los
 * dos errores posibles. Si acá se pidiera MENOS que allá, la persona pasaría
 * la validación de la pantalla y el rebote vendría del servidor, en inglés y
 * después de haber escrito dos veces la contraseña. Si se pidiera más —como
 * estaba— la pantalla rechazaría contraseñas que el sistema acepta, sin más
 * autoridad que una preferencia escrita acá.
 *
 * Si algún día se sube el mínimo, hay que subirlo en los DOS lados: acá y en
 * Authentication → Providers → Email del panel de Supabase.
 */
export const PASSWORD_MIN = 6

/**
 * Marca en los metadatos del usuario con el momento en que eligió su propia
 * contraseña. Ausente = todavía usa la provisoria que le pusieron.
 */
const MARCA = 'password_changed_at'

/**
 * ¿Esta persona todavía está usando la contraseña que le pusieron a mano?
 *
 * La marca dice «YA la cambió», no «tiene que cambiarla», y esa inversión es
 * deliberada por dos motivos:
 *
 * 1. El panel de Supabase, en Add user, sólo pide email, contraseña y Auto
 *    Confirm: no hay campo de metadatos. Con la marca al revés, dar de alta
 *    a alguien exigiría acordarse de correr un UPDATE sobre `auth.users`
 *    después de cada alta — el paso que uno se olvida justo cuando tiene
 *    apuro. Así, crear el usuario en el panel es todo lo que hay que hacer.
 *
 * 2. Falla del lado seguro. Un usuario sin metadatos —recién creado, creado
 *    por otra vía, o migrado— cae en «tiene que cambiarla». El error posible
 *    es pedir el cambio de más, que se resuelve cambiándola; con la marca al
 *    derecho, el error posible sería dejar viva para siempre una contraseña
 *    provisoria que viajó por WhatsApp.
 *
 * Lo que esto NO es: un candado. `user_metadata` lo puede escribir el propio
 * usuario con la anon key, así que alguien con ganas puede marcarse solo y
 * saltear la pantalla. Lo único que se saltea es su propio cambio de
 * contraseña — no abre ningún dato que su sesión no viera ya. Para que fuera
 * un candado, la marca tendría que vivir en `app_metadata` y limpiarla una
 * Edge Function con la service_role: es la puerta que queda abierta si algún
 * día hace falta.
 */
export function needsPasswordChange(user: User | null): boolean {
  if (!user) return false
  const marca = user.user_metadata?.[MARCA]
  return typeof marca !== 'string' || marca === ''
}

/**
 * Lo que se guarda al elegir contraseña propia.
 *
 * SUPUESTO, y conviene tenerlo escrito porque los tipos de `@supabase/auth-js`
 * no lo dicen: `updateUser({ data })` FUSIONA las claves contra
 * `raw_user_meta_data`, no lo reemplaza. Hoy da igual —esta marca es lo único
 * que la app guarda ahí— pero el día que se guarde algo más (un nombre para
 * mostrar, una preferencia), si el supuesto fuera falso este objeto lo
 * borraría en silencio. Quien agregue la segunda clave: verificalo antes,
 * o leé los metadatos y mandalos completos.
 */
export function passwordChangedMetadata(now = new Date()) {
  return { [MARCA]: now.toISOString() }
}

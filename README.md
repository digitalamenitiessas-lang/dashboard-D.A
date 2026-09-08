# Digital Amenities · Centro de Control

Dashboard interno de gestión: proyectos y clientes, cobros, mantenimientos,
gastos, caja, infraestructura, tickets, notas, seguimientos y alertas. Los **proyectos** son
el núcleo del sistema y todo lo demás cuelga de ellos.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui sobre [Base UI](https://base-ui.com)
- Supabase (Postgres + Auth, con RLS)
- Tipografía de marca: Karla

## Puesta en marcha

### 1. Dependencias

```bash
pnpm install
```

### 2. Variables de entorno

Copiá `.env.example` a `.env.local` y completá con los datos de tu proyecto de
Supabase (*Project Settings → API*):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

> No agregues la `service_role` key: saltea RLS por completo y el frontend no
> la necesita.

### 3. Base de datos

Los scripts están en [`supabase/`](supabase) y se corren desde el **SQL Editor**
de Supabase, en orden:

| Script | Qué hace |
| --- | --- |
| `01_inventario.sql` | Lista qué hay en la base (no borra nada) |
| `02_reset.sql` | ⚠️ Borra todo el esquema `public` |
| `03_schema.sql` | Crea el esquema |
| `04_seed.sql` | Datos de ejemplo — *opcional*, saltealo si vas con datos reales |
| `05_dev_anon_policies.sql` | Sólo desarrollo: abre acceso al rol `anon` |
| `06_tareas_y_notas.sql` | Tareas por proyecto y notas vinculadas |
| `07_pagos_sin_vencimiento.sql` | Saca `due_date` y `status` de `payments` |
| `08_caja.sql` | Cuentas y movimientos de dinero |
| `10_gastos.sql` | Gastos fijos y en qué se va la plata |
| `11_tickets.sql` | Reclamos y pedidos de clientes |
| `12_seguimientos.sql` | Acercamientos comerciales con prospectos |
| `20_push.sql` | Cola de avisos, triggers y `pg_cron` |

Para una instalación nueva alcanza con **03**, **06**, **08**, **10**, **11** y
**12**:
el 03 ya crea `payments` con la forma final. El **07** es la migración para una
base creada antes de ese cambio. Del 08 en adelante son todos idempotentes: se
pueden correr de nuevo sin romper nada.

El **20** es aparte y se explica en [Notificaciones push](#notificaciones-push).
Conviene correrlo **antes** del 11: el 11 crea los triggers que avisan de un
ticket nuevo, y para eso necesita que ya exista la función `notificar()`. Si lo
corrés al revés no se rompe nada — el 11 avisa que salteó los triggers y los
crea cuando lo volvés a correr.

### 4. Usuario y seguridad

La app no tiene registro público: los usuarios se crean a mano desde
*Authentication → Users → Add user*, con «Auto Confirm User» tildado y una
contraseña provisoria cualquiera.

**Eso es todo lo que hay que hacer.** No hay que tocar metadatos ni correr
ningún SQL después: la primera vez que la persona entra, la app la manda a
`/cambiar-contrasena` y no la deja ir a ninguna otra pantalla hasta que elija
una propia. La contraseña provisoria sólo tiene que sobrevivir el viaje hasta
su dueño.

> **Importante:** desactivá el registro público en *Authentication → Sign In /
> Providers → Email* («Allow new users to sign up»). Las políticas de RLS le dan
> acceso total a cualquier usuario autenticado, así que sin esto cualquiera con
> la anon key podría crearse una cuenta y ver todos los datos.

Cómo sabe la app que alguien todavía usa la provisoria: por la **ausencia** de
`password_changed_at` en sus metadatos, que se escribe recién cuando elige la
suya. La marca dice «ya la cambió» y no «tiene que cambiarla», y esa inversión
es deliberada — el panel de Supabase no tiene campo de metadatos en el alta,
así que la marca al derecho obligaría a un `UPDATE` a mano después de cada
usuario nuevo, que es el paso que uno se olvida. Así, un usuario sin metadatos
—recién creado, migrado, o creado por cualquier otra vía— cae del lado seguro:
se le pide el cambio.

Consecuencia al instalar esto sobre una base que ya venía andando: **las
cuentas que ya existían también van a caer en la pantalla de cambio**, porque
tampoco tienen la marca. Suele ser lo que uno quiere. Si preferís que alguna
siga como está, marcala a mano una vez desde el SQL Editor:

```sql
update auth.users
   set raw_user_meta_data =
       coalesce(raw_user_meta_data, '{}'::jsonb) ||
       jsonb_build_object('password_changed_at', now())
 where email = 'la-cuenta@ejemplo.com';
```

#### Al resetearle la contraseña a alguien, borrale la marca

La marca se escribe una vez y no se limpia sola, así que contesta «¿alguna vez
eligió una contraseña propia?» y no «¿la que usa ahora es propia?». Si le
reseteás la contraseña a alguien desde *Authentication → Users*, esa persona
entra con la provisoria nueva y **no** se le vuelve a pedir el cambio. El paso
que acompaña a todo reseteo:

```sql
update auth.users
   set raw_user_meta_data = raw_user_meta_data - 'password_changed_at'
 where email = 'quien-se-la-olvido@ejemplo.com';
```

#### Migrar desde la cuenta compartida: hacelo ANTES de deployar

Si venías con una sola cuenta para todo el equipo, el orden importa y no es
obvio. Los cuatro celulares tienen esa misma sesión abierta; apenas se
deploya, los cuatro rebotan a la pantalla de cambio con la **misma** cuenta.
El primero que elige una contraseña se la cambia a todos, y los otros tres
quedan afuera con una contraseña que ya no existe.

El orden que evita eso:

1. Creá primero las cuatro cuentas individuales, con sus provisorias.
2. Repartí las credenciales y esperá a que los cuatro entren y elijan la suya.
3. Recién ahí borrá —o cambiale la contraseña a— la cuenta compartida.

Si ya deployaste y pasó, no se rompió nada: entrá al panel, reseteales la
contraseña a los que quedaron afuera y borrales la marca con el `update` de
arriba.

> Lo que esto **no** es: un candado. `user_metadata` lo puede escribir el
> propio usuario con la anon key, así que alguien decidido puede marcarse solo
> y saltear la pantalla. Lo único que se saltea es su propio cambio de
> contraseña — no abre ni un dato que su sesión no viera ya. Para que fuera un
> candado, la marca tendría que vivir en `app_metadata` y limpiarla una Edge
> Function con la `service_role`; está anotado en `lib/auth.ts` como la puerta
> a abrir si algún día hace falta.

### 5. Levantar el proyecto

```bash
npx next dev
```

> Se usa `npx next dev` y no `pnpm dev` porque el chequeo previo de pnpm falla
> con `ERR_PNPM_IGNORED_BUILDS`.

## Estructura

```
app/(app)/        Pantallas autenticadas (dashboard, proyectos, cobros, ...)
app/(app)/clientes  Sólo redirige: clientes es una pestaña de /proyectos
app/login/        Pantalla de acceso
proxy.ts          Refresca la sesión y manda a /login a quien no la tenga
components/       UI (ui/ es shadcn; el resto es por dominio)
lib/store.tsx     Estado global respaldado por Supabase — useStore()
lib/mappers.ts    Traducción entre filas snake_case y tipos del dominio
lib/derive.ts     Lógica derivada: finanzas, próximo cobro, motor de alertas
lib/money.ts      Totales por moneda (nunca se suman monedas distintas)
lib/caja.ts       Saldos por cuenta y detalle de movimientos
lib/types.ts      Modelo de dominio (los enums espejan los de Postgres)
supabase/         Scripts SQL versionados
```

## Notas para desarrollar

- shadcn corre sobre **Base UI**, no Radix: se usa `render={<X/>}` en lugar de
  `asChild`. Un `Button` que renderiza un `Link` necesita `nativeButton={false}`.
- `lucide-react` v1 eliminó los íconos de marca (no existe `Github`).
- Karla usa cifras proporcionales por defecto: todo número en columna necesita
  `tabular-nums` para alinear.
- La lógica de negocio derivada vive en `lib/derive.ts`, no en las pantallas.
- **Nunca sumes montos de monedas distintas.** No hay cotización cargada, así
  que todo total pasa por `lib/money.ts`: se agrupa por moneda y se muestra
  como `USD 15.000 · ARS 4.500.000`. Cuando hay dos o más monedas la línea usa
  el código (`USD`, `ARS`) porque ambas comparten el símbolo `$`. Los
  porcentajes y las barras de progreso sólo aparecen si hay una sola moneda:
  `collectionRatio()` devuelve `null` en cualquier otro caso.
- Los cobros de mantenimiento viven en `maintenance_charges`, aparte de
  `payments`. Suman a los ingresos, pero **no** al saldo pendiente: lo
  pendiente siempre se mide contra lo cotizado del proyecto.
- **Un pago es plata que ya entró.** `payments` no tiene vencimiento ni
  estado: sólo `paid_date`. No existen los pagos pendientes ni vencidos, así
  que tampoco hay alertas de atraso de cobro — `buildAlerts()` sólo mira
  mantenimientos, proyectos, dominios y notas. El saldo pendiente sale de
  restar lo cobrado a lo cotizado, no de pagos agendados.
- **Los saldos de la caja nunca se guardan.** `accountBalances()` los calcula
  sumando los cobros asignados a cada cuenta más lo que entró por movimientos,
  menos lo que salió. Por eso Cobros y Caja no pueden desincronizarse: no hay
  nada que sincronizar. Un cobro sin `account_id` simplemente no suma a ningún
  saldo, y la pantalla de Caja lo avisa.
- **Una cuenta tiene una sola moneda**, y cada monto de un movimiento va en la
  moneda de *su* cuenta. Por eso un cambio de dólares a pesos es un movimiento
  de una cuenta USD a una ARS con dos montos distintos: la cotización de esa
  operación queda registrada como dato real, no estimada.
- **Clientes no es una pantalla, es una pestaña de `/proyectos`.** Un cliente
  sin sus proyectos no dice nada y un proyecto de terceros sin su cliente
  tampoco, así que el cliente es el *agrupador* de los proyectos de terceros.
  La sección se corta en dos pestañas —«De clientes» y «Propios»— y cada una
  lleva sus propios totales: mezclados, el «total cotizado» sumaba producto
  propio con trabajo facturable y no contestaba ninguna de las dos preguntas.
  El corte no es cosmético, sale del modelo: los diálogos de proyecto fuerzan
  `clientId = type === 'terceros' ? clientId : null`, así que un proyecto
  propio no puede tener cliente. La ruta `/clientes` sobrevive sólo como
  redirección, porque esa URL está en marcadores y en la pantalla de inicio de
  quien instaló la PWA.
- **Un seguimiento es un CONTACTO, no un prospecto.** Cada reunión, llamada o
  mail es un renglón de `seguimientos`; el hilo de un prospecto es el conjunto
  de sus contactos y su estado sale del más reciente (`agruparSeguimientos()`
  en `lib/derive.ts`). No hay tabla de prospectos con su propio estado: sería
  una segunda fuente para el mismo dato, y alcanzaría con cargar una reunión y
  olvidarse de tocar el estado de arriba para que la pantalla dijera «esperamos
  respuesta» sobre algo que se cerró la semana pasada.
- **De qué lado está la pelota decide si algo alerta.** Sólo un prospecto en
  «Pelota nuestra» y con fecha para retomar entra al motor de alertas. Si están
  esperando ellos no hay nada que hacer más que esperar, y avisar ahí haría que
  la campana dejara de significar «hay algo para hacer».
- **El prospecto es texto libre, y por eso el agrupado no lo usa crudo.** Usa
  `prospecto_key`, una columna GENERADA por Postgres que baja a minúsculas y
  colapsa espacios — así vale igual para lo que carga la pantalla y para lo que
  se inserte por SQL. No saca acentos (haría falta la extensión `unaccent`), así
  que «Mediterráneo» y «Mediterraneo» siguen siendo dos. La defensa contra eso
  es el autocompletado del diálogo, que ofrece los nombres ya cargados.
- **Un ticket no tiene columna `status`.** El estado se lee de `resolved_at`:
  null es abierto, con fecha es resuelto. Resolver es poner la fecha y reabrir
  es sacarla; `ticketStatus()` en `lib/derive.ts` hace la lectura y es el único
  lugar donde vive la regla. Es la misma decisión que `fixed_expenses.ended_on`
  y por el mismo motivo: un `status` al lado de una fecha son dos formas de
  decir lo mismo y una de las dos siempre termina mintiendo.
- **La fecha de resolución la pone la base, no el celular.** Un trigger BEFORE
  (`sellar_resolucion_ticket`) pisa lo que mande el cliente con `now()`. Sin
  eso, un teléfono con la hora atrasada escribiría un `resolved_at` anterior al
  `created_at` y el CHECK rechazaría la operación con un error incomprensible.
- **La urgencia de un ticket es un número, no un enum.** Grados 1, 2 y 3, con
  `grade >= 2` significando lo mismo en SQL y en TypeScript. No reusa
  `Priority` (Baja/Media/Alta/Crítica) porque son dos escalas de distinto
  tamaño y mapearlas dejaría la equivalencia escrita en un solo lado.
- `buildAlerts()` **no tiene parámetros opcionales**, a propósito. Los tenía, y
  como la campana del header y `/alertas` no pasaban `maintenanceCharges`,
  marcaban como vencido todo mantenimiento aunque estuviera al día — tres
  vistas del mismo motor daban tres números distintos. Si agregás una entrada
  nueva, que sea obligatoria: olvidarse tiene que ser un error de compilación y
  no una alerta fantasma.

## Notificaciones push

La app no tiene backend propio, así que el push necesita tres piezas fuera del
navegador: la cola en Postgres, `pg_cron` para el reloj y una Edge Function que
es la única que puede firmar con la clave VAPID.

**Nada se manda desde un trigger.** El trigger sólo encola en `notifications`;
si el push falla o se cae Internet, el guardado del usuario no se rompe. Un
`dedupe_key` con la fecha adentro evita que un vencimiento avise cada minuto.

Avisan: un cobro, un mantenimiento cobrado, un movimiento de caja, un proyecto
nuevo o que cambia de estado, una nota nueva, un **ticket nuevo** y un **ticket
resuelto** (`supabase/20_push.sql` y `supabase/11_tickets.sql`). Aparte, una vez
por día a las 9:00 de Buenos Aires, `revisar_vencimientos()` busca lo que venció.

Los avisos de ticket van con `dedupe_key` en null y es correcto: un reclamo
nuevo es un hecho único, no un vencimiento que se repite todos los días. El
dedupe es para lo segundo.

### Puesta en marcha

Todo sale de `.env.local`. Un solo comando:

```bash
npm run push:setup
```

Genera lo que falte (el par VAPID y el `PUSH_TOKEN`), lo escribe en
`.env.local`, carga los secretos en Supabase y deploya la Edge Function. Se
puede correr las veces que haga falta: lo que ya existe no se regenera.

Al terminar imprime las tres cosas que quedan a mano y no puede hacer solo:

1. Correr `supabase/20_push.sql` en el SQL Editor, y después el `insert` en
   `app_settings` que el script te deja armado con la URL y el token.
2. Cargar `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Vercel y **redeployar** — esa
   variable se compila adentro del bundle, así que un deploy viejo no la tiene
   y la campana no va a poder activar nada.
3. En cada celular, tocar la campana.

> Si no tenés la CLI de Supabase, el script lo detecta y te imprime los valores
> para cargarlos desde el panel (*Edge Functions* → *Deploy a new function*, y
> los secretos en *Settings* → *Edge Functions* → *Secrets*).
>
> La función va con `--no-verify-jwt` porque quien la llama es `pg_cron` desde
> la base, que no tiene JWT de usuario. La autorización propia es el
> `PUSH_TOKEN`.

`npm run push:keys` genera sólo las claves, sin tocar Supabase. Y
`node scripts/push-setup.mjs --forzar-claves` regenera el par VAPID: si lo
hacés, todos los celulares se tienen que volver a suscribir.

### Qué es secreto y qué no

| Variable | Dónde vive |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública — `.env.local` y Vercel |
| `VAPID_PRIVATE_KEY` | secreta — `.env.local` y secretos de Supabase |
| `PUSH_TOKEN` | secreto — `.env.local` y secretos de Supabase |

Nada secreto lleva el prefijo `NEXT_PUBLIC_`: eso lo compilaría adentro del
bundle, donde lo lee cualquiera que abra el navegador.

### El detalle de iOS

En iPhone el push **sólo funciona con la app agregada a la pantalla de inicio**,
desde Safari — Chrome en iOS no puede instalar. Es regla de Apple, no hay forma
de saltearla. `pushSupport()` en [`lib/push.ts`](lib/push.ts) distingue «no se
puede» de «falta instalarla» justamente para poder mostrar las instrucciones en
vez de un botón que nunca va a andar. En Android alcanza con tocar la campana.

La suscripción es **por dispositivo, no por usuario**: cada celular se da de
alta una vez y el aviso va a todos los dados de alta, sin importar con qué
cuenta se entró. El `upsert` va por `endpoint`, así que reactivar en el mismo
celular no duplica. Eso venía de cuando toda la empresa compartía una cuenta,
pero sigue siendo lo correcto con un usuario por persona: lo que recibe un
aviso es un teléfono, no una identidad, y nadie quiere enterarse de un grado 3
sólo en la computadora donde tiene la sesión abierta.

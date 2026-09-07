# Digital Amenities · Centro de Control

Dashboard interno de gestión: proyectos, clientes, cobros, mantenimientos,
infraestructura, notas y alertas. Los **proyectos** son el núcleo del sistema y
todo lo demás cuelga de ellos.

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

Para una instalación nueva alcanza con **03**, **06** y **08**: el 03 ya crea
`payments` con la forma final. El **07** es la migración para una base creada
antes de ese cambio. Los dos últimos son idempotentes.

### 4. Usuario y seguridad

La app no tiene registro público: los usuarios se crean a mano desde
*Authentication → Users → Add user* (con «Auto Confirm User»).

> **Importante:** desactivá el registro público en *Authentication → Sign In /
> Providers → Email* («Allow new users to sign up»). Las políticas de RLS le dan
> acceso total a cualquier usuario autenticado, así que sin esto cualquiera con
> la anon key podría crearse una cuenta y ver todos los datos.

### 5. Levantar el proyecto

```bash
npx next dev
```

> Se usa `npx next dev` y no `pnpm dev` porque el chequeo previo de pnpm falla
> con `ERR_PNPM_IGNORED_BUILDS`.

## Estructura

```
app/(app)/        Pantallas autenticadas (dashboard, proyectos, cobros, ...)
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

## Notificaciones push

La app no tiene backend propio, así que el push necesita tres piezas fuera del
navegador: la cola en Postgres, `pg_cron` para el reloj y una Edge Function que
es la única que puede firmar con la clave VAPID.

**Nada se manda desde un trigger.** El trigger sólo encola en `notifications`;
si el push falla o se cae Internet, el guardado del usuario no se rompe. Un
`dedupe_key` con la fecha adentro evita que un vencimiento avise cada minuto.

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

La suscripción es **por dispositivo, no por usuario**: como toda la empresa
entra con la misma cuenta, cada celular se da de alta una vez y el aviso va a
todos los dados de alta. El `upsert` va por `endpoint`, así que reactivar en el
mismo celular no duplica.

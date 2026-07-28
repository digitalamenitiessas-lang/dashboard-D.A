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

Para una instalación nueva alcanza con **03** y **06**.

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

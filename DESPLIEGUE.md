# Despliegue

> **Esto cambió el 19/10/2026.** Antes el dashboard vivía en Vercel. Ya no.

## Qué pasó

Vercel bloqueó la cuenta de Digital Amenities por exceder los límites del plan
gratuito. Cayeron todos los proyectos del equipo a la vez, este incluido, con
`402 Payment Required`.

Además, `admin.digitalamenities.com.ar` resolvía gracias a un registro comodín
`*` que administraba Vercel. Al mudar el DNS a Cloudflare ese comodín se
eliminó, así que el subdominio quedó sin resolver. Estuvo caído por las dos
razones a la vez.

Hoy el dashboard corre en un **VPS propio**, en el mismo servidor donde ya
vivían Citify, Countrify, Casa Fe, MALALA, Sala de Profes 24, el panel de Miska
Muska y la landing institucional.

## Dónde está

| | |
|---|---|
| URL | https://admin.digitalamenities.com.ar |
| Servidor | `2.25.185.242` (Ubuntu 24.04) |
| Carpeta | `/home/dashboardda/dashboard` |
| Usuario | `dashboardda` |
| Puerto | `127.0.0.1:3090`, detrás de Caddy |
| Servicio | `dashboardda.service` |
| Config de Caddy | `/etc/caddy/dashboardda.caddy` |
| DNS | Cloudflare, registro A `admin` en **DNS only** (gris) |
| Certificado | Let's Encrypt, lo renueva Caddy solo |

Supabase **no cambió**: la base sigue donde estaba. Esta mudanza fue solo del
hosting.

## Cómo se despliega ahora

No hay push-to-deploy. Se hace commit y push a `main` como siempre, y después:

```bash
ssh root@2.25.185.242 deploy-dashboardda
```

El script trae los cambios, instala con `pnpm install --frozen-lockfile`,
compila y reinicia. **Si la compilación falla no reinicia nada** y el sitio
sigue sirviendo la versión anterior.

Vive en `/usr/local/bin/deploy-dashboardda` del servidor, no en este repo.

## Lo que hay que tener en cuenta al trabajar

**Las variables de entorno viven en `.env.local` dentro del proyecto**, en el
servidor — no en `/etc/`. No es un descuido: las `NEXT_PUBLIC_*` se incrustan
en el bundle **al compilar**, y el `EnvironmentFile` de systemd solo existe en
tiempo de ejecución. Si agregás una variable nueva, hay que ponerla en el
`.env.local` del servidor **antes** de compilar, o va a quedar vacía en el
cliente sin ningún error visible.

**El servidor es compartido y chico: 1 núcleo y 3,8 GB para ~19 servicios.**
Todo lo que corre lo hace con `nice -n 19` y el servicio tiene `MemoryMax=1G`.
Si algo se desboca, el que muere es el dashboard y no el resto. No corras
builds pesados a mano sin `nice`.

**No toques el `Caddyfile` principal sin hacer backup.** La convención del
servidor es un archivo `.caddy` por sitio, importado al final del Caddyfile, y
un respaldo con fecha antes de cada cambio. Hay siete sitios ahí: romperlo los
tira a todos.

**Node 22 no es el del sistema.** El `node` por defecto del servidor es el 20.
El 22 está en `/opt/node22/bin`, y es el que usa este proyecto (`engines`
pide `>=22`). `pnpm` es el 10.34.5, instalado con corepack, y solo funciona
invocado con Node 22.

## Sacar el dominio del proyecto de Vercel

> **Urgente, y todavía sin hacer.**

El DNS ya apunta al VPS, pero `admin.digitalamenities.com.ar` **sigue atado al
proyecto de Vercel**, que está bloqueado. Verificado el 19/10/2026 forzando la
resolución:

```
--resolve ...:76.76.21.21    →  402  Server: Vercel  X-Vercel-Error: DEPLOYMENT_DISABLED
--resolve ...:2.25.185.242   →  200  (Caddy)
```

Mientras Vercel siga respondiendo por ese nombre, cualquiera que llegue a su
borde —un DNS con la respuesta vieja todavía cacheada, una red con otro
resolver, un navegador reusando una conexión— ve una pantalla que dice
«Deployment Paused» en vez del dashboard. No es un error nuestro y no hay nada
que tocar en el servidor: hay que **quitar el dominio del proyecto en el panel
de Vercel** (Project → Settings → Domains → Remove).

Pasó de verdad: el navegador de prueba daba 402 mientras `curl` desde la misma
máquina daba 200, y los tres resolvers públicos ya devolvían la IP del VPS.

## Pendientes conocidos

- **Faltan tres variables** que el `.env.example` declara y el `.env.local` no
  tiene: `SUPABASE_PROJECT_REF`, `OPENROUTER_API_KEY` y `OPENROUTER_MODEL`. El
  build pasa igual. Si hay alguna función con IA en producción, va a fallar
  cuando alguien la use. Hay que confirmarlo.
- **`@vercel/analytics` sigue como dependencia** y ya no recolecta nada fuera
  de Vercel. Conviene sacarlo o reemplazarlo.
- **El script de deploy no está versionado acá.** Si se quiere, va como
  `scripts/deploy-vps.sh`, igual que en el repo de la landing.
- **Rotar la contraseña de root del VPS.** Se compartió por chat durante la
  migración. El acceso por clave pública ya funciona, así que cambiarla no
  deja a nadie afuera.

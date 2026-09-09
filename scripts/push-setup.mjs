#!/usr/bin/env node
/**
 * Deja las notificaciones push listas, leyendo todo de `.env.local`.
 *
 *   npm run push:setup
 *
 * Genera lo que falte (par VAPID y token), lo escribe en `.env.local`,
 * carga los secretos en Supabase, deploya la Edge Function y te imprime
 * el SQL que hay que pegar. Se puede correr las veces que haga falta:
 * lo que ya existe no se toca ni se regenera.
 *
 *   --solo-sql      imprime los secretos y el SQL para pegar a mano, y sale.
 *                   Para cuando la CLI de Supabase no está logueada.
 *   --solo-claves   genera y guarda las claves, sin tocar Supabase
 *   --forzar-claves regenera el par VAPID aunque ya haya uno
 *                   (si lo hacés, todos los celulares se tienen que
 *                    volver a suscribir: la clave vieja deja de valer)
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const ENV = resolve(process.cwd(), '.env.local')
const args = process.argv.slice(2)
const soloClaves = args.includes('--solo-claves')
const forzarClaves = args.includes('--forzar-claves')
// Imprime lo que queda a mano y sale. Para cuando Supabase se hace el dificil
// pero el SQL no depende de Supabase para nada.
const soloSql = args.includes('--solo-sql')

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  mal: (s) => `\x1b[31m${s}\x1b[0m`,
  ojo: (s) => `\x1b[33m${s}\x1b[0m`,
  tenue: (s) => `\x1b[2m${s}\x1b[0m`,
  fuerte: (s) => `\x1b[1m${s}\x1b[0m`,
}

function morir(mensaje) {
  console.error(`\n${c.mal('✗')} ${mensaje}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------
// .env.local
// ---------------------------------------------------------------------

if (!existsSync(ENV)) {
  morir(
    `No existe .env.local.\n  Copiá .env.example a .env.local y completá los dos datos de Supabase primero.`,
  )
}

const crudo = readFileSync(ENV, 'utf8')

/** Parseo mínimo: sólo KEY=VALOR, que es todo lo que usa este archivo. */
function leerEnv(texto) {
  const out = {}
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const i = limpia.indexOf('=')
    if (i < 0) continue
    out[limpia.slice(0, i).trim()] = limpia
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

/** Reemplaza la línea si la clave ya está; si no, la agrega al final. */
function escribirEnv(texto, clave, valor) {
  const re = new RegExp(`^${clave}=.*$`, 'm')
  if (re.test(texto)) return texto.replace(re, `${clave}=${valor}`)
  return texto.replace(/\s*$/, '') + `\n${clave}=${valor}\n`
}

let env = leerEnv(crudo)
let texto = crudo
let cambio = false

// ---------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------

const b64url = (buf) => Buffer.from(buf).toString('base64url')

/**
 * Par VAPID: una clave P-256, con la pública como punto sin comprimir
 * (0x04 ‖ X ‖ Y) y la privada como el escalar pelado, las dos en
 * base64url. Es exactamente lo que produce `web-push generate-vapid-keys`,
 * pero sin depender de nada: `node:crypto` ya sabe hacerlo.
 */
function generarVapid() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  })
  const jwk = privateKey.export({ format: 'jwk' })
  const punto = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ])
  void publicKey
  return { publica: b64url(punto), privada: jwk.d }
}

if (forzarClaves || !env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  if (forzarClaves && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.log(
      c.ojo(
        '⚠ Regenerando el par VAPID: todos los celulares suscriptos van a\n' +
          '  dejar de recibir avisos hasta que vuelvan a tocar la campana.',
      ),
    )
  }
  const { publica, privada } = generarVapid()
  texto = escribirEnv(texto, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', publica)
  texto = escribirEnv(texto, 'VAPID_PRIVATE_KEY', privada)
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publica
  env.VAPID_PRIVATE_KEY = privada
  cambio = true
  console.log(`${c.ok('✓')} Par VAPID generado`)
} else {
  console.log(`${c.tenue('·')} Par VAPID: ya estaba`)
}

if (!env.PUSH_TOKEN) {
  const token = randomBytes(32).toString('hex')
  texto = escribirEnv(texto, 'PUSH_TOKEN', token)
  env.PUSH_TOKEN = token
  cambio = true
  console.log(`${c.ok('✓')} PUSH_TOKEN generado`)
} else {
  console.log(`${c.tenue('·')} PUSH_TOKEN: ya estaba`)
}

if (!env.VAPID_SUBJECT) {
  texto = escribirEnv(texto, 'VAPID_SUBJECT', 'mailto:admin@digitalamenities.com')
  env.VAPID_SUBJECT = 'mailto:admin@digitalamenities.com'
  cambio = true
  console.log(
    `${c.ojo('!')} VAPID_SUBJECT no estaba: puse uno por defecto.\n  Cambialo en .env.local por un mail tuyo de verdad.`,
  )
}

if (cambio) {
  writeFileSync(ENV, texto, 'utf8')
  console.log(`${c.ok('✓')} .env.local actualizado`)
}

// El ref del proyecto: explícito, o deducido de la URL de Supabase.
const ref =
  env.SUPABASE_PROJECT_REF ||
  (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

if (!ref) {
  morir(
    'No pude deducir el ref del proyecto.\n' +
      '  Completá NEXT_PUBLIC_SUPABASE_URL o SUPABASE_PROJECT_REF en .env.local.',
  )
}

const urlFuncion = `https://${ref}.supabase.co/functions/v1/enviar-push`

if (soloClaves) {
  console.log(`\n${c.fuerte('Listo.')} Las claves quedaron en .env.local.\n`)
  process.exit(0)
}

if (soloSql) {
  console.log(`\n${c.fuerte('─'.repeat(64))}`)
  console.log(c.fuerte(' Para pegar, sin tocar Supabase desde acá'))
  console.log(`${c.fuerte('─'.repeat(64))}\n`)
  imprimirSecretos()
  imprimirSql()
  process.exit(0)
}

// ---------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------

/** `supabase` en Windows es un .cmd, así que va con shell. */
function supabase(argumentos, opciones = {}) {
  return spawnSync('supabase', argumentos, {
    stdio: opciones.silencioso ? 'pipe' : 'inherit',
    shell: true,
    encoding: 'utf8',
  })
}

const version = supabase(['--version'], { silencioso: true })
if (version.status !== 0) {
  console.log(`\n${c.ojo('!')} No encontré la CLI de Supabase.`)
  console.log(`  Instalala con:  ${c.fuerte('npm install -g supabase')}`)
  console.log(`  O hacé el deploy desde el panel: Edge Functions → Deploy a new function.\n`)
  imprimirSecretos()
  imprimirSql()
  process.exit(1)
}

console.log(`\n${c.fuerte('Cargando secretos en Supabase...')}`)
const secretos = supabase([
  'secrets',
  'set',
  `VAPID_PUBLIC_KEY=${env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}`,
  `VAPID_PRIVATE_KEY=${env.VAPID_PRIVATE_KEY}`,
  `VAPID_SUBJECT=${env.VAPID_SUBJECT}`,
  `PUSH_TOKEN=${env.PUSH_TOKEN}`,
  '--project-ref',
  ref,
])

if (secretos.status !== 0) {
  // El SQL no depende de esto y se imprime igual. Los secretos y el deploy se
  // pueden hacer desde el panel, pero el insert en `app_settings` es lo único
  // sin lo cual el push no manda NADA — y encima falla en silencio, así que
  // tragárselo por un error de login es la peor combinación posible.
  console.log(`\n${c.ojo('!')} No pude cargar los secretos en Supabase.`)
  console.log(
    `  Casi siempre es falta de login: corré ${c.fuerte('supabase login')} y volvé a intentar.`,
  )
  console.log(`  O cargalos a mano: Settings → Edge Functions → Secrets.\n`)
  imprimirSecretos()
  imprimirSql()
  process.exit(1)
}

console.log(`\n${c.fuerte('Deployando la Edge Function...')}`)
const deploy = supabase([
  'functions',
  'deploy',
  'enviar-push',
  '--no-verify-jwt',
  '--project-ref',
  ref,
])

if (deploy.status !== 0) {
  console.log(`\n${c.ojo('!')} Falló el deploy de la función. Mirá el error de arriba.`)
  console.log(`  Alternativa: Edge Functions → Deploy a new function, pegando`)
  console.log(`  el contenido de supabase/functions/enviar-push/index.ts\n`)
  imprimirSql()
  process.exit(1)
}

// ---------------------------------------------------------------------
// Lo que queda a mano
// ---------------------------------------------------------------------

/**
 * Los cuatro secretos de la Edge Function, para cargarlos desde el panel.
 *
 * La privada y el token se imprimen enteros a propósito: son secretos del
 * servidor, no de la terminal de su dueño, y sin verlos no hay forma de
 * pegarlos en el panel. Lo que no hay que hacer es mandarlos por chat.
 */
function imprimirSecretos() {
  console.log(`${c.fuerte('Secretos')} (Settings → Edge Functions → Secrets):\n`)
  console.log(`   VAPID_PUBLIC_KEY  = ${env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}`)
  console.log(`   VAPID_PRIVATE_KEY = ${env.VAPID_PRIVATE_KEY}`)
  console.log(`   VAPID_SUBJECT     = ${env.VAPID_SUBJECT}`)
  console.log(`   PUSH_TOKEN        = ${env.PUSH_TOKEN}\n`)
}

function imprimirSql() {
  console.log(`${c.fuerte('1) En el SQL Editor de Supabase')}`)
  console.log(`   Primero ${c.fuerte('supabase/20_push.sql')} entero, y después esto:\n`)
  console.log(
    c.tenue('   ') +
      `insert into app_settings (key, value) values
     ('push_function_url',   '${urlFuncion}'),
     ('push_function_token', '${env.PUSH_TOKEN}')
   on conflict (key) do update set value = excluded.value;`,
  )
  console.log(`\n${c.fuerte('2) En Vercel')}`)
  console.log(`   Settings → Environment Variables → Production:\n`)
  console.log(`   NEXT_PUBLIC_VAPID_PUBLIC_KEY = ${env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}\n`)
  console.log(
    c.ojo('   Y redeployá.') +
      ' Esa variable se compila adentro del bundle, así que\n   un deploy viejo no la tiene.\n',
  )
  console.log(`${c.fuerte('3) En el celular')}`)
  console.log(`   Tocá la campana del header y cargá un cobro para probar.`)
  console.log(
    c.tenue('   En iPhone: primero Compartir → Agregar a inicio, y abrí desde el ícono.\n'),
  )
}

console.log(`\n${c.ok('✓')} Función deployada.\n`)
console.log(c.fuerte('─'.repeat(64)))
console.log(c.fuerte(' Faltan tres cosas que tenés que hacer vos'))
console.log(c.fuerte('─'.repeat(64)) + '\n')
imprimirSql()

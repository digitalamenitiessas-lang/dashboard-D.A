/*
 * Service worker del Centro de Control.
 *
 * Hace una sola cosa: recibir los push y abrir la pantalla que
 * corresponde al tocarlos. NO cachea nada — la app es un tablero contra
 * datos que cambian todo el tiempo, y un caché acá significaría mostrar
 * saldos viejos, que es peor que no mostrar nada.
 */

// Tomar el control apenas se instala, sin esperar a que se cierren las
// pestañas viejas: si no, el primer push después de un deploy se pierde.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Un push sin JSON válido igual tiene que avisar algo, no morirse.
    data = { title: 'Digital Amenities', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Digital Amenities'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Sin tag: cada aviso es un hecho distinto y se apilan. Con tag, el
    // segundo cobro del día pisaría al primero y nadie se enteraría.
    data: { url: data.url || '/' },
    // En Android la vibración ayuda a que no pase desapercibido; iOS la
    // ignora y no molesta.
    vibrate: [80, 40, 80],
    timestamp: Date.now(),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Si la app ya está abierta, se navega esa ventana en vez de abrir
      // otra: en el celular, dos instancias del tablero es un estorbo.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }

      await self.clients.openWindow(target)
    })(),
  )
})

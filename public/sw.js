// Service Worker for Push Notifications
// Handles push events and notification clicks

importScripts('/offline-engine.js');
const offlineEngine = self.SproutOffline.createEngine({
  indexedDB: self.indexedDB, caches: self.caches, crypto: self.crypto,
  origin: self.location.origin, fetch: request => fetch(request),
  broadcast: async () => {
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      client.postMessage(await offlineEngine.status(client.id));
    }
  },
});

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    const client = event.clientId ? await self.clients.get(event.clientId) : null;
    try {
      return await offlineEngine.handle(event.request, { clientId: event.clientId, clientUrl: client?.url }) || await fetch(event.request);
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: 'This request could not be saved on your device. Connect and try again.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
  })());
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle skip waiting message (for service worker updates)
let messageFlight = Promise.resolve(); let messageEpoch = 0;
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  const message = event.data || {};
  const clientId = event.source?.id;
  if (message.type === 'CLEAR_SESSION' || message.type === 'PAUSE_SESSION') {
    messageEpoch++;
    event.waitUntil(message.type === 'CLEAR_SESSION' ? offlineEngine.clear() : offlineEngine.pause(clientId));
    return;
  }
  const startEpoch = messageEpoch;
  const run = messageFlight.then(async () => {
    if (startEpoch !== messageEpoch) return;
    if (message.type === 'SESSION') await offlineEngine.session(message, clientId);
    if (message.type === 'PAUSE_SESSION') await offlineEngine.pause(clientId);
    if (message.type === 'CLEAR_SESSION') await offlineEngine.clear();
    if (message.type === 'REPLAY') await offlineEngine.replay(clientId);
    if (message.type === 'PREWARM') await offlineEngine.prewarm(message.urls || [], clientId);
    if (message.type === 'FRESHEN') {
      await offlineEngine.freshen(message.urls || [], clientId);
      event.source?.postMessage({ type: 'DATA_CHANGED', familyId: (await offlineEngine.status(clientId)).familyId, requestId: message.requestId, foreground: true });
    }
    if (['GET_CONFLICTS', 'QUEUE_LIST'].includes(message.type)) event.source?.postMessage({ type: 'OFFLINE_CONFLICTS', operations: await offlineEngine.operations(clientId), requestId: message.requestId });
    if (['DISCARD_CONFLICT', 'DISCARD_OPERATION'].includes(message.type)) {
      const discarded = await offlineEngine.discard(message, clientId);
      event.source?.postMessage({ type: 'DATA_CHANGED', discarded, familyId: (await offlineEngine.status(clientId)).familyId, requestId: message.requestId });
    }
    if (message.type === 'GET_STATUS') event.source?.postMessage({ ...await offlineEngine.status(clientId), requestId: message.requestId });
  });
  messageFlight = run.catch(() => {});
  event.waitUntil(run);
});

// Listen for push events
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  
  const options = {
    title: payload.title || 'Sprout Track',
    body: payload.body || '',
    icon: payload.icon || '/sprout-128.png',
    badge: payload.badge || '/sprout-128.png',
    tag: payload.tag || 'default',
    data: payload.data || {},
    requireInteraction: false,
    silent: false,
  };
  
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Future: Navigate to URL from data.payload.url
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else {
    // Default: Focus or open the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // If a window is already open on the same origin, focus it
        // Use URL parsing to match any path on the same origin, not just '/'
        const appOrigin = self.location.origin;
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          try {
            const clientUrl = new URL(client.url);
            // Focus any window from our app origin
            if (clientUrl.origin === appOrigin && 'focus' in client) {
              return client.focus();
            }
          } catch (e) {
            // URL parsing failed, skip this client
            console.warn('Failed to parse client URL:', client.url);
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // Could log analytics here if needed
  console.log('Notification closed:', event.notification.tag);
});

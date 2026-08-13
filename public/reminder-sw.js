/**
 * Companion script imported by the generated PWA service worker.
 *
 * Responsibilities:
 *  - persist the next ~36h of dose reminders
 *  - show system notifications even when the UI tab is closed
 *  - schedule TimestampTrigger notifications when the browser supports them
 *  - handle Taken / Snooze actions from the lock-screen notification
 *  - wake on periodic background sync
 */
/* eslint-disable no-undef */
/* global self, clients, TimestampTrigger */

const STORE = 'medimind-reminders-v1'
const KEY = 'schedule'

function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORE, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putSchedule(reminders) {
  const db = await openStore()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put({ reminders, savedAt: Date.now() }, KEY)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getSchedule() {
  const db = await openStore()
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly')
    const r = tx.objectStore('kv').get(KEY)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  db.close()
  return row?.reminders ?? []
}

async function putPendingAction(action) {
  const db = await openStore()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(action, `pending:${action.logId}:${action.action}`)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

function canTimestampTrigger() {
  try {
    return typeof TimestampTrigger === 'function'
  } catch {
    return false
  }
}

function iconFor(reminder) {
  return reminder.icon || 'icons/icon-192.png'
}

async function showDoseNotification(reminder, isRepeat) {
  const title = isRepeat
    ? `Still waiting: ${reminder.medicationName}`
    : reminder.title
  const options = {
    body: reminder.body,
    tag: reminder.tag,
    icon: iconFor(reminder),
    badge: iconFor(reminder),
    renotify: true,
    requireInteraction: !!reminder.critical,
    vibrate: reminder.critical ? [200, 80, 200, 80, 200] : [160, 60, 160],
    timestamp: reminder.at,
    data: {
      url: reminder.url || './#/',
      logId: reminder.logId,
      kind: 'dose',
    },
    actions: [
      { action: 'taken', title: 'Taken' },
      { action: 'snooze', title: 'Snooze 15m' },
    ],
  }
  await self.registration.showNotification(title, options)
}

async function scheduleAll(reminders) {
  await putSchedule(reminders)
  const now = Date.now()
  const upcoming = reminders.filter((r) => r.at > now - 30_000)
  if (!canTimestampTrigger()) return
  for (const r of upcoming) {
    try {
      await self.registration.showNotification(r.title, {
        body: r.body,
        tag: `sched:${r.tag}`,
        icon: iconFor(r),
        badge: iconFor(r),
        showTrigger: new TimestampTrigger(r.at),
        data: { url: r.url || './#/', logId: r.logId, kind: 'dose' },
        actions: [
          { action: 'taken', title: 'Taken' },
          { action: 'snooze', title: 'Snooze 15m' },
        ],
      })
    } catch {
      /* Triggers unsupported or quota — periodic sync / page ticker still cover it. */
    }
  }
}

async function fireDue() {
  const reminders = await getSchedule()
  const now = Date.now()
  const due = reminders.filter((r) => r.at <= now + 15_000 && r.at >= now - 2 * 60 * 60_000)
  for (const r of due) {
    await showDoseNotification(r, false)
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SYNC_SCHEDULE' && Array.isArray(data.reminders)) {
    event.waitUntil(scheduleAll(data.reminders))
  }
  if (data.type === 'SHOW_NOW' && data.notification) {
    event.waitUntil(
      self.registration.showNotification(data.notification.title, {
        body: data.notification.body,
        tag: data.notification.tag,
        icon: data.notification.icon || 'icons/icon-192.png',
        badge: data.notification.icon || 'icons/icon-192.png',
        renotify: true,
        requireInteraction: !!data.notification.critical,
        vibrate: [160, 60, 160],
        data: { url: data.notification.url || './#/', logId: data.notification.logId, kind: data.notification.kind || 'dose' },
        actions: data.notification.actions,
      }),
    )
  }
  if (data.type === 'TEST_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification('MediMind is ready', {
        body: 'Dose reminders will appear here — even if you leave the app.',
        tag: 'medimind-test',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        vibrate: [120, 40, 120],
        data: { url: './#/', kind: 'test' },
      }),
    )
  }
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'medimind-reminders' || event.tag === 'medimind-doses') {
    event.waitUntil(fireDue())
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const action = event.action
  const target = data.url || './#/'

  event.waitUntil((async () => {
    if ((action === 'taken' || action === 'snooze') && data.logId) {
      await putPendingAction({ action, logId: data.logId, at: Date.now() })
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      client.postMessage({
        type: 'DOSE_ACTION',
        action: action || 'open',
        logId: data.logId,
      })
      if ('focus' in client) {
        await client.focus()
        return
      }
    }
    if (self.clients.openWindow) {
      const hash = action === 'taken' || action === 'snooze'
        ? `#/?act=${action}&log=${encodeURIComponent(data.logId || '')}`
        : (target.includes('#') ? target.slice(target.indexOf('#')) : '#/')
      const scope = self.registration.scope
      await self.clients.openWindow(scope + hash.replace(/^#/, '#'))
    }
  })())
})

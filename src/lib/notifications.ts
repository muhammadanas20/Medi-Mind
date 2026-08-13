/**
 * Notification bridge — prefers ServiceWorker notifications (fire when the
 * app is backgrounded or closed), falls back to window.Notification, and
 * always also surfaces an in-app card so nothing is ever silently lost.
 */

import type { DoseInstance } from './reminders'
import { SLOT_META, foodLabel } from './reminders'

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    if (result === 'granted') {
      await enableBackgroundSync()
      await sendTestNotification(false)
    }
    return result
  } catch {
    return Notification.permission
  }
}

export interface DoseNotification {
  tag: string
  title: string
  body: string
  logId?: string
  critical?: boolean
  url?: string
}

export function buildDoseNotification(inst: DoseInstance, isRepeat: boolean): DoseNotification {
  const meta = SLOT_META[inst.slot]
  const qty = `${inst.quantity} ${inst.quantity === 1 ? 'tablet' : 'tablets'}`
  return {
    tag: inst.logId,
    logId: inst.logId,
    critical: inst.isCritical,
    url: `${import.meta.env.BASE_URL}#/`,
    title: isRepeat ? `Still waiting: ${inst.medicationName}` : `Time for ${inst.medicationName}`,
    body:
      `${meta.label} dose · Take ${qty}${inst.strength ? ` of ${inst.strength}` : ''}` +
      `${inst.food !== 'any' ? ` — ${foodLabel(inst.food).toLowerCase()}` : ''}` +
      (isRepeat ? '\nTap Taken when you swallow it.' : '\nOpen MediMind or tap Taken.'),
  }
}

const ICON_192 = `${import.meta.env.BASE_URL}icons/icon-192.png`

export async function fireNotification(n: DoseNotification): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.ready.catch(() => navigator.serviceWorker?.getRegistration())
    if (reg?.active) {
      reg.active.postMessage({
        type: 'SHOW_NOW',
        notification: {
          title: n.title,
          body: n.body,
          tag: n.tag,
          logId: n.logId,
          critical: n.critical,
          url: n.url ?? `${import.meta.env.BASE_URL}#/`,
          icon: ICON_192,
          kind: 'dose',
          actions: [
            { action: 'taken', title: 'Taken' },
            { action: 'snooze', title: 'Snooze 15m' },
          ],
        },
      })
      return true
    }
    if (reg) {
      await reg.showNotification(n.title, {
        body: n.body,
        tag: n.tag,
        icon: ICON_192,
        badge: ICON_192,
        renotify: true,
        requireInteraction: !!n.critical,
        data: { url: n.url ?? `${import.meta.env.BASE_URL}#/`, logId: n.logId, kind: 'dose' },
      } as NotificationOptions)
      return true
    }
    new Notification(n.title, { body: n.body, tag: n.tag, icon: ICON_192 })
    return true
  } catch {
    try {
      new Notification(n.title, { body: n.body, tag: n.tag })
      return true
    } catch {
      return false
    }
  }
}

export interface ScheduledReminder {
  tag: string
  logId: string
  title: string
  body: string
  at: number
  critical?: boolean
  medicationName: string
  url: string
  icon: string
}

export async function syncReminderSchedule(reminders: ScheduledReminder[]): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready
    reg?.active?.postMessage({ type: 'SYNC_SCHEDULE', reminders })
    await enableBackgroundSync()
    await updateAppBadge(reminders)
  } catch {
    /* SW not available — in-app ticker still runs */
  }
}

export async function enableBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready
    if (!reg) return
    const periodic = (reg as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> }
    }).periodicSync
    if (periodic) {
      await periodic.register('medimind-reminders', { minInterval: 15 * 60 * 1000 }).catch(() => undefined)
    }
  } catch {
    /* not installed / not granted — fine */
  }
}

export async function sendTestNotification(force = true): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg?.active && force) {
      reg.active.postMessage({ type: 'TEST_NOTIFICATION' })
      return true
    }
    return true
  } catch {
    return false
  }
}

export async function updateAppBadge(reminders: { at: number }[]): Promise<void> {
  const pending = reminders.filter((r) => r.at <= Date.now() + 60 * 60_000).length
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (pending > 0) await nav.setAppBadge?.(pending)
    else await nav.clearAppBadge?.()
  } catch {
    /* badge API optional */
  }
}

export async function drainPendingNotificationActions(): Promise<{ action: string; logId: string }[]> {
  const out: { action: string; logId: string }[] = []
  try {
    const req = indexedDB.open('medimind-reminders-v1', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onupgradeneeded = () => { req.result.createObjectStore('kv') }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly')
      const r = tx.objectStore('kv').getAllKeys()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith('pending:')) continue
      const row = await new Promise<{ action: string; logId: string } | undefined>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite')
        const store = tx.objectStore('kv')
        const g = store.get(key)
        g.onsuccess = () => {
          store.delete(key)
          resolve(g.result as { action: string; logId: string } | undefined)
        }
        g.onerror = () => reject(g.error)
      })
      if (row?.logId && row.action) out.push(row)
    }
    db.close()
  } catch {
    /* empty */
  }
  return out
}

/** Gentle chime + haptic buzz for in-app due cards. */
export function feedbackPing(opts: { sound: boolean; haptics: boolean }): void {
  if (opts.haptics && 'vibrate' in navigator) navigator.vibrate?.([80, 40, 80])
  if (!opts.sound) return
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(880, ctx.currentTime)
    o.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12)
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.55)
    o.onended = () => void ctx.close()
  } catch {
    /* audio blocked until user gesture — fine */
  }
}

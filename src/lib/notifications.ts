/**
 * Notification bridge — prefers ServiceWorker notifications (fire when the
 * app is backgrounded), falls back to window.Notification, and always also
 * surfaces an in-app card so nothing is ever silently lost.
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
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export interface DoseNotification {
  tag: string // dedupe per dose instance
  title: string
  body: string
}

export function buildDoseNotification(inst: DoseInstance, isRepeat: boolean): DoseNotification {
  const meta = SLOT_META[inst.slot]
  const qty = `${inst.quantity} ${inst.quantity === 1 ? 'tablet' : 'tablets'}`
  return {
    tag: inst.logId,
    title: isRepeat ? `Reminder: ${inst.medicationName} still pending` : `Time for ${inst.medicationName}`,
    body:
      `${meta.emoji} ${meta.label} · Take ${qty}${inst.strength ? ` of ${inst.strength}` : ''}` +
      `${inst.food !== 'any' ? ` — ${foodLabel(inst.food).toLowerCase()}` : ''}` +
      (isRepeat ? '\nTap when completed.' : ''),
  }
}

const ICON_192 = `${import.meta.env.BASE_URL}icons/icon-192.png`

export async function fireNotification(n: DoseNotification): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(n.title, {
        body: n.body,
        tag: n.tag,
        icon: ICON_192,
        badge: ICON_192,
        renotify: true,
        data: { url: import.meta.env.BASE_URL },
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

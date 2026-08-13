import { db } from './db'
import type { AppSettings, DoseLog } from './types'
import {
  expandDoseInstances,
  isMissed,
  shouldRemindNow,
  type DoseInstance,
} from './reminders'
import {
  buildDoseNotification,
  feedbackPing,
  fireNotification,
  syncReminderSchedule,
  type ScheduledReminder,
} from './notifications'
import { addDays, dateStr } from './reminders'

/**
 * Runtime scheduler — a 30s ticker driving the pure engine:
 *
 *   tick()
 *    1. materialize today's dose logs for active medications (idempotent)
 *    2. mark stale pending doses as missed
 *    3. fire reminders (system notification + in-app card) with escalation
 */

const TICK_MS = 30_000
let timer: ReturnType<typeof setInterval> | null = null
let ticking = false

export type DueListener = (due: DoseInstance[]) => void
const listeners = new Set<DueListener>()
export function onDueDoses(fn: DueListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emitDue(due: DoseInstance[]): void {
  for (const fn of listeners) fn(due)
}

export function startScheduler(getSettings: () => AppSettings): () => void {
  stopScheduler()
  const run = () => void tick(getSettings())
  void tick(getSettings())
  timer = setInterval(run, TICK_MS)
  document.addEventListener('medimind:tick', run)
  const onHide = () => {
    if (document.visibilityState === 'hidden') {
      void publishUpcomingReminders(getSettings())
    }
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)
  return () => {
    stopScheduler()
    document.removeEventListener('medimind:tick', run)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
  }
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export async function tick(settings: AppSettings, now = new Date()): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const today = dateStr(now)
    const meds = (await db.medications.toArray()).filter((m) => m.active)

    /* 1 — materialize today's logs */
    const instances = expandDoseInstances(meds, today, settings.reminderWindows)
    const existing = new Map(
      (await db.doseLogs.bulkGet(instances.map((i) => i.logId)))
        .filter(Boolean)
        .map((l) => [l!.id, l!]),
    )
    const toCreate: DoseLog[] = []
    for (const inst of instances) {
      if (!existing.has(inst.logId)) {
        const log: DoseLog = {
          id: inst.logId,
          medicationId: inst.medicationId,
          profileId: inst.profileId,
          medicationName: inst.medicationName,
          date: inst.date,
          slot: inst.slot,
          quantity: inst.quantity,
          windowStart: inst.windowStart.toISOString(),
          windowEnd: inst.windowEnd.toISOString(),
          status: 'pending',
          remindedCount: 0,
        }
        existing.set(log.id, log)
        toCreate.push(log)
      }
    }
    if (toCreate.length) await db.doseLogs.bulkAdd(toCreate).catch(() => undefined)

    /* 2 — auto-miss anything past its window */
    const updates: Promise<unknown>[] = []
    for (const inst of instances) {
      const log = existing.get(inst.logId)!
      if (isMissed(inst, log, now)) {
        updates.push(db.doseLogs.update(log.id, { status: 'missed' }).then(() => {
          log.status = 'missed'
        }))
      }
    }
    await Promise.all(updates)

    /* 3 — reminders with escalation */
    const dueNow: DoseInstance[] = []
    for (const inst of instances) {
      const log = existing.get(inst.logId)!
      if (shouldRemindNow(inst, log, now, settings.escalationMinutes)) {
        const count = log.remindedCount + 1
        await db.doseLogs.update(log.id, {
          remindedCount: count,
          lastRemindedAt: now.toISOString(),
        })
        log.remindedCount = count
        const n = buildDoseNotification(inst, count > 1)
        void fireNotification(n)
        dueNow.push(inst)
      }
    }
    if (dueNow.length) {
      feedbackPing({ sound: settings.soundEnabled, haptics: settings.haptics })
      emitDue(dueNow)
    }
    await publishUpcomingReminders(settings, now)
  } finally {
    ticking = false
  }
}

/** Push the next ~36 hours of pending doses to the service worker so the
 *  phone can still alert after the user leaves / swipes MediMind away. */
export async function publishUpcomingReminders(settings: AppSettings, now = new Date()): Promise<void> {
  const meds = (await db.medications.toArray()).filter((m) => m.active)
  const today = dateStr(now)
  const tomorrow = addDays(today, 1)
  const instances = [
    ...expandDoseInstances(meds, today, settings.reminderWindows),
    ...expandDoseInstances(meds, tomorrow, settings.reminderWindows),
  ]
  const logs = new Map(
    (await db.doseLogs.bulkGet(instances.map((i) => i.logId)))
      .filter(Boolean)
      .map((l) => [l!.id, l!]),
  )
  const reminders: ScheduledReminder[] = []
  for (const inst of instances) {
    const log = logs.get(inst.logId)
    if (log && log.status !== 'pending') continue
    if (log?.snoozeUntil && new Date(log.snoozeUntil).getTime() > now.getTime()) {
      reminders.push(toScheduled(inst, new Date(log.snoozeUntil).getTime()))
      continue
    }
    reminders.push(toScheduled(inst, inst.windowStart.getTime()))
  }
  await syncReminderSchedule(reminders)
}

function toScheduled(inst: DoseInstance, at: number): ScheduledReminder {
  const n = buildDoseNotification(inst, false)
  return {
    tag: inst.logId,
    logId: inst.logId,
    title: n.title,
    body: n.body,
    at,
    critical: inst.isCritical,
    medicationName: inst.medicationName,
    url: `${import.meta.env.BASE_URL}#/`,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
  }
}

/* --------------------------- user dose actions --------------------------- */

export async function markTaken(logId: string, qty = 1): Promise<void> {
  const now = new Date().toISOString()
  const log = await db.doseLogs.get(logId)
  if (!log) return
  await db.doseLogs.update(logId, { status: 'taken', actedAt: now, snoozeUntil: undefined })
  // decrement refill counter when tracked
  const med = await db.medications.get(log.medicationId)
  if (med?.pillsRemaining != null) {
    await db.medications.update(med.id, {
      pillsRemaining: Math.max(0, med.pillsRemaining - log.quantity * qty),
    })
  }
}

export async function markSkipped(logId: string, reason?: string): Promise<void> {
  await db.doseLogs.update(logId, {
    status: 'skipped',
    actedAt: new Date().toISOString(),
    snoozeUntil: undefined,
    skipReason: reason,
  })
}

export async function snooze(logId: string, minutes: number): Promise<void> {
  await db.doseLogs.update(logId, {
    snoozeUntil: new Date(Date.now() + minutes * 60_000).toISOString(),
  })
}

/** Undo a mistaken action back to pending. */
export async function resetDose(logId: string): Promise<void> {
  await db.doseLogs.update(logId, {
    status: 'pending',
    actedAt: undefined,
    snoozeUntil: undefined,
    skipReason: undefined,
  })
}

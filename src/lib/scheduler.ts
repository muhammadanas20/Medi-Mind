import { db } from './db'
import type { AppSettings, DoseLog } from './types'
import {
  expandDoseInstances,
  isMissed,
  shouldRemindNow,
  type DoseInstance,
} from './reminders'
import { buildDoseNotification, feedbackPing, fireNotification } from './notifications'

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
  void tick(getSettings())
  timer = setInterval(() => void tick(getSettings()), TICK_MS)
  return stopScheduler
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export async function tick(settings: AppSettings, now = new Date()): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const meds = (await db.medications.toArray()).filter((m) => m.active)

    /* 1 — materialize today's logs */
    const instances = expandDoseInstances(meds, dateStr, settings.reminderWindows)
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
  } finally {
    ticking = false
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

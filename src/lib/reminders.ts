import type {
  DoseLog,
  Medication,
  ReminderWindows,
  Slot,
} from './types'
import { SLOTS } from './types'

/**
 * Pure reminder-engine core. No I/O, no timers — everything is a function of
 * (medications, logs, windows, now) so it is trivially unit-testable and the
 * runtime scheduler is a thin shell around it.
 */

export const DEFAULT_WINDOWS: ReminderWindows = {
  morning:   { start: '06:00', end: '10:00', enabled: true },
  afternoon: { start: '12:00', end: '15:00', enabled: true },
  evening:   { start: '17:00', end: '20:00', enabled: true },
  night:     { start: '21:00', end: '23:00', enabled: true },
}

export const SLOT_META: Record<Slot, { label: string; emoji: string; hint: string }> = {
  morning:   { label: 'Morning',   emoji: '🌅', hint: '6:00 – 10:00' },
  afternoon: { label: 'Afternoon', emoji: '☀️', hint: '12:00 – 15:00' },
  evening:   { label: 'Evening',   emoji: '🌇', hint: '17:00 – 20:00' },
  night:     { label: 'Night',     emoji: '🌙', hint: '21:00 – 23:00' },
}

/* ------------------------------- utilities ------------------------------ */

export const dateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "HH:MM" on a given local date → Date */
export function atTime(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

export function doseLogId(medicationId: string, date: string, slot: Slot): string {
  return `${medicationId}:${date}:${slot}`
}

/** Add days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = atTime(date, '12:00')
  d.setDate(d.getDate() + days)
  return dateStr(d)
}

/* --------------------------- dose-instance logic ------------------------ */

export interface DoseInstance {
  logId: string
  medicationId: string
  profileId: string
  medicationName: string
  strength?: string
  color: string
  isCritical: boolean
  food: Medication['food']
  instructions?: string
  date: string
  slot: Slot
  quantity: number
  windowStart: Date
  windowEnd: Date
}

export function medicationAppliesOn(med: Medication, date: string): boolean {
  if (!med.active) return false
  if (date < med.startDate) return false
  if (med.durationDays != null) {
    const end = addDays(med.startDate, med.durationDays - 1)
    if (date > end) return false
  }
  return true
}

/** Expand active medications into concrete dose instances for one local date. */
export function expandDoseInstances(
  meds: Medication[],
  date: string,
  windows: ReminderWindows,
): DoseInstance[] {
  const out: DoseInstance[] = []
  for (const med of meds) {
    if (!medicationAppliesOn(med, date)) continue
    for (const slot of SLOTS) {
      const qty = med.slots[slot]
      const win = windows[slot]
      if (!qty || qty <= 0 || !win.enabled) continue
      out.push({
        logId: doseLogId(med.id, date, slot),
        medicationId: med.id,
        profileId: med.profileId,
        medicationName: med.name,
        strength: med.strength,
        color: med.color,
        isCritical: med.isCritical,
        food: med.food,
        instructions: med.instructions,
        date,
        slot,
        quantity: qty,
        windowStart: atTime(date, win.start),
        windowEnd: atTime(date, win.end),
      })
    }
  }
  return out.sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime())
}

/* ------------------------------ escalation ------------------------------ */

/**
 * Decide whether a dose should re-notify `now`.
 *
 * Rules (from the product spec):
 *  1. First reminder at window start.
 *  2. If ignored → repeat every `escalationMin` (default 60).
 *  3. Until Taken / Skipped, or the window ends.
 *  4. Snooze suppresses reminders until snoozeUntil, then resumes.
 *  5. Critical meds keep reminding for one extra hour past window end.
 */
export function shouldRemindNow(
  inst: DoseInstance,
  log: Pick<DoseLog, 'status' | 'snoozeUntil' | 'lastRemindedAt'> | undefined,
  now: Date,
  escalationMin = 60,
): boolean {
  if (log && (log.status === 'taken' || log.status === 'skipped')) return false
  if (log?.snoozeUntil && new Date(log.snoozeUntil).getTime() > now.getTime()) return false

  const start = inst.windowStart.getTime()
  const end = inst.windowEnd.getTime()
  const t = now.getTime()

  // grace for critical meds: keep nagging 60 min past the window
  const hardEnd = inst.isCritical ? end + 60 * 60_000 : end
  if (t < start || t > hardEnd) return false

  if (!log?.lastRemindedAt) return t >= start
  const elapsedMin = (t - new Date(log.lastRemindedAt).getTime()) / 60_000
  return elapsedMin >= escalationMin
}

/** A pending dose past its window (and grace) is auto-marked missed. */
export function isMissed(inst: DoseInstance, log: Pick<DoseLog, 'status'> | undefined, now: Date): boolean {
  if (log && log.status !== 'pending') return false
  const graceMs = inst.isCritical ? 60 * 60_000 : 0
  return now.getTime() > inst.windowEnd.getTime() + graceMs
}

/** Is the dose currently inside its take-window? */
export function isInWindow(inst: DoseInstance, now: Date): boolean {
  const t = now.getTime()
  return t >= inst.windowStart.getTime() && t <= inst.windowEnd.getTime()
}

export function isSnoozed(log: Pick<DoseLog, 'snoozeUntil'> | undefined, now: Date): boolean {
  return !!log?.snoozeUntil && new Date(log.snoozeUntil).getTime() > now.getTime()
}

/* ------------------------------ adherence ------------------------------- */

export interface DayStat {
  date: string
  total: number
  taken: number
  skipped: number
  missed: number
  pending: number
  /** taken / scheduled (null when nothing scheduled) */
  adherence: number | null
}

export function dayStats(logs: DoseLog[]): DayStat {
  const s: DayStat = {
    date: logs[0]?.date ?? '',
    total: logs.length,
    taken: 0, skipped: 0, missed: 0, pending: 0, adherence: null,
  }
  for (const l of logs) {
    if (l.status === 'taken') s.taken++
    else if (l.status === 'skipped') s.skipped++
    else if (l.status === 'missed') s.missed++
    else s.pending++
  }
  s.adherence = s.total === 0 ? null : Math.round((s.taken / s.total) * 100)
  return s
}

/** Rolling N-day adherence series, ending at `endDate` inclusive. */
export function adherenceSeries(
  allLogs: DoseLog[],
  endDate: string,
  days: number,
): DayStat[] {
  const byDate = new Map<string, DoseLog[]>()
  for (const l of allLogs) {
    const arr = byDate.get(l.date)
    if (arr) arr.push(l)
    else byDate.set(l.date, [l])
  }
  const out: DayStat[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i)
    const logs = byDate.get(date) ?? []
    if (logs.length === 0) {
      out.push({ date, total: 0, taken: 0, skipped: 0, missed: 0, pending: 0, adherence: null })
    } else {
      out.push({ ...dayStats(logs), date })
    }
  }
  return out
}

export interface OverallAdherence {
  pct: number | null
  taken: number
  total: number
  streak: number // consecutive days (ending today/yesterday) at 100%
}

export function overallAdherence(logs: DoseLog[], endDate: string, days: number): OverallAdherence {
  const series = adherenceSeries(logs, endDate, days)
  const scheduled = series.filter((s) => s.total > 0)
  const taken = scheduled.reduce((a, s) => a + s.taken, 0)
  const total = scheduled.reduce((a, s) => a + s.total, 0)
  let streak = 0
  for (let i = series.length - 1; i >= 0; i--) {
    const s = series[i]
    if (s.total === 0) continue
    if (s.taken === s.total) streak++
    else break
  }
  return { pct: total === 0 ? null : Math.round((taken / total) * 100), taken, total, streak }
}

/* ----------------------------- label helpers ---------------------------- */

export function foodLabel(food: Medication['food']): string {
  switch (food) {
    case 'before': return 'Before food'
    case 'after': return 'After food'
    case 'with': return 'With food'
    default: return 'Any time'
  }
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

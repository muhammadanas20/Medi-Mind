import { describe, expect, it } from 'vitest'
import type { Medication, ReminderWindows } from './types'
import {
  adherenceSeries,
  atTime,
  dateStr,
  DEFAULT_WINDOWS,
  doseLogId,
  expandDoseInstances,
  isMissed,
  medicationAppliesOn,
  overallAdherence,
  shouldRemindNow,
  type DoseInstance,
} from './reminders'

const NOW = new Date('2026-08-12T08:30:00') // inside morning window

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 'm1',
    profileId: 'p1',
    name: 'Concor',
    strength: '2.5 mg',
    slots: { morning: 1, night: 1 },
    food: 'after',
    startDate: '2026-08-01',
    durationDays: 30,
    color: '#07c5a8',
    isCritical: false,
    active: true,
    createdAt: '2026-08-01T00:00:00Z',
    ...over,
  }
}

describe('expandDoseInstances', () => {
  it('expands one instance per (med, slot) with window times', () => {
    const inst = expandDoseInstances([med()], '2026-08-12', DEFAULT_WINDOWS)
    expect(inst).toHaveLength(2)
    expect(inst[0].slot).toBe('morning')
    expect(inst[1].slot).toBe('night')
    expect(dateStr(inst[0].windowStart)).toBe('2026-08-12')
    expect(inst[0].windowStart.getHours()).toBe(6)
    expect(inst[0].windowEnd.getHours()).toBe(10)
    expect(inst[0].logId).toBe(doseLogId('m1', '2026-08-12', 'morning'))
  })

  it('skips inactive meds, dates before start, and past duration', () => {
    expect(expandDoseInstances([med({ active: false })], '2026-08-12', DEFAULT_WINDOWS)).toHaveLength(0)
    expect(expandDoseInstances([med()], '2026-07-01', DEFAULT_WINDOWS)).toHaveLength(0)
    // duration: 2026-08-01 + 30 days → last day 2026-08-30
    expect(expandDoseInstances([med()], '2026-08-30', DEFAULT_WINDOWS)).toHaveLength(2)
    expect(expandDoseInstances([med()], '2026-08-31', DEFAULT_WINDOWS)).toHaveLength(0)
  })

  it('skips slots disabled in reminder windows', () => {
    const windows: ReminderWindows = {
      ...DEFAULT_WINDOWS,
      morning: { ...DEFAULT_WINDOWS.morning, enabled: false },
    }
    const inst = expandDoseInstances([med()], '2026-08-12', windows)
    expect(inst.map((i) => i.slot)).toEqual(['night'])
  })
})

describe('medicationAppliesOn', () => {
  it('respects duration boundaries exactly', () => {
    expect(medicationAppliesOn(med({ durationDays: 1 }), '2026-08-01')).toBe(true)
    expect(medicationAppliesOn(med({ durationDays: 1 }), '2026-08-02')).toBe(false)
    expect(medicationAppliesOn(med({ durationDays: undefined }), '2035-01-01')).toBe(true)
  })
})

describe('shouldRemindNow (escalation)', () => {
  const inst: DoseInstance = expandDoseInstances([med()], '2026-08-12', DEFAULT_WINDOWS)[0]

  it('does not remind before the window', () => {
    const early = new Date('2026-08-12T05:59:00')
    expect(shouldRemindNow(inst, undefined, early)).toBe(false)
  })

  it('reminds at window start when never reminded', () => {
    expect(shouldRemindNow(inst, undefined, new Date('2026-08-12T06:00:00'))).toBe(true)
  })

  it('does not re-remind until escalationMinutes passed', () => {
    const log = { status: 'pending' as const, lastRemindedAt: '2026-08-12T06:00:00.000Z' }
    const plus30 = new Date(new Date(log.lastRemindedAt).getTime() + 30 * 60_000)
    expect(shouldRemindNow(inst, log, plus30, 60)).toBe(false)
    const plus61 = new Date(new Date(log.lastRemindedAt).getTime() + 61 * 60_000)
    expect(shouldRemindNow(inst, log, plus61, 60)).toBe(true)
  })

  it('stops after taken or skipped', () => {
    expect(
      shouldRemindNow(inst, { status: 'taken' }, NOW),
    ).toBe(false)
    expect(
      shouldRemindNow(inst, { status: 'skipped' }, NOW),
    ).toBe(false)
  })

  it('snooze suppresses until snoozeUntil, then resumes', () => {
    const future = new Date(NOW.getTime() + 30 * 60_000).toISOString()
    expect(shouldRemindNow(inst, { status: 'pending', snoozeUntil: future }, NOW)).toBe(false)
    const past = new Date(NOW.getTime() - 5 * 60_000).toISOString()
    expect(shouldRemindNow(inst, { status: 'pending', snoozeUntil: past }, NOW)).toBe(true)
  })

  it('never reminds past window end for normal meds, +1h for critical', () => {
    const end = new Date('2026-08-12T10:30:00')
    expect(shouldRemindNow(inst, undefined, end)).toBe(false)
    const critical: DoseInstance = { ...inst, isCritical: true }
    expect(shouldRemindNow(critical, undefined, end)).toBe(true)
    expect(shouldRemindNow(critical, undefined, new Date('2026-08-12T11:01:00'))).toBe(false)
  })
})

describe('isMissed', () => {
  const inst = expandDoseInstances([med()], '2026-08-12', DEFAULT_WINDOWS)[0]

  it('marks pending doses missed after the window', () => {
    expect(isMissed(inst, { status: 'pending' }, new Date('2026-08-12T10:00:01'))).toBe(true)
    expect(isMissed(inst, { status: 'pending' }, new Date('2026-08-12T09:00:00'))).toBe(false)
  })

  it('critical meds get a one-hour grace period', () => {
    const critical = { ...inst, isCritical: true }
    expect(isMissed(critical, { status: 'pending' }, new Date('2026-08-12T10:30:00'))).toBe(false)
    expect(isMissed(critical, { status: 'pending' }, new Date('2026-08-12T11:00:01'))).toBe(true)
  })

  it('never marks acted doses as missed', () => {
    expect(isMissed(inst, { status: 'taken' }, new Date('2026-08-12T12:00:00'))).toBe(false)
  })
})

describe('adherence stats', () => {
  function log(date: string, slot: 'morning' | 'night', status: 'taken' | 'missed' | 'skipped') {
    return {
      id: doseLogId('m1', date, slot),
      medicationId: 'm1',
      profileId: 'p1',
      medicationName: 'Concor',
      date,
      slot,
      quantity: 1,
      windowStart: atTime(date, '06:00').toISOString(),
      windowEnd: atTime(date, '10:00').toISOString(),
      status,
      remindedCount: 1,
    } as const
  }

  const logs = [
    log('2026-08-11', 'morning', 'taken'),
    log('2026-08-11', 'night', 'taken'),
    log('2026-08-12', 'morning', 'taken'),
    log('2026-08-12', 'night', 'missed'),
  ]

  it('computes a 7-day series with correct counts', () => {
    const series = adherenceSeries([...logs], '2026-08-12', 7)
    expect(series).toHaveLength(7)
    const d12 = series[6]
    expect(d12.date).toBe('2026-08-12')
    expect(d12.total).toBe(2)
    expect(d12.taken).toBe(1)
    expect(d12.missed).toBe(1)
    expect(d12.adherence).toBe(50)
    // empty days report null adherence
    expect(series[0].total).toBe(0)
    expect(series[0].adherence).toBeNull()
  })

  it('computes overall percentage + streak', () => {
    const overall = overallAdherence([...logs], '2026-08-12', 7)
    expect(overall.taken).toBe(3)
    expect(overall.total).toBe(4)
    expect(overall.pct).toBe(75)
    expect(overall.streak).toBe(0) // today not perfect
    const allTaken = overallAdherence(logs.filter((l) => l.status === 'taken').map((l) => l), '2026-08-11', 2)
    expect(allTaken.streak).toBe(1)
  })
})

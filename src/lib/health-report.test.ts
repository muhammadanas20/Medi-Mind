import { describe, expect, it } from 'vitest'
import { buildHealthReport, inferStability } from './health-report'
import type { VitalReading } from './types'

function bp(id: string, sys: number, dia: number, when: string): VitalReading {
  return {
    id, profileId: 'p', kind: 'blood_pressure', recordedAt: when, date: when.slice(0, 10),
    systolic: sys, diastolic: dia, unit: 'mmHg', source: 'manual', createdAt: when,
  }
}

function sugar(id: string, value: number, when: string, context: VitalReading['context'] = 'fasting'): VitalReading {
  return {
    id, profileId: 'p', kind: 'blood_sugar', recordedAt: when, date: when.slice(0, 10),
    value, unit: 'mg/dL', context, source: 'device_scan', createdAt: when,
  }
}

describe('buildHealthReport', () => {
  it('celebrates a normal stable BP in plain language', () => {
    const now = bp('c', 118, 76, '2026-08-13T07:00:00.000Z')
    const prev = [
      bp('a', 120, 78, '2026-08-12T07:00:00.000Z'),
      bp('b', 116, 74, '2026-08-11T07:00:00.000Z'),
    ]
    const r = buildHealthReport(now, prev)
    expect(r.headline.toLowerCase()).toMatch(/good|okay|ok/)
    expect(r.cls.band).toBe('normal')
    expect(r.stability).toBe('stable')
    expect(r.urgent).toBe(false)
    expect(r.suggestions.some((s) => /walk/i.test(s.title + s.detail))).toBe(true)
    expect(r.suggestions.some((s) => /prescri/i.test(s.detail))).toBe(true)
  })

  it('flags a high BP and tells the patient to skip hard exercise', () => {
    const r = buildHealthReport(bp('c', 152, 96, '2026-08-13T07:00:00.000Z'), [
      bp('a', 128, 82, '2026-08-12T07:00:00.000Z'),
    ])
    expect(r.cls.band).toBe('high')
    expect(r.urgent).toBe(false)
    expect(r.headline.toLowerCase()).toMatch(/high/)
    expect(r.suggestions.some((s) => /exercise|lifting|workout/i.test(s.title + s.detail))).toBe(true)
  })

  it('marks crisis BP as urgent and asks for medical help', () => {
    const r = buildHealthReport(bp('c', 192, 124, '2026-08-13T07:00:00.000Z'), [])
    expect(r.urgent).toBe(true)
    expect(r.suggestions[0].icon).toBe('doctor')
  })

  it('explains fasting sugar that is a bit high', () => {
    const r = buildHealthReport(sugar('c', 112, '2026-08-13T07:00:00.000Z'), [
      sugar('a', 98, '2026-08-12T07:00:00.000Z'),
    ])
    expect(r.cls.band).toBe('elevated')
    expect(r.summary.toLowerCase()).toMatch(/fasting/)
    expect(r.suggestions.some((s) => s.icon === 'walk' || s.icon === 'water')).toBe(true)
  })

  it('never invents a prescription change', () => {
    const r = buildHealthReport(bp('c', 150, 94, '2026-08-13T07:00:00.000Z'), [])
    const blob = r.suggestions.map((s) => s.detail).join(' ')
    expect(blob.toLowerCase()).not.toMatch(/increase your dose|double|stop your tablet/)
  })
})

describe('inferStability', () => {
  it('returns first when there is no history', () => {
    expect(inferStability(bp('c', 120, 80, '2026-08-13T07:00:00.000Z'), [])).toBe('first')
  })

  it('detects a rising run', () => {
    const cur = bp('c', 148, 90, '2026-08-13T07:00:00.000Z')
    const prior = [
      bp('b', 132, 84, '2026-08-12T07:00:00.000Z'),
      bp('a', 124, 80, '2026-08-11T07:00:00.000Z'),
    ]
    expect(inferStability(cur, prior)).toBe('rising')
  })
})

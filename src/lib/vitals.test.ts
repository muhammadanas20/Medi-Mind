import { describe, expect, it } from 'vitest'
import {
  classifyBp,
  classifyGlucose,
  classifyHr,
  classifyReading,
  classifySpo2,
  classifyTemp,
  convertVitalValue,
  filterHistory,
  formatReading,
  historyCutoff,
  inferSugarContext,
  isDraftComplete,
  normalizeUnit,
  parseVitalsFromText,
  sanitizeExtractedVital,
  trendDirection,
  VITALS_HISTORY_DAYS,
} from './vitals'

describe('history window (≈ 3 months)', () => {
  it('defaults to 90 days', () => {
    expect(VITALS_HISTORY_DAYS).toBe(90)
  })

  it('cutoff is inclusive of today and 89 days back', () => {
    expect(historyCutoff(90, '2026-08-13')).toBe('2026-05-16')
  })

  it('filterHistory drops rows older than the window', () => {
    const rows = [
      { date: '2026-04-01' },
      { date: '2026-05-16' },
      { date: '2026-08-13' },
      { date: '2026-08-14' },
    ]
    expect(filterHistory(rows, 90, '2026-08-13').map((r) => r.date)).toEqual([
      '2026-05-16',
      '2026-08-13',
    ])
  })
})

describe('units', () => {
  it('normalizes common aliases', () => {
    expect(normalizeUnit('blood_sugar', 'mg/dl')).toBe('mg/dL')
    expect(normalizeUnit('blood_sugar', 'mmol')).toBe('mmol/L')
    expect(normalizeUnit('weight', 'lbs')).toBe('lb')
    expect(normalizeUnit('temperature', 'c')).toBe('°C')
    expect(normalizeUnit('blood_pressure', 'whatever')).toBe('mmHg')
  })

  it('converts sugar, weight and temperature', () => {
    expect(convertVitalValue('blood_sugar', 90, 'mg/dL', 'mmol/L')).toBe(5)
    expect(convertVitalValue('blood_sugar', 5, 'mmol/L', 'mg/dL')).toBe(90)
    expect(convertVitalValue('weight', 10, 'kg', 'lb')).toBe(22)
    expect(convertVitalValue('temperature', 98.6, '°F', '°C')).toBe(37)
  })
})

describe('classification (reference ranges, not diagnosis)', () => {
  it('classifies AHA-style blood pressure bands', () => {
    expect(classifyBp(118, 76).label).toBe('Normal')
    expect(classifyBp(124, 76).label).toBe('Elevated')
    expect(classifyBp(132, 82).label).toBe('High stage 1')
    expect(classifyBp(150, 94).band).toBe('high')
    expect(classifyBp(190, 122).label).toBe('Crisis range')
    expect(classifyBp(88, 54).band).toBe('low')
  })

  it('honours a personal BP target over reference ranges', () => {
    const cls = classifyBp(138, 86, { targetSystolicMax: 140, targetDiastolicMax: 90 })
    expect(cls.label).toBe('In target')
    expect(classifyBp(142, 86, { targetSystolicMax: 140 }).label).toBe('Above target')
  })

  it('classifies fasting vs after-meal glucose', () => {
    expect(classifyGlucose(95, 'mg/dL', 'fasting').band).toBe('normal')
    expect(classifyGlucose(110, 'mg/dL', 'fasting').band).toBe('elevated')
    expect(classifyGlucose(130, 'mg/dL', 'fasting').band).toBe('high')
    expect(classifyGlucose(150, 'mg/dL', 'after_meal').band).toBe('elevated')
    expect(classifyGlucose(65, 'mg/dL', 'random').band).toBe('low')
    expect(classifyGlucose(5.2, 'mmol/L', 'fasting').band).toBe('normal')
  })

  it('classifies pulse, SpO2 and temperature', () => {
    expect(classifyHr(72).band).toBe('normal')
    expect(classifyHr(48).band).toBe('low')
    expect(classifySpo2(97).band).toBe('normal')
    expect(classifySpo2(92).label).toBe('Low-normal')
    expect(classifyTemp(98.6, '°F').band).toBe('normal')
    expect(classifyTemp(38.4, '°C').label).toBe('Fever')
  })

  it('classifyReading routes BP to the dual-number path', () => {
    expect(classifyReading({ kind: 'blood_pressure', systolic: 118, diastolic: 76, unit: 'mmHg' }).tone).toBe('success')
  })
})

describe('parseVitalsFromText (OCR fallback)', () => {
  it('reads a typical BP cuff screen', () => {
    const [bp] = parseVitalsFromText('SYS 132  DIA 84  PULSE 76  mmHg')
    expect(bp).toMatchObject({ kind: 'blood_pressure', systolic: 132, diastolic: 84, pulse: 76 })
  })

  it('reads slash-style BP', () => {
    const [bp] = parseVitalsFromText('128/82 mmHg')
    expect(bp).toMatchObject({ kind: 'blood_pressure', systolic: 128, diastolic: 82 })
  })

  it('reads a glucometer with units and fasting hint', () => {
    const found = parseVitalsFromText('Glucose 104 mg/dL fasting')
    const g = found.find((r) => r.kind === 'blood_sugar')
    expect(g).toMatchObject({ value: 104, unit: 'mg/dL', context: 'fasting' })
  })

  it('reads mmol/L glucose', () => {
    const g = parseVitalsFromText('BG 6.4 mmol/L').find((r) => r.kind === 'blood_sugar')
    expect(g).toMatchObject({ value: 6.4, unit: 'mmol/L' })
  })

  it('returns nothing when the text has no reading', () => {
    expect(parseVitalsFromText('hello world prescription')).toEqual([])
  })

  it('clamps insane extracted numbers away', () => {
    const out = sanitizeExtractedVital({ kind: 'blood_pressure', systolic: 900, diastolic: 82 })
    expect(out.systolic).toBeUndefined()
    expect(out.diastolic).toBe(82)
  })
})

describe('draft + formatting helpers', () => {
  it('requires both BP numbers before a draft is complete', () => {
    expect(isDraftComplete({ kind: 'blood_pressure', systolic: 120 })).toBe(false)
    expect(isDraftComplete({ kind: 'blood_pressure', systolic: 120, diastolic: 80 })).toBe(true)
    expect(isDraftComplete({ kind: 'blood_sugar', value: 104 })).toBe(true)
  })

  it('formats BP as sys/dia', () => {
    expect(formatReading({
      kind: 'blood_pressure', systolic: 120, diastolic: 80, unit: 'mmHg',
    })).toBe('120/80 mmHg')
  })

  it('trendDirection is flat inside the epsilon', () => {
    expect(trendDirection(120, 120.2)).toBe('flat')
    expect(trendDirection(130, 120)).toBe('up')
    expect(trendDirection(110, 120)).toBe('down')
    expect(trendDirection(undefined, 120)).toBe('none')
  })

  it('infers sugar context words', () => {
    expect(inferSugarContext('taken after meal')).toBe('after_meal')
    expect(inferSugarContext('FBS')).toBe('fasting')
  })
})

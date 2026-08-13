/**
 * Vitals domain — units, classification, OCR fallback, 3-month history window.
 *
 * SAFETY: bands are organizational reference ranges, never a diagnosis.
 * AI / OCR output is untrusted input until a human confirms the reading.
 */

import type {
  BloodSugarContext,
  ExtractedVital,
  HealthTracker,
  VitalKind,
  VitalReading,
} from './types'
import { addDays } from './reminders'

export const VITALS_HISTORY_DAYS = 90

export const VITAL_KINDS: VitalKind[] = [
  'blood_pressure',
  'blood_sugar',
  'heart_rate',
  'weight',
  'spo2',
  'temperature',
]

export const SUGAR_CONTEXTS: { id: BloodSugarContext; label: string }[] = [
  { id: 'fasting', label: 'Fasting' },
  { id: 'before_meal', label: 'Before meal' },
  { id: 'after_meal', label: 'After meal' },
  { id: 'random', label: 'Random' },
  { id: 'bedtime', label: 'Bedtime' },
]

export interface VitalMeta {
  label: string
  short: string
  unit: string
  altUnits: string[]
  featured: boolean
  blurb: string
  who: string
  color: string
  placeholder: string
}

export const VITAL_META: Record<VitalKind, VitalMeta> = {
  blood_pressure: {
    label: 'Blood pressure',
    short: 'BP',
    unit: 'mmHg',
    altUnits: [],
    featured: true,
    blurb: 'Log systolic / diastolic from your cuff. Useful if you live with hypertension or heart disease.',
    who: 'Heart & BP patients',
    color: '#f43f5e',
    placeholder: '120 / 80',
  },
  blood_sugar: {
    label: 'Blood sugar',
    short: 'Glucose',
    unit: 'mg/dL',
    altUnits: ['mmol/L'],
    featured: true,
    blurb: 'Log glucometer readings — fasting, before or after meals. Useful for diabetes or prediabetes.',
    who: 'Diabetes patients',
    color: '#8b5cf6',
    placeholder: '104',
  },
  heart_rate: {
    label: 'Heart rate',
    short: 'Pulse',
    unit: 'bpm',
    altUnits: [],
    featured: false,
    blurb: 'Resting pulse from a monitor, watch, or the extra reading on many BP cuffs.',
    who: 'Optional',
    color: '#f43f5e',
    placeholder: '72',
  },
  weight: {
    label: 'Weight',
    short: 'Weight',
    unit: 'kg',
    altUnits: ['lb'],
    featured: false,
    blurb: 'Scale readings over time. Pair with BP or sugar if your doctor asked you to watch weight.',
    who: 'Optional',
    color: '#0ea5e9',
    placeholder: '72.5',
  },
  spo2: {
    label: 'Blood oxygen',
    short: 'SpO₂',
    unit: '%',
    altUnits: [],
    featured: false,
    blurb: 'Pulse-oximeter saturation. Handy after illness or if you track respiratory health.',
    who: 'Optional',
    color: '#07c5a8',
    placeholder: '98',
  },
  temperature: {
    label: 'Temperature',
    short: 'Temp',
    unit: '°F',
    altUnits: ['°C'],
    featured: false,
    blurb: 'Thermometer readings when you are unwell or monitoring a fever.',
    who: 'Optional',
    color: '#f59e0b',
    placeholder: '98.6',
  },
}

export type VitalBand = 'low' | 'normal' | 'elevated' | 'high' | 'unknown'
export type VitalTone = 'success' | 'warn' | 'danger' | 'neutral'

export interface VitalClass {
  band: VitalBand
  label: string
  tone: VitalTone
}

/* --------------------------------- window -------------------------------- */

export function historyCutoff(days = VITALS_HISTORY_DAYS, endDate?: string): string {
  const end = endDate ?? localDateStr()
  return addDays(end, -(days - 1))
}

export function filterHistory<T extends { date: string }>(
  rows: T[],
  days = VITALS_HISTORY_DAYS,
  endDate?: string,
): T[] {
  const end = endDate ?? localDateStr()
  const cut = historyCutoff(days, end)
  return rows.filter((r) => r.date >= cut && r.date <= end)
}

export function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function localDateTimeValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${localDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string): { recordedAt: string; date: string } {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    return { recordedAt: now.toISOString(), date: localDateStr(now) }
  }
  return { recordedAt: d.toISOString(), date: localDateStr(d) }
}

/* --------------------------------- units --------------------------------- */

export function normalizeUnit(kind: VitalKind, unit?: string): string {
  const u = (unit ?? '').trim()
  if (kind === 'blood_pressure') return 'mmHg'
  if (kind === 'heart_rate') return 'bpm'
  if (kind === 'spo2') return '%'
  if (kind === 'blood_sugar') return /mmol/i.test(u) ? 'mmol/L' : 'mg/dL'
  if (kind === 'weight') return /lb/i.test(u) ? 'lb' : 'kg'
  if (kind === 'temperature') {
    if (/c/i.test(u) && !/f/i.test(u)) return '°C'
    return '°F'
  }
  return u || 'mmHg'
}

export function convertVitalValue(
  kind: VitalKind,
  value: number,
  fromUnit: string,
  toUnit: string,
): number {
  const from = normalizeUnit(kind, fromUnit)
  const to = normalizeUnit(kind, toUnit)
  if (from === to) return value
  if (kind === 'blood_sugar') {
    if (from === 'mg/dL' && to === 'mmol/L') return round1(value / 18)
    if (from === 'mmol/L' && to === 'mg/dL') return Math.round(value * 18)
  }
  if (kind === 'weight') {
    if (from === 'kg' && to === 'lb') return round1(value * 2.20462)
    if (from === 'lb' && to === 'kg') return round1(value / 2.20462)
  }
  if (kind === 'temperature') {
    if (from === '°F' && to === '°C') return round1(((value - 32) * 5) / 9)
    if (from === '°C' && to === '°F') return round1((value * 9) / 5 + 32)
  }
  return value
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/* --------------------------------- clamp --------------------------------- */

export function clampNumber(n: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(n)) return undefined
  if (n < min || n > max) return undefined
  return n
}

export function sanitizeExtractedVital(raw: ExtractedVital): ExtractedVital {
  const kind = raw.kind
  const unit = kind ? normalizeUnit(kind, raw.unit) : raw.unit
  const next: ExtractedVital = { ...raw, kind, unit }
  if (next.systolic != null) next.systolic = clampNumber(next.systolic, 60, 260)
  if (next.diastolic != null) next.diastolic = clampNumber(next.diastolic, 30, 180)
  if (next.pulse != null) next.pulse = clampNumber(next.pulse, 25, 230)
  if (next.value != null && kind) {
    const bounds = valueBounds(kind, unit)
    next.value = clampNumber(next.value, bounds[0], bounds[1])
  }
  return next
}

function valueBounds(kind: VitalKind, unit?: string): [number, number] {
  const u = normalizeUnit(kind, unit)
  switch (kind) {
    case 'blood_sugar':
      return u === 'mmol/L' ? [1, 33] : [20, 600]
    case 'heart_rate':
      return [25, 230]
    case 'weight':
      return u === 'lb' ? [40, 880] : [15, 400]
    case 'spo2':
      return [50, 100]
    case 'temperature':
      return u === '°C' ? [32, 43] : [90, 110]
    default:
      return [0, 400]
  }
}

/* ------------------------------ formatting ------------------------------- */

export function readingPrimary(
  r: Pick<VitalReading, 'kind' | 'value' | 'systolic'>,
): number | undefined {
  if (r.kind === 'blood_pressure') return r.systolic
  return r.value
}

export function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round1(n))
}

export function formatReading(
  r: Pick<VitalReading, 'kind' | 'value' | 'systolic' | 'diastolic' | 'pulse' | 'unit'>,
): string {
  if (r.kind === 'blood_pressure' && r.systolic != null && r.diastolic != null) {
    return `${r.systolic}/${r.diastolic} ${r.unit}`
  }
  if (r.value == null) return '—'
  return `${formatNum(r.value)} ${r.unit}`
}

export function formatReadingWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const today = localDateStr()
  const yesterday = addDays(today, -1)
  const date = localDateStr(d)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (date === today) return `Today ${time}`
  if (date === yesterday) return `Yesterday ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function contextLabel(ctx?: BloodSugarContext): string | undefined {
  return SUGAR_CONTEXTS.find((c) => c.id === ctx)?.label
}

export type TrendDir = 'up' | 'down' | 'flat' | 'none'

export function trendDirection(current?: number, previous?: number, epsilon = 0.5): TrendDir {
  if (current == null || previous == null) return 'none'
  const d = current - previous
  if (Math.abs(d) <= epsilon) return 'flat'
  return d > 0 ? 'up' : 'down'
}

/* ----------------------------- classification ---------------------------- */

export function classifyReading(
  r: Pick<VitalReading, 'kind' | 'value' | 'systolic' | 'diastolic' | 'unit' | 'context'>,
  tracker?: Pick<HealthTracker, 'targetMin' | 'targetMax' | 'targetSystolicMax' | 'targetDiastolicMax'> | null,
): VitalClass {
  if (r.kind === 'blood_pressure') return classifyBp(r.systolic, r.diastolic, tracker)
  const raw = r.value
  if (raw == null) return { band: 'unknown', label: 'Unknown', tone: 'neutral' }

  if (tracker && (tracker.targetMin != null || tracker.targetMax != null)) {
    if (tracker.targetMin != null && raw < tracker.targetMin) return { band: 'low', label: 'Below target', tone: 'warn' }
    if (tracker.targetMax != null && raw > tracker.targetMax) return { band: 'high', label: 'Above target', tone: 'danger' }
    return { band: 'normal', label: 'In target', tone: 'success' }
  }

  switch (r.kind) {
    case 'blood_sugar':
      return classifyGlucose(raw, r.unit, r.context)
    case 'heart_rate':
      return classifyHr(raw)
    case 'spo2':
      return classifySpo2(raw)
    case 'temperature':
      return classifyTemp(raw, r.unit)
    default:
      return { band: 'unknown', label: 'Logged', tone: 'neutral' }
  }
}

export function classifyBp(
  systolic?: number,
  diastolic?: number,
  tracker?: Pick<HealthTracker, 'targetSystolicMax' | 'targetDiastolicMax'> | null,
): VitalClass {
  if (systolic == null || diastolic == null) return { band: 'unknown', label: 'Unknown', tone: 'neutral' }

  if (tracker?.targetSystolicMax != null || tracker?.targetDiastolicMax != null) {
    const sysHi = tracker.targetSystolicMax != null && systolic > tracker.targetSystolicMax
    const diaHi = tracker.targetDiastolicMax != null && diastolic > tracker.targetDiastolicMax
    if (sysHi || diaHi) return { band: 'high', label: 'Above target', tone: 'danger' }
    return { band: 'normal', label: 'In target', tone: 'success' }
  }

  if (systolic > 180 || diastolic > 120) return { band: 'high', label: 'Crisis range', tone: 'danger' }
  if (systolic >= 140 || diastolic >= 90) return { band: 'high', label: 'High', tone: 'danger' }
  if (systolic >= 130 || diastolic >= 80) return { band: 'elevated', label: 'High stage 1', tone: 'warn' }
  if (systolic >= 120 && diastolic < 80) return { band: 'elevated', label: 'Elevated', tone: 'warn' }
  if (systolic < 90 || diastolic < 60) return { band: 'low', label: 'Low', tone: 'warn' }
  return { band: 'normal', label: 'Normal', tone: 'success' }
}

export function classifyGlucose(
  value: number,
  unit?: string,
  context?: BloodSugarContext,
): VitalClass {
  const mg = normalizeUnit('blood_sugar', unit) === 'mmol/L'
    ? value * 18
    : value
  const post = context === 'after_meal' || context === 'random'
  if (mg < 70) return { band: 'low', label: 'Low', tone: 'danger' }
  if (post) {
    if (mg >= 200) return { band: 'high', label: 'High', tone: 'danger' }
    if (mg >= 140) return { band: 'elevated', label: 'Elevated', tone: 'warn' }
    return { band: 'normal', label: 'Normal', tone: 'success' }
  }
  // fasting / before meal / bedtime
  if (mg >= 126) return { band: 'high', label: 'High', tone: 'danger' }
  if (mg >= 100) return { band: 'elevated', label: 'Elevated', tone: 'warn' }
  return { band: 'normal', label: 'Normal', tone: 'success' }
}

export function classifyHr(bpm: number): VitalClass {
  if (bpm < 50) return { band: 'low', label: 'Low', tone: 'warn' }
  if (bpm > 120) return { band: 'high', label: 'High', tone: 'danger' }
  if (bpm > 100) return { band: 'elevated', label: 'Elevated', tone: 'warn' }
  return { band: 'normal', label: 'Normal', tone: 'success' }
}

export function classifySpo2(pct: number): VitalClass {
  if (pct < 90) return { band: 'low', label: 'Low', tone: 'danger' }
  if (pct < 95) return { band: 'elevated', label: 'Low-normal', tone: 'warn' }
  return { band: 'normal', label: 'Normal', tone: 'success' }
}

export function classifyTemp(value: number, unit?: string): VitalClass {
  const f = normalizeUnit('temperature', unit) === '°C' ? (value * 9) / 5 + 32 : value
  if (f < 97) return { band: 'low', label: 'Low', tone: 'warn' }
  if (f >= 100.4) return { band: 'high', label: 'Fever', tone: 'danger' }
  if (f >= 99.2) return { band: 'elevated', label: 'Warm', tone: 'warn' }
  return { band: 'normal', label: 'Normal', tone: 'success' }
}

/* --------------------------- OCR / text parse ---------------------------- */

const SUGAR_CONTEXT_RE: [RegExp, BloodSugarContext][] = [
  [/fast(ing)?|fbs|fpg/i, 'fasting'],
  [/before\s*meal|pre[- ]?meal|ac\b/i, 'before_meal'],
  [/after\s*meal|post[- ]?meal|ppg|pc\b/i, 'after_meal'],
  [/bed\s*time|night/i, 'bedtime'],
  [/random|rbs/i, 'random'],
]

export function inferSugarContext(text: string): BloodSugarContext | undefined {
  for (const [re, ctx] of SUGAR_CONTEXT_RE) if (re.test(text)) return ctx
  return undefined
}

export function inferVitalKind(text: string): VitalKind | undefined {
  const t = text.toLowerCase()
  if (/(blood pressure|systolic|diastolic|\bbp\b|mmhg)/.test(t)) return 'blood_pressure'
  if (/(glucose|sugar|glucometer|mg\/?dl|mmol)/.test(t)) return 'blood_sugar'
  if (/(spo2|o2 sat|oxygen|oximeter)/.test(t)) return 'spo2'
  if (/(temp|thermometer|°c|°f|\bcelsius|\bfahrenheit)/.test(t)) return 'temperature'
  if (/(weight|kg\b|lb\b|scale)/.test(t)) return 'weight'
  if (/(pulse|bpm|heart rate)/.test(t)) return 'heart_rate'
  return undefined
}

/**
 * Best-effort structured reading from OCR / device-screen text.
 * Prefers labeled fields; never invents a value that isn't in the text.
 */
export function parseVitalsFromText(text: string): ExtractedVital[] {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return []
  const out: ExtractedVital[] = []

  const sysL = t.match(/sys(?:tolic)?[^0-9]{0,10}(\d{2,3})/i)
  const diaL = t.match(/dia(?:stolic)?[^0-9]{0,10}(\d{2,3})/i)
  const slash = t.match(/\b([1-2]\d{2})\s*\/\s*(\d{2,3})\b/)
  let systolic = sysL ? Number(sysL[1]) : slash ? Number(slash[1]) : undefined
  let diastolic = diaL ? Number(diaL[1]) : slash ? Number(slash[2]) : undefined
  systolic = systolic != null ? clampNumber(systolic, 60, 260) : undefined
  diastolic = diastolic != null ? clampNumber(diastolic, 30, 180) : undefined

  if (systolic != null && diastolic != null && systolic > diastolic) {
    const pulseM = t.match(/(?:pulse|pul|hr|heart rate)[^0-9]{0,10}(\d{2,3})/i)
    const pulse = pulseM ? clampNumber(Number(pulseM[1]), 25, 230) : undefined
    out.push(sanitizeExtractedVital({
      kind: 'blood_pressure',
      systolic,
      diastolic,
      pulse,
      unit: 'mmHg',
    }))
  }

  const glu = t.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(mg\/?\s*dl|mmol(?:\s*\/?\s*l)?)/i)
  const gluLabeled = t.match(/(?:glucose|sugar|bg|glu)[^0-9]{0,12}(\d{1,3}(?:\.\d{1,2})?)/i)
  if (glu || gluLabeled) {
    const unit = glu && /mmol/i.test(glu[2]) ? 'mmol/L' : 'mg/dL'
    const value = Number((glu ?? gluLabeled)![1])
    out.push(sanitizeExtractedVital({
      kind: 'blood_sugar',
      value,
      unit,
      context: inferSugarContext(t),
    }))
  }

  const spo2 = t.match(/(?:spo2|sp02|o2\s*sat(?:uration)?|ox)[^0-9]{0,10}(\d{2,3})\s*%?/i)
    ?? t.match(/\b(\d{2,3})\s*%\s*(?:spo2|o2)?/i)
  if (spo2) {
    out.push(sanitizeExtractedVital({ kind: 'spo2', value: Number(spo2[1]), unit: '%' }))
  }

  const temp = t.match(/\b(\d{2,3}(?:\.\d)?)\s*°?\s*([CF])\b/i)
    ?? t.match(/(?:temp(?:erature)?)[^0-9]{0,8}(\d{2,3}(?:\.\d)?)\s*°?\s*([CF])?/i)
  if (temp) {
    const unit = temp[2]?.toUpperCase() === 'C' ? '°C' : '°F'
    out.push(sanitizeExtractedVital({ kind: 'temperature', value: Number(temp[1]), unit }))
  }

  const weight = t.match(/\b(\d{2,3}(?:\.\d)?)\s*(kg|lb|lbs)\b/i)
  if (weight) {
    out.push(sanitizeExtractedVital({
      kind: 'weight',
      value: Number(weight[1]),
      unit: /lb/i.test(weight[2]) ? 'lb' : 'kg',
    }))
  }

  if (!out.some((r) => r.kind === 'heart_rate' || r.pulse != null)) {
    const hr = t.match(/(?:heart rate|pulse|bpm)[^0-9]{0,10}(\d{2,3})/i)
    if (hr) out.push(sanitizeExtractedVital({ kind: 'heart_rate', value: Number(hr[1]), unit: 'bpm' }))
  }

  return out.filter((r) => r.value != null || (r.systolic != null && r.diastolic != null))
}

export function defaultUnitFor(kind: VitalKind, existing?: string): string {
  return existing ? normalizeUnit(kind, existing) : VITAL_META[kind].unit
}

export function emptyDraft(kind: VitalKind, unit?: string): ExtractedVital {
  return {
    kind,
    unit: defaultUnitFor(kind, unit),
    context: kind === 'blood_sugar' ? 'fasting' : undefined,
  }
}

export function isDraftComplete(d: ExtractedVital): boolean {
  if (!d.kind) return false
  if (d.kind === 'blood_pressure') return d.systolic != null && d.diastolic != null
  return d.value != null && Number.isFinite(d.value)
}

export function sparkValues(
  rows: VitalReading[],
  kind: VitalKind,
  displayUnit: string,
  limit = 12,
): number[] {
  return [...rows]
    .filter((r) => r.kind === kind)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .slice(-limit)
    .map((r) => {
      const raw = readingPrimary(r)
      if (raw == null) return null
      return convertVitalValue(kind, raw, r.unit, displayUnit)
    })
    .filter((n): n is number => n != null)
}

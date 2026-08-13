/**
 * Patient-facing health snapshot after a BP / sugar (or other) reading.
 *
 * SAFETY: lifestyle suggestions only. Never change a prescribed dose.
 * Always framed as organizational guidance, not a diagnosis.
 */

import type { HealthTracker, VitalKind, VitalReading } from './types'
import {
  classifyReading,
  formatReading,
  readingPrimary,
  trendDirection,
  type VitalClass,
  type VitalTone,
  VITAL_META,
} from './vitals'

export type Stability = 'stable' | 'rising' | 'falling' | 'variable' | 'first'

export interface HealthSuggestion {
  icon: 'walk' | 'rest' | 'water' | 'meds' | 'recheck' | 'doctor' | 'food' | 'ok'
  title: string
  detail: string
}

export interface HealthReport {
  kind: VitalKind
  headline: string
  summary: string
  readingLabel: string
  cls: VitalClass
  stability: Stability
  stabilityLabel: string
  vsLast?: string
  suggestions: HealthSuggestion[]
  urgent: boolean
  disclaimer: string
}

const DISCLAIMER =
  'This is a home log, not a diagnosis. Follow your doctor’s plan. If you feel unwell, get medical help.'

export function buildHealthReport(
  reading: VitalReading,
  previous: VitalReading[],
  tracker?: HealthTracker | null,
): HealthReport {
  const cls = classifyReading(reading, tracker)
  const kind = reading.kind
  const prior = previous
    .filter((r) => r.kind === kind && r.id !== reading.id)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  const last = prior[0]
  const stability = inferStability(reading, prior)
  const vsLast = describeVsLast(reading, last)
  const urgent = isUrgent(reading, cls)

  return {
    kind,
    headline: headlineFor(kind, cls, stability, urgent),
    summary: summaryFor(kind, cls, stability, reading),
    readingLabel: formatReading(reading),
    cls,
    stability,
    stabilityLabel: stabilityPhrase(stability),
    vsLast,
    suggestions: suggestionsFor(kind, cls, stability, urgent),
    urgent,
    disclaimer: DISCLAIMER,
  }
}

export function inferStability(current: VitalReading, prior: VitalReading[]): Stability {
  if (prior.length === 0) return 'first'
  const curr = readingPrimary(current)
  const values = prior
    .slice(0, 6)
    .map((r) => readingPrimary(r))
    .filter((n): n is number => n != null)
  if (curr == null || values.length === 0) return 'first'

  const last = values[0]
  const step = current.kind === 'blood_pressure' ? 6 : current.kind === 'blood_sugar' ? 12 : 4
  const dir = trendDirection(curr, last, step)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const spread = Math.max(...values) - Math.min(...values)
  const wild = spread > step * 3

  if (wild && values.length >= 3) return 'variable'
  if (dir === 'up' && curr > mean + step) return 'rising'
  if (dir === 'down' && curr < mean - step) return 'falling'
  return 'stable'
}

function describeVsLast(current: VitalReading, last?: VitalReading): string | undefined {
  if (!last) return undefined
  const a = readingPrimary(current)
  const b = readingPrimary(last)
  if (a == null || b == null) return undefined
  const delta = Math.round((a - b) * 10) / 10
  if (delta === 0) return 'Same as last time'
  const unit = current.kind === 'blood_pressure' ? 'points' : current.unit
  return delta > 0 ? `Up ${delta} ${unit} from last time` : `Down ${Math.abs(delta)} ${unit} from last time`
}

function isUrgent(reading: VitalReading, cls: VitalClass): boolean {
  if (reading.kind === 'blood_pressure') {
    return (reading.systolic ?? 0) > 180 || (reading.diastolic ?? 0) > 120
  }
  if (reading.kind === 'blood_sugar') {
    const v = reading.value ?? 0
    const mg = /mmol/i.test(reading.unit) ? v * 18 : v
    return mg < 54 || mg >= 300
  }
  if (reading.kind === 'spo2') return (reading.value ?? 100) < 90
  if (reading.kind === 'temperature') return cls.band === 'high'
  return false
}

function headlineFor(kind: VitalKind, cls: VitalClass, stability: Stability, urgent: boolean): string {
  if (urgent) {
    if (kind === 'blood_pressure') return 'This reading is very high'
    if (kind === 'blood_sugar' && cls.band === 'low') return 'Sugar looks too low'
    if (kind === 'blood_sugar') return 'Sugar looks very high'
    return 'This needs attention'
  }
  if (cls.band === 'normal' && (stability === 'stable' || stability === 'first')) {
    return kind === 'blood_pressure' ? 'Blood pressure looks good' : kind === 'blood_sugar' ? 'Sugar looks okay' : 'Looking good'
  }
  if (cls.band === 'normal' && stability === 'rising') return 'Still okay — a little higher than usual'
  if (cls.band === 'normal' && stability === 'falling') return 'Still okay — a little lower than usual'
  if (cls.band === 'elevated') return kind === 'blood_pressure' ? 'A bit high today' : 'A little above the usual range'
  if (cls.band === 'high') return kind === 'blood_pressure' ? 'Blood pressure is high' : 'This reading is high'
  if (cls.band === 'low') return kind === 'blood_pressure' ? 'Blood pressure is on the low side' : 'This reading is low'
  return 'Reading saved'
}

function summaryFor(kind: VitalKind, cls: VitalClass, stability: Stability, reading: VitalReading): string {
  const name = VITAL_META[kind].label.toLowerCase()
  const range = cls.label.toLowerCase()
  const sit =
    stability === 'stable' ? 'Your recent readings are staying about the same.'
    : stability === 'rising' ? 'Compared with the last few days, this is trending up.'
    : stability === 'falling' ? 'Compared with the last few days, this is trending down.'
    : stability === 'variable' ? 'Your recent readings have been jumping around.'
    : 'This is your first saved reading for this metric.'

  if (kind === 'blood_pressure') {
    return `Your cuff reading is ${formatReading(reading)} — that sits in the “${range}” range. ${sit}`
  }
  if (kind === 'blood_sugar') {
    const when = reading.context === 'fasting' ? 'fasting '
      : reading.context === 'after_meal' ? 'after-meal '
      : reading.context === 'before_meal' ? 'before-meal '
      : ''
    return `Your ${when}sugar is ${formatReading(reading)} — “${range}” for this type of check. ${sit}`
  }
  return `Your ${name} is ${formatReading(reading)} (${range}). ${sit}`
}

function stabilityPhrase(s: Stability): string {
  switch (s) {
    case 'stable': return 'Stable'
    case 'rising': return 'Trending up'
    case 'falling': return 'Trending down'
    case 'variable': return 'Up and down'
    default: return 'First reading'
  }
}

function suggestionsFor(
  kind: VitalKind,
  cls: VitalClass,
  stability: Stability,
  urgent: boolean,
): HealthSuggestion[] {
  if (urgent) {
    return [
      {
        icon: 'doctor',
        title: 'Get medical help now',
        detail: kind === 'blood_sugar' && cls.band === 'low'
          ? 'If you can, take fast sugar (juice, glucose tabs) as your care plan says, and tell someone nearby.'
          : 'Chest pain, fainting, confusion, or a crushing headache? Call emergency services. Do not drive yourself.',
      },
      {
        icon: 'recheck',
        title: 'Sit and recheck in 5 minutes',
        detail: 'Rest your arm at heart level, feet on the floor, no talking. Write both numbers down.',
      },
      {
        icon: 'meds',
        title: 'Do not skip prescribed medicine',
        detail: 'Take today’s tablets the way your doctor already told you. Don’t add extra doses on your own.',
      },
    ]
  }

  const meds: HealthSuggestion = {
    icon: 'meds',
    title: 'Take medicines as prescribed',
    detail: 'Keep the same dose your doctor set. This log does not change your prescription.',
  }

  if (kind === 'blood_pressure') {
    if (cls.band === 'normal') {
      return [
        { icon: 'ok', title: 'No extra action today', detail: 'Stay with your usual routine — that’s the goal.' },
        { icon: 'walk', title: 'A gentle walk is fine', detail: '10–20 minutes of easy walking is usually okay when BP is in range.' },
        { icon: 'water', title: 'Sip water, go easy on salt', detail: 'Skip the extra salty snack if you can. Keep your usual fluids.' },
        meds,
      ]
    }
    if (cls.band === 'low') {
      return [
        { icon: 'rest', title: 'Stand up slowly', detail: 'If you feel light-headed, sit or lie down. Don’t jump into a hard workout.' },
        { icon: 'water', title: 'Have a glass of water', detail: 'Dehydration can drop BP. Then recheck if you still feel odd.' },
        { icon: 'walk', title: 'Skip intense exercise for now', detail: 'Wait until you feel steady. A slow indoor walk is enough.' },
        meds,
      ]
    }
    return [
      { icon: 'rest', title: 'Sit quietly, then recheck', detail: '5 minutes, back supported, cuff on bare skin. One high number is not the whole story.' },
      { icon: 'walk', title: 'Hold off on hard exercise', detail: 'No heavy lifting or sprinting until a later reading is closer to your usual.' },
      { icon: 'food', title: 'Go light on salt and caffeine', detail: 'Choose a simple meal. Save the strong tea/coffee for later if you can.' },
      meds,
      ...(stability === 'rising' || cls.band === 'high'
        ? [{ icon: 'doctor' as const, title: 'Tell your clinician if this keeps happening', detail: 'A few high home readings in a row are useful to share at your next visit — or sooner if you feel unwell.' }]
        : []),
    ]
  }

  if (kind === 'blood_sugar') {
    if (cls.band === 'low') {
      return [
        { icon: 'food', title: 'Take fast sugar if your plan says so', detail: 'Juice, glucose tabs, or the snack your educator gave you. Recheck in 15 minutes.' },
        { icon: 'walk', title: 'Don’t exercise until it comes up', detail: 'Walking now can drop sugar further. Rest, then recheck.' },
        meds,
        { icon: 'doctor', title: 'Call your care team if it stays low', detail: 'Repeated lows need a clinician — don’t change insulin or tablets on your own.' },
      ]
    }
    if (cls.band === 'normal') {
      return [
        { icon: 'ok', title: 'You’re in range', detail: 'Nice work. Keep the meal and medicine timing that got you here.' },
        { icon: 'walk', title: 'A short walk is okay', detail: 'After a meal, 10 minutes of easy walking can help the next reading.' },
        { icon: 'food', title: 'Stick to your usual plate', detail: 'No need for a special diet change from one good number.' },
        meds,
      ]
    }
    return [
      { icon: 'water', title: 'Drink water', detail: 'Sip steadily. Don’t gulp sugary drinks to “fix” a high.' },
      { icon: 'walk', title: 'Easy walk if you feel well', detail: 'A slow 10–15 minute walk can help. Sit down if you feel dizzy or sick.' },
      { icon: 'food', title: 'Choose the next meal carefully', detail: 'Lean protein + veg, smaller portion of rice/bread. Skip dessert this round.' },
      meds,
      ...(cls.band === 'high'
        ? [{ icon: 'recheck' as const, title: 'Check again in 1–2 hours', detail: 'One high isn’t a full day. If it stays high or you feel very thirsty / sleepy, contact your clinician.' }]
        : []),
    ]
  }

  if (kind === 'heart_rate') {
    if (cls.band === 'high') {
      return [
        { icon: 'rest', title: 'Sit and breathe slowly', detail: '2 minutes of quiet breathing. Recheck once you’re still.' },
        { icon: 'walk', title: 'Skip the hard workout', detail: 'Wait until your pulse settles closer to your usual.' },
        meds,
      ]
    }
    return [
      { icon: 'ok', title: 'Pulse is in a usual rest range', detail: 'No change needed unless you feel fluttering, chest pain, or faint.' },
      { icon: 'walk', title: 'Normal activity is fine', detail: 'Keep your usual walk if you feel well.' },
    ]
  }

  if (kind === 'spo2' && (cls.band === 'low' || cls.band === 'elevated')) {
    return [
      { icon: 'rest', title: 'Sit upright and take slow breaths', detail: 'Recheck on a warm finger. Nail polish and cold hands fool oximeters.' },
      { icon: 'doctor', title: 'Call for help if you’re short of breath', detail: 'Blue lips, chest pain, or confusion is urgent — don’t wait on the next reading.' },
    ]
  }

  if (kind === 'temperature' && (cls.band === 'high' || cls.band === 'elevated')) {
    return [
      { icon: 'rest', title: 'Rest and sip fluids', detail: 'Light clothes, a cool room. Recheck in a few hours.' },
      { icon: 'walk', title: 'No workout while you’re hot', detail: 'Let the fever settle before exercise.' },
      { icon: 'doctor', title: 'Call if it climbs or you feel very unwell', detail: 'Especially with a stiff neck, rash, or trouble breathing.' },
    ]
  }

  return [
    { icon: 'ok', title: 'Logged for your history', detail: 'Keep tracking so you can show the last 3 months at clinic.' },
    meds,
  ]
}

export function reportToneGradient(tone: VitalTone): string {
  if (tone === 'success') return 'from-emerald-500/20 via-brand-500/10 to-transparent'
  if (tone === 'warn') return 'from-amber-500/20 via-warn-500/10 to-transparent'
  if (tone === 'danger') return 'from-rose-500/25 via-danger-500/10 to-transparent'
  return 'from-slate-500/10 to-transparent'
}

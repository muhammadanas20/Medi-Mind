import type { Medication } from './types'
import { SLOT_META, foodLabel } from './reminders'
import { SLOTS } from './types'

export { SLOTS }
export const SLOT_META_ = SLOT_META
export { foodLabel }

export const MED_FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'drops', 'inhaler', 'cream', 'other'] as const

/** "Morning 1 · Night 1 — After food" plain-text one-liner (aria labels, exports). */
export function medSlotsSummary(med: Medication): string {
  const parts = SLOTS.filter((s) => (med.slots[s] ?? 0) > 0).map(
    (s) => `${SLOT_META[s].label} ${med.slots[s]}`,
  )
  const food = med.food !== 'any' ? ` — ${foodLabel(med.food)}` : ''
  return `${parts.join(' · ') || 'No schedule'}${food}`
}

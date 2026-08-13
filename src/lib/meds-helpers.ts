import type { Medication } from './types'
import { SLOT_META, foodLabel } from './reminders'
import { SLOTS } from './types'

export { SLOTS }
export const SLOT_META_ = SLOT_META
export { foodLabel }

/** "🌅 1 · 🌙 1 — After food" one-liner for cards. */
export function medSlotsSummary(med: Medication): string {
  const parts = SLOTS.filter((s) => (med.slots[s] ?? 0) > 0).map(
    (s) => `${SLOT_META[s].emoji} ${med.slots[s]}`,
  )
  const food = med.food !== 'any' ? ` · ${foodLabel(med.food)}` : ''
  return `${parts.join('  ') || 'No schedule'}${food}`
}

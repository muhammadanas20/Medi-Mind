import {
  Activity,
  Droplet,
  HeartPulse,
  MoonStar,
  Scale,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { Slot, VitalKind } from '../lib/types'
import { VITAL_META } from '../lib/vitals'
import { cn } from '../lib/utils'

/**
 * Modern icon language for time-of-day slots and vitals.
 *
 * Emojis render differently on every device (and some — like the organ
 * emojis — are missing on older phones), so the UI uses crisp Lucide icons
 * instead: instantly readable, consistent, and tinted with meaningful color.
 */

export const SLOT_ICONS: Record<Slot, LucideIcon> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: MoonStar,
}

/** Soft, universally readable tints for each part of the day. */
export const SLOT_ICON_TINT: Record<Slot, string> = {
  morning: 'text-orange-500 dark:text-orange-400',
  afternoon: 'text-amber-500 dark:text-amber-400',
  evening: 'text-rose-500 dark:text-rose-400',
  night: 'text-indigo-500 dark:text-indigo-400',
}

export const VITAL_ICONS: Record<VitalKind, LucideIcon> = {
  blood_pressure: HeartPulse,
  blood_sugar: Droplet,
  heart_rate: Activity,
  weight: Scale,
  spo2: Wind,
  temperature: Thermometer,
}

/** Icon for a dose slot (sunrise / sun / sunset / moon). Sizes with font via `1.2em`. */
export function SlotIcon({ slot, className }: { slot: Slot; className?: string }) {
  const Icon = SLOT_ICONS[slot]
  return (
    <Icon
      aria-hidden
      strokeWidth={2.2}
      className={cn('inline-block size-[1.2em] shrink-0 align-[-0.2em]', SLOT_ICON_TINT[slot], className)}
    />
  )
}

/** Icon for a vital kind, tinted with the vital's brand color by default. */
export function VitalIcon({
  kind,
  className,
  colored = true,
}: {
  kind: VitalKind
  className?: string
  colored?: boolean
}) {
  const Icon = VITAL_ICONS[kind]
  return (
    <Icon
      aria-hidden
      strokeWidth={2.1}
      className={cn('inline-block size-[1.2em] shrink-0 align-[-0.2em]', className)}
      style={colored ? { color: VITAL_META[kind].color } : undefined}
    />
  )
}

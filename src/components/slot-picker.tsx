import { SlotIcon } from './icons'
import { SLOT_META } from '../lib/reminders'
import { SLOTS, type Slot } from '../lib/types'
import { cn } from '../lib/utils'

/** 4-up morning/afternoon/evening/night stepper used by scan review and the meds form. */
export function DoseSlotPicker({
  slots,
  onChange,
  testIdPrefix,
}: {
  slots: Partial<Record<Slot, number>>
  onChange: (slot: Slot, qty: number) => void
  testIdPrefix?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SLOTS.map((slot) => {
        const qty = slots[slot] ?? 0
        return (
          <div
            key={slot}
            className={cn(
              'rounded-2xl border p-2.5 text-center transition-all sm:p-3',
              qty > 0
                ? 'border-brand-500/40 bg-brand-500/[0.08]'
                : 'border-slate-300/60 bg-white/40 dark:border-white/10 dark:bg-white/[0.03]',
            )}
          >
            <div className="flex justify-center">
              <SlotIcon slot={slot} className="size-5 sm:size-6" />
            </div>
            <p className="mt-1 text-[11px] font-bold">{SLOT_META[slot].label}</p>
            <div className="mt-2 flex items-center justify-center gap-1.5 sm:gap-2">
              <button
                type="button"
                className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-slate-300/60 text-sm font-bold transition active:scale-90 dark:bg-white/10"
                onClick={() => onChange(slot, Math.max(0, qty - 1))}
                aria-label={`Decrease ${slot}`}
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-extrabold tabular-nums">{qty}</span>
              <button
                type="button"
                className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-brand-500/20 text-sm font-bold text-brand-700 transition active:scale-90 dark:text-brand-300"
                onClick={() => onChange(slot, Math.min(6, qty + 1))}
                aria-label={`Increase ${slot}`}
                data-testid={testIdPrefix ? `${testIdPrefix}-${slot}` : undefined}
              >
                +
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

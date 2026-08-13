import { motion } from 'framer-motion'
import type { DayStat } from '../lib/reminders'
import { cn } from '../lib/utils'

/** Weekly adherence bars — 60fps-friendly animated SVG. */
export function WeeklyBars({ days, className }: { days: DayStat[]; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-2', className)}>
      {days.map((d, i) => {
        const pct = d.adherence ?? 0
        const none = d.total === 0
        return (
          <div key={d.date || i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-24 w-full max-w-9 items-end justify-center rounded-xl bg-slate-200/60 p-0.5 dark:bg-white/5">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${none ? 0 : Math.max(6, pct)}%` }}
                transition={{ delay: 0.05 * i, type: 'spring', stiffness: 160, damping: 22 }}
                className={cn(
                  'w-full rounded-[10px]',
                  none && 'hidden',
                  pct >= 90 && 'bg-gradient-to-t from-brand-600 to-brand-400',
                  pct >= 60 && pct < 90 && 'bg-gradient-to-t from-warn-500 to-warn-400',
                  pct < 60 && 'bg-gradient-to-t from-danger-500 to-danger-400',
                )}
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {d.date ? new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' }) : '·'}
            </span>
            <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
              {none ? '—' : `${pct}%`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Per-medication adherence line bars. */
export function MedicationBars({
  rows,
  className,
}: {
  rows: { name: string; color: string; pct: number; taken: number; total: number }[]
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {rows.map((r, i) => (
        <div key={r.name} className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold">{r.name}</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {r.taken}/{r.total} · {r.pct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/8">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${r.pct}%` }}
              transition={{ delay: 0.06 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ background: r.color }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-400">No tracked doses yet this period.</p>
      )}
    </div>
  )
}

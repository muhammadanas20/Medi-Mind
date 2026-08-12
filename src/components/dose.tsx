import { AnimatePresence, motion } from 'framer-motion'
import { AlarmClock, Check, Clock, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import type { DoseLog } from '../lib/types'
import {
  foodLabel,
  formatTime,
  isInWindow,
  isSnoozed,
  SLOT_META,
  type DoseInstance,
} from '../lib/reminders'
import { markSkipped, markTaken, resetDose, snooze } from '../lib/scheduler'
import { cn } from '../lib/utils'
import { useUiStore } from '../state/ui'
import { Badge, Button } from './ui'

const STATUS_STYLE: Record<DoseLog['status'], { label: string; cls: string }> = {
  taken: { label: 'Taken', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  skipped: { label: 'Skipped', cls: 'bg-slate-500/15 text-slate-500 dark:text-slate-400' },
  missed: { label: 'Missed', cls: 'bg-danger-500/15 text-danger-500 dark:text-danger-400' },
  pending: { label: 'Pending', cls: 'bg-brand-500/15 text-brand-600 dark:text-brand-300' },
}

/** One dose row: medicine, time window, food hint, actions. */
export function DoseRow({
  instance,
  log,
  compact,
}: {
  instance: DoseInstance
  log: DoseLog
  compact?: boolean
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const settings = useUiStore((s) => s.settings)
  const showToast = useUiStore((s) => s.showToast)
  const now = new Date()
  const snoozed = isSnoozed(log, now)
  const available =
    log.status === 'pending' && (isInWindow(instance, now) || now > instance.windowStart)
  const style = STATUS_STYLE[log.status]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-colors',
        log.status === 'taken' && 'opacity-70',
        available && 'border-brand-500/25 bg-brand-500/[0.06]',
      )}
      data-testid={`dose-${instance.slot}-${instance.medicationName}`}
    >
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md"
        style={{ background: instance.color }}
      >
        {instance.medicationName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm font-bold', log.status === 'taken' && 'line-through')}>
            {instance.medicationName}
            {instance.strength && (
              <span className="ml-1.5 text-xs font-semibold text-slate-500">{instance.strength}</span>
            )}
          </p>
          {instance.isCritical && <Badge tone="danger">Critical</Badge>}
        </div>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {instance.quantity} {instance.quantity === 1 ? 'tablet' : 'tablets'} · {foodLabel(instance.food)}
          {instance.instructions ? ` · ${instance.instructions}` : ''}
        </p>
        {snoozed && log.snoozeUntil && (
          <p className="mt-0.5 text-[11px] font-medium text-warn-500">
            Snoozed until {formatTime(new Date(log.snoozeUntil))}
          </p>
        )}
      </div>

      {log.status === 'pending' ? (
        compact ? (
          <Badge tone="brand">{formatTime(instance.windowStart)}</Badge>
        ) : (
          <div className="relative flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="subtle"
              onClick={async () => {
                await markTaken(log.id)
                showToast(`${instance.medicationName} marked as taken`, 'success')
              }}
              data-testid="dose-taken"
            >
              <Check /> Take
            </Button>
            <Button size="iconsm" variant="ghost" aria-label="Snooze" onClick={() => setSnoozeOpen((v) => !v)}>
              <AlarmClock />
            </Button>
            <Button
              size="iconsm"
              variant="ghost"
              aria-label="Skip"
              onClick={async () => {
                await markSkipped(log.id)
                showToast(`${instance.medicationName} skipped`)
              }}
            >
              <X />
            </Button>
            <AnimatePresence>
              {snoozeOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-strong absolute right-0 top-11 z-20 flex gap-1 rounded-2xl p-1.5"
                >
                  {settings.snoozeOptionsMin.map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={async () => {
                        await snooze(log.id, m)
                        setSnoozeOpen(false)
                        showToast(`Snoozed for ${m} min`)
                      }}
                    >
                      {m}m
                    </Button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', style.cls)}>
            {style.label}
            {log.actedAt ? ` · ${formatTime(new Date(log.actedAt))}` : ''}
          </span>
          <Button size="iconsm" variant="ghost" aria-label="Undo" title="Undo" onClick={() => void resetDose(log.id)}>
            <RotateCcw />
          </Button>
        </div>
      )}
    </motion.div>
  )
}

/** Big modal cards pushed by the scheduler when a dose becomes due. */
export function DueStack() {
  const dueQueue = useUiStore((s) => s.dueQueue)
  const dismissDue = useUiStore((s) => s.dismissDue)
  const settings = useUiStore((s) => s.settings)
  const showToast = useUiStore((s) => s.showToast)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)

  const current = dueQueue[dueQueue.length - 1]

  const act = async (action: 'taken' | 'skipped') => {
    if (!current) return
    if (action === 'taken') {
      await markTaken(current.logId)
      showToast(`✅ ${current.medicationName} taken — great job!`, 'success')
    } else {
      await markSkipped(current.logId)
      showToast(`${current.medicationName} skipped`)
    }
    dismissDue(current.logId)
    setSnoozeFor(null)
  }

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={() => dismissDue(current.logId)} />
          <motion.div
            key={current.logId + current.medicationName}
            initial={{ y: 120, scale: 0.94 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="glass-strong relative w-full max-w-sm overflow-hidden rounded-[28px] p-6 text-center"
            data-testid="due-card"
          >
            <div
              className="absolute inset-x-0 top-0 h-1.5"
              style={{ background: `linear-gradient(90deg, ${current.color}, transparent)` }}
            />
            <span className="text-4xl">{SLOT_META[current.slot].emoji}</span>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              {SLOT_META[current.slot].label} dose · {formatTime(current.windowStart)}–{formatTime(current.windowEnd)}
            </p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight">{current.medicationName}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {current.strength && <span className="font-semibold">{current.strength} · </span>}
              Take {current.quantity} {current.quantity === 1 ? 'tablet' : 'tablets'}
              {current.food !== 'any' && (
                <span className="mt-1 block font-semibold text-brand-600 dark:text-brand-300">
                  {foodLabel(current.food)}
                </span>
              )}
            </p>
            {current.isCritical && (
              <Badge tone="danger" className="mt-2">⚠ Critical medication — don't skip</Badge>
            )}

            {snoozeFor === current.logId ? (
              <div className="mt-6 grid grid-cols-3 gap-2">
                {settings.snoozeOptionsMin.map((m) => (
                  <Button
                    key={m}
                    variant="outline"
                    onClick={async () => {
                      await snooze(current.logId, m)
                      showToast(`Snoozed ${m} minutes ⏰`)
                      dismissDue(current.logId)
                      setSnoozeFor(null)
                    }}
                  >
                    {m} min
                  </Button>
                ))}
              </div>
            ) : (
              <div className="mt-6 space-y-2">
                <Button className="w-full" size="lg" onClick={() => void act('taken')} data-testid="due-taken">
                  <Check /> Taken
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setSnoozeFor(current.logId)}>
                    <Clock /> Snooze
                  </Button>
                  <Button variant="ghost" onClick={() => void act('skipped')}>
                    <X /> Skip
                  </Button>
                </div>
              </div>
            )}
            {dueQueue.length > 1 && (
              <p className="mt-3 text-[11px] text-slate-400">+{dueQueue.length - 1} more due</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

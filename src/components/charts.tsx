import { motion } from 'framer-motion'
import { useId, useState } from 'react'
import type { DayStat } from '../lib/reminders'
import { formatNum } from '../lib/vitals'
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
            <div className="flex h-20 w-full max-w-9 items-end justify-center rounded-xl bg-slate-200/60 p-0.5 sm:h-24 dark:bg-white/5">
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

/* ------------------------------ vitals charts ----------------------------- */

export function Sparkline({
  values,
  color = '#07c5a8',
  className,
}: {
  values: number[]
  color?: string
  className?: string
}) {
  if (values.length < 2) {
    return <div className={cn('h-8 w-20', className)} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 80
  const h = 28
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / span) * (h - 4) - 2
    return `${x},${y}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('h-8 w-20', className)} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.join(' ')} />
    </svg>
  )
}

export interface VitalPoint {
  id: string
  date: string
  recordedAt: string
  primary: number
  secondary?: number
}

export function VitalTrendChart({
  points,
  primaryLabel,
  secondaryLabel,
  primaryColor = '#07c5a8',
  secondaryColor = '#8b5cf6',
  unit,
  bandMin,
  bandMax,
  height = 200,
  className,
}: {
  points: VitalPoint[]
  primaryLabel: string
  secondaryLabel?: string
  primaryColor?: string
  secondaryColor?: string
  unit: string
  bandMin?: number
  bandMax?: number
  height?: number
  className?: string
}) {
  const gid = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) {
    return (
      <div className={cn('flex h-48 items-center justify-center text-sm text-slate-400', className)}>
        No readings in this period yet.
      </div>
    )
  }

  const vals = points.flatMap((p) => [p.primary, p.secondary].filter((n): n is number => n != null))
  if (bandMin != null) vals.push(bandMin)
  if (bandMax != null) vals.push(bandMax)
  const rawMin = Math.min(...vals)
  const rawMax = Math.max(...vals)
  const pad = Math.max(2, (rawMax - rawMin) * 0.12)
  const yMin = rawMin - pad
  const yMax = rawMax + pad
  const span = yMax - yMin || 1

  const W = 640
  const H = height
  const padL = 40
  const padR = 12
  const padT = 16
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const xAt = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const yAt = (v: number) => padT + (1 - (v - yMin) / span) * innerH

  const toPath = (key: 'primary' | 'secondary') => {
    const usable = points
      .map((p, i) => ({ i, v: p[key] }))
      .filter((p): p is { i: number; v: number } => p.v != null)
    if (usable.length === 0) return ''
    return usable.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xAt(p.i)} ${yAt(p.v)}`).join(' ')
  }

  const area = (() => {
    const usable = points.map((p, i) => ({ i, v: p.primary }))
    if (usable.length < 2) return ''
    const line = usable.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xAt(p.i)} ${yAt(p.v)}`).join(' ')
    return `${line} L${xAt(usable[usable.length - 1].i)} ${padT + innerH} L${xAt(usable[0].i)} ${padT + innerH} Z`
  })()

  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + (span * i) / ticks)
  const xLabels = labelIndexes(points.length).map((i) => ({
    i,
    text: new Date(`${points[i].date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }),
  }))

  const active = hover != null ? points[hover] : points[points.length - 1]

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: primaryColor }} />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span className="size-2 rounded-full" style={{ background: secondaryColor }} />
              {secondaryLabel}
            </span>
          )}
        </div>
        {active && (
          <p className="tabular-nums text-slate-500 dark:text-slate-400">
            {new Date(active.recordedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            {' · '}
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {formatNum(active.primary)}
              {active.secondary != null ? `/${formatNum(active.secondary)}` : ''}
            </span>{' '}
            {unit}
          </p>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${primaryLabel} trend`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} className="stroke-slate-200 dark:stroke-white/8" strokeWidth="1" />
            <text x={padL - 6} y={yAt(v) + 3} textAnchor="end" className="fill-slate-400" fontSize="10">
              {formatNum(Math.round(v * 10) / 10)}
            </text>
          </g>
        ))}
        {bandMin != null && bandMax != null && (
          <rect
            x={padL}
            y={yAt(bandMax)}
            width={innerW}
            height={Math.max(0, yAt(bandMin) - yAt(bandMax))}
            fill={primaryColor}
            opacity="0.08"
          />
        )}
        {area && <path d={area} fill={`url(#${gid}-fill)`} />}
        <path d={toPath('primary')} fill="none" stroke={primaryColor} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {secondaryLabel && (
          <path d={toPath('secondary')} fill="none" stroke={secondaryColor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 4" />
        )}
        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.primary)}
              r={hover === i || i === points.length - 1 ? 4.5 : 2.5}
              fill={primaryColor}
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            />
            <rect
              x={xAt(i) - innerW / points.length / 2}
              y={padT}
              width={Math.max(8, innerW / points.length)}
              height={innerH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {xLabels.map((l) => (
          <text key={l.i} x={xAt(l.i)} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  )
}

function labelIndexes(n: number): number[] {
  if (n <= 1) return [0]
  if (n <= 6) return Array.from({ length: n }, (_, i) => i)
  const want = 5
  const set = new Set<number>()
  for (let i = 0; i < want; i++) set.add(Math.round((i / (want - 1)) * (n - 1)))
  return [...set].sort((a, b) => a - b)
}

import { motion } from 'framer-motion'
import { Activity, Flame, History, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MedicationBars, Sparkline, WeeklyBars } from '../components/charts'
import { Badge, Card, Ring, SectionTitle } from '../components/ui'
import { todayStr } from '../lib/db'
import { adherenceSeries, overallAdherence, SLOT_META } from '../lib/reminders'
import { formatTime } from '../lib/reminders'
import { classifyReading, formatReading, sparkValues, VITAL_META } from '../lib/vitals'
import { useActiveProfile, useHealthTrackers, useRecentLogs, useVitalReadings } from '../state/hooks'

export function InsightsPage() {
  const profile = useActiveProfile()
  const logs = useRecentLogs(profile?.id, 7)
  const trackers = useHealthTrackers(profile?.id)
  const vitals = useVitalReadings(profile?.id, 90)
  const enabledVitals = (trackers ?? []).filter((t) => t.enabled)

  const week = useMemo(() => (logs ? adherenceSeries(logs, todayStr(), 7) : []), [logs])
  const overall = useMemo(() => (logs ? overallAdherence(logs, todayStr(), 7) : null), [logs])
  const perMed = useMemo(() => {
    if (!logs) return []
    const colors = ['#07c5a8', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#84cc16']
    const byMed = new Map<string, { taken: number; total: number }>()
    for (const l of logs) {
      const cur = byMed.get(l.medicationId) ?? { taken: 0, total: 0 }
      cur.total++
      if (l.status === 'taken') cur.taken++
      byMed.set(l.medicationId, cur)
    }
    return [...byMed.entries()]
      .map(([id, v], i) => {
        const name = logs.find((l) => l.medicationId === id)?.medicationName ?? 'Unknown'
        return { name, color: colors[i % colors.length], pct: v.total ? Math.round((v.taken / v.total) * 100) : 0, taken: v.taken, total: v.total }
      })
      .sort((a, b) => b.total - a.total)
  }, [logs])

  const timeline = useMemo(() => {
    if (!logs) return []
    return [...logs]
      .filter((l) => l.status !== 'pending')
      .sort((a, b) => (b.actedAt ?? b.windowEnd).localeCompare(a.actedAt ?? a.windowEnd))
      .slice(0, 20)
  }, [logs])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Insights</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Adherence trends for {profile?.name ?? 'you'} over the last 7 days
        </p>
      </div>

      {/* 3-up only once there is genuine room for ring + text; stacked below */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex items-center gap-4">
          <Ring pct={overall?.pct ?? 0} size={88} stroke={9}>
            <span className="text-xl font-extrabold tabular-nums">{overall?.pct ?? '–'}</span>
          </Ring>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">7-day adherence</p>
            <p className="mt-1 text-sm font-semibold">
              {overall?.taken ?? 0} of {overall?.total ?? 0} doses
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-warn-400/20 to-danger-500/20">
            <Flame className="size-7 text-warn-500" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Perfect-day streak</p>
            <p className="mt-1 text-2xl font-extrabold">{overall?.streak ?? 0}<span className="text-sm font-semibold text-slate-400"> days</span></p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500/20 to-accent-500/20">
            <TrendingUp className="size-7 text-brand-500" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Best day</p>
            <p className="mt-1 text-2xl font-extrabold">
              {week.filter((d) => d.total > 0).length ? `${Math.max(...week.map((d) => d.adherence ?? 0))}%` : '–'}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="h-full">
            <SectionTitle>Daily adherence</SectionTitle>
            <WeeklyBars days={week} />
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <SectionTitle>Per medication</SectionTitle>
            <MedicationBars rows={perMed} />
          </Card>
        </motion.div>
      </div>

      {enabledVitals.length > 0 && (
        <Card>
          <SectionTitle right={
            <Link to="/health" className="text-xs font-semibold text-brand-600 dark:text-brand-300">
              Open health log →
            </Link>
          }>
            <span className="inline-flex items-center gap-2"><Activity className="size-5" /> 3-month vitals</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {enabledVitals.map((t) => {
              const rows = (vitals ?? []).filter((r) => r.kind === t.kind)
              const latest = rows[0]
              const cls = latest ? classifyReading(latest, t) : null
              return (
                <Link
                  key={t.id}
                  to="/health"
                  className="flex items-center gap-3 rounded-2xl border border-slate-200/70 px-3 py-2.5 transition hover:bg-slate-200/40 dark:border-white/10 dark:hover:bg-white/[0.04]"
                >
                  <span className="text-xl">{VITAL_META[t.kind].emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{VITAL_META[t.kind].label}</p>
                    <p className="text-sm font-extrabold tabular-nums">{latest ? formatReading(latest) : 'No readings'}</p>
                  </div>
                  <Sparkline values={sparkValues(rows, t.kind, t.unit)} color={VITAL_META[t.kind].color} />
                  {cls && <Badge tone={cls.tone}>{cls.label}</Badge>}
                </Link>
              )
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>
          <span className="inline-flex items-center gap-2"><History className="size-5" /> Recent activity</span>
        </SectionTitle>
        <div className="space-y-1">
          {timeline.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No activity yet — actions on doses appear here.</p>
          )}
          {timeline.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-200/40 dark:hover:bg-white/[0.04]">
              <span className="text-lg">{SLOT_META[l.slot].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {l.medicationName}
                  {l.skipReason && <span className="ml-2 text-xs font-normal italic text-slate-400">“{l.skipReason}”</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(`${l.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}{l.actedAt ? formatTime(new Date(l.actedAt)) : '—'}
                </p>
              </div>
              <Badge tone={l.status === 'taken' ? 'success' : l.status === 'missed' ? 'danger' : 'neutral'}>
                {l.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

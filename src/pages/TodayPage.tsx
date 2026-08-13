import { motion } from 'framer-motion'
import { Activity, ArrowRight, CalendarClock, Flame, Pill, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { WeeklyBars } from '../components/charts'
import { DoseRow } from '../components/dose'
import { Badge, Card, Ring, SectionTitle } from '../components/ui'
import { adherenceSeries, overallAdherence, SLOT_META } from '../lib/reminders'
import { formatTime } from '../lib/reminders'
import { todayStr } from '../lib/db'
import { classifyReading, formatReading, formatReadingWhen, VITAL_META } from '../lib/vitals'
import { useActiveProfile, useHealthTrackers, useRecentLogs, useTodayDoses, useVitalReadings } from '../state/hooks'

export function TodayPage() {
  const profile = useActiveProfile()
  const data = useTodayDoses(profile?.id)
  const recentLogs = useRecentLogs(profile?.id, 7)
  const trackers = useHealthTrackers(profile?.id)
  const vitals = useVitalReadings(profile?.id, 90)
  const enabledTrackers = (trackers ?? []).filter((t) => t.enabled)
  const latestByKind = enabledTrackers.map((t) => ({
    tracker: t,
    reading: (vitals ?? []).find((r) => r.kind === t.kind),
  }))

  const greeting = () => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night'
  }

  const pct = data && data.totals.total > 0 ? Math.round((data.totals.taken / data.totals.total) * 100) : 0
  const week = recentLogs ? adherenceSeries(recentLogs, todayStr(), 7) : []
  const overall = recentLogs ? overallAdherence(recentLogs, todayStr(), 7) : null
  const nextUp = data?.flat.find((i) => i.log.status === 'pending' && new Date(i.instance.windowStart) > new Date())

  return (
    <div className="space-y-6">
      {/* greeting + overall ring */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {greeting()}{profile ? `, ${profile.name.split(' ')[0]}` : ''} {profile?.avatarEmoji}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Today's <span className="text-gradient">plan</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data
              ? data.totals.total === 0
                ? 'No medications scheduled today.'
                : `${data.totals.taken} of ${data.totals.total} doses taken`
              : 'Loading…'}
            {data && data.totals.missed > 0 && (
              <span className="ml-2 font-semibold text-danger-500">· {data.totals.missed} missed</span>
            )}
          </p>
        </div>
        <Ring pct={pct} size={104} stroke={11}>
          <span className="text-2xl font-extrabold tabular-nums">{pct}<span className="text-sm">%</span></span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">today</span>
        </Ring>
      </div>

      {nextUp && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="flex items-center gap-3 border-brand-500/20 !bg-brand-500/[0.06]">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-600 dark:text-brand-300">
              <CalendarClock className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Next dose</p>
              <p className="truncate text-sm font-bold">
                {nextUp.instance.medicationName} · {SLOT_META[nextUp.instance.slot].emoji}{' '}
                {formatTime(nextUp.instance.windowStart)}
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* slot sections */}
      <div className="grid gap-5 lg:grid-cols-2">
        {data?.groups.map((g, gi) => (
          <motion.section
            key={g.slot}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * gi }}
          >
            <Card className="card-hover">
              <SectionTitle
                right={
                  <Badge tone={g.taken === g.total ? 'success' : 'brand'}>
                    {g.taken}/{g.total} taken
                  </Badge>
                }
              >
                <span className="mr-1.5">{SLOT_META[g.slot].emoji}</span>
                {SLOT_META[g.slot].label}
              </SectionTitle>
              <div className="space-y-1.5">
                {g.items.map(({ instance, log }) => (
                  <DoseRow key={log.id} instance={instance} log={log} />
                ))}
              </div>
            </Card>
          </motion.section>
        ))}
      </div>

      {data && data.groups.length === 0 && (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Pill className="size-8" />
          </div>
          <div>
            <p className="text-lg font-bold">Nothing scheduled today</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Scan a prescription or add a medicine manually to build your plan.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/scan">
              <motion.span className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25">
                <ScanLine className="size-4" /> Scan prescription
              </motion.span>
            </Link>
            <Link to="/meds" className="inline-flex items-center gap-2 rounded-2xl border border-slate-300/80 px-5 py-3 text-sm font-semibold dark:border-white/15">
              Add manually <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      )}

      {/* weekly strip */}
      <Card>
        <SectionTitle
          right={
            overall && overall.pct != null ? (
              <Badge tone="brand">
                <Flame className="size-3" /> {overall.pct}% · {overall.streak}d streak
              </Badge>
            ) : undefined
          }
        >
          This week
        </SectionTitle>
        <WeeklyBars days={week} />
      </Card>
    </div>
  )
}

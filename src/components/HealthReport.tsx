import { motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle2, Droplets, Footprints, HeartPulse, Moon, Phone,
  Pill, RefreshCw, ShieldCheck, Utensils,
} from 'lucide-react'
import type { HealthReport, HealthSuggestion, Stability } from '../lib/health-report'
import { reportToneGradient } from '../lib/health-report'
import { VITAL_META } from '../lib/vitals'
import { Badge, Button, Card } from './ui'

const ICONS: Record<HealthSuggestion['icon'], typeof Footprints> = {
  walk: Footprints,
  rest: Moon,
  water: Droplets,
  meds: Pill,
  recheck: RefreshCw,
  doctor: Phone,
  food: Utensils,
  ok: CheckCircle2,
}

export function HealthReportCard({
  report,
  onDone,
  compact,
}: {
  report: HealthReport
  onDone?: () => void
  compact?: boolean
}) {
  const meta = VITAL_META[report.kind]
  const tone = report.cls.tone

  return (
    <Card className={`relative overflow-hidden ${compact ? '!p-4' : ''}`} data-testid="health-report">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${reportToneGradient(tone)}`} />
      <div className="relative space-y-4">
        <div className="flex items-start gap-3">
          <StatusOrb tone={tone} urgent={report.urgent} emoji={meta.emoji} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {meta.label} check
            </p>
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{report.headline}</h2>
            <p className="mt-1 text-3xl font-black tabular-nums tracking-tight">
              {report.readingLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={tone}>{report.cls.label}</Badge>
          <Badge tone={stabilityTone(report.stability)}>{report.stabilityLabel}</Badge>
          {report.vsLast && <Badge tone="neutral">{report.vsLast}</Badge>}
        </div>

        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{report.summary}</p>

        {report.urgent && (
          <div className="flex items-start gap-2 rounded-2xl bg-danger-500/12 p-3 text-sm text-danger-500 dark:text-danger-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="font-semibold">If you feel chest pain, faint, confused, or very unwell — get emergency help now.</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">What you can do</p>
          {report.suggestions.map((s) => {
            const Icon = ICONS[s.icon]
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 rounded-2xl border border-slate-200/70 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{s.title}</p>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.detail}</p>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <p>{report.disclaimer}</p>
        </div>

        {onDone && (
          <Button className="w-full" size="lg" onClick={onDone} data-testid="health-report-done">
            <HeartPulse /> Got it — back to my log
          </Button>
        )}
      </div>
    </Card>
  )
}

function StatusOrb({ tone, urgent, emoji }: { tone: HealthReport['cls']['tone']; urgent: boolean; emoji: string }) {
  const ring =
    tone === 'success' ? 'from-emerald-400 to-brand-500'
    : tone === 'warn' ? 'from-amber-400 to-orange-500'
    : tone === 'danger' ? 'from-rose-500 to-red-600'
    : 'from-slate-400 to-slate-500'
  return (
    <div className={`relative flex size-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br ${ring} text-3xl shadow-lg ${urgent ? 'animate-pulse' : ''}`}>
      <span className="drop-shadow">{emoji}</span>
    </div>
  )
}

function stabilityTone(s: Stability): 'success' | 'warn' | 'danger' | 'neutral' | 'brand' {
  if (s === 'stable') return 'success'
  if (s === 'rising') return 'warn'
  if (s === 'falling') return 'brand'
  if (s === 'variable') return 'warn'
  return 'neutral'
}

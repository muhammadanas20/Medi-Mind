import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowLeft, BadgeCheck, BrainCircuit, CalendarRange, Camera, CircleAlert,
  Loader2, PenLine, Plus, Settings2, ShieldCheck, Sparkles, Trash2,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { extractVitalReading } from '../ai/service'
import { coerceSugarContext } from '../ai/extract'
import { CameraCapture } from '../components/camera'
import { Sparkline, VitalTrendChart, type VitalPoint } from '../components/charts'
import { Badge, Button, Card, Dialog, Field, Input, Select, SectionTitle, Switch, Textarea } from '../components/ui'
import { db, uid } from '../lib/db'
import { prepareForAI, prepareForOCR } from '../lib/image'
import { runOCR } from '../lib/ocr'
import type {
  BloodSugarContext, ExtractedVital, HealthTracker, VitalKind, VitalReading, VitalSource,
} from '../lib/types'
import {
  SUGAR_CONTEXTS, VITAL_KINDS, VITAL_META, VITALS_HISTORY_DAYS,
  classifyReading, convertVitalValue, defaultUnitFor, emptyDraft, filterHistory,
  formatReading, formatReadingWhen, fromDateTimeLocal, isDraftComplete,
  localDateTimeValue, parseVitalsFromText, readingPrimary, sparkValues,
  trendDirection, contextLabel,
} from '../lib/vitals'
import { buildHealthReport, type HealthReport } from '../lib/health-report'
import { HealthReportCard } from '../components/HealthReport'
import { useActiveProfile, useHealthTrackers, useVitalReadings } from '../state/hooks'
import { useUiStore } from '../state/ui'

type Stage = 'dash' | 'scan' | 'processing' | 'review' | 'report'
type Period = 7 | 30 | 90

export function HealthPage() {
  const profile = useActiveProfile()
  const showToast = useUiStore((s) => s.showToast)
  const [params, setParams] = useSearchParams()

  const trackers = useHealthTrackers(profile?.id)
  const readings = useVitalReadings(profile?.id, VITALS_HISTORY_DAYS)

  const enabled = (trackers ?? []).filter((t) => t.enabled)
  const [period, setPeriod] = useState<Period>(90)
  const [focus, setFocus] = useState<VitalKind | 'all'>('all')
  const [stage, setStage] = useState<Stage>('dash')
  const [manualOpen, setManualOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editing, setEditing] = useState<VitalReading | null>(null)

  const [image, setImage] = useState<Blob | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [progress, setProgress] = useState('')
  const [draft, setDraft] = useState<ExtractedVital>(emptyDraft('blood_pressure'))
  const [when, setWhen] = useState(localDateTimeValue())
  const [notes, setNotes] = useState('')
  const [aiFailed, setAiFailed] = useState<string | null>(null)
  const [providerLabel, setProviderLabel] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [report, setReport] = useState<HealthReport | null>(null)

  useEffect(() => {
    if (params.get('scan') === '1') {
      setStage('scan')
      const next = new URLSearchParams(params)
      next.delete('scan')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const periodRows = useMemo(
    () => (readings ? filterHistory(readings, period) : []),
    [readings, period],
  )
  const focusedRows = useMemo(
    () => (focus === 'all' ? periodRows : periodRows.filter((r) => r.kind === focus)),
    [periodRows, focus],
  )

  const chartKind: VitalKind | undefined =
    focus !== 'all' ? focus : enabled[0]?.kind ?? focusedRows[0]?.kind

  const chartTracker = enabled.find((t) => t.kind === chartKind)

  const chartPoints: VitalPoint[] = useMemo(() => {
    if (!chartKind) return []
    const unit = chartTracker?.unit ?? VITAL_META[chartKind].unit
    const points: VitalPoint[] = []
    const rows = [...focusedRows]
      .filter((r) => r.kind === chartKind)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    for (const r of rows) {
      if (r.kind === 'blood_pressure' && r.systolic != null && r.diastolic != null) {
        points.push({ id: r.id, date: r.date, recordedAt: r.recordedAt, primary: r.systolic, secondary: r.diastolic })
        continue
      }
      const raw = readingPrimary(r)
      if (raw == null) continue
      points.push({
        id: r.id,
        date: r.date,
        recordedAt: r.recordedAt,
        primary: convertVitalValue(r.kind, raw, r.unit, unit),
      })
    }
    return points
  }, [focusedRows, chartKind, chartTracker])

  const resetScan = () => {
    setStage('dash')
    setImage(null)
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl('')
    setAiFailed(null)
    setOcrText('')
    setNotes('')
    setWhen(localDateTimeValue())
  }

  const onCapture = async (blob: Blob) => {
    setImage(blob)
    setImageUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
    setStage('processing')
    setAiFailed(null)
    setOcrText('')
    try {
      setProgress('Preparing image…')
      const ai = await prepareForAI(blob)
      setProgress('Reading the device screen…')
      const { extraction, providerLabel: pl } = await extractVitalReading(ai.base64, ai.mimeType, profile ?? undefined)
      setProviderLabel(pl)
      const kind = extraction.kind ?? enabled[0]?.kind ?? 'blood_pressure'
      setDraft({
        ...emptyDraft(kind, trackerUnit(trackers, kind)),
        ...extraction,
        kind,
        unit: extraction.unit ? extraction.unit : defaultUnitFor(kind, trackerUnit(trackers, kind)),
        context: coerceSugarContext(extraction.context) ?? (kind === 'blood_sugar' ? 'fasting' : undefined),
      })
      setStage('review')
      if (!isDraftComplete({ ...extraction, kind })) {
        showToast('Could not read every number — please check the fields', 'info')
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'AI extraction failed'
      setAiFailed(message === 'NO_PROVIDER'
        ? 'No AI provider configured. Running offline OCR — you can also type the numbers.'
        : message)
      let parsed: ExtractedVital | undefined
      try {
        const ocred = await prepareForOCR(blob)
        const text = await runOCR(ocred.blob, (p) =>
          setProgress(`Offline OCR — ${p.status} ${Math.round(p.progress * 100)}%`),
        )
        setOcrText(text)
        parsed = parseVitalsFromText(text)[0]
      } catch {
        setOcrText('')
      }
      const kind = parsed?.kind ?? enabled[0]?.kind ?? 'blood_pressure'
      setDraft({
        ...emptyDraft(kind, trackerUnit(trackers, kind)),
        ...parsed,
        kind,
        unit: parsed?.unit ?? defaultUnitFor(kind, trackerUnit(trackers, kind)),
        context: coerceSugarContext(parsed?.context) ?? (kind === 'blood_sugar' ? 'fasting' : undefined),
      })
      setProviderLabel('offline OCR')
      setStage('review')
    }
  }

  const saveDraft = async (source: VitalSource) => {
    if (!profile) {
      showToast('Create a profile first', 'error')
      return
    }
    if (!draft.kind || !isDraftComplete(draft)) {
      showToast(draft.kind === 'blood_pressure'
        ? 'Enter both systolic and diastolic'
        : 'Enter a reading value', 'error')
      return
    }
    const tracker = await ensureTracker(profile.id, draft.kind, trackers)
    const { recordedAt, date } = fromDateTimeLocal(when)
    const row: VitalReading = {
      id: uid(),
      profileId: profile.id,
      trackerId: tracker.id,
      kind: draft.kind,
      recordedAt,
      date,
      value: draft.kind === 'blood_pressure' ? undefined : draft.value,
      systolic: draft.kind === 'blood_pressure' ? draft.systolic : undefined,
      diastolic: draft.kind === 'blood_pressure' ? draft.diastolic : undefined,
      pulse: draft.pulse,
      unit: defaultUnitFor(draft.kind, draft.unit),
      context: draft.kind === 'blood_sugar'
        ? (coerceSugarContext(draft.context) as BloodSugarContext | undefined) ?? 'random'
        : undefined,
      notes: notes.trim() || undefined,
      source,
      image: image ?? undefined,
      aiRaw: source === 'manual' ? undefined : draft,
      createdAt: new Date().toISOString(),
    }
    await db.vitalReadings.add(row)
    if (draft.kind === 'weight' && draft.value != null) {
      await db.profiles.update(profile.id, {
        weight: draft.value,
        weightUnit: (draft.unit as 'kg' | 'lbs') || profile.weightUnit || 'kg',
      })
    }
    const prior = (readings ?? []).filter((r) => r.kind === row.kind)
    setReport(buildHealthReport(row, prior, tracker, profile ?? undefined))
    setManualOpen(false)
    setStage('report')
    showToast(`${VITAL_META[draft.kind].label} saved`, 'success')
  }

  const openManual = (kind?: VitalKind) => {
    const k = kind ?? enabled[0]?.kind ?? 'blood_pressure'
    setDraft(emptyDraft(k, trackerUnit(trackers, k)))
    setWhen(localDateTimeValue())
    setNotes('')
    setImage(null)
    setManualOpen(true)
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Health <span className="text-gradient">log</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            Optional. Track BP, sugar and more for about 3 months — scan the device
            screen or type a reading. Nothing is logged until you confirm it.
          </p>
        </div>
        {enabled.length > 0 && stage === 'dash' && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setManageOpen(true)} data-testid="manage-trackers">
              <Settings2 /> Manage
            </Button>
            <Button variant="outline" onClick={() => openManual()} data-testid="log-manual">
              <PenLine /> Log manually
            </Button>
            <Button onClick={() => setStage('scan')} data-testid="scan-device">
              <Camera /> Scan device
            </Button>
          </div>
        )}
        {stage !== 'dash' && (
          <Button variant="ghost" onClick={resetScan}><ArrowLeft /> Back to log</Button>
        )}
      </div>

      {!profile && (
        <Card className="border-warn-500/30 !bg-warn-500/[0.06] text-sm">
          You need a profile before logging vitals.{' '}
          <Link to="/settings" className="font-bold text-brand-600 underline dark:text-brand-300">
            Create one in Settings
          </Link>.
        </Card>
      )}

      <AnimatePresence mode="wait">
        {stage === 'scan' && (
          <motion.div key="scan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <CameraCapture
              onCapture={(b) => void onCapture(b)}
              overlayHint="Fit the device screen inside the frame — avoid glare"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Camera, t: '1 · Photo', d: 'Camera or files — cuff, glucometer, oximeter, scale' },
                { icon: BrainCircuit, t: '2 · Read', d: 'AI (or offline OCR) pulls the numbers off the display' },
                { icon: BadgeCheck, t: '3 · Confirm', d: 'You check every digit before it joins your 3-month log' },
              ].map((s) => (
                <Card key={s.t} className="flex items-start gap-3 !p-4">
                  <s.icon className="mt-0.5 size-5 text-brand-500" />
                  <div>
                    <p className="text-sm font-bold">{s.t}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{s.d}</p>
                  </div>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {stage === 'processing' && (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="flex flex-col items-center gap-5 py-12">
              {imageUrl && <img src={imageUrl} alt="Device screen" className="max-h-56 rounded-2xl border border-white/10 object-contain" />}
              <div className="relative">
                <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-accent-600 text-white shadow-xl">
                  <Sparkles className="size-7 animate-pulse" />
                </div>
                <Loader2 className="absolute -right-2 -top-2 size-6 animate-spin text-brand-500" />
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{progress}</p>
              <p className="-mt-2 max-w-80 text-center text-xs text-slate-400">
                The AI is only reading the display. Nothing is saved until you confirm it.
              </p>
            </Card>
          </motion.div>
        )}

        {stage === 'review' && (
          <motion.div key="rev" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card className={aiFailed ? 'border-warn-500/30 !bg-warn-500/[0.06]' : 'border-accent-500/25 !bg-accent-500/[0.06]'}>
              <div className="flex items-start gap-3">
                {aiFailed ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn-500" /> : <BrainCircuit className="mt-0.5 size-5 shrink-0 text-accent-500" />}
                <div className="text-sm">
                  {aiFailed ? (
                    <>
                      <p className="font-bold text-warn-600 dark:text-warn-400">Automatic read unavailable</p>
                      <p className="mt-0.5 text-slate-500 dark:text-slate-400">{aiFailed}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-accent-600 dark:text-accent-400">
                        Read with {providerLabel} — check every digit
                      </p>
                      <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                        Device screens glare and smudge. Confirm this matches what you see.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </Card>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
              <div className="space-y-4">
                {imageUrl && (
                  <Card className="!p-2">
                    <img src={imageUrl} alt="Scanned device" className="w-full rounded-2xl object-contain" />
                  </Card>
                )}
                {ocrText && (
                  <Card>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">OCR text</p>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{ocrText}</pre>
                  </Card>
                )}
              </div>
              <Card className="space-y-4">
                <ReadingFields draft={draft} onChange={setDraft} when={when} onWhen={setWhen} notes={notes} onNotes={setNotes} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={resetScan}>Discard</Button>
                  <Button onClick={() => void saveDraft(aiFailed ? 'ocr' : 'device_scan')} data-testid="save-reading">
                    <BadgeCheck /> Confirm & save
                  </Button>
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {stage === 'report' && report && (
          <motion.div key="report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <HealthReportCard
              report={report}
              onDone={() => {
                setReport(null)
                resetScan()
              }}
            />
          </motion.div>
        )}

        {stage === 'dash' && (
          <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {enabled.length === 0 ? (
              <OptInGallery
                existing={trackers ?? []}
                onEnable={async (kind) => {
                  if (!profile) return showToast('Create a profile first', 'error')
                  await ensureTracker(profile.id, kind, trackers)
                  showToast(`${VITAL_META[kind].label} tracking on`, 'success')
                }}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {([7, 30, 90] as Period[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setPeriod(d)}
                      className={
                        period === d
                          ? 'rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold text-brand-700 dark:text-brand-300'
                          : 'rounded-full px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/8'
                      }
                    >
                      {d === 90 ? '3 months' : `${d} days`}
                    </button>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <CalendarRange className="size-3.5" />
                    {focusedRows.length} reading{focusedRows.length === 1 ? '' : 's'} in view
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {enabled.map((t) => (
                    <SummaryCard
                      key={t.id}
                      tracker={t}
                      rows={periodRows.filter((r) => r.kind === t.kind)}
                      active={focus === t.kind || (focus === 'all' && chartKind === t.kind)}
                      onFocus={() => setFocus((f) => (f === t.kind ? 'all' : t.kind))}
                      onLog={() => openManual(t.kind)}
                    />
                  ))}
                </div>

                {chartKind && (
                  <Card>
                    <SectionTitle
                      right={
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => setFocus('all')}
                            className={focus === 'all'
                              ? 'rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300'
                              : 'rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-slate-400'}
                          >
                            Latest
                          </button>
                          {enabled.map((t) => (
                            <button
                              key={t.kind}
                              onClick={() => setFocus(t.kind)}
                              className={focus === t.kind
                                ? 'rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300'
                                : 'rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-slate-400'}
                            >
                              {VITAL_META[t.kind].short}
                            </button>
                          ))}
                        </div>
                      }
                    >
                      {VITAL_META[chartKind].emoji} {VITAL_META[chartKind].label} · last {period === 90 ? '3 months' : `${period} days`}
                    </SectionTitle>
                    <VitalTrendChart
                      points={chartPoints}
                      primaryLabel={chartKind === 'blood_pressure' ? 'Systolic' : VITAL_META[chartKind].short}
                      secondaryLabel={chartKind === 'blood_pressure' ? 'Diastolic' : undefined}
                      primaryColor={VITAL_META[chartKind].color}
                      unit={chartTracker?.unit ?? VITAL_META[chartKind].unit}
                      bandMin={chartTracker?.targetMin}
                      bandMax={chartTracker?.targetMax}
                    />
                  </Card>
                )}

                <Card>
                  <SectionTitle right={
                    <Button size="sm" variant="subtle" onClick={() => openManual()}><Plus /> Add</Button>
                  }>
                    History
                  </SectionTitle>
                  <div className="space-y-1" data-testid="health-history">
                    {focusedRows.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <Activity className="size-8 text-slate-400" />
                        <p className="text-sm text-slate-500">No readings in this period. Scan a device or log one manually.</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setStage('scan')}><Camera /> Scan</Button>
                          <Button size="sm" variant="outline" onClick={() => openManual()}><PenLine /> Manual</Button>
                        </div>
                      </div>
                    )}
                    {focusedRows.map((r) => {
                      const cls = classifyReading(r, trackers?.find((t) => t.kind === r.kind))
                      return (
                        <button
                          key={r.id}
                          onClick={() => setEditing(r)}
                          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-slate-200/40 dark:hover:bg-white/[0.04]"
                        >
                          <span className="text-lg">{VITAL_META[r.kind].emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {formatReading(r)}
                              {r.context && (
                                <span className="ml-2 text-xs font-normal text-slate-400">{contextLabel(r.context)}</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatReadingWhen(r.recordedAt)}
                              {r.source !== 'manual' && ' · scanned'}
                              {r.notes ? ` · ${r.notes}` : ''}
                            </p>
                          </div>
                          <Badge tone={cls.tone}>{cls.label}</Badge>
                        </button>
                      )
                    })}
                  </div>
                </Card>

                <Card className="border-slate-300/40 !bg-transparent dark:border-white/8">
                  <div className="flex items-start gap-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <p>
                      MediMind stores these readings on this device so you can share a 3-month
                      picture with your clinician. It does not diagnose, treat, or replace a
                      medical device. Confirm every scanned number against the screen.
                    </p>
                  </div>
                </Card>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} title="Log a reading" wide>
        <div className="space-y-4">
          <ReadingFields draft={draft} onChange={setDraft} when={when} onWhen={setWhen} notes={notes} onNotes={setNotes} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveDraft('manual')} data-testid="save-reading">Save reading</Button>
          </div>
        </div>
      </Dialog>

      <ManageDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        profileId={profile?.id}
        trackers={trackers ?? []}
      />

      <ReadingDetail
        reading={editing}
        prior={(readings ?? []).filter((r) => r.kind === editing?.kind)}
        tracker={editing ? trackers?.find((t) => t.kind === editing.kind) : undefined}
        onClose={() => setEditing(null)}
        onDeleted={() => { setEditing(null); showToast('Reading deleted') }}
      />
    </div>
  )
}

/* --------------------------------- pieces -------------------------------- */

function trackerUnit(trackers: HealthTracker[] | undefined, kind: VitalKind): string | undefined {
  return trackers?.find((t) => t.kind === kind)?.unit
}

async function ensureTracker(
  profileId: string,
  kind: VitalKind,
  existing: HealthTracker[] | undefined,
): Promise<HealthTracker> {
  const found =
    existing?.find((t) => t.kind === kind)
    ?? await db.healthTrackers.where('[profileId+kind]').equals([profileId, kind]).first()
  if (found) {
    if (!found.enabled) await db.healthTrackers.update(found.id, { enabled: true })
    return { ...found, enabled: true }
  }
  const row: HealthTracker = {
    id: uid(),
    profileId,
    kind,
    enabled: true,
    unit: VITAL_META[kind].unit,
    createdAt: new Date().toISOString(),
  }
  try {
    await db.healthTrackers.add(row)
  } catch {
    const raced = await db.healthTrackers.where('[profileId+kind]').equals([profileId, kind]).first()
    if (raced) return { ...raced, enabled: true }
    throw new Error('Could not enable tracker')
  }
  return row
}

function OptInGallery({
  existing,
  onEnable,
}: {
  existing: HealthTracker[]
  onEnable: (kind: VitalKind) => void
}) {
  const featured = VITAL_KINDS.filter((k) => VITAL_META[k].featured)
  const extra = VITAL_KINDS.filter((k) => !VITAL_META[k].featured)
  const enabled = new Set(existing.filter((t) => t.enabled).map((t) => t.kind))

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Activity className="size-6" />
          </div>
          <div>
            <p className="font-bold">Turn on only what you need</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Heart and diabetes patients often keep about three months of BP or sugar
              history for clinic visits. Everything stays on this device — skip any metric
              you don’t use.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {featured.map((kind) => {
          const m = VITAL_META[kind]
          return (
            <Card key={kind} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold">{m.label}</h2>
                    <Badge tone="brand">{m.who}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{m.blurb}</p>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={enabled.has(kind)}
                data-testid={`enable-tracker-${kind}`}
                onClick={() => onEnable(kind)}
              >
                {enabled.has(kind) ? 'Tracking on' : `Track ${m.short.toLowerCase()}`}
              </Button>
            </Card>
          )
        })}
      </div>

      <Card>
        <SectionTitle>Also available</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {extra.map((kind) => {
            const m = VITAL_META[kind]
            return (
              <div key={kind} className="flex items-center gap-3 rounded-2xl border border-slate-300/50 p-3 dark:border-white/10">
                <span className="text-xl">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{m.label}</p>
                  <p className="text-[11px] text-slate-400">{m.blurb}</p>
                </div>
                <Button size="sm" variant="subtle" disabled={enabled.has(kind)} data-testid={`enable-tracker-${kind}`} onClick={() => onEnable(kind)}>
                  {enabled.has(kind) ? 'On' : 'Enable'}
                </Button>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function SummaryCard({
  tracker,
  rows,
  active,
  onFocus,
  onLog,
}: {
  tracker: HealthTracker
  rows: VitalReading[]
  active: boolean
  onFocus: () => void
  onLog: () => void
}) {
  const meta = VITAL_META[tracker.kind]
  const latest = rows[0]
  const prev = rows[1]
  const cls = latest ? classifyReading(latest, tracker) : null
  const trend = trendDirection(readingPrimary(latest ?? {}), readingPrimary(prev ?? {}))
  const spark = sparkValues(rows, tracker.kind, tracker.unit)
  const TrendIcon = trend === 'down' ? TrendingDown : trend === 'up' ? TrendingUp : Minus

  return (
    <Card className={active ? 'ring-2 ring-brand-500/40' : ''}>
      <button onClick={onFocus} className="w-full cursor-pointer text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.emoji}</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{meta.label}</p>
              <p className="text-2xl font-extrabold tabular-nums">
                {latest ? formatReading(latest).replace(` ${latest.unit}`, '') : '—'}
                <span className="ml-1 text-xs font-semibold text-slate-400">{latest?.unit ?? tracker.unit}</span>
              </p>
            </div>
          </div>
          {cls && <Badge tone={cls.tone}>{cls.label}</Badge>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">
            {latest ? formatReadingWhen(latest.recordedAt) : 'No readings yet'}
            {trend !== 'none' && latest && prev && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                <TrendIcon className="size-3" />
                vs last
              </span>
            )}
          </p>
          <Sparkline values={spark} color={meta.color} />
        </div>
      </button>
      <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={onLog}>
        <Plus /> Log {meta.short.toLowerCase()}
      </Button>
    </Card>
  )
}

function ReadingFields({
  draft,
  onChange,
  when,
  onWhen,
  notes,
  onNotes,
}: {
  draft: ExtractedVital
  onChange: (d: ExtractedVital) => void
  when: string
  onWhen: (v: string) => void
  notes: string
  onNotes: (v: string) => void
}) {
  const kind = draft.kind ?? 'blood_pressure'
  const meta = VITAL_META[kind]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What are you logging?">
          <Select
            value={kind}
            data-testid="vital-kind"
            onChange={(e) => {
              const next = e.target.value as VitalKind
              onChange({ ...emptyDraft(next), kind: next, unit: defaultUnitFor(next, draft.unit) })
            }}
          >
            {VITAL_KINDS.map((k) => (
              <option key={k} value={k}>{VITAL_META[k].emoji} {VITAL_META[k].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="When">
          <Input type="datetime-local" value={when} onChange={(e) => onWhen(e.target.value)} />
        </Field>
      </div>

      {kind === 'blood_pressure' ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Systolic">
            <Input inputMode="numeric" data-testid="vital-systolic" placeholder="120" value={draft.systolic ?? ''} onChange={(e) => onChange({ ...draft, systolic: numOrUndef(e.target.value) })} />
          </Field>
          <Field label="Diastolic">
            <Input inputMode="numeric" data-testid="vital-diastolic" placeholder="80" value={draft.diastolic ?? ''} onChange={(e) => onChange({ ...draft, diastolic: numOrUndef(e.target.value) })} />
          </Field>
          <Field label="Pulse (opt.)">
            <Input inputMode="numeric" placeholder="72" value={draft.pulse ?? ''} onChange={(e) => onChange({ ...draft, pulse: numOrUndef(e.target.value) })} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${meta.short} reading`}>
            <Input inputMode="decimal" data-testid="vital-value" placeholder={meta.placeholder} value={draft.value ?? ''} onChange={(e) => onChange({ ...draft, value: numOrUndef(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <Select value={defaultUnitFor(kind, draft.unit)} onChange={(e) => onChange({ ...draft, unit: e.target.value })}>
              {[meta.unit, ...meta.altUnits].map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
      )}

      {kind === 'blood_sugar' && (
        <Field label="When relative to food">
          <Select
            value={coerceSugarContext(draft.context) ?? 'fasting'}
            onChange={(e) => onChange({ ...draft, context: e.target.value })}
          >
            {SUGAR_CONTEXTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
      )}

      {draft.deviceBrand && (
        <p className="text-xs text-slate-400">Device: {draft.deviceBrand}</p>
      )}
      {draft.confidenceNote && (
        <p className="rounded-xl bg-warn-500/10 p-2.5 text-xs text-warn-600 dark:text-warn-400">{draft.confidenceNote}</p>
      )}

      <Field label="Notes" hint="Optional — e.g. after a walk, felt dizzy">
        <Textarea className="min-h-16" value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="Anything worth telling your clinician…" />
      </Field>
    </div>
  )
}

function numOrUndef(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function ManageDialog({
  open,
  onClose,
  profileId,
  trackers,
}: {
  open: boolean
  onClose: () => void
  profileId?: string
  trackers: HealthTracker[]
}) {
  const showToast = useUiStore((s) => s.showToast)
  const byKind = new Map(trackers.map((t) => [t.kind, t]))

  const toggle = async (kind: VitalKind, on: boolean) => {
    if (!profileId) return
    const found = byKind.get(kind)
    if (found) {
      await db.healthTrackers.update(found.id, { enabled: on })
    } else if (on) {
      await ensureTracker(profileId, kind, trackers)
    }
  }

  const patch = async (kind: VitalKind, next: Partial<HealthTracker>) => {
    const found = byKind.get(kind)
    if (!found) return
    await db.healthTrackers.update(found.id, next)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Manage health tracking" wide>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Disable a metric to hide it from the dashboard. Past readings stay on this device
        for your 3-month history and backups.
      </p>
      <div className="space-y-3">
        {VITAL_KINDS.map((kind) => {
          const m = VITAL_META[kind]
          const t = byKind.get(kind)
          const on = !!t?.enabled
          return (
            <div key={kind} className="rounded-2xl border border-slate-300/50 p-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-xl">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{m.label}</p>
                  <p className="text-[11px] text-slate-400">{m.who}</p>
                </div>
                <Switch checked={on} onChange={(v) => void toggle(kind, v)} />
              </div>
              {on && t && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Field label="Unit">
                    <Select value={t.unit} onChange={(e) => void patch(kind, { unit: e.target.value })}>
                      {[m.unit, ...m.altUnits].map((u) => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  </Field>
                  {kind === 'blood_pressure' ? (
                    <>
                      <Field label="Max systolic">
                        <Input inputMode="numeric" placeholder="e.g. 130" value={t.targetSystolicMax ?? ''} onChange={(e) => void patch(kind, { targetSystolicMax: numOrUndef(e.target.value) })} />
                      </Field>
                      <Field label="Max diastolic">
                        <Input inputMode="numeric" placeholder="e.g. 80" value={t.targetDiastolicMax ?? ''} onChange={(e) => void patch(kind, { targetDiastolicMax: numOrUndef(e.target.value) })} />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Target min">
                        <Input inputMode="decimal" value={t.targetMin ?? ''} onChange={(e) => void patch(kind, { targetMin: numOrUndef(e.target.value) })} />
                      </Field>
                      <Field label="Target max">
                        <Input inputMode="decimal" value={t.targetMax ?? ''} onChange={(e) => void patch(kind, { targetMax: numOrUndef(e.target.value) })} />
                      </Field>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => { showToast('Tracking preferences saved', 'success'); onClose() }}>Done</Button>
      </div>
    </Dialog>
  )
}

function ReadingDetail({
  reading,
  prior,
  tracker,
  onClose,
  onDeleted,
}: {
  reading: VitalReading | null
  prior: VitalReading[]
  tracker?: HealthTracker
  onClose: () => void
  onDeleted: () => void
}) {
  const profile = useActiveProfile()
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!reading?.image) { setUrl(''); return }
    const u = URL.createObjectURL(reading.image)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [reading])

  if (!reading) return null
  const meta = VITAL_META[reading.kind]
  const snap = buildHealthReport(reading, prior, tracker, profile ?? undefined)

  return (
    <Dialog open onClose={onClose} title={`${meta.emoji} ${meta.label}`} wide>
      <div className="space-y-4">
        <HealthReportCard report={snap} compact />
        {url && (
          <img src={url} alt="Saved device photo" className="max-h-56 w-full rounded-2xl object-contain" />
        )}
        {reading.notes && <p className="text-sm text-slate-600 dark:text-slate-300">{reading.notes}</p>}
        <p className="text-[11px] text-slate-400">
          {formatReadingWhen(reading.recordedAt)} · {reading.source === 'manual' ? 'typed' : reading.source === 'ocr' ? 'offline OCR' : 'device scan'}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Delete this reading?')) return
              await db.vitalReadings.delete(reading.id)
              onDeleted()
            }}
          >
            <Trash2 /> Delete
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  )
}


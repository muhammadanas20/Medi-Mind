import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BrainCircuit, CalendarDays, ChevronDown,
  CircleAlert, FlaskConical, ImageIcon, Pill, Plus, ScanLine, Search, ShieldCheck,
  Stethoscope, Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CameraCapture } from '../components/camera'
import { SlotIcon } from '../components/icons'
import { DoseSlotPicker } from '../components/slot-picker'
import { AIScanLoader, Badge, Button, Card, Field, Input, Select } from '../components/ui'
import { foodLabel } from '../lib/reminders'
import { SLOTS, type Slot } from '../lib/types'
import { extractPrescription } from '../ai/service'
import { parseDurationDays, foodFromText } from '../ai/extract'
import { db, todayStr, uid } from '../lib/db'
import { prepareForAI, prepareForOCR } from '../lib/image'
import type { ExtractedPrescription, ExtractedMedicine, FoodInstruction, Prescription } from '../lib/types'
import { MED_FORMS } from '../lib/meds-helpers'
import { runOCR, type OcrProgress } from '../lib/ocr'
import { cn } from '../lib/utils'
import { useActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

type Stage = 'capture' | 'processing' | 'review' | 'done'

const MED_COLORS = ['#07c5a8', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#84cc16']

export function ScanPage() {
  const profile = useActiveProfile()
  const showToast = useUiStore((s) => s.showToast)
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>('capture')
  const [image, setImage] = useState<Blob | null>(null)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [progress, setProgress] = useState('')
  const [extraction, setExtraction] = useState<ExtractedPrescription | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [aiFailed, setAiFailed] = useState<string | null>(null)
  const [providerLabel, setProviderLabel] = useState('')
  const [confirmedCount, setConfirmedCount] = useState(0)

  const onCapture = async (blob: Blob) => {
    setImage(blob)
    setImageUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
    setStage('processing')
    void processImage(blob)
  }

  /** The pipeline: AI vision → zod parse → review. OCR fallback always offered. */
  const processImage = async (blob: Blob) => {
    setAiFailed(null)
    try {
      setProgress('Preparing image…')
      const ai = await prepareForAI(blob)
      setProgress('Reading prescription with AI…')
      const { extraction: ex, providerLabel: pl } = await extractPrescription(ai.base64, ai.mimeType, profile ?? undefined)
      setExtraction(ex)
      setProviderLabel(pl)
      setStage('review')
      if (!ex.medicines.length) {
        showToast('No medicines detected — add them manually below', 'info')
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'AI extraction failed'
      if (message === 'NO_PROVIDER') {
        setAiFailed('No AI provider configured yet. Running offline OCR instead — you can also add an API key in Settings → AI Providers.')
      } else {
        setAiFailed(message)
      }
      // Graceful offline fallback: OCR text to help manual entry
      try {
        const ocred = await prepareForOCR(blob)
        const text = await runOCR(ocred.blob, (p: OcrProgress) =>
          setProgress(`Offline OCR — ${p.status} ${Math.round(p.progress * 100)}%`),
        )
        setOcrText(text)
      } catch {
        setOcrText('')
      }
      setExtraction({ medicines: [emptyMedicine()] })
      setStage('review')
    }
  }

  const confirmAll = async () => {
    if (!profile || !extraction) return
    const meds = extraction.medicines.filter((m) => m.medicine.trim())
    if (meds.length === 0) {
      showToast('Nothing to confirm — add at least one medicine', 'error')
      return
    }

    const prescription: Prescription = {
      id: uid(),
      profileId: profile.id,
      image: image ?? undefined,
      extraction,
      ocrText: ocrText || undefined,
      aiProvider: providerLabel || 'manual/OCR',
      status: 'confirmed',
      confirmedMedicationIds: [],
      createdAt: new Date().toISOString(),
    }

    for (const [i, m] of meds.entries()) {
      const id = uid()
      await db.medications.add({
        id,
        profileId: profile.id,
        name: m.medicine.trim(),
        strength: m.strength,
        form: m.form || 'tablet',
        slots: { morning: m.morning, afternoon: m.afternoon, evening: m.evening, night: m.night },
        food: m.foodRelation ?? foodFromText(m.food),
        instructions: [m.food, m.notes].filter(Boolean).join(' — ') || undefined,
        startDate: todayStr(),
        durationDays: parseDurationDays(m.duration),
        color: MED_COLORS[i % MED_COLORS.length],
        isCritical: false,
        active: true,
        sourcePrescriptionId: prescription.id,
        createdAt: new Date().toISOString(),
      })
      prescription.confirmedMedicationIds.push(id)
    }
    await db.prescriptions.add(prescription)
    setConfirmedCount(meds.length)
    setStage('done')
  }

  const reset = () => {
    setStage('capture')
    setImage(null)
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl('')
    setExtraction(null)
    setOcrText('')
    setAiFailed(null)
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Scan <span className="text-gradient">prescription</span>
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <ShieldCheck className="size-4 text-emerald-500" />
            AI extracts — you confirm. Reminders are created only after your approval.
          </p>
        </div>
        {stage !== 'capture' && (
          <Button variant="ghost" onClick={reset}>
            <ArrowLeft /> New scan
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {stage === 'capture' && (
          <motion.div key="capture" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <CameraCapture
              onCapture={(b) => void onCapture(b)}
              overlayHint="Fit the whole prescription inside the frame"
            />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { icon: ScanLine, t: '1 · Scan', d: 'Camera or files — image is processed on your terms' },
                { icon: BrainCircuit, t: '2 · Extract', d: 'AI structures medicines into a reviewable list' },
                { icon: BadgeCheck, t: '3 · Confirm', d: 'You approve every entry before reminders start' },
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
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Link to="/health?scan=1" className="block" data-testid="scan-goto-health">
                <Card className="card-hover flex items-start gap-3 !p-4">
                  <Activity className="mt-0.5 size-5 text-rose-500" />
                  <div>
                    <p className="text-sm font-bold">Scan a reading device</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      BP cuff, glucometer, oximeter — AI reads the screen into your 3-month health log.
                    </p>
                  </div>
                </Card>
              </Link>
              <Link to="/pill-id" className="block" data-testid="scan-goto-pill">
                <Card className="card-hover flex items-start gap-3 !p-4">
                  <Search className="mt-0.5 size-5 text-accent-500" />
                  <div>
                    <p className="text-sm font-bold">Identify a pill</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Photo + imprint → possible matches with a confidence score. Never a diagnosis.
                    </p>
                  </div>
                </Card>
              </Link>
            </div>
          </motion.div>
        )}

        {stage === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="flex flex-col items-center gap-5 py-12">
              {imageUrl && (
                <img src={imageUrl} alt="Prescription" className="max-h-56 rounded-2xl border border-white/10 object-contain" />
              )}
              <AIScanLoader progress={progress} />
              <p className="max-w-80 text-center text-xs text-slate-400">
                The AI is only reading the document. Nothing becomes a reminder until you confirm it.
              </p>
            </Card>
          </motion.div>
        )}

        {stage === 'review' && extraction && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card className={
              aiFailed
                ? 'border-warn-500/30 !bg-warn-500/[0.06]'
                : 'border-accent-500/25 !bg-accent-500/[0.06]'
            }>
              <div className="flex items-start gap-3">
                {aiFailed ? (
                  <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn-500" />
                ) : (
                  <BrainCircuit className="mt-0.5 size-5 shrink-0 text-accent-500" />
                )}
                <div className="min-w-0 text-sm">
                  {aiFailed ? (
                    <>
                      <p className="font-bold text-warn-600 dark:text-warn-400">AI extraction unavailable</p>
                      <p className="mt-0.5 text-slate-500 dark:text-slate-400">{aiFailed}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-accent-600 dark:text-accent-400">
                          Extracted with {providerLabel} — review every field
                        </p>
                        {profile && (profile.age != null || profile.weight != null) && (
                          <Badge tone="brand">
                            {profile.name}{profile.age != null ? ` · ${profile.age} yrs` : ''}{profile.weight != null ? ` · ${profile.weight} ${profile.weightUnit || 'kg'}` : ''}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                        Tap a medicine to edit it. Nothing is scheduled until you confirm.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr] xl:grid-cols-[minmax(0,320px)_1fr]">
              <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                {imageUrl && <ScanImagePreview url={imageUrl} />}
                {ocrText && (
                  <Card>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      OCR text (offline fallback)
                    </p>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">{ocrText}</pre>
                  </Card>
                )}
              </div>

              <div className="min-w-0 space-y-4 pb-28 lg:pb-10">
                <PrescriptionDetailsCard
                  extraction={extraction}
                  onChange={setExtraction}
                  defaultOpen={!extraction.medicines.some((m) => m.medicine.trim())}
                />

                <MedicineReviewList
                  medicines={extraction.medicines}
                  onChange={(medicines) => setExtraction({ ...extraction, medicines })}
                />

                <div className="sticky bottom-24 z-10 lg:bottom-6">
                  <Card className="glass-strong flex flex-col gap-3 !p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
                      <p className="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                        I reviewed each medicine against the original prescription.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => void confirmAll()}
                      data-testid="confirm-extraction"
                    >
                      <BadgeCheck /> Confirm {extraction.medicines.filter((m) => m.medicine.trim()).length} & schedule
                    </Button>
                  </Card>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {stage === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="flex flex-col items-center gap-4 py-12 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                className="flex size-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
              >
                <BadgeCheck className="size-10" />
              </motion.div>
              <h2 className="text-2xl font-extrabold tracking-tight">{confirmedCount} reminder{confirmedCount === 1 ? '' : 's'} scheduled</h2>
              <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                You'll be notified in each dose window. Anything you marked critical will keep
                reminding you until it's taken.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => navigate('/')}>Go to today <ArrowRight /></Button>
                <Button variant="outline" onClick={reset}>Scan another</Button>
              </div>
              {extraction?.followUpDate && (
                <Badge tone="accent">
                  <CalendarDays className="size-3" /> Follow-up: {extraction.followUpDate}
                </Badge>
              )}
              {extraction?.tests?.length ? (
                <Badge tone="neutral">
                  <FlaskConical className="size-3" /> Tests: {extraction.tests.join(', ')}
                </Badge>
              ) : null}
              <Badge tone="neutral">
                <Stethoscope className="size-3" /> Always verify medication changes with your doctor
              </Badge>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!profile && stage === 'capture' && (
        <Card className="border-warn-500/30 !bg-warn-500/[0.06] text-sm">
          You need a profile before confirming extractions.{' '}
          <Link to="/settings" className="font-bold text-brand-600 underline dark:text-brand-300">
            Create one in Settings
          </Link>
          .
        </Card>
      )}
    </div>
  )
}

function emptyMedicine(): ExtractedMedicine {
  return { medicine: '', form: 'tablet', morning: 1, afternoon: 0, evening: 0, night: 0, foodRelation: 'any' }
}

/* ------------------------------ review UI ------------------------------ */

function ScanImagePreview({ url }: { url: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Card className="!p-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-3 text-left"
        >
          <img src={url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Original prescription</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {open ? 'Tap to hide' : 'Tap to compare while reviewing'}
            </p>
          </div>
          <ImageIcon className="size-4 shrink-0 text-slate-400" />
        </button>
        {open && (
          <img src={url} alt="Prescription scan" className="mt-2 max-h-72 w-full rounded-2xl object-contain" />
        )}
      </Card>
      <Card className="hidden !p-2 lg:block">
        <img src={url} alt="Prescription scan" className="w-full rounded-2xl object-contain" />
      </Card>
    </>
  )
}

function PrescriptionDetailsCard({
  extraction,
  onChange,
  defaultOpen,
}: {
  extraction: ExtractedPrescription
  onChange: (next: ExtractedPrescription) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const summary = [extraction.patientName, extraction.doctorName, extraction.hospital, extraction.disease]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Prescription details</p>
          <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            {summary || 'Patient, doctor, diagnosis, follow-up…'}
          </p>
        </div>
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t border-slate-200/70 px-4 py-4 dark:border-white/8 sm:grid-cols-2 sm:px-5">
              <Field label="Patient">
                <Input value={extraction.patientName ?? ''} onChange={(e) => onChange({ ...extraction, patientName: e.target.value })} placeholder="—" />
              </Field>
              <Field label="Doctor">
                <Input value={extraction.doctorName ?? ''} onChange={(e) => onChange({ ...extraction, doctorName: e.target.value })} placeholder="—" />
              </Field>
              <Field label="Hospital">
                <Input value={extraction.hospital ?? ''} onChange={(e) => onChange({ ...extraction, hospital: e.target.value })} placeholder="—" />
              </Field>
              <Field label="Diagnosis">
                <Input value={extraction.disease ?? ''} onChange={(e) => onChange({ ...extraction, disease: e.target.value })} placeholder="—" />
              </Field>
              <Field label="Follow-up date">
                <Input value={extraction.followUpDate ?? ''} onChange={(e) => onChange({ ...extraction, followUpDate: e.target.value })} placeholder="e.g. 2026-09-01" />
              </Field>
              <Field label="Tests">
                <Input
                  value={(extraction.tests ?? []).join(', ')}
                  onChange={(e) => onChange({
                    ...extraction,
                    tests: e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined,
                  })}
                  placeholder="e.g. HbA1c, Lipid panel"
                />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function MedicineReviewList({
  medicines,
  onChange,
}: {
  medicines: ExtractedMedicine[]
  onChange: (next: ExtractedMedicine[]) => void
}) {
  const [expanded, setExpanded] = useState(0)
  const prevLen = useRef(medicines.length)

  useEffect(() => {
    if (medicines.length > prevLen.current) {
      setExpanded(medicines.length - 1)
    } else {
      setExpanded((i) => (medicines.length === 0 ? -1 : Math.min(i, medicines.length - 1)))
    }
    prevLen.current = medicines.length
  }, [medicines.length])

  const named = medicines.filter((m) => m.medicine.trim()).length

  return (
    <Card className="!p-0 overflow-hidden" data-testid="review-med-list">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">Medicines</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {medicines.length === 0
              ? 'Nothing extracted yet — add one manually'
              : `${named} of ${medicines.length} named · tap a row to edit`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {medicines.length > 0 && <Badge tone="brand">{medicines.length}</Badge>}
          <Button
            variant="subtle"
            size="sm"
            onClick={() => onChange([...medicines, emptyMedicine()])}
          >
            <Plus /> Add
          </Button>
        </div>
      </div>

      {medicines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border-t border-slate-200/70 px-4 py-10 text-center dark:border-white/8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Pill className="size-6" />
          </div>
          <div>
            <p className="font-bold">No medicines yet</p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Add one manually, or scan the prescription again.
            </p>
          </div>
          <Button onClick={() => onChange([emptyMedicine()])}>
            <Plus /> Add medicine
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200/70 dark:divide-white/8">
          {medicines.map((med, i) => (
            <MedicineReviewRow
              key={i}
              med={med}
              index={i}
              open={expanded === i}
              onToggle={() => setExpanded(expanded === i ? -1 : i)}
              onChange={(next) => onChange(medicines.map((x, j) => (j === i ? next : x)))}
              onRemove={() => onChange(medicines.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function MedicineReviewRow({
  med,
  index,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  med: ExtractedMedicine
  index: number
  open: boolean
  onToggle: () => void
  onChange: (m: ExtractedMedicine) => void
  onRemove: () => void
}) {
  const color = MED_COLORS[index % MED_COLORS.length]
  const hasName = med.medicine.trim().length > 0
  const activeSlots = SLOTS.filter((s) => (med[s] ?? 0) > 0)
  const totalDoses = activeSlots.reduce((sum, s) => sum + (med[s] ?? 0), 0)

  return (
    <li className={cn(open && 'bg-brand-500/[0.03] dark:bg-white/[0.02]')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-slate-400">
          {index + 1}
        </span>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold text-white shadow-md"
          style={{ background: color }}
        >
          {hasName ? med.medicine.slice(0, 1).toUpperCase() : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className={cn('min-w-0 truncate font-bold', !hasName && 'text-slate-400')}>
              {hasName ? med.medicine : 'Untitled medicine'}
            </p>
            {!hasName && <Badge tone="warn" className="shrink-0">Name needed</Badge>}
            {hasName && totalDoses === 0 && <Badge tone="warn" className="shrink-0">No schedule</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {med.strength && <span className="font-semibold text-slate-600 dark:text-slate-300">{med.strength}</span>}
            {med.form && <span>{med.form}</span>}
            {activeSlots.length > 0 ? (
              activeSlots.map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <SlotIcon slot={s} className="size-3.5" />
                  <span className="font-semibold tabular-nums">{med[s]}</span>
                </span>
              ))
            ) : (
              <span>No doses set</span>
            )}
            {med.foodRelation && med.foodRelation !== 'any' && (
              <span>· {foodLabel(med.foodRelation)}</span>
            )}
            {med.duration && <span>· {med.duration}</span>}
          </div>
        </div>
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              <Field label="Medicine name">
                <Input
                  className="font-bold"
                  value={med.medicine}
                  placeholder="e.g. Metformin"
                  data-testid={`review-med-${index}`}
                  onChange={(e) => onChange({ ...med, medicine: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Strength">
                  <Input
                    value={med.strength ?? ''}
                    placeholder="500 mg"
                    onChange={(e) => onChange({ ...med, strength: e.target.value })}
                  />
                </Field>
                <Field label="Form">
                  <Select
                    value={med.form || 'tablet'}
                    onChange={(e) => onChange({ ...med, form: e.target.value })}
                  >
                    {MED_FORMS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Duration">
                  <Input
                    value={med.duration ?? ''}
                    placeholder="30 days"
                    onChange={(e) => onChange({ ...med, duration: e.target.value })}
                  />
                </Field>
                <Field label="Food timing">
                  <Select
                    value={med.foodRelation ?? 'any'}
                    onChange={(e) => onChange({ ...med, foodRelation: e.target.value as FoodInstruction })}
                  >
                    <option value="any">Any time</option>
                    <option value="before">Before food</option>
                    <option value="after">After food</option>
                    <option value="with">With food</option>
                  </Select>
                </Field>
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Dose schedule
                </span>
                <div className="mt-2">
                  <DoseSlotPicker
                    slots={{ morning: med.morning, afternoon: med.afternoon, evening: med.evening, night: med.night }}
                    onChange={(slot: Slot, qty) => onChange({ ...med, [slot]: qty })}
                  />
                </div>
              </div>

              <Field label="Notes" hint="Optional — anything written on the script">
                <Input
                  value={med.notes ?? ''}
                  placeholder="e.g. Swallow whole, do not crush"
                  onChange={(e) => onChange({ ...med, notes: e.target.value })}
                />
              </Field>

              {(med.food && med.food.trim()) ? (
                <p className="rounded-xl bg-slate-200/50 px-3 py-2 text-xs text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
                  From the script: {med.food}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-danger-500" onClick={onRemove} aria-label="Remove medicine">
                  <Trash2 /> Remove
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

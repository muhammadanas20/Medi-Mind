import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BrainCircuit, CalendarDays, CircleAlert,
  FlaskConical, PenLine, ScanLine, Search, ShieldCheck, Stethoscope, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CameraCapture } from '../components/camera'
import { SlotIcon } from '../components/icons'
import { AIScanLoader, Badge, Button, Card, Field, Input, Select, Textarea } from '../components/ui'
import { SLOT_META } from '../lib/reminders'
import { SLOTS, type Slot } from '../lib/types'
import { extractPrescription } from '../ai/service'
import { parseDurationDays, foodFromText } from '../ai/extract'
import { db, todayStr, uid } from '../lib/db'
import { prepareForAI, prepareForOCR } from '../lib/image'
import type { ExtractedPrescription, ExtractedMedicine, FoodInstruction, Prescription } from '../lib/types'
import { runOCR, type OcrProgress } from '../lib/ocr'
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
                { icon: BrainCircuit, t: '2 · Extract', d: 'AI structures medicines into reviewable cards' },
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
            {/* status banner */}
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
                <div className="text-sm">
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
                        AI evaluates age & weight safety. Tap any value to correct it before confirming.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
              {/* original + OCR side column */}
              <div className="space-y-4">
                {imageUrl && (
                  <Card className="!p-2">
                    <img src={imageUrl} alt="Prescription scan" className="w-full rounded-2xl object-contain" />
                  </Card>
                )}
                {ocrText && (
                  <Card>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      OCR text (offline fallback)
                    </p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">{ocrText}</pre>
                  </Card>
                )}
              </div>

              {/* editable structured data */}
              <div className="space-y-4">
                <Card className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Patient"><Input value={extraction.patientName ?? ''} onChange={(e) => setExtraction({ ...extraction, patientName: e.target.value })} placeholder="—" /></Field>
                    <Field label="Doctor"><Input value={extraction.doctorName ?? ''} onChange={(e) => setExtraction({ ...extraction, doctorName: e.target.value })} placeholder="—" /></Field>
                    <Field label="Hospital"><Input value={extraction.hospital ?? ''} onChange={(e) => setExtraction({ ...extraction, hospital: e.target.value })} placeholder="—" /></Field>
                    <Field label="Diagnosis"><Input value={extraction.disease ?? ''} onChange={(e) => setExtraction({ ...extraction, disease: e.target.value })} placeholder="—" /></Field>
                    <Field label="Follow-up date"><Input value={extraction.followUpDate ?? ''} onChange={(e) => setExtraction({ ...extraction, followUpDate: e.target.value })} placeholder="e.g. 2026-09-01" /></Field>
                    <Field label="Tests"><Input value={(extraction.tests ?? []).join(', ')} onChange={(e) => setExtraction({ ...extraction, tests: e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined })} placeholder="e.g. HbA1c, Lipid panel" /></Field>
                  </div>
                </Card>

                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight">Medicines ({extraction.medicines.length})</h2>
                  <Button variant="subtle" size="sm" onClick={() => setExtraction({ ...extraction, medicines: [...extraction.medicines, emptyMedicine()] })}>
                    <PenLine /> Add manually
                  </Button>
                </div>

                {extraction.medicines.map((m, i) => (
                  <MedicineReviewCard
                    key={i}
                    med={m}
                    index={i}
                    onChange={(next) =>
                      setExtraction({
                        ...extraction,
                        medicines: extraction.medicines.map((x, j) => (j === i ? next : x)),
                      })
                    }
                    onRemove={() =>
                      setExtraction({ ...extraction, medicines: extraction.medicines.filter((_, j) => j !== i) })
                    }
                  />
                ))}

                <div className="sticky bottom-24 z-10 lg:bottom-6">
                  <Card className="glass-strong flex flex-wrap items-center gap-3 !p-4">
                    <ShieldCheck className="size-5 text-emerald-500" />
                    <p className="min-w-40 flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                      I reviewed each medicine against the original prescription.
                    </p>
                    <Button size="lg" onClick={() => void confirmAll()} data-testid="confirm-extraction">
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
  return { medicine: '', morning: 1, afternoon: 0, evening: 0, night: 0, foodRelation: 'any' }
}

/* ------------------------------ review card ------------------------------ */

function MedicineReviewCard({
  med,
  index,
  onChange,
  onRemove,
}: {
  med: ExtractedMedicine
  index: number
  onChange: (m: ExtractedMedicine) => void
  onRemove: () => void
}) {
  const dose = (key: Slot, delta: number) => {
    onChange({ ...med, [key]: Math.max(0, Math.min(6, (med[key] ?? 0) + delta)) })
  }
  const color = MED_COLORS[index % MED_COLORS.length]
  const hasName = med.medicine.trim().length > 0

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <Card className={`relative overflow-hidden ${hasName ? '' : 'border-warn-500/40'}`}>
        <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <Input
            className="!h-10 col-span-2 min-w-36 font-bold sm:col-span-1 sm:flex-1"
            value={med.medicine}
            placeholder="Medicine name *"
            data-testid={`review-med-${index}`}
            onChange={(e) => onChange({ ...med, medicine: e.target.value })}
          />
          <Input
            className="!h-10 w-full sm:w-28"
            value={med.strength ?? ''}
            placeholder="Strength"
            onChange={(e) => onChange({ ...med, strength: e.target.value })}
          />
          <Select
            className="!h-10 w-full sm:w-28"
            value={med.foodRelation ?? 'any'}
            onChange={(e) => onChange({ ...med, foodRelation: e.target.value as FoodInstruction })}
          >
            <option value="any">Any time</option>
            <option value="before">Before food</option>
            <option value="after">After food</option>
            <option value="with">With food</option>
          </Select>
          <Input
            className="!h-10 w-full sm:w-28"
            value={med.duration ?? ''}
            placeholder="Duration"
            onChange={(e) => onChange({ ...med, duration: e.target.value })}
          />
          <Button size="iconsm" variant="ghost" className="justify-self-end text-danger-500 sm:justify-self-auto" onClick={onRemove} aria-label="Remove medicine">
            <Trash2 />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SLOTS.map((slot) => (
            <div
              key={slot}
              className={
                (med[slot] ?? 0) > 0
                  ? 'flex items-center gap-2 rounded-2xl border border-brand-500/40 bg-brand-500/[0.08] px-3 py-1.5'
                  : 'flex items-center gap-2 rounded-2xl border border-slate-300/50 px-3 py-1.5 dark:border-white/10'
              }
            >
              <SlotIcon slot={slot} className="size-4" />
              <span className="text-xs font-semibold">{SLOT_META[slot].label}</span>
              <div className="flex items-center gap-1.5">
                <button aria-label={`less ${slot}`} className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-slate-300/60 text-xs font-bold dark:bg-white/10" onClick={() => dose(slot, -1)}>−</button>
                <span className="w-4 text-center text-sm font-extrabold tabular-nums">{med[slot] ?? 0}</span>
                <button aria-label={`more ${slot}`} className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-700 dark:text-brand-300" onClick={() => dose(slot, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
        {(med.food || med.notes) && (
          <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
            {[med.food, med.notes].filter(Boolean).join(' · ')}
          </p>
        )}
      </Card>
    </motion.div>
  )
}

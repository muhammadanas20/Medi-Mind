import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, Camera, CircleHelp, Loader2, RotateCcw, SearchCheck, ShieldAlert, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { observePill } from '../ai/service'
import { normalizePillColor, normalizePillShape } from '../ai/extract'
import { CameraCapture } from '../components/camera'
import { Badge, Button, Card, Field, Input, Select } from '../components/ui'
import { db, uid } from '../lib/db'
import { prepareForAI, prepareForOCR, sampleDominantColor, type SampledColor } from '../lib/image'
import { extractImprintCandidates, runOCR } from '../lib/ocr'
import { matchPills, type MatchInput } from '../lib/pills'
import type { PillColor, PillScanResult, PillShape } from '../lib/types'
import { SHAPES, COLORS } from '../lib/pill-ui'
import { useActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

type Stage = 'capture' | 'analyzing' | 'results'

export function PillIdPage() {
  const profile = useActiveProfile()
  const showToast = useUiStore((s) => s.showToast)

  const [stage, setStage] = useState<Stage>('capture')
  const [imageUrl, setImageUrl] = useState('')
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [progress, setProgress] = useState('')
  const [imprint, setImprint] = useState('')
  const [color, setColor] = useState<PillColor | ''>('')
  const [sampled, setSampled] = useState<SampledColor | null>(null)
  const [shape, setShape] = useState<PillShape | ''>('')
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [aiUsed, setAiUsed] = useState(false)
  const [results, setResults] = useState<PillScanResult[]>([])
  const [verified, setVerified] = useState<string | null>(null)

  const analyze = async (blob: Blob) => {
    setImageBlob(blob)
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(URL.createObjectURL(blob))
    setStage('analyzing')
    setAiNote(null)
    setAiUsed(false)

    // 1 — local color sampling (instant, on-device)
    setProgress('Analyzing color…')
    const c = await sampleDominantColor(blob)
    setSampled(c)
    setColor((c.name as PillColor) ?? '')

    // 2 — try AI vision to read the imprint + shape (falls back to local OCR)
    try {
      setProgress('Asking AI to read the imprint…')
      const ai = await prepareForAI(blob)
      const obs = await observePill(ai.base64, ai.mimeType)
      setAiUsed(true)
      setImprint(obs.imprint)
      const nc = normalizePillColor(obs.color)
      if (nc) setColor(nc)
      const ns = normalizePillShape(obs.shape)
      if (ns) setShape(ns)
      if (obs.confidenceNote) setAiNote(obs.confidenceNote)
    } catch {
      // offline path — local OCR + manual shape
      try {
        setProgress('Running offline imprint OCR…')
        const ocred = await prepareForOCR(blob)
        const text = await runOCR(ocred.blob, (p) => setProgress(`Offline OCR — ${p.status}`))
        setImprint(extractImprintCandidates(text))
        setAiNote('AI unavailable — imprint read with local OCR. Double-check it matches your pill.')
      } catch {
        setAiNote('Could not auto-read this image — type the imprint code printed on the pill.')
      }
    }
    setStage('results')
  }

  const runMatch = () => {
    const input: MatchInput = {
      imprint: imprint || undefined,
      color: (color || undefined) as PillColor | undefined,
      shape: (shape || undefined) as PillShape | undefined,
    }
    const r = matchPills(input)
    setResults(r)
    if (r.length === 0) showToast('No close matches in the local database', 'info')
  }

  const confirmMatch = async (entryId: string) => {
    setVerified(entryId)
    if (profile) {
      await db.pillScans.add({
        id: uid(),
        profileId: profile.id,
        image: imageBlob ?? undefined,
        imprint,
        color: (color || undefined) as PillColor | undefined,
        shape: (shape || undefined) as PillShape | undefined,
        results,
        verifiedByUser: true,
        createdAt: new Date().toISOString(),
      })
    }
    showToast('Match saved to your history', 'success')
  }

  const reset = () => {
    setStage('capture')
    setResults([])
    setVerified(null)
    setImprint('')
    setColor('')
    setShape('')
    setSampled(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Pill <span className="text-gradient">identifier</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            Combines imprint OCR + color + shape to suggest <em>possible</em> matches with a
            confidence score. Many pills look identical — always verify against the packaging.
          </p>
        </div>
        {stage !== 'capture' && (
          <Button variant="ghost" onClick={reset}><RotateCcw /> New scan</Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {stage === 'capture' && (
          <motion.div key="cap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CameraCapture
              onCapture={(b) => void analyze(b)}
              overlayHint="Place ONE pill on a dark background, imprint facing up"
            />
          </motion.div>
        )}

        {stage === 'analyzing' && (
          <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="flex flex-col items-center gap-4 py-10">
              {imageUrl && <img src={imageUrl} alt="Pill" className="max-h-52 rounded-2xl object-contain" />}
              <Loader2 className="size-6 animate-spin text-brand-500" />
              <p className="text-sm font-semibold">{progress}</p>
            </Card>
          </motion.div>
        )}

        {stage === 'results' && (
          <motion.div key="res" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
            {/* left: photo + observations */}
            <div className="space-y-4">
              {imageUrl && (
                <Card className="!p-2">
                  <img src={imageUrl} alt="Pill scan" className="w-full rounded-2xl object-contain" />
                  <div className="flex items-center gap-2 p-2 text-xs text-slate-500">
                    {aiUsed ? <BrainCircuit className="size-4 text-accent-500" /> : <Camera className="size-4" />}
                    {aiUsed ? 'Observed by AI vision' : 'Local analysis'}
                    {sampled && (
                      <span className="ml-auto inline-flex items-center gap-1.5 font-semibold">
                        <span className="size-3.5 rounded-full border border-black/10" style={{ background: sampled.hex }} />
                        {sampled.name}
                      </span>
                    )}
                  </div>
                </Card>
              )}
              <Card className="space-y-4">
                <Field label="Imprint code" hint="Letters/numbers pressed into the pill">
                  <Input value={imprint} onChange={(e) => setImprint(e.target.value)} placeholder="e.g. ATV 20" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Color">
                    <Select value={color} onChange={(e) => setColor(e.target.value as PillColor | '')}>
                      <option value="">Unknown</option>
                      {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                  <Field label="Shape">
                    <Select value={shape} onChange={(e) => setShape(e.target.value as PillShape | '')}>
                      <option value="">Unknown</option>
                      {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>
                </div>
                {aiNote && (
                  <p className="rounded-xl bg-warn-500/10 p-2.5 text-xs text-warn-600 dark:text-warn-400">
                    <Sparkles className="mr-1 inline size-3.5" />{aiNote}
                  </p>
                )}
                <Button className="w-full" onClick={runMatch} data-testid="match-pills">
                  <SearchCheck /> Find possible matches
                </Button>
              </Card>
            </div>

            {/* right: results */}
            <div className="space-y-3">
              {results.length === 0 ? (
                <Card className="flex flex-col items-center gap-3 py-10 text-center">
                  <CircleHelp className="size-8 text-slate-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Review the observations, then run the matcher.
                  </p>
                </Card>
              ) : (
                <>
                  {results.map((r, i) => (
                    <motion.div key={r.entry.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
                      <Card className="relative overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 w-1.5"
                          style={{ background: r.confidence >= 70 ? '#07c5a8' : r.confidence >= 40 ? '#f59e0b' : '#f43f5e' }}
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-extrabold">{r.entry.name} {r.entry.strength}</h3>
                              {i === 0 && <Badge tone="brand">Best possible match</Badge>}
                            </div>
                            {r.entry.genericName && (
                              <p className="text-xs text-slate-500">{r.entry.genericName} · {r.entry.purpose}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-extrabold tabular-nums ${r.confidence >= 70 ? 'text-brand-500' : r.confidence >= 40 ? 'text-warn-500' : 'text-danger-500'}`}>
                              {r.confidence}%
                            </p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">confidence</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.reasons.map((reason) => (
                            <Badge key={reason} tone="neutral">{reason}</Badge>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/60 pt-3 dark:border-white/8">
                          <p className="text-[11px] text-slate-400">Not a definitive identification.</p>
                          {verified === r.entry.id ? (
                            <Badge tone="success"><SearchCheck className="size-3" /> Verified & saved</Badge>
                          ) : (
                            <Button size="sm" variant="subtle" onClick={() => void confirmMatch(r.entry.id)}>
                              ✓ This matches my packaging
                            </Button>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                  <Card className="border-warn-500/30 !bg-warn-500/[0.06]">
                    <div className="flex items-start gap-3 text-sm">
                      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn-500" />
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        <strong>Never take an unidentified pill.</strong> Many medicines look nearly
                        identical. If the imprint doesn't exactly match your packaging or you're
                        unsure — ask a pharmacist.
                      </p>
                    </div>
                  </Card>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

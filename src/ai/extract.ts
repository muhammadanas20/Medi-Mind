import { z } from 'zod'
import type {
  ExtractedMedicine,
  ExtractedPrescription,
  FoodInstruction,
  PillColor,
  PillShape,
} from '../lib/types'

/**
 * Prescription extraction — prompt + strict parsing.
 *
 * SAFETY CONTRACT (core product principle):
 *  - The model is an OCR/structuring assistant, never a prescriber.
 *  - Its output is parsed defensively, clamped to sane ranges, and ALWAYS
 *    staged for human review before any reminder exists.
 */

export const PRESCRIPTION_PROMPT = `You are a medical prescription digitization assistant. Read the attached prescription image (it may be handwritten) and extract structured data.

RULES
- Extract ONLY what is written. Never invent medicines, doses, or advice.
- If a field is unreadable or absent, omit it (do not guess).
- For each medicine fill morning/afternoon/evening/night with the number of doses in that slot (0 if none). Interpret schedules like "1-0-1" as morning=1, afternoon=0, night=1 and "BD/BID" as morning+night, "TDS/TID" as morning+afternoon+night, "OD" as morning.
- foodRelation: "before" | "after" | "with" | "any" (from abbreviations like AC=before food, PC=after food).
- duration: short text like "30 days" or "5 days"; omit if not stated.
- Keep the reply SHORT: valid JSON only, no markdown, no commentary.

JSON SHAPE
{
  "patientName": string?,
  "doctorName": string?,
  "hospital": string?,
  "disease": string?,
  "medicines": [
    {
      "medicine": string,          // required
      "strength": string?,         // "2.5 mg"
      "form": string?,             // tablet/capsule/syrup...
      "morning": number, "afternoon": number, "evening": number, "night": number,
      "food": string?,             // original text e.g. "After breakfast"
      "foodRelation": "before"|"after"|"with"|"any"?,
      "duration": string?,
      "notes": string?
    }
  ],
  "tests": string[]?,
  "followUpDate": string?,         // best-effort ISO date or text
  "notes": string?
}`

const doseCount = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? parseFloat(v) || 0 : v))
  .pipe(z.number().min(0).max(12))
  .catch(0)

const extractedMedicineSchema = z.object({
  medicine: z.string().min(1),
  strength: z.string().optional(),
  form: z.string().optional(),
  morning: doseCount.default(0),
  afternoon: doseCount.default(0),
  evening: doseCount.default(0),
  night: doseCount.default(0),
  food: z.string().optional(),
  foodRelation: z.enum(['before', 'after', 'with', 'any']).optional(),
  duration: z.string().optional(),
  notes: z.string().optional(),
})

export const extractedPrescriptionSchema = z.object({
  patientName: z.string().optional(),
  doctorName: z.string().optional(),
  hospital: z.string().optional(),
  disease: z.string().optional(),
  medicines: z.array(extractedMedicineSchema).default([]),
  tests: z.array(z.string()).optional(),
  followUpDate: z.string().optional(),
  notes: z.string().optional(),
})

/** Find the JSON object inside possibly-markdown model output. */
export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in AI response')
  return candidate.slice(start, end + 1)
}

export function parseExtraction(rawText: string): ExtractedPrescription {
  const json = extractJsonBlock(rawText)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('AI returned invalid JSON — please try again or enter medicines manually')
  }
  const result = extractedPrescriptionSchema.safeParse(parsed)
  if (!result.success) throw new Error('AI response did not match the prescription schema')
  // Defensive normalization: at least one slot per medicine
  const meds: ExtractedMedicine[] = result.data.medicines
    .map((m) => {
      const allZero = m.morning + m.afternoon + m.evening + m.night === 0
      return allZero ? { ...m, morning: 1 } : m
    })
    .slice(0, 40)
  return { ...result.data, medicines: meds }
}

/** "30 days" | "2 weeks" | "x10" → number of days (best effort). */
export function parseDurationDays(duration?: string): number | undefined {
  if (!duration) return undefined
  const m = duration.toLowerCase().match(/(\d+)\s*(day|d\b|week|wk|month)/)
  if (!m) return undefined
  const n = parseInt(m[1], 10)
  if (Number.isNaN(n) || n <= 0) return undefined
  if (m[2].startsWith('week') || m[2].startsWith('wk')) return n * 7
  if (m[2].startsWith('month')) return n * 30
  return n
}

export function foodFromText(food?: string, relation?: FoodInstruction): FoodInstruction {
  if (relation) return relation
  if (!food) return 'any'
  const f = food.toLowerCase()
  if (/(before|ac\b|empty stomach)/.test(f)) return 'before'
  if (/(after|pc\b|post)/.test(f)) return 'after'
  if (/(with|during)/.test(f)) return 'with'
  return 'any'
}

/* ------------------------------ pill assist ------------------------------ */

export const PILL_PROMPT = `You are assisting with pill IDENTIFICATION from a photo. Describe only observable physical features — never diagnose.

RULES
- Read any imprint code text exactly as seen (letters/numbers/score lines).
- Describe the dominant color and shape (round|oval|capsule|oblong|square|triangle|other).
- If multiple pills: describe the clearest one.
- Reply with JSON only: { "imprint": string, "color": string, "shape": string, "sizeNote": string?, "confidenceNote": string? }`

export const pillObservationSchema = z.object({
  imprint: z.string().catch(''),
  color: z.string().catch(''),
  shape: z.string().catch('other'),
  sizeNote: z.string().optional(),
  confidenceNote: z.string().optional(),
})

export type PillObservation = z.infer<typeof pillObservationSchema>

export function normalizePillColor(color: string): PillColor | undefined {
  const c = color.toLowerCase()
  const map: [RegExp, PillColor][] = [
    [/white|off-white|clear/, 'white'], [/cream|beige|peach/, 'cream'],
    [/yellow/, 'yellow'], [/orange/, 'orange'], [/pink/, 'pink'],
    [/red|maroon/, 'red'], [/blue/, 'blue'], [/green/, 'green'],
    [/brown|tan/, 'brown'], [/gray|grey|silver/, 'gray'],
  ]
  for (const [re, v] of map) if (re.test(c)) return v
  return undefined
}

export function normalizePillShape(shape: string): PillShape | undefined {
  const s = shape.toLowerCase()
  const map: [RegExp, PillShape][] = [
    [/round|circle|circular/, 'round'], [/oval|elliptical/, 'oval'],
    [/capsule/, 'capsule'], [/oblong|rectang/, 'oblong'],
    [/square/, 'square'], [/triangle/, 'triangle'],
  ]
  for (const [re, v] of map) if (re.test(s)) return v
  return undefined
}

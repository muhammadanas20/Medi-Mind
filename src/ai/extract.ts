import { z } from 'zod'
import type {
  BloodSugarContext,
  ExtractedMedicine,
  ExtractedPrescription,
  ExtractedVital,
  FoodInstruction,
  PillColor,
  PillShape,
  Profile,
  VitalKind,
} from '../lib/types'
import { sanitizeExtractedVital } from '../lib/vitals'

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

export function buildPrescriptionPrompt(profile?: Profile): string {
  if (!profile) return PRESCRIPTION_PROMPT
  const details: string[] = []
  if (profile.name) details.push(`Name: ${profile.name}`)
  if (profile.age != null) details.push(`Age: ${profile.age} years old`)
  if (profile.weight != null) details.push(`Weight: ${profile.weight} ${profile.weightUnit || 'kg'}`)
  if (profile.gender) details.push(`Gender: ${profile.gender}`)
  if (profile.relation) details.push(`Relation: ${profile.relation}`)

  if (details.length === 0) return PRESCRIPTION_PROMPT

  return `${PRESCRIPTION_PROMPT}

PATIENT PROFILE FOR CLINICAL DOSAGE CHECKING:
${details.map((d) => `- ${d}`).join('\n')}

Note: Consider the patient's age (${profile.age ?? 'unspecified'}) and weight (${profile.weight ?? 'unspecified'} ${profile.weightUnit || 'kg'}) when parsing medicines and dosage instructions. If any dosage appears unusual or requires age/weight caution (e.g., pediatric or geriatric considerations), include a brief warning note in the "notes" field.`
}

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

/* --------------------------- device-reading assist -------------------------- */

export const VITAL_PROMPT = `You are a medical-device display reader. The photo is a blood-pressure cuff, glucometer, pulse oximeter, scale, thermometer, or similar home monitor.

RULES
- Extract ONLY digits and labels visible on the screen. Never invent a reading.
- If the display is unreadable, return {"kind": null} with a short confidenceNote.
- Blood pressure: systolic AND diastolic (and pulse if shown). kind = "blood_pressure".
- Glucose / sugar: kind = "blood_sugar". Prefer the unit printed on the device (mg/dL or mmol/L). context if a label shows fasting / before meal / after meal / random / bedtime.
- Pulse-only: kind = "heart_rate", unit "bpm".
- SpO2: kind = "spo2", unit "%".
- Weight: kind = "weight", unit "kg" or "lb".
- Temperature: kind = "temperature", unit "°C" or "°F".
- Reply with JSON only, no markdown.

JSON SHAPE
{
  "kind": "blood_pressure"|"blood_sugar"|"heart_rate"|"weight"|"spo2"|"temperature"|null,
  "value": number?,
  "systolic": number?,
  "diastolic": number?,
  "pulse": number?,
  "unit": string?,
  "context": string?,
  "deviceBrand": string?,
  "confidenceNote": string?,
  "recordedAtHint": string?
}`

export function buildVitalPrompt(profile?: Profile): string {
  if (!profile) return VITAL_PROMPT
  const details: string[] = []
  if (profile.age != null) details.push(`Age: ${profile.age} years old`)
  if (profile.weight != null) details.push(`Baseline Weight: ${profile.weight} ${profile.weightUnit || 'kg'}`)
  if (profile.gender) details.push(`Gender: ${profile.gender}`)

  if (details.length === 0) return VITAL_PROMPT

  return `${VITAL_PROMPT}

PATIENT CONTEXT: ${details.join(' · ')}`
}

const optionalNum = z
  .union([z.number(), z.string()])
  .transform((v) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v
    return Number.isFinite(n) ? n : undefined
  })
  .optional()
  .catch(undefined)

const vitalKindSchema = z
  .enum(['blood_pressure', 'blood_sugar', 'heart_rate', 'weight', 'spo2', 'temperature'])
  .optional()
  .catch(undefined)

export const extractedVitalSchema = z.object({
  kind: z.union([vitalKindSchema, z.null()]).optional().transform((v) => v ?? undefined),
  value: optionalNum,
  systolic: optionalNum,
  diastolic: optionalNum,
  pulse: optionalNum,
  unit: z.string().optional().catch(undefined),
  context: z.string().optional().catch(undefined),
  deviceBrand: z.string().optional().catch(undefined),
  confidenceNote: z.string().optional().catch(undefined),
  recordedAtHint: z.string().optional().catch(undefined),
})

export function parseVitalExtraction(rawText: string): ExtractedVital {
  const json = extractJsonBlock(rawText)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('AI returned invalid JSON — please enter the reading manually')
  }
  const result = extractedVitalSchema.safeParse(parsed)
  if (!result.success) throw new Error('AI response did not match the device-reading schema')
  return sanitizeExtractedVital(result.data)
}

export function coerceSugarContext(raw?: string): BloodSugarContext | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase()
  if (/fast/.test(s)) return 'fasting'
  if (/before|pre/.test(s)) return 'before_meal'
  if (/after|post/.test(s)) return 'after_meal'
  if (/bed/.test(s)) return 'bedtime'
  if (/random/.test(s)) return 'random'
  return undefined
}

export function asVitalKind(raw?: string): VitalKind | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase().replace(/\s+/g, '_')
  if (s === 'blood_pressure' || s === 'bp') return 'blood_pressure'
  if (s === 'blood_sugar' || s === 'glucose' || s === 'sugar') return 'blood_sugar'
  if (s === 'heart_rate' || s === 'pulse') return 'heart_rate'
  if (s === 'weight') return 'weight'
  if (s === 'spo2' || s === 'oxygen') return 'spo2'
  if (s === 'temperature' || s === 'temp') return 'temperature'
  return undefined
}

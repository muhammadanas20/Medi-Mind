/**
 * Core domain types for MediMind.
 *
 * DESIGN PRINCIPLE: AI never creates reminders directly.
 * AI output (ExtractedPrescription) is always staged as a draft that a human
 * must review & confirm before any Medication/schedule row is written.
 */

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night'
export const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night']

export type FoodInstruction = 'before' | 'after' | 'with' | 'any'

export type DoseStatus = 'pending' | 'taken' | 'skipped' | 'missed'

export interface Profile {
  id: string
  name: string
  relation?: string // self / parent / spouse / patient...
  color: string
  avatarEmoji?: string
  createdAt: string
}

/** Per-slot dose quantities. Missing/zero slot = not scheduled. */
export type DoseSlots = Partial<Record<Slot, number>>

export interface Medication {
  id: string
  profileId: string
  name: string
  strength?: string // "2.5 mg"
  form?: string // tablet | capsule | syrup ...
  slots: DoseSlots
  food: FoodInstruction
  instructions?: string
  startDate: string // YYYY-MM-DD
  durationDays?: number // undefined → ongoing
  color: string // ui tag color
  isCritical: boolean // critical meds escalate harder
  active: boolean
  /** refill tracking (v1 simple) */
  pillsRemaining?: number
  refillAt?: number
  sourcePrescriptionId?: string
  createdAt: string
}

export interface DoseLog {
  /** `${medicationId}:${YYYY-MM-DD}:${slot}` — deterministic, idempotent */
  id: string
  medicationId: string
  profileId: string
  medicationName: string // denormalized for fast history rendering
  date: string // YYYY-MM-DD
  slot: Slot
  quantity: number
  windowStart: string // ISO
  windowEnd: string // ISO
  status: DoseStatus
  actedAt?: string // ISO
  snoozeUntil?: string // ISO
  remindedCount: number
  lastRemindedAt?: string
  skipReason?: string
}

/** What the vision model returns — UNTRUSTED until user confirms. */
export interface ExtractedMedicine {
  medicine: string
  strength?: string
  form?: string
  morning: number
  afternoon: number
  evening: number
  night: number
  food?: string // "After breakfast" etc. (free text from AI)
  foodRelation?: FoodInstruction
  duration?: string // "30 days"
  notes?: string
}

export interface ExtractedPrescription {
  patientName?: string
  doctorName?: string
  hospital?: string
  disease?: string
  medicines: ExtractedMedicine[]
  tests?: string[]
  followUpDate?: string
  notes?: string
}

export interface Prescription {
  id: string
  profileId: string
  image?: Blob
  imageWidth?: number
  imageHeight?: number
  extraction?: ExtractedPrescription
  ocrText?: string
  aiProvider?: string
  status: 'draft' | 'confirmed' | 'discarded'
  confirmedMedicationIds: string[]
  createdAt: string
}

export type PillShape = 'round' | 'oval' | 'capsule' | 'oblong' | 'square' | 'triangle' | 'other'
export type PillColor =
  | 'white' | 'cream' | 'yellow' | 'orange' | 'pink' | 'red'
  | 'blue' | 'green' | 'brown' | 'gray' | 'other'

export interface PillEntry {
  id: string
  name: string
  strength: string
  genericName?: string
  imprints: string[]
  colors: PillColor[]
  shapes: PillShape[]
  purpose?: string
}

export interface PillScanResult {
  entry: PillEntry
  /** 0–100 — ALWAYS shown as "possible match", never a diagnosis */
  confidence: number
  reasons: string[]
}

export interface PillScan {
  id: string
  profileId: string
  image?: Blob
  imprint: string
  color?: PillColor
  shape?: PillShape
  aiDescription?: string
  results: PillScanResult[]
  verifiedByUser?: boolean
  createdAt: string
}

export interface ReminderWindow {
  start: string // "HH:MM"
  end: string
  enabled: boolean
}
export type ReminderWindows = Record<Slot, ReminderWindow>

/** App-level settings row (single row in kv table as JSON). */
export interface AppSettings {
  reminderWindows: ReminderWindows
  escalationMinutes: number // re-nag interval — default 60
  snoozeOptionsMin: number[]
  theme: 'system' | 'light' | 'dark'
  largeText: boolean
  haptics: boolean
  voiceReminders: boolean
  soundEnabled: boolean
  lockEnabled: boolean
  activeAiProviderId?: string
  onboardingDone: boolean
}

export type AiProviderKind =
  | 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'groq' | 'ollama' | 'lmstudio'

export interface AiProviderConfig {
  id: string
  kind: AiProviderKind
  label: string
  baseUrl: string
  model: string
  /** AES-GCM encrypted API key (empty for local providers) */
  encryptedKey?: string
  enabled: boolean
  lastTestAt?: string
  lastTestOk?: boolean
}

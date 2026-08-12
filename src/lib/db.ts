import Dexie, { type Table } from 'dexie'
import type {
  AiProviderConfig,
  AppSettings,
  DoseLog,
  Medication,
  PillScan,
  Prescription,
  Profile,
} from './types'
import { DEFAULT_WINDOWS } from './reminders'

export const DEFAULT_SETTINGS: AppSettings = {
  reminderWindows: DEFAULT_WINDOWS,
  escalationMinutes: 60,
  snoozeOptionsMin: [10, 30, 60],
  theme: 'dark',
  largeText: false,
  haptics: true,
  voiceReminders: false,
  soundEnabled: true,
  lockEnabled: false,
  onboardingDone: false,
}

export class MediMindDB extends Dexie {
  profiles!: Table<Profile, string>
  medications!: Table<Medication, string>
  doseLogs!: Table<DoseLog, string>
  prescriptions!: Table<Prescription, string>
  pillScans!: Table<PillScan, string>
  aiProviders!: Table<AiProviderConfig, string>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('medimind')
    this.version(1).stores({
      // NOTE: booleans are not valid IndexedDB keys → `active` is filtered in memory
      profiles: 'id, name, createdAt',
      medications: 'id, profileId, name, startDate, createdAt',
      doseLogs: 'id, medicationId, profileId, date, slot, status, [date+slot], [medicationId+date]',
      prescriptions: 'id, profileId, status, createdAt',
      pillScans: 'id, profileId, createdAt',
      aiProviders: 'id, kind, enabled',
      kv: 'key',
    })
  }
}

export const db = new MediMindDB()

/* ----------------------------- settings (kv) ---------------------------- */

export async function getSettings(): Promise<AppSettings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch }
  await db.kv.put({ key: 'settings', value: next })
  return next
}

export async function getActiveProfileId(): Promise<string | undefined> {
  return (await db.kv.get('activeProfileId'))?.value as string | undefined
}

export async function setActiveProfileId(id: string): Promise<void> {
  await db.kv.put({ key: 'activeProfileId', value: id })
}

/* ------------------------------ id + dates ------------------------------ */

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const todayStr = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

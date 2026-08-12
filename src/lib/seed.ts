import { db, uid, todayStr } from './db'
import type { DoseLog, Medication, Profile } from './types'
import { addDays, doseLogId, atTime } from './reminders'

const DEMO_MEDS: Omit<Medication, 'id' | 'profileId' | 'createdAt'>[] = [
  {
    name: 'Concor', strength: '2.5 mg', form: 'tablet',
    slots: { morning: 1 }, food: 'after', instructions: 'After breakfast',
    startDate: addDays(todayStr(), -12), durationDays: 30,
    color: '#07c5a8', isCritical: true, active: true, pillsRemaining: 18, refillAt: 30,
  },
  {
    name: 'Metformin', strength: '500 mg', form: 'tablet',
    slots: { morning: 1, night: 1 }, food: 'after', instructions: 'With meals',
    startDate: addDays(todayStr(), -9), durationDays: 90,
    color: '#8b5cf6', isCritical: false, active: true, pillsRemaining: 46, refillAt: 60,
  },
  {
    name: 'Atorvastatin', strength: '20 mg', form: 'tablet',
    slots: { night: 1 }, food: 'any',
    startDate: addDays(todayStr(), -9), durationDays: 60,
    color: '#f59e0b', isCritical: false, active: true, pillsRemaining: 6, refillAt: 30,
  },
  {
    name: 'Vitamin D3', strength: '1000 IU', form: 'capsule',
    slots: { afternoon: 1 }, food: 'with', instructions: 'With lunch',
    startDate: addDays(todayStr(), -9),
    color: '#f43f5e', isCritical: false, active: true,
  },
]

/** Seed a rich but plausible 7-day history + today's doses. */
export async function seedDemoData(): Promise<Profile> {
  const profile: Profile = {
    id: uid(),
    name: 'Demo Patient',
    relation: 'Self',
    color: '#07c5a8',
    avatarEmoji: '🧓',
    createdAt: new Date().toISOString(),
  }
  await db.profiles.add(profile)

  const meds: Medication[] = DEMO_MEDS.map((m) => ({
    ...m,
    id: uid(),
    profileId: profile.id,
    createdAt: new Date().toISOString(),
  }))
  await db.medications.bulkAdd(meds)

  // 7 days of history with realistic adherence (~92%)
  const logs: DoseLog[] = []
  const today = todayStr()
  for (let dayOffset = 7; dayOffset >= 1; dayOffset--) {
    const date = addDays(today, -dayOffset)
    const morningJohnny = dayOffset % 6 !== 0 // miss one morning occasionally
    for (const med of meds) {
      for (const [slot, qty] of Object.entries(med.slots)) {
        if (!qty) continue
        const taken =
          slot === 'morning' ? morningJohnny : dayOffset % 5 !== 0
        const skippedRarely = dayOffset === 3 && med.name === 'Vitamin D3'
        const status: DoseLog['status'] = skippedRarely ? 'skipped' : taken ? 'taken' : 'missed'
        logs.push({
          id: doseLogId(med.id, date, slot as DoseLog['slot']),
          medicationId: med.id,
          profileId: profile.id,
          medicationName: med.name,
          date,
          slot: slot as DoseLog['slot'],
          quantity: qty,
          windowStart: atTime(date, '06:00').toISOString(),
          windowEnd: atTime(date, '10:00').toISOString(),
          status,
          actedAt: atTime(date, slot === 'morning' ? '07:30' : slot === 'afternoon' ? '12:45' : slot === 'evening' ? '18:10' : '21:20').toISOString(),
          remindedCount: 1,
          skipReason: skippedRarely ? 'Felt nauseous' : undefined,
        })
      }
    }
  }
  await db.doseLogs.bulkPut(logs)
  return profile
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.profiles, db.medications, db.doseLogs, db.prescriptions, db.pillScans],
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.medications.clear(),
        db.doseLogs.clear(),
        db.prescriptions.clear(),
        db.pillScans.clear(),
      ])
    },
  )
}

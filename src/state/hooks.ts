import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db, getSettings, saveSettings, getActiveProfileId, setActiveProfileId, todayStr } from '../lib/db'
import type { AppSettings, DoseLog, Medication, Profile, Slot } from '../lib/types'
import { SLOTS } from '../lib/types'
import { expandDoseInstances, type DoseInstance, isSnoozed } from '../lib/reminders'
import { useUiStore } from './ui'

/* ------------------------------ bootstrap ------------------------------- */

export function useBootstrap(): boolean {
  const hydrated = useUiStore((s) => s.hydrated)
  useEffect(() => {
    void (async () => {
      const settings = await getSettings()
      useUiStore.getState().setSettings(settings)
      const pid = await getActiveProfileId()
      if (pid) useUiStore.getState().setActiveProfileId(pid)
      useUiStore.setState({ hydrated: true })
    })()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const s = useUiStore.getState().settings
      if (s.theme === 'system') {
        import('./ui').then((m) => m.applyTheme(s))
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return hydrated
}

export function usePatchSettings(): (patch: Partial<AppSettings>) => Promise<void> {
  return async (patch) => {
    const next = await saveSettings(patch)
    useUiStore.getState().setSettings(next)
  }
}

/* -------------------------------- profiles ------------------------------ */

export function useProfiles(): Profile[] | undefined {
  return useLiveQuery(() => db.profiles.orderBy('createdAt').toArray(), [])
}

export function useActiveProfile(): Profile | undefined {
  const activeId = useUiStore((s) => s.activeProfileId)
  const profiles = useProfiles()
  return useMemo(() => {
    if (!profiles) return undefined
    return profiles.find((p) => p.id === activeId) ?? profiles[0]
  }, [profiles, activeId])
}

export function useSetActiveProfile(): (id: string) => Promise<void> {
  return async (id) => {
    await setActiveProfileId(id)
    useUiStore.getState().setActiveProfileId(id)
  }
}

/* ------------------------------ medications ----------------------------- */

export function useMedications(profileId?: string): Medication[] | undefined {
  return useLiveQuery(
    async () => {
      let meds = await db.medications.toArray()
      if (profileId) meds = meds.filter((m) => m.profileId === profileId)
      return meds.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    },
    [profileId],
  )
}

/* ----------------------------- today's doses ---------------------------- */

export interface SlotGroup {
  slot: Slot
  items: { instance: DoseInstance; log: DoseLog }[]
  taken: number
  total: number
}

export function useTodayDoses(profileId?: string, date = todayStr()) {
  const settings = useUiStore((s) => s.settings)
  const data = useLiveQuery(
    async () => {
      let meds = await db.medications.toArray()
      meds = meds.filter((m) => m.active && (!profileId || m.profileId === profileId))
      const instances = expandDoseInstances(meds, date, settings.reminderWindows)
      const logs = new Map(
        (await db.doseLogs.bulkGet(instances.map((i) => i.logId)))
          .filter(Boolean)
          .map((l) => [l!.id, l!]),
      )
      const now = new Date()
      const groups: SlotGroup[] = SLOTS.map((slot) => {
        const items = instances
          .filter((i) => i.slot === slot)
          .map((instance) => {
            const log =
              logs.get(instance.logId) ??
              ({
                id: instance.logId,
                medicationId: instance.medicationId,
                profileId: instance.profileId,
                medicationName: instance.medicationName,
                date: instance.date,
                slot: instance.slot,
                quantity: instance.quantity,
                windowStart: instance.windowStart.toISOString(),
                windowEnd: instance.windowEnd.toISOString(),
                status: 'pending',
                remindedCount: 0,
              } satisfies DoseLog)
            return { instance, log }
          })
        return {
          slot,
          items,
          taken: items.filter((i) => i.log.status === 'taken').length,
          total: items.length,
        }
      }).filter((g) => g.items.length > 0)

      const flat = groups.flatMap((g) => g.items)
      return {
        groups,
        flat,
        totals: {
          total: flat.length,
          taken: flat.filter((i) => i.log.status === 'taken').length,
          skipped: flat.filter((i) => i.log.status === 'skipped').length,
          missed: flat.filter((i) => i.log.status === 'missed').length,
        },
        now,
      }
    },
    [profileId, date, settings.reminderWindows],
  )
  return data
}

export function useOverdueDoses(profileId?: string) {
  const data = useTodayDoses(profileId)
  return useMemo(() => {
    if (!data) return []
    const now = new Date()
    return data.flat.filter(
      ({ instance, log }) =>
        log.status === 'pending' &&
        !isSnoozed(log, now) &&
        now.getTime() >= instance.windowStart.getTime() &&
        now.getTime() <= instance.windowEnd.getTime() + (instance.isCritical ? 60 * 60_000 : 0),
    )
  }, [data])
}

/* -------------------------------- history -------------------------------- */

export function useRecentLogs(profileId?: string, days = 7) {
  const settings = useUiStore((s) => s.settings)
  return useLiveQuery(
    async () => {
      // ensure rows exist for today so stats are live
      let meds = await db.medications.toArray()
      meds = meds.filter((m) => m.active && (!profileId || m.profileId === profileId))
      const instances = expandDoseInstances(meds, todayStr(), settings.reminderWindows)
      const existing = await db.doseLogs.bulkGet(instances.map((i) => i.logId))
      const missing: DoseLog[] = []
      instances.forEach((inst, idx) => {
        if (!existing[idx]) {
          missing.push({
            id: inst.logId, medicationId: inst.medicationId, profileId: inst.profileId,
            medicationName: inst.medicationName, date: inst.date, slot: inst.slot,
            quantity: inst.quantity, windowStart: inst.windowStart.toISOString(),
            windowEnd: inst.windowEnd.toISOString(), status: 'pending', remindedCount: 0,
          })
        }
      })
      if (missing.length) await db.doseLogs.bulkAdd(missing).catch(() => undefined)

      let logs = await db.doseLogs.toArray()
      if (profileId) logs = logs.filter((l) => l.profileId === profileId)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days + 1)
      const cutoffStr = todayStr(cutoff)
      return logs.filter((l) => l.date >= cutoffStr)
    },
    [profileId, days, settings.reminderWindows],
  )
}

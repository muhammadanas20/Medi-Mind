import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, BellRing, BrainCircuit, Check, Clock, Download, KeyRound,
  Lock, LockOpen, Moon, Pencil, Plus, Sparkles, Sun, TestTubeDiagonal, Trash2, Type, Upload, UserPlus, Users, Vibrate, Waves,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { SlotIcon } from '../components/icons'
import { InstallAppSection } from '../components/install'
import { draftFromProfile, emptyProfileDraft, parseProfileDraft, ProfileFields, type ProfileDraft } from '../components/profile-form'
import { Badge, Button, Card, Dialog, DotsLoader, Field, Input, SectionTitle, Select, Switch } from '../components/ui'
import { disablePasscodeLock, enablePasscodeLock } from '../lib/crypto'
import {
  listProviders, removeProvider, setActiveProvider, testProvider, upsertProvider,
} from '../ai/service'
import { PROVIDER_PRESETS, type ProviderPreset } from '../ai/providers'
import { db, uid } from '../lib/db'
import {
  requestNotificationPermission, notificationPermission, sendTestNotification, enableBackgroundSync,
} from '../lib/notifications'
import { clearAllData, seedDemoData } from '../lib/seed'
import type { AiProviderConfig, Profile, Slot } from '../lib/types'
import { SLOTS } from '../lib/types'
import { SLOT_META } from '../lib/reminders'
import { todayStr } from '../lib/db'
import { useActiveProfile, usePatchSettings, useProfiles, useSetActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

export function SettingsPage() {
  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Everything is stored locally on this device. AI keys are encrypted at rest.
        </p>
      </div>
      <InstallAppSection />
      <ProfilesSection />
      <AiSection />
      <RemindersSection />
      <ExperienceSection />
      <SecuritySection />
      <DataSection />
    </div>
  )
}

/* -------------------------------- profiles ------------------------------- */

function ProfilesSection() {
  const profiles = useProfiles()
  const active = useActiveProfile()
  const setActive = useSetActiveProfile()
  const showToast = useUiStore((s) => s.showToast)

  const [open, setOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft)

  const openNew = () => {
    setEditingProfile(null)
    setDraft(emptyProfileDraft())
    setOpen(true)
  }

  const openEdit = (p: Profile) => {
    setEditingProfile(p)
    setDraft(draftFromProfile(p))
    setOpen(true)
  }

  const save = async () => {
    const parsed = parseProfileDraft(draft)
    if (!parsed.name) return

    if (editingProfile) {
      await db.profiles.update(editingProfile.id, parsed)
      showToast(`Profile “${parsed.name}” updated`, 'success')
    } else {
      const p: Profile = {
        id: uid(),
        ...parsed,
        createdAt: new Date().toISOString(),
      }
      await db.profiles.add(p)
      await setActive(p.id)
      showToast(`Profile “${p.name}” created`, 'success')
    }
    setOpen(false)
  }

  const deleteProfile = async (p: Profile) => {
    if ((profiles ?? []).length <= 1) {
      showToast('You must keep at least one profile', 'error')
      return
    }
    if (!confirm(`Delete profile for ${p.name}?`)) return

    if (p.id === active?.id) {
      const other = profiles?.find((x) => x.id !== p.id)
      if (other) await setActive(other.id)
    }
    await db.profiles.delete(p.id)
    showToast(`Profile “${p.name}” deleted`)
  }

  return (
    <Card>
      <SectionTitle right={<Button size="sm" variant="subtle" onClick={openNew} data-testid="new-profile"><UserPlus /> New profile</Button>}>
        <span className="inline-flex items-center gap-2"><Users className="size-5" /> Profiles</span>
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        {(profiles ?? []).map((p) => {
          const isActive = p.id === active?.id
          return (
            <div
              key={p.id}
              className={
                isActive
                  ? 'rounded-2xl border border-brand-500/50 bg-brand-500/[0.08] p-4 space-y-3'
                  : 'rounded-2xl border border-slate-300/60 p-4 space-y-3 dark:border-white/10'
              }
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm"
                  style={{ background: `${p.color}25` }}
                >
                  {p.avatarEmoji ?? '👤'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-base font-bold">{p.name}</p>
                    {isActive && <Badge tone="brand"><Check className="size-3" /> Active</Badge>}
                    {p.relation && <Badge tone="neutral">{p.relation}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {[
                      p.age != null ? `${p.age} yrs` : null,
                      p.weight != null ? `${p.weight} ${p.weightUnit || 'kg'}` : null,
                      p.gender,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No age or weight set'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-white/8">
                {!isActive && (
                  <Button size="sm" variant="subtle" className="flex-1" onClick={() => void setActive(p.id)}>
                    Switch to profile
                  </Button>
                )}
                <Button size="sm" variant="outline" className={isActive ? 'flex-1' : ''} onClick={() => openEdit(p)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                {(profiles ?? []).length > 1 && (
                  <Button size="iconsm" variant="ghost" className="text-danger-500" onClick={() => void deleteProfile(p)} aria-label={`Delete ${p.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
        {(profiles ?? []).length === 0 && (
          <p className="text-sm text-slate-400">No profiles — create one for each family member you manage.</p>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={editingProfile ? 'Edit Profile' : 'New Profile'}>
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Age and weight enable AI to evaluate medication dosages and provide tailored safety checks.
          </p>

          <ProfileFields
            value={draft}
            onChange={setDraft}
            autoFocusName={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
          />

          <Button className="w-full" size="lg" onClick={() => void save()} disabled={!draft.name.trim()} data-testid="save-profile">
            {editingProfile ? 'Save Changes' : 'Create Profile'}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}

/* ------------------------------ AI providers ----------------------------- */

function AiSection() {
  const providers = useLiveQuery(() => listProviders(), [])
  const showToast = useUiStore((s) => s.showToast)
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<ProviderPreset>(PROVIDER_PRESETS[0])
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  const openFor = (p: ProviderPreset, existing?: AiProviderConfig) => {
    setPreset(p)
    setApiKey('')
    setBaseUrl(existing?.baseUrl ?? p.baseUrl)
    setModel(existing?.model ?? p.defaultModel)
    setOpen(true)
  }

  const save = async (test = false) => {
    setBusy(test ? 'test' : 'save')
    try {
      const cfg = await upsertProvider(preset.kind, {
        baseUrl: baseUrl || preset.baseUrl,
        model: model || preset.defaultModel,
        apiKey: apiKey || undefined,
      })
      if (test) {
        const reply = await testProvider(cfg)
        showToast(`Connected ✓ model replied “${reply}”`, 'success')
      } else {
        showToast(`${cfg.label} saved`, 'success')
        setOpen(false)
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'LOCKED') {
        showToast('Unlock the app first (lock icon in the header)', 'error')
      } else {
        showToast(e instanceof Error ? e.message.slice(0, 140) : 'Connection failed', 'error')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <SectionTitle right={<Badge tone="accent"><BrainCircuit className="size-3" /> Optional</Badge>}>
        <span className="inline-flex items-center gap-2"><BrainCircuit className="size-5" /> AI providers</span>
      </SectionTitle>
      <p className="-mt-2 mb-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Keys are AES-encrypted and stored only in this browser. Requests go directly from your
        device to the provider — nothing passes through our servers (there are none).
        Local options (Ollama, LM Studio) keep even the inference on your machine.
      </p>
      <div className="grid gap-3">
        {PROVIDER_PRESETS.map((p) => {
          const cfg = providers?.find((x) => x.kind === p.kind)
          const active = !!cfg?.enabled
          return (
            <div
              key={p.kind}
              className={
                active
                  ? 'rounded-2xl border border-brand-500/40 bg-brand-500/[0.06] p-3.5'
                  : 'rounded-2xl border border-slate-300/50 p-3.5 dark:border-white/10'
              }
            >
              <div className="flex items-start gap-3">
                <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${active ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300' : 'bg-slate-500/10 text-slate-400'}`}>
                  <KeyRound className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-bold">{p.label}</p>
                    {p.local && <Badge tone="success">offline</Badge>}
                    {cfg?.lastTestOk && <Badge tone="success">tested</Badge>}
                    {cfg?.lastTestOk === false && <Badge tone="danger">failed</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {cfg ? `${cfg.model}${cfg.encryptedKey ? ' · key saved' : ''}` : 'Not configured'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {cfg ? (
                  <>
                    <Button size="sm" variant="subtle" className="flex-1 sm:flex-none" onClick={() => void setActiveProvider(cfg.id)}>
                      <Check /> Use this
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => openFor(p, cfg)}>
                      Edit
                    </Button>
                    <Button size="iconsm" variant="ghost" className="text-danger-500" aria-label={`Remove ${p.label}`} onClick={() => void removeProvider(cfg.id)}>
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="subtle" className="w-full sm:w-auto" onClick={() => openFor(p)}>
                    <Plus /> Set up
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={`${preset.label} setup`}>
        <div className="space-y-4">
          {preset.needsKey && (
            <Field label="API key" hint="Stored encrypted on this device. Leave empty to keep the existing key.">
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={preset.keyHint} data-testid="api-key" />
            </Field>
          )}
          <Field label="Base URL"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={preset.baseUrl} /></Field>
          <Field label="Vision model"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={preset.defaultModel} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={() => void save(true)}>
              {busy === 'test' ? <DotsLoader size="sm" /> : <TestTubeDiagonal />} Test
            </Button>
            <Button disabled={busy !== null} onClick={() => void save(false)}>
              {busy === 'save' ? <DotsLoader size="sm" /> : <Check />} Save
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}

/* ------------------------------- reminders ------------------------------- */

function RemindersSection() {
  const settings = useUiStore((s) => s.settings)
  const patch = usePatchSettings()
  const showToast = useUiStore((s) => s.showToast)
  const [perm, setPerm] = useState(notificationPermission())

  const setWindow = (slot: Slot, key: 'start' | 'end', value: string) =>
    void patch({
      reminderWindows: { ...settings.reminderWindows, [slot]: { ...settings.reminderWindows[slot], [key]: value } },
    })

  return (
    <Card>
      <SectionTitle>
        <span className="inline-flex items-center gap-2"><BellRing className="size-5" /> Phone alerts</span>
      </SectionTitle>
      <div className="mb-4 rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-3.5">
        <p className="text-sm font-bold">Get reminded like a real app</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Allow notifications, then add MediMind to your home screen. Dose alerts show on the
          lock screen with Taken / Snooze — even if you leave the app. Works best on Android;
          iPhone needs the home-screen icon and notification permission.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {perm !== 'granted' && perm !== 'unsupported' ? (
            <Button
              size="sm"
              data-testid="enable-notifications"
              onClick={async () => {
                const p = await requestNotificationPermission()
                setPerm(p)
                if (p === 'granted') await enableBackgroundSync()
                showToast(
                  p === 'granted' ? 'Dose alerts are now enabled' : 'Notifications were blocked by the browser',
                  p === 'granted' ? 'success' : 'error',
                  p === 'granted' ? 'Notifications on' : 'Permission denied',
                )
              }}
            >
              <BellRing /> Enable notifications
            </Button>
          ) : (
            <Badge tone={perm === 'granted' ? 'success' : 'neutral'}>
              <Bell className="size-3" /> {perm === 'granted' ? 'Notifications on' : 'Unavailable — in-app alerts used'}
            </Badge>
          )}
          {perm === 'granted' && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const ok = await sendTestNotification(true)
                showToast(
                  ok ? 'Check your notification shade' : 'Could not send a test alert',
                  ok ? 'success' : 'error',
                  ok ? 'Test alert sent' : 'Test alert failed',
                )
              }}
            >
              <Bell /> Send test alert
            </Button>
          )}
        </div>
      </div>
      <SectionTitle>
        <span className="inline-flex items-center gap-2"><Clock className="size-5" /> Reminder windows</span>
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((slot) => {
          const w = settings.reminderWindows[slot]
          return (
            <div key={slot} className="flex items-center gap-3 rounded-2xl border border-slate-300/50 p-3 dark:border-white/10">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-white/8">
                <SlotIcon slot={slot} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{SLOT_META[slot].label}</p>
                {/* Wraps below the label on very narrow screens instead of overflowing */}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <input
                    type="time"
                    value={w.start}
                    onChange={(e) => setWindow(slot, 'start', e.target.value)}
                    className="min-w-[5.25rem] flex-1 rounded-lg border border-slate-300/60 bg-white/60 px-2 py-1 text-base font-semibold sm:flex-none sm:text-xs dark:border-white/10 dark:bg-white/5"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="time"
                    value={w.end}
                    onChange={(e) => setWindow(slot, 'end', e.target.value)}
                    className="min-w-[5.25rem] flex-1 rounded-lg border border-slate-300/60 bg-white/60 px-2 py-1 text-base font-semibold sm:flex-none sm:text-xs dark:border-white/10 dark:bg-white/5"
                  />
                </div>
              </div>
              <Switch checked={w.enabled} onChange={(v) => void patch({ reminderWindows: { ...settings.reminderWindows, [slot]: { ...w, enabled: v } } })} />
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-200/50 p-3 text-sm dark:bg-white/[0.04]">
        <Waves className="size-4 text-brand-500" />
        <span>If a dose is ignored, remind again every</span>
        <Select
          className="!h-9 !w-24"
          value={settings.escalationMinutes}
          onChange={(e) => void patch({ escalationMinutes: parseInt(e.target.value) })}
        >
          {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
        </Select>
        <span className="text-xs text-slate-400">until taken or the window ends. Critical meds get +1 hour grace.</span>
      </div>
    </Card>
  )
}

/* ------------------------------ experience ------------------------------- */

function ExperienceSection() {
  const settings = useUiStore((s) => s.settings)
  const patch = usePatchSettings()
  const rows = [
    { icon: Moon, label: 'Theme', control: (
      <Select className="!h-9 !w-32" value={settings.theme} onChange={(e) => void patch({ theme: e.target.value as never })}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </Select>
    ) },
    { icon: Type, label: 'Large text', hint: 'Bigger type for easier reading', control: (
      <Switch checked={settings.largeText} onChange={(v) => void patch({ largeText: v })} />
    ) },
    { icon: Vibrate, label: 'Haptic feedback', hint: 'Gentle vibration with reminders', control: (
      <Switch checked={settings.haptics} onChange={(v) => void patch({ haptics: v })} />
    ) },
    { icon: Sun, label: 'Reminder chime', hint: 'Short sound for in-app alerts', control: (
      <Switch checked={settings.soundEnabled} onChange={(v) => void patch({ soundEnabled: v })} />
    ) },
  ]
  return (
    <Card>
      <SectionTitle>Appearance & accessibility</SectionTitle>
      <div className="divide-y divide-slate-200/60 dark:divide-white/8">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 py-3">
            <r.icon className="size-5 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{r.label}</p>
              {r.hint && <p className="text-xs text-slate-400">{r.hint}</p>}
            </div>
            {r.control}
          </div>
        ))}
      </div>
    </Card>
  )
}

/* -------------------------------- security -------------------------------- */

function SecuritySection() {
  const settings = useUiStore((s) => s.settings)
  const showToast = useUiStore((s) => s.showToast)
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)

  const toggleLock = async () => {
    if (settings.lockEnabled) {
      setBusy(true)
      const ok = await disablePasscodeLock(passcode)
      setBusy(false)
      if (ok) {
        showToast('Passcode lock removed', 'success')
        setPasscode('')
      } else {
        showToast('Wrong passcode', 'error')
      }
    } else {
      if (passcode.length < 4) {
        showToast('Passcode must be at least 4 characters', 'error')
        return
      }
      setBusy(true)
      await enablePasscodeLock(passcode)
      setBusy(false)
      setPasscode('')
      showToast('Passcode lock enabled — keys now need your passcode', 'success', 'Security on')
    }
  }

  return (
    <Card>
      <SectionTitle right={<Badge tone={settings.lockEnabled ? 'success' : 'neutral'}>{settings.lockEnabled ? 'Locked at rest' : 'Device-key encryption'}</Badge>}>
        <span className="inline-flex items-center gap-2"><Lock className="size-5" /> Security</span>
      </SectionTitle>
      <p className="-mt-2 mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        API keys are always stored AES-256-GCM encrypted. With a passcode, they can additionally
        only be decrypted after unlock (PBKDF2, 310k iterations).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          className="w-full sm:!w-48"
          placeholder={settings.lockEnabled ? 'Enter passcode to disable' : 'Choose a passcode (4+ chars)'}
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
        />
        <Button variant={settings.lockEnabled ? 'outline' : 'primary'} disabled={busy} onClick={() => void toggleLock()}>
          {settings.lockEnabled ? <LockOpen /> : <Lock />}
          {settings.lockEnabled ? 'Disable lock' : 'Enable passcode lock'}
        </Button>
      </div>
    </Card>
  )
}

/* ---------------------------------- data ---------------------------------- */

function DataSection() {
  const showToast = useUiStore((s) => s.showToast)
  const setActive = useSetActiveProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const profile = useActiveProfile()
  const profiles = useProfiles()
  const hasDemo = (profiles ?? []).some((p) => p.name === 'Demo Patient')

  const exportJson = async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      app: 'MediMind',
      version: 1,
      profiles: await db.profiles.toArray(),
      medications: await db.medications.toArray(),
      doseLogs: (await db.doseLogs.toArray()).slice(-2000),
      prescriptions: (await db.prescriptions.toArray()).map((p) => ({ ...p, image: undefined })),
      pillScans: (await db.pillScans.toArray()).map((p) => ({ ...p, image: undefined })),
      healthTrackers: await db.healthTrackers.toArray(),
      vitalReadings: (await db.vitalReadings.toArray()).map((r) => ({ ...r, image: undefined })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `medimind-backup-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('Backup exported (includes no API keys)', 'success')
  }

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as {
        profiles?: Profile[]
        medications?: never[]
        doseLogs?: never[]
        healthTrackers?: never[]
        vitalReadings?: never[]
      }
      if (!data.profiles || !data.medications) throw new Error('Not a MediMind backup file')
      await db.transaction(
        'rw',
        [db.profiles, db.medications, db.doseLogs, db.healthTrackers, db.vitalReadings],
        async () => {
          await db.profiles.bulkPut(data.profiles!)
          await db.medications.bulkPut(data.medications!)
          await db.doseLogs.bulkPut(data.doseLogs ?? [])
          if (data.healthTrackers?.length) await db.healthTrackers.bulkPut(data.healthTrackers)
          if (data.vitalReadings?.length) await db.vitalReadings.bulkPut(data.vitalReadings)
        },
      )
      showToast('Backup imported ✓', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import failed', 'error')
    }
  }

  return (
    <Card>
      <SectionTitle>Data</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void exportJson()}><Download /> Export backup</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Import backup</Button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
        {!profile && !hasDemo && (
          <Button
            variant="subtle"
            onClick={async () => {
              const p = await seedDemoData()
              await setActive(p.id)
              showToast('Demo patient loaded with a week of history', 'success')
            }}
          >
            <Sparkles /> Load demo data
          </Button>
        )}
        <Button variant="danger" onClick={() => setConfirmWipe(true)}><Trash2 /> Erase everything</Button>
      </div>
      <AnimatePresence>
        {confirmWipe && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-danger-500/10 p-3 text-sm">
              <span>This deletes all profiles, medicines, dose history, health readings, scans and keys from this device.</span>
              <Button size="sm" variant="danger" data-testid="confirm-wipe" onClick={async () => { await clearAllData(); showToast('All local data erased'); setConfirmWipe(false) }}>
                Yes, erase
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmWipe(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

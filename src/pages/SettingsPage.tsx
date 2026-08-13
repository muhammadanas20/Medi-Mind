import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, BellRing, BrainCircuit, Check, Clock, Download, KeyRound,
  Loader2, Lock, LockOpen, Moon, Plus, Sun, TestTubeDiagonal, Trash2, Type, Upload, UserPlus, Users, Vibrate, Waves,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { InstallAppSection } from '../components/install'
import { Badge, Button, Card, Dialog, Field, Input, SectionTitle, Select, Switch } from '../components/ui'
import { disablePasscodeLock, enablePasscodeLock } from '../lib/crypto'
import {
  listProviders, presetFor, removeProvider, setActiveProvider, testProvider, upsertProvider,
} from '../ai/service'
import { PROVIDER_PRESETS, type ProviderPreset } from '../ai/providers'
import { db, uid } from '../lib/db'
import {
  requestNotificationPermission, notificationPermission, sendTestNotification, enableBackgroundSync,
} from '../lib/notifications'
import { clearAllData, seedDemoData } from '../lib/seed'
import type { AiProviderConfig, Profile, Slot } from '../lib/types'
import { SLOTS } from '../lib/types'
import { atTime, SLOT_META } from '../lib/reminders'
import { todayStr } from '../lib/db'
import { useActiveProfile, usePatchSettings, useProfiles, useSetActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

export function SettingsPage() {
  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
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
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🧓')
  const [color, setColor] = useState('#07c5a8')

  const add = async () => {
    if (!name.trim()) return
    const p: Profile = { id: uid(), name: name.trim(), color, avatarEmoji: emoji, relation: 'Self', createdAt: new Date().toISOString() }
    await db.profiles.add(p)
    await setActive(p.id)
    setOpen(false)
    setName('')
    showToast(`Profile “${p.name}” created`, 'success')
  }

  return (
    <Card>
      <SectionTitle right={<Button size="sm" variant="subtle" onClick={() => setOpen(true)}><UserPlus /> New</Button>}>
        <span className="inline-flex items-center gap-2"><Users className="size-5" /> Profiles</span>
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        {(profiles ?? []).map((p) => (
          <button
            key={p.id}
            onClick={() => void setActive(p.id)}
            className={
              p.id === active?.id
                ? 'flex cursor-pointer items-center gap-2 rounded-2xl border border-brand-500/50 bg-brand-500/10 px-4 py-2.5'
                : 'flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-300/60 px-4 py-2.5 transition hover:bg-slate-200/50 dark:border-white/10 dark:hover:bg-white/5'
            }
          >
            <span className="flex size-7 items-center justify-center rounded-full text-sm" style={{ background: `${p.color}33` }}>{p.avatarEmoji ?? '👤'}</span>
            <span className="text-sm font-bold">{p.name}</span>
            {p.id === active?.id && <Check className="size-4 text-brand-500" />}
          </button>
        ))}
        {(profiles ?? []).length === 0 && (
          <p className="text-sm text-slate-400">No profiles — create one for each family member you manage.</p>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="New profile">
        <div className="space-y-4">
          <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grandma Rosa" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emoji">
              <div className="flex gap-1.5">
                {['🧓', '👵', '👴', '🧑', '👶', '🐕'].map((e) => (
                  <button key={e} onClick={() => setEmoji(e)} className={`flex size-9 cursor-pointer items-center justify-center rounded-xl text-lg ${emoji === e ? 'bg-brand-500/20 ring-2 ring-brand-500/50' : 'bg-slate-200/60 dark:bg-white/8'}`}>{e}</button>
                ))}
              </div>
            </Field>
            <Field label="Color">
              <div className="flex gap-1.5">
                {['#07c5a8', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9'].map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={`size-9 cursor-pointer rounded-xl ${color === c ? 'ring-2 ring-slate-500 ring-offset-2 ring-offset-transparent' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
          <Button className="w-full" onClick={() => void add()} disabled={!name.trim()}>Create profile</Button>
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
        showToast('Unlock the app first (top-right lock)', 'error')
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
              {busy === 'test' ? <Loader2 className="animate-spin" /> : <TestTubeDiagonal />} Test
            </Button>
            <Button disabled={busy !== null} onClick={() => void save(false)}>
              {busy === 'save' ? <Loader2 className="animate-spin" /> : <Check />} Save
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
                showToast(p === 'granted' ? 'Notifications enabled 🔔' : 'Permission denied by browser', p === 'granted' ? 'success' : 'error')
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
                showToast(ok ? 'Test alert sent — check your notification shade' : 'Could not send a test alert', ok ? 'success' : 'error')
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
              <span className="text-xl">{SLOT_META[slot].emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-bold">{SLOT_META[slot].label}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <input
                    type="time"
                    value={w.start}
                    onChange={(e) => setWindow(slot, 'start', e.target.value)}
                    className="rounded-lg border border-slate-300/60 bg-white/60 px-2 py-1 font-semibold dark:border-white/10 dark:bg-white/5"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="time"
                    value={w.end}
                    onChange={(e) => setWindow(slot, 'end', e.target.value)}
                    className="rounded-lg border border-slate-300/60 bg-white/60 px-2 py-1 font-semibold dark:border-white/10 dark:bg-white/5"
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
  const patch = usePatchSettings()
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
      showToast('🔐 Passcode lock enabled — keys now need your passcode', 'success')
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
          className="!w-48"
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
            🎭 Load demo data
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

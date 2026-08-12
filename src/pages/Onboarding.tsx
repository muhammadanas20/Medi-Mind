import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, BellRing, BrainCircuit, LockKeyhole, ScanLine, Sparkles, User } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Field, Input } from '../components/ui'
import { requestNotificationPermission } from '../lib/notifications'
import { saveSettings, uid } from '../lib/db'
import { seedDemoData } from '../lib/seed'
import type { Profile } from '../lib/types'
import { useSetActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

const EMOJIS = ['🧓', '👵', '👴', '🧑', '👩', '👨', '👶']

export function Onboarding({ done }: { done: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🧑')
  const showToast = useUiStore((s) => s.showToast)
  const setActive = useSetActiveProfile()

  const finish = async (profileId?: string) => {
    await saveSettings({ onboardingDone: true })
    if (profileId) await setActive(profileId)
    done()
  }

  const createProfile = async () => {
    const p: Profile = {
      id: uid(),
      name: name.trim(),
      avatarEmoji: emoji,
      color: '#07c5a8',
      relation: 'Self',
      createdAt: new Date().toISOString(),
    }
    const { db } = await import('../lib/db')
    await db.profiles.add(p)
    return p
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-6 text-center">
          <motion.div
            initial={{ scale: 0.6, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-400 to-accent-600 text-3xl shadow-xl shadow-brand-500/30"
          >
            💊
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Medi<span className="text-gradient">Mind</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Privacy-first AI medication management
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <Card className="space-y-5 !p-7">
                {[
                  { icon: ScanLine, t: 'Scan any prescription', d: 'AI reads it into structured medicines' },
                  { icon: BadgeCheck, t: 'You stay in control', d: 'Nothing becomes a reminder until you confirm it' },
                  { icon: LockKeyhole, t: 'Offline & private', d: 'All data lives on this device — keys encrypted' },
                  { icon: BellRing, t: 'Never miss a dose', d: 'Smart reminders that re-nag until taken' },
                ].map((f, i) => (
                  <motion.div key={f.t} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }} className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                      <f.icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{f.t}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{f.d}</p>
                    </div>
                  </motion.div>
                ))}
                <Button className="w-full" size="lg" onClick={() => setStep(1)} data-testid="onb-next">
                  Get started <ArrowRight />
                </Button>
              </Card>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <Card className="space-y-5 !p-7">
                <div className="flex items-center gap-2">
                  <User className="size-5 text-brand-500" />
                  <h2 className="text-lg font-bold">Who is this profile for?</h2>
                </div>
                <Field label="Name">
                  <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grandpa Joe" data-testid="onb-name" />
                </Field>
                <Field label="Pick an avatar">
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => setEmoji(e)}
                        className={`flex size-11 cursor-pointer items-center justify-center rounded-2xl text-2xl transition-transform hover:scale-110 ${emoji === e ? 'bg-brand-500/20 ring-2 ring-brand-500/60' : 'bg-slate-200/60 dark:bg-white/8'}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="lg"
                    disabled={!name.trim()}
                    data-testid="onb-create"
                    onClick={async () => {
                      const p = await createProfile()
                      setStep(2)
                      showToast(`Welcome, ${p.name}!`, 'success')
                    }}
                  >
                    Create profile <ArrowRight />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  data-testid="onb-demo"
                  onClick={async () => {
                    const p = await seedDemoData()
                    showToast('Demo patient loaded with a week of history', 'success')
                    await finish(p.id)
                  }}
                >
                  <Sparkles /> Just explore with demo data
                </Button>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <Card className="space-y-5 !p-7">
                <div className="flex items-center gap-2">
                  <BellRing className="size-5 text-brand-500" />
                  <h2 className="text-lg font-bold">Almost ready</h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Allow notifications so dose reminders reach you even when MediMind is in the
                  background. You can fine-tune AI providers later in Settings.
                </p>
                <Button
                  className="w-full"
                  size="lg"
                  data-testid="onb-notif"
                  onClick={async () => {
                    await requestNotificationPermission()
                    setStep(3)
                  }}
                >
                  <BellRing /> Enable notifications
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setStep(3)}>
                  Skip for now
                </Button>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="space-y-5 !p-7 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
                >
                  <BadgeCheck className="size-10" />
                </motion.div>
                <h2 className="text-2xl font-extrabold tracking-tight">All set!</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Scan your first prescription — or add a medicine manually.
                </p>
                <Button
                  className="w-full"
                  size="lg"
                  data-testid="onb-finish"
                  onClick={async () => {
                    // profile was created in step 1 — find it
                    const { db } = await import('../lib/db')
                    const profiles = await db.profiles.toArray()
                    await finish(profiles[profiles.length - 1]?.id)
                  }}
                >
                  Start using MediMind <BrainCircuit />
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          MediMind helps organize medications. It is not medical advice — always follow your
          doctor's instructions and verify AI-extracted data.
        </p>
      </motion.div>
    </div>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ArrowRight, BadgeCheck, BellRing, BrainCircuit, LockKeyhole, ScanLine, ShieldCheck, Sparkles, User } from 'lucide-react'
import { useState } from 'react'
import { emptyProfileDraft, parseProfileDraft, ProfileFields } from '../components/profile-form'
import { Button, Card } from '../components/ui'
import { requestNotificationPermission } from '../lib/notifications'
import { db, saveSettings, uid } from '../lib/db'
import { seedDemoData } from '../lib/seed'
import type { Profile } from '../lib/types'
import { useSetActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

export function Onboarding({ done }: { done: () => void }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(emptyProfileDraft)

  const showToast = useUiStore((s) => s.showToast)
  const setActive = useSetActiveProfile()

  const finish = async (profileId?: string) => {
    await saveSettings({ onboardingDone: true })
    if (profileId) await setActive(profileId)
    done()
  }

  const createProfile = async () => {
    const parsed = parseProfileDraft(draft)
    const p: Profile = {
      id: uid(),
      ...parsed,
      createdAt: new Date().toISOString(),
    }
    await db.profiles.add(p)
    return p
  }

  return (
    <div className="flex min-h-dvh justify-center px-4 py-8">
      {/* `m-auto` centers the card when there is room, but keeps its top edge
          reachable when it is taller than the viewport (short / landscape
          screens) — `items-center` would clip it above the fold. */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="m-auto w-full max-w-md"
      >
        <div className="mb-6 text-center">
          <motion.img
            src={`${import.meta.env.BASE_URL}icons/icon.svg`}
            alt=""
            width={56}
            height={56}
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-3 size-14 rounded-[16px] shadow-lg shadow-brand-500/25"
          />
          <h1 className="text-3xl font-extrabold tracking-tight">
            Medi<span className="text-gradient">Mind</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Privacy-first AI medication management
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="space-y-4 !p-5 sm:!p-6">
                {[
                  { icon: ScanLine, t: 'Scan any prescription', d: 'AI reads it into structured medicines' },
                  { icon: BadgeCheck, t: 'You stay in control', d: 'Nothing becomes a reminder until you confirm it' },
                  { icon: Activity, t: 'Optional health log', d: 'Track BP, sugar and more — scan the device or type it in' },
                  { icon: LockKeyhole, t: 'Offline & private', d: 'All data lives on this device — keys encrypted' },
                  { icon: BellRing, t: 'Never miss a dose', d: 'Smart reminders that re-nag until taken' },
                ].map((f, i) => (
                  <motion.div key={f.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                      <f.icon className="size-4" />
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
            <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="space-y-4 !p-5 sm:!p-6">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <User className="size-5 text-brand-500" />
                    <h2 className="text-xl font-bold tracking-tight">Create Patient Profile</h2>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Enter your information below. Age and weight allow AI to check dose safety and tailor recommendations.
                </p>

                <ProfileFields
                  value={draft}
                  onChange={setDraft}
                  nameTestId="onb-name"
                  ageTestId="onb-age"
                  weightTestId="onb-weight"
                  autoFocusName
                />

                <div className="flex items-start gap-2 rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span><strong>100% Private & Local:</strong> Your age, weight, and health data remain on this device. AI uses it solely to evaluate dosage and health safety.</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!draft.name.trim()}
                  data-testid="onb-create"
                  onClick={async () => {
                    const p = await createProfile()
                    setStep(2)
                    showToast(`Welcome, ${p.name}!`, 'success')
                  }}
                >
                  Create Profile & Continue <ArrowRight />
                </Button>
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
            <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="space-y-5 !p-5 sm:!p-6">
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
            <motion.div key="s3" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="space-y-5 !p-5 text-center sm:!p-6">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                  className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
                >
                  <BadgeCheck className="size-8" />
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

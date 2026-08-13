import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ArrowRight, BadgeCheck, BellRing, BrainCircuit, LockKeyhole, ScanLine, Sparkles, User } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Field, Input, Select } from '../components/ui'
import { requestNotificationPermission } from '../lib/notifications'
import { db, saveSettings, uid } from '../lib/db'
import { seedDemoData } from '../lib/seed'
import type { Profile } from '../lib/types'
import { useSetActiveProfile } from '../state/hooks'
import { useUiStore } from '../state/ui'

const EMOJIS = ['🧓', '👵', '👴', '🧑', '👩', '👨', '👶', '🐕']
const COLORS = ['#07c5a8', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9']

export function Onboarding({ done }: { done: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('Self')
  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg')
  const [gender, setGender] = useState('')
  const [emoji, setEmoji] = useState('🧑')
  const [color, setColor] = useState('#07c5a8')

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
      relation,
      age: age ? parseInt(age) || undefined : undefined,
      weight: weight ? parseFloat(weight) || undefined : undefined,
      weightUnit,
      gender: gender || undefined,
      avatarEmoji: emoji,
      color,
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

                <div className="space-y-3">
                  <Field label="Full Name">
                    <Input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. John Doe or Grandma Rosa"
                      data-testid="onb-name"
                      className="!h-12 !text-base"
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Relationship">
                      <Select value={relation} onChange={(e) => setRelation(e.target.value)} className="!h-12 !text-base">
                        <option value="Self">Self (Me)</option>
                        <option value="Parent">Parent</option>
                        <option value="Spouse">Spouse</option>
                        <option value="Child">Child</option>
                        <option value="Patient">Patient</option>
                        <option value="Other">Other</option>
                      </Select>
                    </Field>

                    <Field label="Gender (Optional)">
                      <Select value={gender} onChange={(e) => setGender(e.target.value)} className="!h-12 !text-base">
                        <option value="">Unspecified</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </Select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Age (Years)" hint="For AI dose safety checks">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="e.g. 68"
                        data-testid="onb-age"
                        className="!h-12 !text-base"
                      />
                    </Field>

                    <Field label="Weight" hint="For AI health guidance">
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          placeholder="e.g. 70"
                          data-testid="onb-weight"
                          className="!h-12 !text-base min-w-0 flex-1"
                        />
                        <div className="flex h-12 items-center rounded-2xl border border-slate-300/70 bg-slate-200/50 p-1 dark:border-white/10 dark:bg-white/5">
                          <button
                            type="button"
                            onClick={() => setWeightUnit('kg')}
                            className={`h-full rounded-xl px-2.5 text-xs font-bold transition-all ${
                              weightUnit === 'kg' ? 'bg-white text-brand-700 shadow-sm dark:bg-white/20 dark:text-white' : 'text-slate-500'
                            }`}
                          >
                            kg
                          </button>
                          <button
                            type="button"
                            onClick={() => setWeightUnit('lbs')}
                            className={`h-full rounded-xl px-2.5 text-xs font-bold transition-all ${
                              weightUnit === 'lbs' ? 'bg-white text-brand-700 shadow-sm dark:bg-white/20 dark:text-white' : 'text-slate-500'
                            }`}
                          >
                            lbs
                          </button>
                        </div>
                      </div>
                    </Field>
                  </div>

                  <Field label="Choose Avatar Emoji">
                    <div className="flex flex-wrap gap-2">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setEmoji(e)}
                          className={`flex size-11 cursor-pointer items-center justify-center rounded-2xl text-2xl transition-transform active:scale-95 ${
                            emoji === e ? 'bg-brand-500/20 ring-2 ring-brand-500' : 'bg-slate-200/60 dark:bg-white/8'
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Profile Tag Color">
                    <div className="flex items-center gap-2 pt-1">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={`size-9 cursor-pointer rounded-2xl transition-transform hover:scale-110 ${
                            color === c ? 'ring-2 ring-slate-600 ring-offset-2 ring-offset-transparent scale-110' : ''
                          }`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  🛡️ <strong>100% Private & Local:</strong> Your age, weight, and health data remain on this device. AI uses it solely to evaluate dosage and health safety.
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!name.trim()}
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

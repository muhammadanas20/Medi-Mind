import { AnimatePresence, motion } from 'framer-motion'
import { Archive, PackageOpen, PenLine, Pill, Plus, ScanLine, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SlotIcon } from '../components/icons'
import { DoseSlotPicker } from '../components/slot-picker'
import { Badge, Button, Card, Dialog, Field, Input, Select, SectionTitle, Switch, Textarea } from '../components/ui'
import { db, todayStr, uid } from '../lib/db'
import type { FoodInstruction, Medication, Slot } from '../lib/types'
import { MED_FORMS, SLOTS, foodLabel, medSlotsSummary } from '../lib/meds-helpers'
import { cn } from '../lib/utils'
import { useActiveProfile, useMedications } from '../state/hooks'
import { useUiStore } from '../state/ui'

const MED_COLORS = ['#07c5a8', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#84cc16', '#ec4899', '#6366f1']

/** Icon row of scheduled slots — e.g. [sunrise] 1  [moon] 1 · After food */
function MedSlotsLine({ med }: { med: Medication }) {
  const slots = SLOTS.filter((s) => (med.slots[s] ?? 0) > 0)
  if (slots.length === 0) return <span>No schedule</span>
  return (
    <>
      {slots.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <SlotIcon slot={s} className="size-3.5" />
          <span className="font-semibold tabular-nums">{med.slots[s]}</span>
        </span>
      ))}
      {med.food !== 'any' && <span className="text-slate-500 dark:text-slate-400">· {foodLabel(med.food)}</span>}
    </>
  )
}

export function MedsPage() {
  const profile = useActiveProfile()
  const meds = useMedications(profile?.id)
  const showToast = useUiStore((s) => s.showToast)
  const [editing, setEditing] = useState<Medication | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const openNew = () => {
    if (!profile) {
      showToast('Create a profile first', 'error')
      return
    }
    setEditing(null)
    setFormOpen(true)
  }

  const remove = async (med: Medication) => {
    if (!confirm(`Delete ${med.name}? Its dose history stays in Insights.`)) return
    await db.medications.delete(med.id)
    showToast(`${med.name} deleted`)
  }

  const toggleActive = async (med: Medication) => {
    await db.medications.update(med.id, { active: !med.active })
    showToast(med.active ? `${med.name} archived` : `${med.name} re-activated`)
  }

  const active = meds?.filter((m) => m.active) ?? []
  const archived = meds?.filter((m) => !m.active) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Medications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ''}
          </p>
        </div>
        <Button onClick={openNew} data-testid="add-med">
          <Plus /> Add medicine
        </Button>
      </div>

      {active.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Pill className="size-8" />
          </div>
          <div>
            <p className="text-lg font-bold">No active medicines</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Scan a prescription and the extracted list lands here — or add one by hand.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/scan">
              <Button>
                <ScanLine /> Scan prescription
              </Button>
            </Link>
            <Button variant="outline" onClick={openNew}>
              <Plus /> Add manually
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden" data-testid="meds-list">
          <ul className="divide-y divide-slate-200/70 dark:divide-white/8">
            <AnimatePresence initial={false}>
              {active.map((med, i) => {
                const refillSoon =
                  med.pillsRemaining != null && med.refillAt != null && med.pillsRemaining <= med.refillAt / 3
                return (
                  <motion.li
                    key={med.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: 0.03 * i, duration: 0.22, ease: 'easeOut' }}
                    className="relative"
                  >
                    <div
                      className="absolute inset-y-3 left-0 w-1 rounded-r-full"
                      style={{ background: med.color }}
                    />
                    <div className="flex items-start gap-3 px-4 py-3.5 sm:items-center sm:px-5">
                      <div
                        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-white shadow-md"
                        style={{ background: med.color }}
                      >
                        {med.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="min-w-0 truncate font-bold">{med.name}</h3>
                          {med.isCritical && (
                            <Badge tone="danger" className="shrink-0">
                              <ShieldAlert className="size-3" /> Critical
                            </Badge>
                          )}
                          {med.sourcePrescriptionId && <Badge tone="accent" className="shrink-0">Scanned</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {[med.strength, med.form].filter(Boolean).join(' · ') || 'No strength set'}
                        </p>
                        <p
                          className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-600 dark:text-slate-300"
                          aria-label={medSlotsSummary(med)}
                        >
                          <MedSlotsLine med={med} />
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {med.durationDays && <Badge tone="neutral">{med.durationDays} days</Badge>}
                          {med.pillsRemaining != null && (
                            <Badge tone={refillSoon ? 'warn' : 'neutral'}>
                              <PackageOpen className="size-3" /> {med.pillsRemaining} left
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="iconsm"
                          variant="ghost"
                          title="Edit"
                          aria-label={`Edit ${med.name}`}
                          onClick={() => { setEditing(med); setFormOpen(true) }}
                        >
                          <PenLine />
                        </Button>
                        <Button
                          size="iconsm"
                          variant="ghost"
                          title="Archive"
                          aria-label={`Archive ${med.name}`}
                          onClick={() => void toggleActive(med)}
                        >
                          <Archive />
                        </Button>
                        <Button
                          size="iconsm"
                          variant="ghost"
                          className="text-danger-500"
                          title="Delete"
                          aria-label={`Delete ${med.name}`}
                          onClick={() => void remove(med)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </Card>
      )}

      {archived.length > 0 && (
        <Card>
          <SectionTitle>Archived</SectionTitle>
          <div className="space-y-2">
            {archived.map((med) => (
              <div key={med.id} className="flex items-center gap-3 rounded-2xl bg-slate-200/40 p-3 dark:bg-white/[0.04]">
                <span className="size-2.5 rounded-full" style={{ background: med.color }} />
                <span className="flex-1 text-sm font-semibold line-through opacity-70">
                  {med.name} {med.strength}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void toggleActive(med)}>Reactivate</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <MedicationForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        profileId={profile?.id ?? ''}
        existing={editing}
      />
    </div>
  )
}

/* --------------------------------- form ---------------------------------- */

export function MedicationForm({
  open,
  onClose,
  profileId,
  existing,
}: {
  open: boolean
  onClose: () => void
  profileId: string
  existing: Medication | null
}) {
  const showToast = useUiStore((s) => s.showToast)
  const [name, setName] = useState(existing?.name ?? '')
  const [strength, setStrength] = useState(existing?.strength ?? '')
  const [form, setForm] = useState(existing?.form ?? 'tablet')
  const [slots, setSlots] = useState<Partial<Record<Slot, number>>>(existing?.slots ?? { morning: 1 })
  const [food, setFood] = useState<FoodInstruction>(existing?.food ?? 'any')
  const [durationDays, setDurationDays] = useState(existing?.durationDays?.toString() ?? '')
  const [instructions, setInstructions] = useState(existing?.instructions ?? '')
  const [isCritical, setIsCritical] = useState(existing?.isCritical ?? false)
  const [pillsRemaining, setPillsRemaining] = useState(existing?.pillsRemaining?.toString() ?? '')
  const [color, setColor] = useState(existing?.color ?? MED_COLORS[0])

  // re-hydrate when dialog target changes
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)
  if (open && hydratedFor !== (existing?.id ?? 'new')) {
    setHydratedFor(existing?.id ?? 'new')
    setName(existing?.name ?? '')
    setStrength(existing?.strength ?? '')
    setForm(existing?.form ?? 'tablet')
    setSlots(existing?.slots ?? { morning: 1 })
    setFood(existing?.food ?? 'any')
    setDurationDays(existing?.durationDays?.toString() ?? '')
    setInstructions(existing?.instructions ?? '')
    setIsCritical(existing?.isCritical ?? false)
    setPillsRemaining(existing?.pillsRemaining?.toString() ?? '')
    setColor(existing?.color ?? MED_COLORS[0])
  }

  const totalSlots = Object.values(slots).reduce((a, b) => a + (b ?? 0), 0)
  const valid = name.trim().length > 0 && totalSlots > 0

  const save = async () => {
    if (!valid) return
    const base = {
      name: name.trim(),
      strength: strength.trim() || undefined,
      form,
      slots,
      food,
      durationDays: durationDays ? parseInt(durationDays) || undefined : undefined,
      instructions: instructions.trim() || undefined,
      isCritical,
      pillsRemaining: pillsRemaining ? parseInt(pillsRemaining) || 0 : undefined,
      refillAt: pillsRemaining ? Math.max(5, Math.round(parseInt(pillsRemaining) * 0.3)) : undefined,
      color,
    }
    if (existing) {
      await db.medications.update(existing.id, base)
      showToast(`${base.name} updated`, 'success')
    } else {
      await db.medications.add({
        ...base,
        id: uid(),
        profileId,
        startDate: todayStr(),
        active: true,
        createdAt: new Date().toISOString(),
      } as Medication)
      showToast(`${base.name} added — reminders scheduled`, 'success')
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={existing ? 'Edit medicine' : 'Add medicine'} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medicine name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Concor" data-testid="med-name" autoFocus={window.matchMedia('(pointer: fine)').matches} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Strength">
            <Input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="2.5 mg" />
          </Field>
          <Field label="Form">
            <Select value={form} onChange={(e) => setForm(e.target.value)}>
              {MED_FORMS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Dose schedule
        </span>
        <div className="mt-2">
          <DoseSlotPicker
            slots={slots}
            onChange={(slot, qty) => setSlots((s) => ({ ...s, [slot]: qty }))}
            testIdPrefix="med-slot"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Food timing">
          <Select value={food} onChange={(e) => setFood(e.target.value as FoodInstruction)}>
            <option value="any">Any time</option>
            <option value="before">Before food</option>
            <option value="after">After food</option>
            <option value="with">With food</option>
          </Select>
        </Field>
        <Field label="Duration (days)" hint="Leave empty for ongoing">
          <Input value={durationDays} onChange={(e) => setDurationDays(e.target.value.replace(/\D/g, ''))} placeholder="30" inputMode="numeric" />
        </Field>
        <Field label="Pills in stock" hint="Enables refill countdown">
          <Input value={pillsRemaining} onChange={(e) => setPillsRemaining(e.target.value.replace(/\D/g, ''))} placeholder="30" inputMode="numeric" />
        </Field>
        <Field label="Color tag">
          <div className="flex min-h-11 flex-wrap items-center gap-2">
            {MED_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={cn(
                  'size-7 cursor-pointer rounded-full transition-transform hover:scale-110',
                  color === c && 'ring-2 ring-slate-500 ring-offset-2 ring-offset-transparent scale-110',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Instructions">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Swallow whole, do not crush" className="min-h-16" />
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-danger-500/[0.07] p-4">
        <div>
          <p className="text-sm font-bold">Critical medication</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reminders keep repeating 1 hour past the window until taken.
          </p>
        </div>
        <Switch checked={isCritical} onChange={setIsCritical} />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid} onClick={() => void save()} data-testid="med-save">
          {existing ? 'Save changes' : 'Add & schedule'}
        </Button>
      </div>
    </Dialog>
  )
}

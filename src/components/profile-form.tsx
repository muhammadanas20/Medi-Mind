import type { Profile } from '../lib/types'
import { cn } from '../lib/utils'
import { Field, Input, Select } from './ui'

export const PROFILE_EMOJIS = ['🧓', '👵', '👴', '🧑', '👩', '👨', '👶', '🐕'] as const
export const PROFILE_COLORS = ['#07c5a8', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9'] as const

export type ProfileDraft = {
  name: string
  relation: string
  age: string
  weight: string
  weightUnit: 'kg' | 'lbs'
  gender: string
  emoji: string
  color: string
}

export function emptyProfileDraft(): ProfileDraft {
  return {
    name: '',
    relation: 'Self',
    age: '',
    weight: '',
    weightUnit: 'kg',
    gender: '',
    emoji: '🧑',
    color: '#07c5a8',
  }
}

export function draftFromProfile(p: Profile): ProfileDraft {
  return {
    name: p.name,
    relation: p.relation || 'Self',
    age: p.age != null ? String(p.age) : '',
    weight: p.weight != null ? String(p.weight) : '',
    weightUnit: p.weightUnit || 'kg',
    gender: p.gender || '',
    emoji: p.avatarEmoji || '🧑',
    color: p.color || '#07c5a8',
  }
}

export function parseProfileDraft(d: ProfileDraft) {
  return {
    name: d.name.trim(),
    relation: d.relation,
    age: d.age ? parseInt(d.age, 10) || undefined : undefined,
    weight: d.weight ? parseFloat(d.weight) || undefined : undefined,
    weightUnit: d.weightUnit,
    gender: d.gender || undefined,
    avatarEmoji: d.emoji,
    color: d.color,
  }
}

export function ProfileFields({
  value,
  onChange,
  nameTestId = 'profile-name',
  ageTestId = 'profile-age',
  weightTestId = 'profile-weight',
  autoFocusName = false,
}: {
  value: ProfileDraft
  onChange: (next: ProfileDraft) => void
  nameTestId?: string
  ageTestId?: string
  weightTestId?: string
  autoFocusName?: boolean
}) {
  const set = <K extends keyof ProfileDraft>(key: K, next: ProfileDraft[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="space-y-3">
      <Field label="Full name">
        <Input
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Grandma Rosa or John Doe"
          data-testid={nameTestId}
          className="!h-12 !text-base"
          autoFocus={autoFocusName}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Relationship">
          <Select value={value.relation} onChange={(e) => set('relation', e.target.value)} className="!h-12 !text-base">
            <option value="Self">Self (Me)</option>
            <option value="Parent">Parent</option>
            <option value="Spouse">Spouse</option>
            <option value="Child">Child</option>
            <option value="Patient">Patient</option>
            <option value="Other">Other</option>
          </Select>
        </Field>

        <Field label="Gender (optional)">
          <Select value={value.gender} onChange={(e) => set('gender', e.target.value)} className="!h-12 !text-base">
            <option value="">Unspecified</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </Select>
        </Field>
      </div>

      {/* Stack on phones so the weight field + unit toggle is not crushed into ~150px. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Age (years)" hint="For AI dose safety checks">
          <Input
            type="number"
            inputMode="numeric"
            value={value.age}
            onChange={(e) => set('age', e.target.value)}
            placeholder="e.g. 68"
            data-testid={ageTestId}
            className="!h-12 !text-base"
          />
        </Field>

        <Field label="Weight" hint="For AI health guidance">
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              value={value.weight}
              onChange={(e) => set('weight', e.target.value)}
              placeholder="e.g. 70"
              data-testid={weightTestId}
              className="!h-12 min-w-0 flex-1 !text-base"
            />
            <div
              className="flex h-12 shrink-0 items-center rounded-2xl border border-slate-300/70 bg-slate-200/50 p-1 dark:border-white/10 dark:bg-white/5"
              role="group"
              aria-label="Weight unit"
            >
              {(['kg', 'lbs'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => set('weightUnit', unit)}
                  aria-pressed={value.weightUnit === unit}
                  className={cn(
                    'h-full rounded-xl px-2.5 text-xs font-bold transition-all',
                    value.weightUnit === unit
                      ? 'bg-white text-brand-700 shadow-sm dark:bg-white/20 dark:text-white'
                      : 'text-slate-500',
                  )}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        </Field>
      </div>

      <Field label="Avatar">
        <div className="flex flex-wrap gap-2">
          {PROFILE_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => set('emoji', emoji)}
              aria-label={`Avatar ${emoji}`}
              aria-pressed={value.emoji === emoji}
              className={cn(
                'flex size-11 cursor-pointer items-center justify-center rounded-2xl text-2xl transition-transform active:scale-95',
                value.emoji === emoji ? 'bg-brand-500/20 ring-2 ring-brand-500' : 'bg-slate-200/60 dark:bg-white/8',
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Profile color">
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {PROFILE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => set('color', color)}
              aria-label={`Color ${color}`}
              aria-pressed={value.color === color}
              className={cn(
                'size-9 cursor-pointer rounded-2xl transition-transform hover:scale-110',
                value.color === color && 'scale-110 ring-2 ring-slate-600 ring-offset-2 ring-offset-white dark:ring-offset-ink-900',
              )}
              style={{ background: color }}
            />
          ))}
        </div>
      </Field>
    </div>
  )
}

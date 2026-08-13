import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { toTwentyFourHourTime, toTwelveHourTime } from '../lib/time'
import { cn } from '../lib/utils'

/* --------------------------------- Button -------------------------------- */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0 select-none cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/45 hover:brightness-110',
        accent:
          'bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-500/25 hover:brightness-110',
        danger:
          'bg-danger-500/15 text-danger-500 hover:bg-danger-500/25 dark:text-danger-400',
        outline:
          'border border-slate-300/80 bg-transparent hover:bg-slate-200/60 dark:border-white/15 dark:hover:bg-white/10',
        ghost: 'hover:bg-slate-200/70 dark:hover:bg-white/10',
        glass: 'glass hover:shadow-xl hover:bg-white/80 dark:hover:bg-white/10',
        subtle: 'bg-brand-500/12 text-brand-700 hover:bg-brand-500/20 dark:text-brand-300',
      },
      size: {
        sm: 'h-9 px-3.5 text-xs',
        md: 'h-11 px-5',
        lg: 'h-13 px-7 text-base',
        icon: 'h-11 w-11',
        iconsm: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

/* ---------------------------------- Card --------------------------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass min-w-0 rounded-3xl p-4 sm:p-5', className)} {...props} />
}

export function SectionTitle({
  children,
  right,
  className,
}: {
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2', className)}>
      <h2 className="min-w-0 text-lg font-bold tracking-tight">{children}</h2>
      {right}
    </div>
  )
}

/* ---------------------------------- Badge -------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
  {
    variants: {
      tone: {
        brand: 'bg-brand-500/15 text-brand-700 dark:text-brand-300',
        accent: 'bg-accent-500/15 text-accent-600 dark:text-accent-400',
        warn: 'bg-warn-500/15 text-amber-700 dark:text-warn-400',
        danger: 'bg-danger-500/15 text-danger-500 dark:text-danger-400',
        neutral: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
        success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/* ---------------------------------- Input -------------------------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // text-base on phones: iOS Safari auto-zooms into fields smaller than 16px
        'h-11 w-full rounded-2xl border border-slate-300/70 bg-white/60 px-4 text-base outline-none transition-all placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/5 dark:placeholder:text-slate-500 sm:text-sm',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

/**
 * A locale-independent 12-hour time control. Values remain HH:mm internally so
 * reminder scheduling does not need to change, while people always choose an
 * hour, minute, and AM/PM instead of interpreting a 24-hour clock.
 */
export function TimePicker({
  value,
  onChange,
  className,
  disabled,
  'aria-label': ariaLabel = 'Time',
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  const { hour, minute, period } = toTwelveHourTime(value)
  const update = (nextHour = hour, nextMinute = minute, nextPeriod = period) => {
    onChange(toTwentyFourHourTime(nextHour, nextMinute, nextPeriod))
  }
  const selectClass = 'h-9 min-w-0 rounded-lg border border-slate-300/60 bg-white/60 px-1.5 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5'

  return (
    <div className={cn('flex items-center gap-1', className)} aria-label={ariaLabel}>
      <select aria-label={`${ariaLabel} hour`} value={hour} disabled={disabled} onChange={(e) => update(Number(e.target.value))} className={selectClass}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span aria-hidden="true" className="font-bold text-slate-400">:</span>
      <select aria-label={`${ariaLabel} minute`} value={minute} disabled={disabled} onChange={(e) => update(hour, Number(e.target.value))} className={selectClass}>
        {Array.from({ length: 60 }, (_, i) => i).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
      </select>
      <select aria-label={`${ariaLabel} AM or PM`} value={period} disabled={disabled} onChange={(e) => update(hour, minute, e.target.value as 'AM' | 'PM')} className={selectClass}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full rounded-2xl border border-slate-300/70 bg-white/60 p-4 text-base outline-none transition-all placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/5 sm:text-sm',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        // text-base on phones (iOS zoom fix) + a visible chevron: `appearance-none`
        // removes the native arrow on iOS, so without this the control looks inert
        'h-11 w-full cursor-pointer appearance-none rounded-2xl border border-slate-300/70 bg-white/60 py-0 pl-4 pr-10 text-base outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-ink-700 sm:text-sm',
        className,
      )}
      style={{
        backgroundImage:
          "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%2394a3b8\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m6 9 6 6 6-6\"/></svg>')",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.8rem center',
      }}
      {...props}
    />
  ),
)
Select.displayName = 'Select'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

/* --------------------------------- Switch --------------------------------- */

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-300 disabled:opacity-40',
        checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/15',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={cn(
          'absolute top-0.5 size-6 rounded-full bg-white shadow-md',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

/* --------------------------------- Dialog --------------------------------- */

const DialogCtx = createContext<() => void>(() => {})

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Render into a portal on <body>. The Dialog is always a `position: fixed`
  // overlay, but it is usually mounted inside a `Card` that applies
  // `backdrop-filter` (the `glass` utility). A non-`none` `backdrop-filter`
  // establishes a containing block for `position: fixed` descendants, which
  // traps the overlay inside the card and pushes it off-screen. Portaling to
  // <body> sidesteps that so the overlay always fills the viewport.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title != null ? titleId : undefined}
            initial={{ y: 60, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cn(
              'glass-strong relative max-h-[88dvh] w-full min-w-0 overflow-y-auto overscroll-contain rounded-3xl p-5 sm:p-6',
              wide ? 'max-w-2xl' : 'max-w-md',
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              {title != null && (
                <h3 id={titleId} className="min-w-0 text-lg font-bold tracking-tight">
                  {title}
                </h3>
              )}
              <Button variant="ghost" size="iconsm" className="ml-auto shrink-0" onClick={onClose} aria-label="Close">
                <X />
              </Button>
            </div>
            <DialogCtx.Provider value={onClose}>{children}</DialogCtx.Provider>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export const useCloseDialog = () => useContext(DialogCtx)

/* -------------------------------- ProgressRing --------------------------- */

export function Ring({
  pct,
  size = 120,
  stroke = 10,
  children,
  trackClass = 'stroke-slate-300/60 dark:stroke-white/10',
}: {
  pct: number // 0..100
  size?: number
  stroke?: number
  children?: ReactNode
  trackClass?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * Math.min(100, Math.max(0, pct))) / 100 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#20e1c1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/* --------------------------------- Toasts --------------------------------- */

const toneToBadge = { info: 'neutral', success: 'success', error: 'danger' } as const

export function ToneDot({ tone, className }: { tone: 'brand' | 'warn' | 'danger' | 'success' | 'accent'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        tone === 'brand' && 'bg-brand-500',
        tone === 'accent' && 'bg-accent-500',
        tone === 'warn' && 'bg-warn-500',
        tone === 'danger' && 'bg-danger-500',
        tone === 'success' && 'bg-emerald-500',
        className,
      )}
    />
  )
}
void toneToBadge

/* ------------------------------ Modern Loaders ---------------------------- */

/**
 * DotsLoader — modern animated bouncing dots used for AI scanning and loading
 * states across the app.
 *
 * Variants:
 * - `sm`  → inline / button loaders (tiny dots)
 * - `md`  → card-level loaders (medium dots)
 * - `lg`  → full-screen / prominent scanners (large dots with orbit ring)
 */
export function DotsLoader({
  size = 'md',
  label,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}) {
  const sizes = {
    sm: { dot: 'size-1.5', gap: 'gap-1' },
    md: { dot: 'size-2', gap: 'gap-1.5' },
    lg: { dot: 'size-2.5', gap: 'gap-2' },
  }[size]

  return (
    <div
      className={cn('inline-flex items-center', sizes.gap, className)}
      role="status"
      aria-label={label ?? 'Loading'}
    >
      <span
        className={cn(
          sizes.dot,
          'rounded-full bg-gradient-to-br from-brand-400 to-brand-600',
          'animate-[dots-bounce_1.4s_ease-in-out_infinite_both]',
        )}
      />
      <span
        className={cn(
          sizes.dot,
          'rounded-full bg-gradient-to-br from-brand-500 to-accent-500',
          'animate-[dots-bounce_1.4s_ease-in-out_0.16s_infinite_both]',
        )}
      />
      <span
        className={cn(
          sizes.dot,
          'rounded-full bg-gradient-to-br from-accent-500 to-accent-600',
          'animate-[dots-bounce_1.4s_ease-in-out_0.32s_infinite_both]',
        )}
      />
      {label && (
        <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}
    </div>
  )
}

/**
 * AIScanLoader — the hero "AI is scanning" loader.
 *
 * A glowing gradient orb with orbiting dots, a subtle pulse ring, and a
 * brain-circuit icon in the centre. Designed for the full-card processing
 * screens on ScanPage, HealthPage, and PillIdPage.
 */
export function AIScanLoader({ progress }: { progress?: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-2">
      {/* Ambient glow behind the orb */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 via-accent-500 to-brand-500 opacity-60 blur-2xl animate-[scan-glow_2.6s_ease-in-out_infinite]" />

        {/* Orbit ring */}
        <div className="relative size-20 animate-[orbit-spin_1.8s_linear_infinite]">
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-brand-400 shadow-[0_0_10px_2px_rgba(32,225,193,0.8)]" />
          <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent-400 shadow-[0_0_8px_2px_rgba(167,139,250,0.7)]" />
          <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-brand-500 shadow-[0_0_8px_2px_rgba(7,197,168,0.7)]" />
        </div>

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 text-white shadow-xl shadow-brand-500/30">
            <BrainCircuit className="size-6 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Bouncing dots below the orb */}
      <div className="flex items-center gap-1.5 pt-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-brand-500"
            style={{
              animation: `dot-fade 1.4s ease-in-out ${i * 0.2}s infinite both`,
            }}
          />
        ))}
      </div>

      {progress && (
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{progress}</p>
      )}
    </div>
  )
}

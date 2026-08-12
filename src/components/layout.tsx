import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, CalendarClock, Camera, ChartNoAxesColumn, CheckCircle2, HeartPulse,
  Info, Moon, Pill, ScanLine, Search, Sun, TriangleAlert,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useUiStore } from '../state/ui'
import { usePatchSettings, useProfiles, useSetActiveProfile, useActiveProfile } from '../state/hooks'
import { Button } from './ui'

const NAV = [
  { to: '/', label: 'Today', icon: CalendarClock, end: true },
  { to: '/meds', label: 'Meds', icon: Pill },
  { to: '/scan', label: 'Scan', icon: ScanLine, fab: true },
  { to: '/pill-id', label: 'Pill ID', icon: Search },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
]

export function AppShell() {
  const settings = useUiStore((s) => s.settings)
  const patch = usePatchSettings()
  const toast = useUiStore((s) => s.toast)
  const location = useLocation()
  const navigate = useNavigate()
  const profiles = useProfiles()
  const active = useActiveProfile()
  const setActive = useSetActiveProfile()

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
      {/* ------------------------- desktop side rail ------------------------ */}
      <aside className="sticky top-0 hidden h-dvh w-20 flex-col items-center gap-2 py-6 lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-1.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              data-testid={`nav-${n.label.toLowerCase().replace(' ', '-')}`}
              className={({ isActive }) =>
                cn(
                  'flex size-12 items-center justify-center rounded-2xl transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/30'
                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-200',
                )
              }
            >
              <n.icon className="size-5" strokeWidth={2.2} />
            </NavLink>
          ))}
        </nav>
        <ThemeButton />
      </aside>

      {/* ------------------------------- main ------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-4 sm:px-6 lg:pb-10">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 lg:hidden">
            <Brand compact />
          </div>
          {/* profile switcher */}
          <div className="ml-auto flex items-center gap-2">
            {profiles && profiles.length > 1 && active && (
              <div className="glass flex items-center gap-1 rounded-2xl p-1">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void setActive(p.id)}
                    className={cn(
                      'flex h-8 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-all',
                      p.id === active.id
                        ? 'bg-white text-slate-900 shadow dark:bg-white/15 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="max-w-16 truncate">{p.avatarEmoji ?? p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            )}
            <Button variant="glass" size="icon" onClick={() => navigate('/settings')} aria-label="Settings" data-testid="open-settings">
              <Bell className="hidden" />
              <Sun className="hidden" />
              <SettingsCog />
            </Button>
            <div className="lg:hidden">
              <ThemeButton />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-10 hidden items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 lg:flex">
          <HeartPulse className="size-3.5" />
          MediMind organizes your schedule — it never replaces medical advice. Always confirm AI-extracted data.
          <span className="ml-auto inline-flex items-center gap-1">
            <ShieldDot /> 100% local storage · your keys never leave this device
          </span>
        </footer>
      </div>

      {/* --------------------------- mobile bottom nav ----------------------- */}
      <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center justify-around rounded-[26px] px-2 py-2 lg:hidden">
        {NAV.map((n) =>
          n.fab ? (
            <NavLink key={n.to} to={n.to} aria-label={n.label} data-testid="nav-scan">
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="animate-pulse-ring -mt-8 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-xl shadow-brand-500/40"
              >
                <n.icon className="size-6" strokeWidth={2.4} />
              </motion.div>
            </NavLink>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              aria-label={n.label}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[10px] font-semibold transition-colors',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 dark:text-slate-500',
                )
              }
            >
              <n.icon className="size-5" strokeWidth={2.2} />
              {n.label}
            </NavLink>
          ),
        )}
      </nav>

      {/* -------------------------------- toast ------------------------------ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-strong fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
          >
            {toast.kind === 'success' && <CheckCircle2 className="size-4 text-emerald-500" />}
            {toast.kind === 'error' && <TriangleAlert className="size-4 text-danger-500" />}
            {toast.kind === 'info' && <Info className="size-4 text-brand-500" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* settings shortcut uses hidden icons to keep bundling obvious */}
      <span className="hidden">{settings.theme}</span>
    </div>
  )

  function ThemeButton() {
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    return (
      <Button
        variant="glass"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => void patch({ theme: dark ? 'light' : 'dark' })}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    )
  }
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-accent-600 text-white shadow-lg shadow-brand-500/30">
        <Camera className="hidden" />
        <Pill className="size-5" strokeWidth={2.4} />
      </div>
      {!compact && (
        <span className="hidden text-lg font-extrabold tracking-tight lg:block">
          Medi<span className="text-gradient">Mind</span>
        </span>
      )}
      {compact && (
        <span className="text-lg font-extrabold tracking-tight">
          Medi<span className="text-gradient">Mind</span>
        </span>
      )}
    </div>
  )
}

function SettingsCog() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ShieldDot() {
  return (
    <span className="inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarClock, ChartNoAxesColumn, CheckCircle2, HeartPulse,
  Info, Moon, Pill, ScanLine, Search, Settings2, Sun, TriangleAlert,
} from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useUiStore } from '../state/ui'
import { usePatchSettings, useProfiles, useSetActiveProfile, useActiveProfile } from '../state/hooks'
import { InstallAppBanner } from './install'
import { Button } from './ui'
import { ErrorBoundary } from './ErrorBoundary'
import { TodayPage } from '../pages/TodayPage'

// Keep startup light on mobile: feature-heavy screens (camera, AI settings and
// analytics) are downloaded only when opened, then cached by the service worker.
const MedsPage = lazy(() => import('../pages/MedsPage').then((module) => ({ default: module.MedsPage })))
const ScanPage = lazy(() => import('../pages/ScanPage').then((module) => ({ default: module.ScanPage })))
const PillIdPage = lazy(() => import('../pages/PillIdPage').then((module) => ({ default: module.PillIdPage })))
const InsightsPage = lazy(() => import('../pages/InsightsPage').then((module) => ({ default: module.InsightsPage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

const NAV = [
  { to: '/', label: 'Today', icon: CalendarClock, end: true },
  { to: '/meds', label: 'Meds', icon: Pill },
  { to: '/scan', label: 'Scan', icon: ScanLine, fab: true },
  { to: '/pill-id', label: 'Pill ID', icon: Search },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
]

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function PageLoader() {
  return (
    <div className="flex min-h-64 items-center justify-center" role="status" aria-label="Loading page">
      <div className="flex items-center gap-3 rounded-2xl bg-white/50 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-white/5 dark:text-slate-400">
        <span className="size-4 animate-spin rounded-full border-2 border-brand-500/25 border-t-brand-500" />
        Loading…
      </div>
    </div>
  )
}

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
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:pb-10 lg:pt-4">
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
              <Settings2 className="size-4" />
            </Button>
            <div className="lg:hidden">
              <ThemeButton />
            </div>
          </div>
        </header>

        <InstallAppBanner />

        <main className="min-w-0 flex-1">
          {/* Route transitions. We pass the *current* location explicitly to
              <Routes> and key the wrapper by pathname so AnimatePresence can
              keep the outgoing page mounted (showing its own content) while the
              incoming page animates in. The previous pattern keyed an <Outlet/>
              here, which made the exiting node render the *new* route and could
              leave the viewport blank on navigation (e.g. Settings not opening). */}
          <ErrorBoundary>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <Routes location={location}>
                  <Route index element={<TodayPage />} />
                  <Route path="meds" element={<LazyPage><MedsPage /></LazyPage>} />
                  <Route path="scan" element={<LazyPage><ScanPage /></LazyPage>} />
                  <Route path="pill-id" element={<LazyPage><PillIdPage /></LazyPage>} />
                  <Route path="insights" element={<LazyPage><InsightsPage /></LazyPage>} />
                  <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
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
      <nav className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-around rounded-[26px] px-2 py-2 lg:hidden">
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
      <picture className="block">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon.svg`}
          alt=""
          className="size-10 drop-shadow-[0_6px_16px_rgb(7_197_168/0.35)]"
        />
      </picture>
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

function ShieldDot() {
  return (
    <span className="inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
  )
}

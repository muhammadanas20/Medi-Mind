import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, CalendarClock, ChartNoAxesColumn, CheckCircle2, CircleAlert, HeartPulse,
  Info, LockKeyhole, Moon, Pill, ScanLine, Search, Settings2, Sun, X,
} from 'lucide-react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { TOAST_DURATION_MS, useUiStore, type ToastKind } from '../state/ui'
import { usePatchSettings, useProfiles, useSetActiveProfile, useActiveProfile } from '../state/hooks'
import { InstallAppBanner } from './install'
import { Button } from './ui'
import { ErrorBoundary } from './ErrorBoundary'
import { TodayPage } from '../pages/TodayPage'

// Keep startup light on mobile: feature-heavy screens (camera, AI settings and
// analytics) are downloaded only when opened, then cached by the service worker.
const MedsPage = lazy(() => import('../pages/MedsPage').then((module) => ({ default: module.MedsPage })))
const ScanPage = lazy(() => import('../pages/ScanPage').then((module) => ({ default: module.ScanPage })))
const HealthPage = lazy(() => import('../pages/HealthPage').then((module) => ({ default: module.HealthPage })))
const PillIdPage = lazy(() => import('../pages/PillIdPage').then((module) => ({ default: module.PillIdPage })))
const InsightsPage = lazy(() => import('../pages/InsightsPage').then((module) => ({ default: module.InsightsPage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

type NavItem = { to: string; label: string; icon: typeof CalendarClock; end?: boolean; fab?: boolean }

/** Mobile bottom bar — Health replaces Pill ID so daily vitals stay one tap away. */
const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: CalendarClock, end: true },
  { to: '/meds', label: 'Meds', icon: Pill },
  { to: '/scan', label: 'Scan', icon: ScanLine, fab: true },
  { to: '/health', label: 'Health', icon: Activity },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
]

/** Desktop rail has room for Pill ID as well. */
const DESKTOP_NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: CalendarClock, end: true },
  { to: '/meds', label: 'Meds', icon: Pill },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/health', label: 'Health', icon: Activity },
  { to: '/pill-id', label: 'Pill ID', icon: Search },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
]

// Per-route document title (also what the installed PWA shows in the task switcher).
const ROUTE_TITLES: Record<string, string> = {
  '/': "Today's plan",
  '/meds': 'Medications',
  '/scan': 'Scan prescription',
  '/health': 'Health log',
  '/pill-id': 'Pill identifier',
  '/insights': 'Insights',
  '/settings': 'Settings',
}
const BASE_TITLE = 'MediMind — AI Medication Manager'
const LG_MEDIA_QUERY = '(min-width: 1024px)'

/** Visual language for the modern toast: tinted icon chip, colored progress bar, fallback title. */
const TOAST_META: Record<ToastKind, { icon: typeof Info; chip: string; bar: string; title: string }> = {
  success: { icon: CheckCircle2, chip: 'bg-emerald-500', bar: 'bg-emerald-500', title: 'Success' },
  info: { icon: Info, chip: 'bg-brand-500', bar: 'bg-brand-500', title: 'Heads up' },
  error: { icon: CircleAlert, chip: 'bg-danger-500', bar: 'bg-danger-500', title: 'Something went wrong' },
}

function navTestId(label: string) {
  return `nav-${label.toLowerCase().replace(/\s+/g, '-')}`
}

function useMediaQuery(query: string) {
  const getMatches = () =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(query).matches
      : false
  const [matches, setMatches] = useState(getMatches)

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return undefined

    const media = window.matchMedia(query)
    const updateMatches = () => setMatches(media.matches)

    updateMatches()
    media.addEventListener('change', updateMatches)
    return () => media.removeEventListener('change', updateMatches)
  }, [query])

  return matches
}

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
  const dismissToast = useUiStore((s) => s.dismissToast)
  const locked = useUiStore((s) => s.locked)
  const setShowLockScreen = useUiStore((s) => s.setShowLockScreen)
  const location = useLocation()
  const navigate = useNavigate()
  const profiles = useProfiles()
  const active = useActiveProfile()
  const setActive = useSetActiveProfile()
  // Both navs stay mounted for CSS breakpoints, so expose the shared nav-* test
  // ids only on the currently visible nav to keep Playwright strict locators unique.
  const isDesktopNav = useMediaQuery(LG_MEDIA_QUERY)

  // With hash routing the browser never scrolls back to the top on its own, so
  // a long page (Settings, Insights…) keeps the previous page's scroll offset
  // after navigation. Reset it whenever the route changes.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = ROUTE_TITLES[location.pathname] ? `${ROUTE_TITLES[location.pathname]} · MediMind` : BASE_TITLE
  }, [location.pathname])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl lg:gap-3 lg:px-3 lg:py-3">
      {/* ------------------------- desktop side rail ------------------------ */}
      <aside className="glass sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-56 shrink-0 flex-col gap-1 self-start overflow-hidden rounded-3xl px-3 py-5 lg:flex">
        <Brand />
        <nav className="mt-5 flex flex-1 flex-col gap-1">
          {DESKTOP_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              data-testid={isDesktopNav ? navTestId(n.label) : undefined}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25'
                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-200',
                )
              }
            >
              <n.icon className="size-5 shrink-0" strokeWidth={2.2} />
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <ThemeButton settingsTheme={settings.theme} onToggle={(theme) => void patch({ theme })} labeled />
      </aside>

      {/* ------------------------------- main ------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-6 lg:pb-6 lg:pt-2">
        <header className="mb-5 flex items-center gap-3">
          <div className="min-w-0 shrink lg:hidden">
            <Brand compact />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {profiles && profiles.length > 1 && active && (
              <div className="glass no-scrollbar flex max-w-[46vw] items-center gap-1 overflow-x-auto rounded-2xl p-1 sm:max-w-none">
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
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="max-w-16 truncate">{p.avatarEmoji ?? p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            )}
            {locked && (
              <Button
                variant="glass"
                size="icon"
                aria-label="Unlock AI features"
                title="AI features are locked"
                onClick={() => setShowLockScreen(true)}
              >
                <LockKeyhole className="size-4" />
              </Button>
            )}
            <Button variant="glass" size="icon" onClick={() => navigate('/settings')} aria-label="Settings" data-testid="open-settings">
              <Settings2 className="size-4" />
            </Button>
            <div className="lg:hidden">
              <ThemeButton settingsTheme={settings.theme} onToggle={(theme) => void patch({ theme })} />
            </div>
          </div>
        </header>

        <InstallAppBanner />

        <main className="w-full min-w-0 flex-1">
          {/* Route transitions. We pass the *current* location explicitly to
              <Routes> and key the wrapper by pathname so AnimatePresence can
              keep the outgoing page mounted (showing its own content) while the
              incoming page animates in. The previous pattern keyed an <Outlet/>
              here, which made the exiting node render the *new* route instead
              and could leave the viewport blank on navigation (e.g. tapping
              Settings did nothing visible). */}
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
                  <Route path="health" element={<LazyPage><HealthPage /></LazyPage>} />
                  <Route path="pill-id" element={<LazyPage><PillIdPage /></LazyPage>} />
                  <Route path="insights" element={<LazyPage><InsightsPage /></LazyPage>} />
                  <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>

        <footer className="mt-10 hidden flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500 lg:flex">
          <HeartPulse className="size-3.5 shrink-0" />
          <span>MediMind organizes your schedule — it never replaces medical advice. Always confirm AI-extracted data.</span>
          <span className="inline-flex items-center gap-1 lg:ml-auto">
            <ShieldDot /> 100% local storage · your keys never leave this device
          </span>
        </footer>
      </div>

      {/* --------------------------- mobile bottom nav ----------------------- */}
      <nav className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-end justify-around rounded-[26px] px-1.5 py-2 sm:px-2 lg:hidden">
        {MOBILE_NAV.map((n) =>
          n.fab ? (
            <NavLink
              key={n.to}
              to={n.to}
              aria-label={n.label}
              data-testid={!isDesktopNav ? navTestId(n.label) : undefined}
              className="flex"
            >
              {({ isActive }) => (
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    'animate-pulse-ring -mt-7 flex size-13 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-xl shadow-brand-500/40 sm:-mt-8 sm:size-14',
                    isActive && 'ring-4 ring-brand-500/25',
                  )}
                >
                  <n.icon className="size-6" strokeWidth={2.4} />
                </motion.div>
              )}
            </NavLink>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              aria-label={n.label}
              data-testid={!isDesktopNav ? navTestId(n.label) : undefined}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-col items-center gap-1 whitespace-nowrap rounded-2xl px-2.5 py-2 text-[10px] font-semibold transition-colors sm:px-3',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 dark:text-slate-500',
                )
              }
            >
              <n.icon className="size-5" strokeWidth={2.2} />
              <span className="leading-none">{n.label}</span>
            </NavLink>
          ),
        )}
      </nav>

      {/* -------------------------------- toast ------------------------------ */}
      <AnimatePresence>
        {toast && <ToastView key={toast.id} toast={toast} onDismiss={dismissToast} />}
      </AnimatePresence>
    </div>
  )
}

/** Modern in-app toast: tinted icon chip, bold title, clear message, dismiss button, auto-dismiss progress bar. */
function ToastView({
  toast,
  onDismiss,
}: {
  toast: { id: number; title?: string; message: string; kind: ToastKind }
  onDismiss: () => void
}) {
  const meta = TOAST_META[toast.kind]
  const Icon = meta.icon
  return (
    <motion.div
      role="status"
      aria-live="polite"
      data-testid="toast"
      initial={{ opacity: 0, y: -24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="glass-strong fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[60] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl"
    >
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md',
            meta.chip,
          )}
        >
          <Icon className="size-[18px]" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-bold tracking-tight">{toast.title ?? meta.title}</p>
          <p className="mt-0.5 break-words text-[13px] font-medium leading-snug text-slate-500 dark:text-slate-400">
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="-m-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* auto-dismiss progress bar */}
      <motion.span
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: TOAST_DURATION_MS / 1000, ease: 'linear' }}
        className={cn('absolute inset-x-0 bottom-0 h-[3px] origin-left', meta.bar)}
      />
    </motion.div>
  )
}

function ThemeButton({
  settingsTheme,
  onToggle,
  labeled,
}: {
  settingsTheme: 'system' | 'light' | 'dark'
  onToggle: (theme: 'light' | 'dark') => void
  labeled?: boolean
}) {
  const dark =
    settingsTheme === 'dark' ||
    (settingsTheme === 'system' && typeof window !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (labeled) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        onClick={() => onToggle(dark ? 'light' : 'dark')}
        className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-200"
      >
        {dark ? <Sun className="size-5 shrink-0" /> : <Moon className="size-5 shrink-0" />}
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    )
  }
  return (
    <Button
      variant="glass"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => onToggle(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact ? 'min-w-0' : 'px-1')}>
      <img
        src={`${import.meta.env.BASE_URL}icons/icon.svg`}
        alt=""
        width={36}
        height={36}
        className="size-8 shrink-0 rounded-[9px] shadow-md shadow-brand-500/25 lg:size-9 lg:rounded-[10px]"
      />
      <span className={cn('text-lg font-extrabold tracking-tight', compact && 'truncate')}>
        Medi<span className="text-gradient">Mind</span>
      </span>
    </div>
  )
}

function ShieldDot() {
  return (
    <span className="inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
  )
}

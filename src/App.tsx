import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/layout'
import { DueStack } from './components/dose'
import { LockScreen } from './components/LockScreen'
import { Onboarding } from './pages/Onboarding'
import { TodayPage } from './pages/TodayPage'
import { onDueDoses, startScheduler } from './lib/scheduler'
import { isLocked } from './lib/crypto'
import { useBootstrap } from './state/hooks'
import { useUiStore } from './state/ui'

// Keep startup light on mobile: feature-heavy screens (camera, AI settings and
// analytics) are downloaded only when opened, then cached by the service worker.
const MedsPage = lazy(() => import('./pages/MedsPage').then((module) => ({ default: module.MedsPage })))
const ScanPage = lazy(() => import('./pages/ScanPage').then((module) => ({ default: module.ScanPage })))
const PillIdPage = lazy(() => import('./pages/PillIdPage').then((module) => ({ default: module.PillIdPage })))
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((module) => ({ default: module.InsightsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
})

export default function App() {
  const hydrated = useBootstrap()
  const settings = useUiStore((s) => s.settings)
  const locked = useUiStore((s) => s.locked)
  const setLocked = useUiStore((s) => s.setLocked)
  const [onboarded, setOnboarded] = useState(false)

  /* scheduler lifecycle */
  useEffect(() => {
    if (!hydrated) return
    void isLocked().then(setLocked)
    const unsubDue = onDueDoses((due) => useUiStore.getState().pushDue(due))
    const stop = startScheduler(() => useUiStore.getState().settings)
    // also tick when the tab becomes visible again (missed doses while away)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.dispatchEvent(new CustomEvent('medimind:tick'))
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      unsubDue()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [hydrated, setLocked])

  useEffect(() => {
    if (hydrated) setOnboarded(settings.onboardingDone)
  }, [hydrated, settings.onboardingDone])

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 animate-pop items-center justify-center rounded-[20px] bg-gradient-to-br from-brand-400 to-accent-600 text-2xl shadow-xl">
            💊
          </div>
          <p className="text-sm font-semibold text-slate-400">Opening your medicine cabinet…</p>
        </div>
      </div>
    )
  }

  if (!onboarded) {
    return (
      <>
        <div className="app-bg" />
        <Onboarding done={() => setOnboarded(true)} />
      </>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-bg" />
      {locked && <LockScreen />}
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="meds" element={<LazyPage><MedsPage /></LazyPage>} />
            <Route path="scan" element={<LazyPage><ScanPage /></LazyPage>} />
            <Route path="pill-id" element={<LazyPage><PillIdPage /></LazyPage>} />
            <Route path="insights" element={<LazyPage><InsightsPage /></LazyPage>} />
            <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <DueStack />
    </QueryClientProvider>
  )
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

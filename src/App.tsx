import { useEffect, useState } from 'react'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/layout'
import { DueStack } from './components/dose'
import { LockScreen } from './components/LockScreen'
import { Onboarding } from './pages/Onboarding'
import { onDueDoses, startScheduler } from './lib/scheduler'
import { isLocked } from './lib/crypto'
import { useBootstrap } from './state/hooks'
import { useUiStore } from './state/ui'

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
        <AppShell />
      </HashRouter>
      <DueStack />
    </QueryClientProvider>
  )
}

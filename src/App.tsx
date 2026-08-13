import { useEffect, useState } from 'react'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/layout'
import { DueStack } from './components/dose'
import { LockScreen } from './components/LockScreen'
import { Onboarding } from './pages/Onboarding'
import { markTaken, onDueDoses, snooze, startScheduler } from './lib/scheduler'
import { drainPendingNotificationActions } from './lib/notifications'
import { isLocked } from './lib/crypto'
import { useBootstrap } from './state/hooks'
import { useUiStore } from './state/ui'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
})

function dismissBootSplash(): void {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.classList.add('boot-out')
  window.setTimeout(() => boot.remove(), 450)
}

export default function App() {
  const hydrated = useBootstrap()
  const settings = useUiStore((s) => s.settings)
  const locked = useUiStore((s) => s.locked)
  const showLockScreen = useUiStore((s) => s.showLockScreen)
  const setLocked = useUiStore((s) => s.setLocked)
  const [onboarded, setOnboarded] = useState(false)

  useEffect(() => {
    if (hydrated) dismissBootSplash()
  }, [hydrated])

  /* scheduler lifecycle */
  useEffect(() => {
    if (!hydrated) return
    void isLocked().then(setLocked)
    const unsubDue = onDueDoses((due) => useUiStore.getState().pushDue(due))
    const stop = startScheduler(() => useUiStore.getState().settings)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.dispatchEvent(new CustomEvent('medimind:tick'))
      }
    }
    document.addEventListener('visibilitychange', onVis)

    const applyAction = async (action: string, logId?: string) => {
      if (!logId) return
      if (action === 'taken') {
        await markTaken(logId)
        useUiStore.getState().dismissDue(logId)
        useUiStore.getState().showToast('Marked as taken from the notification', 'success')
      } else if (action === 'snooze') {
        await snooze(logId, 15)
        useUiStore.getState().dismissDue(logId)
        useUiStore.getState().showToast('Snoozed 15 minutes', 'info')
      }
      document.dispatchEvent(new CustomEvent('medimind:tick'))
    }

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string; logId?: string } | undefined
      if (data?.type === 'DOSE_ACTION') void applyAction(data.action ?? 'open', data.logId)
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)

    void drainPendingNotificationActions().then((pending) => {
      for (const p of pending) void applyAction(p.action, p.logId)
    })

    const hash = window.location.hash
    const q = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?'))) : null
    if (q?.get('act') && q.get('log')) {
      void applyAction(q.get('act')!, q.get('log')!)
      window.location.hash = '#/'
    }

    return () => {
      stop()
      unsubDue()
      document.removeEventListener('visibilitychange', onVis)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [hydrated, setLocked])

  useEffect(() => {
    if (hydrated) setOnboarded(settings.onboardingDone)
  }, [hydrated, settings.onboardingDone])

  /* Native + HTML #boot splash covers first paint. Stay empty until IndexedDB is ready
     so we don't flash a second, larger logo. */
  if (!hydrated) return null

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

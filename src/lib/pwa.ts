export type InstallStatus = 'installed' | 'ready' | 'ios' | 'manual' | 'unavailable'
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let installPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS may identify itself as macOS when "Request Desktop Website" is on.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

export function getInstallStatus(): InstallStatus {
  if (typeof window === 'undefined') return 'unavailable'
  if (isStandalone()) return 'installed'
  if (installPrompt) return 'ready'
  if (isIos()) return 'ios'

  // Chromium may dispatch beforeinstallprompt a moment after first render. Until
  // then, offer browser-menu instructions rather than hiding installation.
  if (window.isSecureContext && 'serviceWorker' in navigator) return 'manual'
  return 'unavailable'
}

export function subscribeToInstallStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function promptAppInstall(): Promise<InstallOutcome> {
  if (!installPrompt) return 'unavailable'
  const prompt = installPrompt
  await prompt.prompt()
  const choice = await prompt.userChoice
  installPrompt = null
  emitChange()
  return choice.outcome
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
    emitChange()
  })

  window.addEventListener('appinstalled', () => {
    installPrompt = null
    emitChange()
  })

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', emitChange)
}

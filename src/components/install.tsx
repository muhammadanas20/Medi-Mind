import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { CheckCircle2, Download, MoreVertical, Share2, Smartphone, X } from 'lucide-react'
import { getInstallStatus, isIos, promptAppInstall, subscribeToInstallStatus } from '../lib/pwa'
import { useUiStore } from '../state/ui'
import { Badge, Button, Card, Dialog, SectionTitle } from './ui'

function useInstallStatus() {
  return useSyncExternalStore(subscribeToInstallStatus, getInstallStatus, () => 'unavailable')
}

function useInstallAction(openHelp: () => void) {
  const status = useInstallStatus()
  const showToast = useUiStore((state) => state.showToast)

  const install = async () => {
    if (status !== 'ready') {
      openHelp()
      return
    }
    const outcome = await promptAppInstall()
    if (outcome === 'accepted') {
      showToast('MediMind is being added to your home screen', 'success')
    } else if (outcome === 'dismissed') {
      showToast('Installation cancelled — you can try again in Settings')
    }
  }

  return { status, install }
}

export function InstallAppBanner() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('medimind.install-banner-dismissed') === '1'
    } catch {
      return false
    }
  })
  const { status, install } = useInstallAction(() => setHelpOpen(true))

  if (status === 'installed' || status === 'unavailable' || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem('medimind.install-banner-dismissed', '1')
    } catch {
      // Storage can be unavailable in private browsing; dismiss for this render.
    }
  }

  return (
    <>
      <div className="mb-5 overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-r from-brand-500/12 to-accent-500/10 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 text-white shadow-lg shadow-brand-500/20">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Use MediMind like a mobile app</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Add it to your home screen for a fast, standalone, offline experience.
            </p>
          </div>
          <Button size="iconsm" variant="ghost" aria-label="Dismiss install message" onClick={dismiss}>
            <X />
          </Button>
        </div>
        <Button className="mt-3 w-full sm:ml-14 sm:w-auto" size="sm" onClick={() => void install()}>
          <Download /> {status === 'ready' ? 'Install app' : 'How to install'}
        </Button>
      </div>
      <InstallHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}

export function InstallAppSection() {
  const [helpOpen, setHelpOpen] = useState(false)
  const { status, install } = useInstallAction(() => setHelpOpen(true))

  return (
    <>
      <Card className="border-brand-500/20 !bg-brand-500/[0.045]">
        <SectionTitle
          right={
            status === 'installed' ? (
              <Badge tone="success"><CheckCircle2 className="size-3" /> Installed</Badge>
            ) : (
              <Badge tone="brand">Mobile app</Badge>
            )
          }
        >
          <span className="inline-flex items-center gap-2"><Smartphone className="size-5" /> Install MediMind</span>
        </SectionTitle>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {status === 'installed' ? 'MediMind is running as an installed app' : 'Put MediMind on your home screen'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {status === 'installed'
                ? 'It opens without browser controls and keeps the app shell available offline.'
                : 'Get an app icon, standalone display without browser controls, quicker launches, and offline access. Your data stays on this device.'}
            </p>
          </div>
          {status !== 'installed' && status !== 'unavailable' && (
            <Button className="shrink-0" onClick={() => void install()} data-testid="install-app">
              <Download /> {status === 'ready' ? 'Install app' : 'Show install steps'}
            </Button>
          )}
        </div>
      </Card>
      <InstallHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}

function InstallHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ios = isIos()

  return (
    <Dialog open={open} onClose={onClose} title="Install MediMind on your phone">
      <div className="space-y-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 text-white shadow-lg shadow-brand-500/25">
          <Smartphone className="size-7" />
        </div>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {ios
            ? 'Apple installs web apps from Safari. Once added, MediMind opens from your home screen without Safari controls.'
            : 'Use your browser menu to add MediMind. It will then open from your home screen as a standalone app.'}
        </p>
        <ol className="space-y-3">
          {ios ? (
            <>
              <InstallStep number="1" icon={<Share2 />} text="Open this page in Safari, then tap the Share button." />
              <InstallStep number="2" text="Scroll down and tap “Add to Home Screen”." />
              <InstallStep number="3" text="Tap “Add” in the top-right corner." />
            </>
          ) : (
            <>
              <InstallStep number="1" icon={<MoreVertical />} text="Open the browser menu in the top-right corner." />
              <InstallStep number="2" text="Tap “Install app” or “Add to Home screen”." />
              <InstallStep number="3" text="Confirm Install, then launch MediMind from its new icon." />
            </>
          )}
        </ol>
        <div className="rounded-2xl bg-brand-500/10 p-3 text-xs leading-relaxed text-brand-800 dark:text-brand-200">
          The installed app is the same private, offline-capable MediMind. No app-store download or account is required.
        </div>
        <Button className="w-full" variant="outline" onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  )
}

function InstallStep({ number, icon, text }: { number: string; icon?: ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-300/60 p-3 dark:border-white/10">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-sm font-extrabold text-brand-700 dark:text-brand-300">
        {icon ? <span className="[&_svg]:size-4">{icon}</span> : number}
      </span>
      <span className="text-sm font-medium">{text}</span>
    </li>
  )
}

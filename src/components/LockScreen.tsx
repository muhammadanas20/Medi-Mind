import { motion } from 'framer-motion'
import { LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, Input } from './ui'
import { unlockWithPasscode } from '../lib/crypto'
import { useUiStore } from '../state/ui'

export function LockScreen() {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const setLocked = useUiStore((s) => s.setLocked)
  const setShowLockScreen = useUiStore((s) => s.setShowLockScreen)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const unlock = async () => {
    setBusy(true)
    const ok = await unlockWithPasscode(passcode)
    setBusy(false)
    if (ok) {
      setLocked(false)
      setPasscode('')
    } else {
      setError(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-title"
      >
        <Card className="space-y-5 !p-6 text-center sm:!p-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-400 to-accent-600 text-white shadow-lg">
            <LockKeyhole className="size-7" />
          </div>
          <div>
            <h2 id="lock-title" className="text-xl font-extrabold tracking-tight">MediMind is locked</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter your passcode to decrypt your AI keys.
            </p>
          </div>
          <Input
            type="password"
            autoFocus
            value={passcode}
            placeholder="Passcode"
            className={error ? '!border-danger-500' : ''}
            onChange={(e) => {
              setPasscode(e.target.value)
              setError(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && void unlock()}
            data-testid="unlock-passcode"
          />
          {error && <p className="text-sm font-semibold text-danger-500">Wrong passcode — try again</p>}
          <Button className="w-full" size="lg" disabled={busy || !passcode} onClick={() => void unlock()} data-testid="unlock-btn">
            Unlock
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setShowLockScreen(false)}>
            Continue without AI
          </Button>
          <p className="text-[11px] text-slate-400">
            Your medication schedule and history remain fully readable — only AI features need the key.
          </p>
        </Card>
      </motion.div>
    </div>
  )
}

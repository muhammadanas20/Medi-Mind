import { motion } from 'framer-motion'
import { LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Input } from './ui'
import { unlockWithPasscode } from '../lib/crypto'
import { useUiStore } from '../state/ui'

export function LockScreen() {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const setLocked = useUiStore((s) => s.setLocked)

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
    <div className="flex min-h-dvh justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="m-auto w-full max-w-sm">
        <Card className="space-y-5 !p-6 text-center sm:!p-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-400 to-accent-600 text-white shadow-lg">
            <LockKeyhole className="size-7" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">MediMind is locked</h2>
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
          <p className="text-[11px] text-slate-400">
            Your medication schedule and history remain fully readable — only AI features need the key.
          </p>
        </Card>
      </motion.div>
    </div>
  )
}

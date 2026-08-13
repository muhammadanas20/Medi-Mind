import { create } from 'zustand'
import type { AppSettings } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/db'
import type { DoseInstance } from '../lib/reminders'

export type ToastKind = 'info' | 'success' | 'error'

/** How long a toast stays on screen — mirrored by the toast's progress bar. */
export const TOAST_DURATION_MS = 4000

interface UiState {
  hydrated: boolean
  settings: AppSettings
  setSettings: (s: AppSettings) => void

  activeProfileId: string | null
  setActiveProfileId: (id: string | null) => void

  /** Live due-dose cards pushed by the scheduler (in-app notification center) */
  dueQueue: DoseInstance[]
  pushDue: (items: DoseInstance[]) => void
  dismissDue: (logId: string) => void
  clearDue: () => void

  locked: boolean
  setLocked: (v: boolean) => void
  showLockScreen: boolean
  setShowLockScreen: (v: boolean) => void

  toast: { id: number; title?: string; message: string; kind: ToastKind } | null
  showToast: (message: string, kind?: ToastKind, title?: string) => void
  dismissToast: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = create<UiState>((set) => ({
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => {
    set({ settings })
    applyTheme(settings)
  },

  activeProfileId: null,
  setActiveProfileId: (activeProfileId) => set({ activeProfileId }),

  dueQueue: [],
  pushDue: (items) =>
    set((s) => {
      const seen = new Set(s.dueQueue.map((d) => d.logId))
      const fresh = items.filter((d) => !seen.has(d.logId))
      return { dueQueue: [...s.dueQueue, ...fresh].slice(-5) }
    }),
  dismissDue: (logId) =>
    set((s) => ({ dueQueue: s.dueQueue.filter((d) => d.logId !== logId) })),
  clearDue: () => set({ dueQueue: [] }),

  locked: false,
  showLockScreen: false,
  setShowLockScreen: (showLockScreen) => set({ showLockScreen }),
  setLocked: (locked) => set({ locked, showLockScreen: locked }),

  toast: null,
  showToast: (message, kind = 'info', title) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { id: Date.now(), title, message, kind } })
    toastTimer = setTimeout(() => set({ toast: null }), TOAST_DURATION_MS)
  },
  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: null })
  },
}))

export function applyTheme(settings: AppSettings): void {
  const root = document.documentElement
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  root.classList.toggle('boot-light', !dark)
  root.classList.toggle('text-lg-mode', settings.largeText)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0b0f14' : '#0d9488')
  try {
    localStorage.setItem('medimind.theme', settings.theme)
  } catch {
    // private mode / blocked storage — first paint may flash, runtime theme still works
  }
}

import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback renderer; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render/runtime errors in the routed tree (including lazy chunk-load
 * failures and unexpected exceptions) so a single broken view can never blank
 * the entire app. Shows a recoverable screen with a retry/reload action.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure for debugging without taking the app down.
    console.error('MediMind crashed:', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-3xl p-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-500/15 text-danger-500">
            <TriangleAlert className="size-7" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Something went wrong</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            This screen hit an unexpected error. Your data is safe on this device. Try again —
            if it keeps happening, reload the app.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-3 max-h-40 overflow-auto rounded-2xl bg-black/5 p-3 text-left text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {error.message}
            </pre>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={this.reset}
              className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl border border-slate-300/80 px-5 py-3 text-sm font-semibold dark:border-white/15"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}

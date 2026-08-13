import { Camera, FolderOpen, ImagePlus, RefreshCw, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui'

/**
 * Camera capture with two *separate* photo sources:
 *
 *  1. Live getUserMedia viewfinder ("Open camera")
 *  2. File-manager / photo-library picker ("Choose from files")
 *
 * Mobile notes:
 *  - The gallery <input> must NOT have a `capture` attribute.
 *    `capture="environment"` tells iOS/Android to skip the file manager and
 *    jump straight into the camera — which is exactly what "Upload photo"
 *    must not do.
 *  - The live stream is attached to the <video> inside an effect, once the
 *    element actually exists. Attaching it synchronously in the click handler
 *    ran *before* React mounted the <video> (the element only renders after
 *    `setMode('live')`), so the viewfinder stayed black on phones even after
 *    the permission prompt.
 *  - Constraint sets are tried in order of preference so phones that reject
 *    `facingMode` + explicit resolution (older Safari/Chrome) still open the
 *    back camera instead of showing "no camera".
 *  - The viewfinder fills most of the screen on phones and the whole frame is
 *    tappable, so "tap anywhere" captures a photo — not just a small button.
 */

const GALLERY_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif'

const CAMERA_ATTEMPTS: MediaStreamConstraints[] = [
  {
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  },
  { video: { facingMode: 'environment' }, audio: false },
  { video: { facingMode: { ideal: 'environment' } }, audio: false },
  { video: true, audio: false },
]

export function CameraCapture({
  onCapture,
  overlayHint,
  overlayClass,
}: {
  onCapture: (blob: Blob) => void
  overlayHint?: string
  /** extra content rendered above viewfinder controls (slot) */
  overlayClass?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const nativeCameraRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'idle' | 'live' | 'error'>('idle')
  const [error, setError] = useState<string>('')

  const stopStream = useCallback((stream?: MediaStream | null) => {
    if (!stream) return
    stream.getTracks().forEach((t) => t.stop())
    if (stream === streamRef.current) streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    stopStream(streamRef.current)
    setMode('idle')
  }, [stopStream])

  /** Open the back camera, falling back to looser constraints until one works. */
  const start = useCallback(async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser — choose a photo from your files instead.')
      setMode('error')
      return
    }
    let stream: MediaStream | null = null
    let firstError: unknown = null
    for (const constraints of CAMERA_ATTEMPTS) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        break
      } catch (e) {
        firstError ??= e
      }
    }
    if (!stream) {
      setError(
        firstError instanceof DOMException && firstError.name === 'NotAllowedError'
          ? 'Camera permission denied — allow camera access or choose a photo from your files instead.'
          : 'No camera available — choose a photo from your files instead.',
      )
      setMode('error')
      return
    }
    // Replace any stream already running (the "restart camera" action).
    stopStream(streamRef.current)
    streamRef.current = stream
    setMode('live')
  }, [stopStream])

  // Attach the stream to the <video> only once the element is actually
  // mounted — otherwise the preview stays black (the bug that made the camera
  // "not open" on phones). The effect re-runs on every entry into 'live'.
  useEffect(() => {
    if (mode !== 'live') return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => {
      /* autoplay can be blocked in odd embedded contexts; the shutter still works */
    })
  }, [mode])

  useEffect(() => stop, [stop])

  const snap = useCallback(async () => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (!video.videoWidth || !video.videoHeight) return // stream not ready yet
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (blob) {
      stop()
      onCapture(blob)
    }
  }, [onCapture, stop])

  const pickFile = (file?: File | null) => {
    if (file) onCapture(file)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    pickFile(e.target.files?.[0])
    // allow picking the same file twice in a row
    e.target.value = ''
  }

  return (
    <div className={cn('relative overflow-hidden rounded-3xl', overlayClass)}>
      {/* Gallery / file-manager picker — NO capture attribute */}
      <input
        ref={galleryRef}
        type="file"
        accept={GALLERY_ACCEPT}
        className="hidden"
        data-testid="gallery-file-input"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />
      {/* Native camera fallback only — used when live preview is unavailable */}
      <input
        ref={nativeCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="native-camera-input"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />

      {mode === 'live' ? (
        <div className="relative">
          {/* Tall phone-friendly viewfinder; 4:3 on larger screens. Tapping the
              whole frame captures — the small shutter button is a convenience,
              not the only tap target. */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            onClick={() => void snap()}
            data-testid="camera-preview"
            className="h-[62dvh] w-full cursor-pointer rounded-3xl bg-black object-cover sm:h-auto sm:aspect-[4/3]"
          />
          <div className="scan-corners pointer-events-none absolute inset-5 sm:inset-6">
            <span className="c" />
            {overlayHint && (
              <p className="absolute inset-x-0 top-4 px-8 text-center text-xs font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                {overlayHint}
              </p>
            )}
            <p className="absolute inset-x-0 bottom-24 text-center text-[11px] font-medium text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
              Tap the viewfinder to capture
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
            <Button variant="glass" size="icon" onClick={stop} aria-label="Close camera">
              <X />
            </Button>
            <button
              onClick={() => void snap()}
              aria-label="Capture photo"
              data-testid="capture-photo"
              className="size-[4.25rem] cursor-pointer rounded-full border-4 border-white/90 bg-white/25 shadow-xl backdrop-blur transition-transform hover:scale-105 active:scale-95"
            />
            <Button variant="glass" size="icon" onClick={() => void start()} aria-label="Restart camera">
              <RefreshCw />
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => void start()}
          className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-300/70 bg-white/40 p-6 text-center transition-colors hover:border-brand-500/50 active:border-brand-500 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Camera className="size-8" />
          </div>
          {mode === 'error' && <p className="max-w-72 text-sm text-warn-500">{error}</p>}
          <p className="max-w-72 text-sm text-slate-500 dark:text-slate-400">
            {overlayHint ?? 'Point the camera at the document — good light works best.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={(e) => { e.stopPropagation(); void start() }} data-testid="open-camera">
              <Camera /> Open camera
            </Button>
            <Button
              variant="outline"
              onClick={(e) => { e.stopPropagation(); galleryRef.current?.click() }}
              data-testid="upload-photo"
            >
              <FolderOpen /> Choose from files
            </Button>
          </div>
          <p className="max-w-80 text-[11px] leading-relaxed text-slate-400">
            <ImagePlus className="mr-1 inline size-3" />
            “Choose from files” opens your gallery or file manager — it will not launch the camera.
          </p>
          {mode === 'error' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); nativeCameraRef.current?.click() }}
              data-testid="native-camera-fallback"
            >
              <Smartphone /> Use phone camera instead
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

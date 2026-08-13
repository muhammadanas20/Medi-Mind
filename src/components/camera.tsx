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
 * IMPORTANT mobile fix: the gallery <input> must NOT have a `capture`
 * attribute. `capture="environment"` tells iOS/Android to skip the file
 * manager and jump straight into the camera — which is exactly what
 * "Upload photo" must not do.
 *
 * A third, native-camera file input (WITH capture) is only offered as a
 * fallback when getUserMedia is unavailable / denied.
 */

const GALLERY_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif'

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

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setMode('idle')
  }, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setMode('live')
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera permission denied — choose a photo from your files instead.'
        : 'No camera available — choose a photo from your files instead.')
      setMode('error')
    }
  }, [])

  useEffect(() => stop, [stop])

  const snap = async () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (blob) {
      stop()
      onCapture(blob)
    }
  }

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
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full rounded-3xl bg-black object-cover" />
          <div className="scan-corners pointer-events-none absolute inset-6">
            <span className="c" />
            {overlayHint && (
              <p className="absolute inset-x-0 top-4 text-center text-xs font-semibold text-white/90 drop-shadow">
                {overlayHint}
              </p>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
            <Button variant="glass" size="icon" onClick={stop} aria-label="Close camera">
              <X />
            </Button>
            <button
              onClick={() => void snap()}
              aria-label="Capture photo"
              data-testid="capture-photo"
              className="size-16 cursor-pointer rounded-full border-4 border-white/90 bg-white/25 shadow-xl backdrop-blur transition-transform hover:scale-105 active:scale-95"
            />
            <Button variant="glass" size="icon" onClick={() => void start()} aria-label="Restart camera">
              <RefreshCw />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-300/70 bg-white/40 p-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Camera className="size-8" />
          </div>
          {mode === 'error' && <p className="max-w-72 text-sm text-warn-500">{error}</p>}
          <p className="max-w-72 text-sm text-slate-500 dark:text-slate-400">
            {overlayHint ?? 'Point the camera at the document — good light works best.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => void start()} data-testid="open-camera">
              <Camera /> Open camera
            </Button>
            <Button
              variant="outline"
              onClick={() => galleryRef.current?.click()}
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
              onClick={() => nativeCameraRef.current?.click()}
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

/** Image helpers: camera-downscale, canvas preprocessing, color sampling. */

export interface PreparedImage {
  blob: Blob
  base64: string // no data: prefix
  mimeType: string
  width: number
  height: number
}

/** Downscale a photo for AI upload (keeps tokens + latency small). */
export async function prepareForAI(file: Blob, maxSide = 1600): Promise<PreparedImage> {
  const { canvas, ctx, width, height } = await drawToCanvas(file, maxSide)
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85),
  )
  void ctx
  return { blob, base64: await blobToBase64(blob), mimeType: 'image/jpeg', width, height }
}

/** Contrast-boosted grayscale variant that makes OCR noticeably better. */
export async function prepareForOCR(file: Blob, maxSide = 2000): Promise<PreparedImage> {
  const { canvas, ctx, width, height } = await drawToCanvas(file, maxSide)
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = g > 140 ? Math.min(255, g * 1.18) : g * 0.82
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'),
  )
  return { blob, base64: await blobToBase64(blob), mimeType: 'image/png', width, height }
}

async function drawToCanvas(file: Blob, maxSide: number) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { canvas, ctx, width, height }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

export function blobToObjectUrl(blob?: Blob): string | undefined {
  return blob ? URL.createObjectURL(blob) : undefined
}

/* ------------------------- dominant color sampling ------------------------ */

export interface SampledColor {
  hex: string
  /** nearest named pill color word */
  name: string
  r: number
  g: number
  b: number
}

const NAMED_COLORS: [string, [number, number, number]][] = [
  ['white', [245, 245, 240]], ['cream', [240, 224, 190]], ['yellow', [245, 220, 90]],
  ['orange', [240, 150, 60]], ['pink', [240, 170, 190]], ['red', [200, 60, 60]],
  ['blue', [90, 140, 220]], ['green', [90, 180, 120]], ['brown', [150, 105, 70]],
  ['gray', [160, 160, 165]],
]

/** Sample the dominant non-background pill color from the image center region. */
export async function sampleDominantColor(file: Blob): Promise<SampledColor> {
  const { ctx, width, height } = await drawToCanvas(file, 256)
  // center 60% box — pills photographed against backgrounds
  const x0 = Math.floor(width * 0.2)
  const y0 = Math.floor(height * 0.2)
  const w = Math.floor(width * 0.6)
  const h = Math.floor(height * 0.6)
  const { data } = ctx.getImageData(x0, y0, w, h)
  let rSum = 0, gSum = 0, bSum = 0, n = 0
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    // skip very dark / background-ish pixels
    if (r + g + b < 90) continue
    rSum += r; gSum += g; bSum += b; n++
  }
  if (n === 0) return { hex: '#cccccc', name: 'other', r: 204, g: 204, b: 204 }
  const r = Math.round(rSum / n), g = Math.round(gSum / n), b = Math.round(bSum / n)
  let best = 'other'
  let bestDist = Infinity
  for (const [name, [nr, ng, nb]] of NAMED_COLORS) {
    const dist = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2
    if (dist < bestDist) { bestDist = dist; best = name }
  }
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  return { hex, name: best, r, g, b }
}

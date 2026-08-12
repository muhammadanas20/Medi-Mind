import type { Worker } from 'tesseract.js'

/**
 * Lazy Tesseract.js OCR — the package, worker and English language data all
 * load on first use (~a few MB, then cached by the service worker → works
 * offline). Keeping it out of the initial bundle keeps app startup fast.
 */

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then((m) => m.createWorker('eng'))
  }
  return workerPromise
}

export interface OcrProgress {
  status: string
  progress: number // 0..1
}

export async function runOCR(image: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  onProgress?.({ status: 'Loading OCR engine…', progress: 0.05 })
  const worker = await getWorker()
  onProgress?.({ status: 'Reading text…', progress: 0.25 })
  const { data } = await worker.recognize(image, {}, {
    text: true,
  } as never)
  onProgress?.({ status: 'Done', progress: 1 })
  return data.text.trim()
}

/** Extract imprint-like tokens (letters+digits, short runs) from OCR text. */
export function extractImprintCandidates(ocrText: string): string {
  const tokens = ocrText
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 1 && t.length <= 8 && /[A-Z0-9]/.test(t))
  return [...new Set(tokens)].slice(0, 12).join(' ')
}

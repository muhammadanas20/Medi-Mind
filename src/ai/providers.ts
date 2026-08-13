import type { AiProviderConfig, AiProviderKind } from '../lib/types'

/**
 * Lightweight fetch-based AI clients (no vendor SDKs → small bundle, works in
 * the browser for all providers incl. local Ollama / LM Studio).
 *
 * Contract: every provider implements `visionJson` — send an image + prompt,
 * get raw text back (expected to be JSON). The caller validates it.
 */

export interface ProviderPreset {
  kind: AiProviderKind
  label: string
  baseUrl: string
  defaultModel: string
  needsKey: boolean
  keyHint?: string
  local?: boolean
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { kind: 'openai',     label: 'OpenAI',           baseUrl: 'https://api.openai.com/v1',                 defaultModel: 'gpt-4o-mini',                          needsKey: true,  keyHint: 'sk-...' },
  { kind: 'gemini',     label: 'Google Gemini',    baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash',                     needsKey: true,  keyHint: 'AIza...' },
  { kind: 'anthropic',  label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com',                 defaultModel: 'claude-sonnet-4-5',                    needsKey: true,  keyHint: 'sk-ant-...' },
  { kind: 'openrouter', label: 'OpenRouter',       baseUrl: 'https://openrouter.ai/api/v1',              defaultModel: 'openai/gpt-4o-mini',                   needsKey: true,  keyHint: 'sk-or-...' },
  { kind: 'groq',       label: 'Groq',             baseUrl: 'https://api.groq.com/openai/v1',            defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct', needsKey: true, keyHint: 'gsk_...' },
  { kind: 'ollama',     label: 'Ollama (local)',   baseUrl: 'http://localhost:11434/v1',                 defaultModel: 'llama3.2-vision',                      needsKey: false, local: true },
  { kind: 'lmstudio',   label: 'LM Studio (local)',baseUrl: 'http://localhost:1234/v1',                  defaultModel: 'local-model',                          needsKey: false, local: true },
]

export interface VisionRequest {
  prompt: string
  imageBase64: string // no data: prefix
  mimeType: string
  maxTokens?: number
}

const OPENAI_COMPAT: AiProviderKind[] = ['openai', 'openrouter', 'groq', 'ollama', 'lmstudio']

export async function visionGenerate(
  cfg: AiProviderConfig,
  apiKey: string,
  req: VisionRequest,
): Promise<string> {
  if (OPENAI_COMPAT.includes(cfg.kind)) return openaiCompatVision(cfg, apiKey, req)
  if (cfg.kind === 'gemini') return geminiVision(cfg, apiKey, req)
  if (cfg.kind === 'anthropic') return anthropicVision(cfg, apiKey, req)
  throw new Error(`Unknown provider kind: ${cfg.kind}`)
}

/** Simple text-only round-trip used by "Test connection". */
export async function testConnection(cfg: AiProviderConfig, apiKey: string): Promise<string> {
  const probe = 'Reply with the single word: ready'
  if (OPENAI_COMPAT.includes(cfg.kind)) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: openaiHeaders(cfg, apiKey),
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: probe }],
        max_tokens: 8,
        temperature: 0,
      }),
    })
    if (!res.ok) throw new Error(await errText(res))
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? 'ok'
  }
  // Gemini / Anthropic: reuse the vision path with a tiny 1x1 png
  const px =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  return visionGenerate(cfg, apiKey, {
    prompt: `${probe}\n(ignore the image)`,
    imageBase64: px,
    mimeType: 'image/png',
    maxTokens: 16,
  })
}

/* ------------------------------ OpenAI-style ----------------------------- */

function openaiHeaders(cfg: AiProviderConfig, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) h.Authorization = `Bearer ${apiKey}`
  if (cfg.kind === 'openrouter') {
    h['HTTP-Referer'] = location.origin
    h['X-Title'] = 'MediMind'
  }
  return h
}

async function openaiCompatVision(
  cfg: AiProviderConfig,
  apiKey: string,
  req: VisionRequest,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    temperature: 0,
    max_tokens: req.maxTokens ?? 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: req.prompt },
          {
            type: 'image_url',
            image_url: { url: `data:${req.mimeType};base64,${req.imageBase64}` },
          },
        ],
      },
    ],
  }
  // response_format is unsupported by some compat servers — try, then fall back
  let res = await post(`${cfg.baseUrl}/chat/completions`, openaiHeaders(cfg, apiKey), {
    ...body,
    response_format: { type: 'json_object' },
  })
  if (!res.ok && res.status === 400) {
    res = await post(`${cfg.baseUrl}/chat/completions`, openaiHeaders(cfg, apiKey), body)
  }
  if (!res.ok) throw new Error(await errText(res))
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string') throw new Error('Empty response from model')
  return text
}

/* -------------------------------- Gemini -------------------------------- */

async function geminiVision(
  cfg: AiProviderConfig,
  apiKey: string,
  req: VisionRequest,
): Promise<string> {
  const url = `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await post(url, { 'Content-Type': 'application/json' }, {
    contents: [
      {
        parts: [
          { text: req.prompt },
          { inline_data: { mime_type: req.mimeType, data: req.imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: req.maxTokens ?? 4096,
      responseMimeType: 'application/json',
    },
  })
  if (!res.ok) throw new Error(await errText(res))
  const data = await res.json()
  const text: string | undefined = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
  if (!text) throw new Error(data.promptFeedback?.blockReason ?? 'Empty response from Gemini')
  return text
}

/* ------------------------------- Anthropic ------------------------------- */

async function anthropicVision(
  cfg: AiProviderConfig,
  apiKey: string,
  req: VisionRequest,
): Promise<string> {
  const res = await post(
    `${cfg.baseUrl}/v1/messages`,
    {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    {
      model: cfg.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.mimeType, data: req.imageBase64 } },
            { type: 'text', text: req.prompt },
          ],
        },
      ],
    },
  )
  if (!res.ok) throw new Error(await errText(res))
  const data = await res.json()
  const text: string | undefined = data.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
  if (!text) throw new Error('Empty response from Claude')
  return text
}

/* -------------------------------- helpers -------------------------------- */

function post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function errText(res: Response): Promise<string> {
  let msg = `${res.status} ${res.statusText}`
  try {
    const data = await res.json()
    msg += ` — ${data?.error?.message ?? data?.error ?? JSON.stringify(data).slice(0, 300)}`
  } catch {
    /* ignore */
  }
  return msg
}

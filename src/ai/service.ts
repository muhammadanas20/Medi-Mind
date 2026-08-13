import { db, uid } from '../lib/db'
import { decryptSecret, encryptSecret } from '../lib/crypto'
import type { AiProviderConfig, AiProviderKind } from '../lib/types'
import { PROVIDER_PRESETS, testConnection, visionGenerate, type ProviderPreset } from './providers'
import {
  PILL_PROMPT,
  buildPrescriptionPrompt,
  buildVitalPrompt,
  parseExtraction,
  parseVitalExtraction,
  pillObservationSchema,
  extractJsonBlock,
  type PillObservation,
} from './extract'
import type { ExtractedPrescription, ExtractedVital, Profile } from '../lib/types'

/**
 * AI service — the ONLY module that talks to the network.
 * Keys are stored AES-encrypted in IndexedDB; decrypted just-in-time in memory.
 */

export function presetFor(kind: AiProviderKind): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.kind === kind)!
}

export async function listProviders(): Promise<AiProviderConfig[]> {
  return db.aiProviders.toArray()
}

export async function getActiveProvider(): Promise<AiProviderConfig | undefined> {
  const row = await db.kv.get('activeAiProviderId')
  const providers = await db.aiProviders.toArray()
  const id = row?.value as string | undefined
  return providers.find((p) => p.id === id && p.enabled) ?? providers.find((p) => p.enabled)
}

export async function upsertProvider(
  kind: AiProviderKind,
  opts: { label?: string; baseUrl?: string; model?: string; apiKey?: string },
): Promise<AiProviderConfig> {
  const preset = presetFor(kind)
  const existing = (await db.aiProviders.toArray()).find((p) => p.kind === kind)
  const encryptedKey =
    opts.apiKey != null && opts.apiKey !== ''
      ? await encryptSecret(opts.apiKey)
      : existing?.encryptedKey

  const cfg: AiProviderConfig = {
    id: existing?.id ?? uid(),
    kind,
    label: opts.label ?? preset.label,
    baseUrl: opts.baseUrl || existing?.baseUrl || preset.baseUrl,
    model: opts.model || existing?.model || preset.defaultModel,
    encryptedKey,
    enabled: true,
    lastTestAt: existing?.lastTestAt,
    lastTestOk: existing?.lastTestOk,
  }
  await db.aiProviders.put(cfg)
  await db.kv.put({ key: 'activeAiProviderId', value: cfg.id })
  return cfg
}

export async function removeProvider(id: string): Promise<void> {
  await db.aiProviders.delete(id)
  const row = await db.kv.get('activeAiProviderId')
  if (row?.value === id) await db.kv.delete('activeAiProviderId')
}

export async function setActiveProvider(id: string): Promise<void> {
  await db.kv.put({ key: 'activeAiProviderId', value: id })
}

async function keyFor(cfg: AiProviderConfig): Promise<string> {
  if (!cfg.encryptedKey) return ''
  try {
    return await decryptSecret(cfg.encryptedKey)
  } catch (e) {
    if (e instanceof Error && e.message === 'LOCKED') {
      throw new Error('App is locked — unlock with your passcode to use AI features')
    }
    throw e
  }
}

export async function testProvider(cfg: AiProviderConfig): Promise<string> {
  const key = await keyFor(cfg)
  const reply = await testConnection(cfg, key)
  await db.aiProviders.update(cfg.id, { lastTestAt: new Date().toISOString(), lastTestOk: true })
  return reply.trim().slice(0, 60)
}

/* ------------------------------ use cases ------------------------------- */

export interface ExtractionOutcome {
  extraction: ExtractedPrescription
  providerLabel: string
}

export async function extractPrescription(
  imageBase64: string,
  mimeType: string,
  profile?: Profile,
): Promise<ExtractionOutcome> {
  const provider = await getActiveProvider()
  if (!provider) {
    throw new Error('NO_PROVIDER')
  }
  const key = await keyFor(provider)
  const prompt = buildPrescriptionPrompt(profile)
  const raw = await visionGenerate(provider, key, {
    prompt,
    imageBase64,
    mimeType,
    maxTokens: 4096,
  })
  return { extraction: parseExtraction(raw), providerLabel: provider.label }
}

export async function observePill(
  imageBase64: string,
  mimeType: string,
): Promise<PillObservation & { providerLabel: string }> {
  const provider = await getActiveProvider()
  if (!provider) throw new Error('NO_PROVIDER')
  const key = await keyFor(provider)
  const raw = await visionGenerate(provider, key, {
    prompt: PILL_PROMPT,
    imageBase64,
    mimeType,
    maxTokens: 512,
  })
  const parsed = pillObservationSchema.safeParse(JSON.parse(extractJsonBlock(raw)))
  return { ...(parsed.success ? parsed.data : { imprint: '', color: '', shape: 'other' }), providerLabel: provider.label }
}

export interface VitalExtractionOutcome {
  extraction: ExtractedVital
  providerLabel: string
}

export async function extractVitalReading(
  imageBase64: string,
  mimeType: string,
  profile?: Profile,
): Promise<VitalExtractionOutcome> {
  const provider = await getActiveProvider()
  if (!provider) throw new Error('NO_PROVIDER')
  const key = await keyFor(provider)
  const prompt = buildVitalPrompt(profile)
  const raw = await visionGenerate(provider, key, {
    prompt,
    imageBase64,
    mimeType,
    maxTokens: 800,
  })
  return { extraction: parseVitalExtraction(raw), providerLabel: provider.label }
}

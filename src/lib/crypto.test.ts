import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Round-trip tests for AES-GCM helpers. Node 22 provides WebCrypto natively.
 * Dexie is stubbed via an in-memory map so we exercise the real crypto paths.
 */

const store = new Map<string, { key: string; value: unknown }>()

await import('./crypto') // ensure module evaluates (lazy db import happens later)

// Mock ./db AFTER import — vi.mock is hoisted and used by crypto.ts lazily.
import { vi } from 'vitest'

vi.mock('./db', () => ({
  db: {
    kv: {
      get: async (key: string) => store.get(key),
      put: async (row: { key: string; value: unknown }) => void store.set(row.key, row),
      delete: async (key: string) => void store.delete(key),
      bulkPut: async (rows: { key: string; value: unknown }[]) => rows.forEach((r) => store.set(r.key, r)),
      where: () => ({
        startsWith: (prefix: string) => ({
          toArray: async () => [...store.values()].filter((r) => r.key.startsWith(prefix)),
        }),
      }),
    },
  },
  getSettings: async () => ({ lockEnabled: store.get('__lock')?.value === true }),
  saveSettings: async (p: Record<string, unknown>) => {
    store.set('__lock', { key: '__lock', value: p.lockEnabled === true })
    return p
  },
}))

import {
  decryptSecret,
  derivePasscodeKey,
  disablePasscodeLock,
  enablePasscodeLock,
  encryptSecret,
  isLocked,
  unlockWithPasscode,
} from './crypto'

describe('AES-GCM secret storage', () => {
  beforeAll(() => store.clear())

  it('encrypts and decrypts with the device key (lock off)', async () => {
    const payload = await encryptSecret('sk-test-12345')
    expect(payload).not.toContain('sk-test-12345')
    expect(payload.split('.')).toHaveLength(2)
    expect(await decryptSecret(payload)).toBe('sk-test-12345')
  })

  it('derives deterministic passcode keys', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const a = await derivePasscodeKey('hunter2', salt)
    const b = await derivePasscodeKey('hunter2', salt)
    const pt = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, a, new TextEncoder().encode('x'))
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, b, pt)
    expect(new TextDecoder().decode(out)).toBe('x')
  })

  it('wrong passcode cannot unlock', async () => {
    await enablePasscodeLock('correct-horse')
    expect(await unlockWithPasscode('wrong-pass')).toBe(false)
    expect(await unlockWithPasscode('correct-horse')).toBe(true)
    expect(await isLocked()).toBe(false)
    await disablePasscodeLock('correct-horse')
    expect(await isLocked()).toBe(false)
  })
})

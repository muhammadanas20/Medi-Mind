/**
 * Local encryption for API keys.
 *
 * - AES-GCM 256 via WebCrypto.
 * - Default mode: a per-install random device key, generated on first use and
 *   stored apart from the ciphertext (kv table). Protects data at rest
 *   against casual inspection / backup leaks.
 * - Optional passcode mode: the wrapping key is derived (PBKDF2, 310k iters)
 *   from a user passcode and kept only in memory → keys unreadable without it.
 *
 * Nothing is ever sent anywhere except the AI provider the user configured.
 */

import { db, getSettings, saveSettings } from './db'

const te = new TextEncoder()
const td = new TextDecoder()

const DEVICE_KEY_ID = 'crypto.deviceKey'
const PASS_CHECK = 'crypto.passCheck' // ciphertext of a known plaintext
const KNOWN_PLAINTEXT = 'medimind:ok'

function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s)
}
function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function getDeviceKey(): Promise<CryptoKey> {
  const existing = await db.kv.get(DEVICE_KEY_ID)
  if (existing?.value) {
    return crypto.subtle.importKey('jwk', existing.value as JsonWebKey, { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  const jwk = await crypto.subtle.exportKey('jwk', key)
  await db.kv.put({ key: DEVICE_KEY_ID, value: jwk })
  return key
}

export async function derivePasscodeKey(
  passcode: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(passcode), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptWith(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(plaintext))
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(ct))}`
}

async function decryptWith(key: CryptoKey, payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split('.')
  if (!ivB64 || !ctB64) throw new Error('Malformed ciphertext')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) as BufferSource },
    key,
    b64ToBytes(ctB64) as BufferSource,
  )
  return td.decode(pt)
}

/* ------------------------ in-memory unlocked key ------------------------ */

let sessionKey: CryptoKey | null = null

/** The key currently usable for encrypt/decrypt of secrets. */
export async function activeKey(): Promise<CryptoKey> {
  const settings = await getSettings()
  if (settings.lockEnabled) {
    if (!sessionKey) throw new Error('LOCKED')
    return sessionKey
  }
  return getDeviceKey()
}

export function lockNow(): void {
  sessionKey = null
}

export async function isLocked(): Promise<boolean> {
  const s = await getSettings()
  return s.lockEnabled && !sessionKey
}

/** Enable passcode lock: re-encrypt every stored secret under the new key. */
export async function enablePasscodeLock(passcode: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const passKey = await derivePasscodeKey(passcode, salt)
  const deviceKey = await getDeviceKey()

  const secrets = await db.kv.where('key').startsWith('secret.').toArray()
  for (const row of secrets) {
    const plain = await decryptWith(deviceKey, String(row.value))
    row.value = await encryptWith(passKey, plain)
  }
  await db.kv.bulkPut(secrets)
  await db.kv.put({
    key: PASS_CHECK,
    value: { salt: bytesToB64(salt), check: await encryptWith(passKey, KNOWN_PLAINTEXT) },
  })
  sessionKey = passKey
  await saveSettings({ lockEnabled: true })
}

/** Verify a passcode and unlock the session. */
export async function unlockWithPasscode(passcode: string): Promise<boolean> {
  const row = await db.kv.get(PASS_CHECK)
  if (!row?.value) return false
  const { salt, check } = row.value as { salt: string; check: string }
  const key = await derivePasscodeKey(passcode, b64ToBytes(salt))
  try {
    const ok = await decryptWith(key, check)
    if (ok !== KNOWN_PLAINTEXT) return false
    sessionKey = key
    return true
  } catch {
    return false
  }
}

/** Disable passcode lock: re-encrypt secrets back under the device key. */
export async function disablePasscodeLock(passcode: string): Promise<boolean> {
  if (!(await unlockWithPasscode(passcode))) return false
  const passKey = sessionKey!
  const deviceKey = await getDeviceKey()
  const secrets = await db.kv.where('key').startsWith('secret.').toArray()
  for (const row of secrets) {
    const plain = await decryptWith(passKey, String(row.value))
    row.value = await encryptWith(deviceKey, plain)
  }
  await db.kv.bulkPut(secrets)
  await db.kv.delete(PASS_CHECK)
  sessionKey = null
  await saveSettings({ lockEnabled: false })
  return true
}

/* --------------------------- secret convenience ------------------------- */

export async function encryptSecret(plaintext: string): Promise<string> {
  return encryptWith(await activeKey(), plaintext)
}

export async function decryptSecret(payload: string): Promise<string> {
  return decryptWith(await activeKey(), payload)
}

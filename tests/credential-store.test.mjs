import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MAX_API_KEY_LENGTH, readStoredApiKey, saveStoredApiKey, storagePath } from '../desktop/credential-store.mjs'

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: value => value.toString('utf8').replace(/^encrypted:/, ''),
  }
}

test('MiniMax API key is encrypted at rest and round-trips locally', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-credential-'))
  const safeStorage = fakeSafeStorage()
  const apiKey = 'sk-minimax-test-secret'
  try {
    await saveStoredApiKey({ userDataPath, safeStorage }, apiKey)
    const encoded = await fs.readFile(storagePath(userDataPath), 'utf8')
    assert.doesNotMatch(encoded, /sk-minimax-test-secret/)
    assert.equal(await readStoredApiKey({ userDataPath, safeStorage }), apiKey)
    assert.deepEqual((await fs.readdir(userDataPath)).filter(name => name.endsWith('.tmp')), [])
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true })
  }
})

test('missing credential file is treated as not configured', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-credential-'))
  try {
    assert.equal(await readStoredApiKey({ userDataPath, safeStorage: fakeSafeStorage() }), null)
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true })
  }
})

test('credential storage fails closed when encrypted storage is unavailable', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-credential-'))
  const unavailable = { ...fakeSafeStorage(), isEncryptionAvailable: () => false }
  try {
    await assert.rejects(() => saveStoredApiKey({ userDataPath, safeStorage: unavailable }, 'secret'), /unavailable/i)
    await fs.writeFile(storagePath(userDataPath), 'ZW5jcnlwdGVkOnNlY3JldA==')
    await assert.rejects(() => readStoredApiKey({ userDataPath, safeStorage: unavailable }), /unavailable/i)
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true })
  }
})

test('credential storage rejects empty and overlong values', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-credential-'))
  try {
    await assert.rejects(() => saveStoredApiKey({ userDataPath, safeStorage: fakeSafeStorage() }, '   '), /required/i)
    await assert.rejects(() => saveStoredApiKey({ userDataPath, safeStorage: fakeSafeStorage() }, 'x'.repeat(MAX_API_KEY_LENGTH + 1)), /too long/i)
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true })
  }
})

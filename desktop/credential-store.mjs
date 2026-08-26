import fs from 'node:fs/promises'
import path from 'node:path'

const STORAGE_FILE = 'minimax-api-key.enc'
const MAX_API_KEY_LENGTH = 512

function validateApiKey(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('API key is required.')
  if (value.trim().length > MAX_API_KEY_LENGTH) throw new Error('API key is too long.')
  return value.trim()
}

function storagePath(userDataPath) {
  return path.join(userDataPath, STORAGE_FILE)
}

export async function readStoredApiKey({ userDataPath, safeStorage }) {
  const filePath = storagePath(userDataPath)
  try {
    const encoded = await fs.readFile(filePath, 'utf8')
    if (!encoded.trim()) return null
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Encrypted storage is unavailable.')
    return safeStorage.decryptString(Buffer.from(encoded.trim(), 'base64'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export async function saveStoredApiKey({ userDataPath, safeStorage }, value) {
  const apiKey = validateApiKey(value)
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encrypted storage is unavailable.')
  const encrypted = safeStorage.encryptString(apiKey).toString('base64')
  const filePath = storagePath(userDataPath)
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.mkdir(userDataPath, { recursive: true })
  try {
    await fs.writeFile(temporaryPath, encrypted, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temporaryPath, filePath)
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

export { MAX_API_KEY_LENGTH, STORAGE_FILE, storagePath }

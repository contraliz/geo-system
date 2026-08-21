import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { publisherDataDir } from './store.mjs'

const keyPath = path.join(publisherDataDir, 'session.key')
const vaultPath = path.join(publisherDataDir, 'sessions.enc')

async function getKey() {
  try { return await fs.readFile(keyPath) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    const key = crypto.randomBytes(32)
    await fs.mkdir(publisherDataDir, { recursive: true, mode: 0o700 })
    await fs.writeFile(keyPath, key, { mode: 0o600 })
    return key
  }
}

async function readVault() {
  try {
    const raw = JSON.parse(await fs.readFile(vaultPath, 'utf8'))
    const key = await getKey()
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(raw.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw.data, 'base64')), decipher.final()]).toString('utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error('The local session vault could not be opened.')
  }
}

async function writeVault(value) {
  const key = await getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  await fs.mkdir(publisherDataDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(vaultPath, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 })
}

export function normalizeSameSite(value) {
  if (value === undefined || value === null || value === '') return undefined
  const str = String(value).trim()
  if (str === 'no_restriction') return 'None'
  const lower = str.toLowerCase()
  if (lower === 'strict' || lower === 'lax' || lower === 'none') return lower.charAt(0).toUpperCase() + lower.slice(1)
  return undefined
}

export function normalizeCookies(input) {
  const source = Array.isArray(input) ? input : input?.cookies
  if (!Array.isArray(source)) throw new Error('Cookies must be a JSON array exported from a browser cookie tool.')
  const cookies = source.map(cookie => ({
    name: String(cookie.name || ''),
    value: String(cookie.value || ''),
    domain: cookie.domain ? String(cookie.domain) : '.zhihu.com',
    path: cookie.path ? String(cookie.path) : '/',
    expires: typeof cookie.expirationDate === 'number' ? cookie.expirationDate : typeof cookie.expires === 'number' ? cookie.expires : undefined,
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure !== false,
    sameSite: normalizeSameSite(cookie.sameSite),
  })).filter(cookie => cookie.name && cookie.value)
  if (!cookies.length) throw new Error('No usable cookies were found.')
  return cookies
}

export async function saveCookies(accountId, cookies) {
  const vault = await readVault()
  vault[accountId] = { savedAt: new Date().toISOString(), cookies }
  await writeVault(vault)
}

export async function loadCookies(accountId) {
  const vault = await readVault()
  return vault[accountId]?.cookies || []
}

export async function deleteCookies(accountId) {
  const vault = await readVault()
  delete vault[accountId]
  await writeVault(vault)
}

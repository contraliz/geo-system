import { discardZhihuJobSession, openZhihuAccount, prepareZhihuJob, publishZhihuJob, resetZhihuAccount, startZhihuAccountSetup, verifyZhihuAccount } from './zhihu.mjs'
import { getPlatformAuthConfig } from './platform-auth-config.mjs'
import { authorizeAccountWithElectron } from './account-auth.mjs'
import { deleteSession } from './vault.mjs'
import { removeAccountProfile } from './profile.mjs'

// Clean-room platform registry. Each adapter owns only its platform-specific
// navigation/editor behavior; lifecycle, leases, approval, and vault handling
// remain in the shared publisher service.
const catalog = [
  { id: 'zhihu', name: 'Zhihu', nameZh: '知乎', operational: true, editorUrl: 'https://zhuanlan.zhihu.com/write' },
  { id: 'wechat', name: 'WeChat Official Accounts', nameZh: '微信公众号', operational: false },
  { id: 'weibo', name: 'Weibo', nameZh: '微博', operational: false },
  { id: 'baijiahao', name: 'Baijiahao', nameZh: '百度百家号', operational: false },
  { id: 'toutiao', name: 'Toutiao', nameZh: '今日头条', operational: false },
  { id: 'douyin', name: 'Douyin', nameZh: '抖音', operational: false },
  { id: 'sohu', name: 'Sohu', nameZh: '搜狐号', operational: false },
  { id: 'netease', name: 'NetEase', nameZh: '网易号', operational: false },
  { id: 'penguin', name: 'Tencent Penguin', nameZh: '腾讯企鹅号', operational: false },
  { id: 'csdn', name: 'CSDN', nameZh: 'CSDN', operational: false },
  { id: 'xiaohongshu', name: 'Xiaohongshu', nameZh: '小红书', operational: false },
  { id: 'bilibili', name: 'Bilibili', nameZh: '哔哩哔哩', operational: false },
]

const adapters = {
  zhihu: {
    id: 'zhihu',
    startAccountSetup: startZhihuAccountSetup,
    openAccount: openZhihuAccount,
    resetAccount: resetZhihuAccount,
    verifyAccount: verifyZhihuAccount,
    prepareJob: prepareZhihuJob,
    publishJob: publishZhihuJob,
    discardJobSession: discardZhihuJobSession,
  },
}

const accountAdapters = Object.fromEntries(catalog.map(platform => [platform.id, adapters[platform.id] || {
  id: platform.id,
  startAccountSetup: account => authorizeAccountWithElectron(account, { hydrateSession: true }),
  verifyAccount: async account => {
    const auth = getPlatformAuthConfig(platform.id)
    return authorizeAccountWithElectron(account, { hydrateSession: true, url: auth?.adminUrl || auth?.loginUrl })
  },
  openAccount: async () => { throw new Error(`${platform.name} account inspection is not implemented yet.`) },
  resetAccount: async account => { if (account.profileDir) await removeAccountProfile(account.profileDir); await deleteSession(account.id); return { ok: true } },
  discardJobSession: async () => false,
}]))

const safe = platform => {
  if (!platform) return null
  const auth = getPlatformAuthConfig(platform.id)
  return { ...platform, authSupported: Boolean(auth), selectorsValidated: Boolean(auth?.selectorsValidated), publishingSupported: Boolean(platform.operational), loginUrl: auth?.loginUrl || null, adminUrl: auth?.adminUrl || null, cookieDomain: auth?.cookieDomain || null }
}

export function listPlatforms() {
  return catalog.map(safe)
}

export function getPlatform(platformId) {
  return safe(catalog.find(platform => platform.id === platformId))
}

export function requireOperationalPlatform(platformId) {
  const platform = getPlatform(platformId)
  if (!platform) throw new Error('Unknown publishing platform.')
  if (!platform.operational) throw new Error(`${platform.name} publishing is not implemented yet.`)
  return platform
}

export function requirePlatformAdapter(platformId) {
  const platform = requireOperationalPlatform(platformId)
  const adapter = adapters[platform.id]
  if (!adapter) throw new Error(`${platform.name} publishing is not implemented yet.`)
  return adapter
}

export function requireAccountAdapter(platformId) {
  const platform = getPlatform(platformId)
  if (!platform) throw new Error('Unknown account platform.')
  const adapter = accountAdapters[platform.id]
  if (!adapter) throw new Error(`${platform.name} account authorization is not implemented yet.`)
  return adapter
}

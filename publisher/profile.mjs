import fs from 'node:fs/promises'
import path from 'node:path'
import { publisherDataDir } from './store.mjs'

// Disconnect is the only destructive account action. Keep deletion constrained
// to a concrete child of this publisher's profiles directory and refuse links.
export async function removeAccountProfile(profileDir) {
  const profilesRoot = path.resolve(publisherDataDir, 'profiles')
  const target = path.resolve(String(profileDir || ''))
  const relative = path.relative(profilesRoot, target)
  if (!profileDir || !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Refusing to remove an account profile outside the publisher profiles directory.')
  let rootStat
  try { rootStat = await fs.lstat(profilesRoot) } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Refusing to remove a profile under an invalid profiles directory.')
  let stat
  try { stat = await fs.lstat(target) } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Refusing to remove an account profile that is not a real directory.')
  await fs.rm(target, { recursive: true, force: false })
  return true
}

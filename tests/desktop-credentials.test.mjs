import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('credential IPC and window boundaries keep the key out of the main GEO renderer', async () => {
  const main = await fs.readFile(path.join(repoRoot, 'desktop', 'main.mjs'), 'utf8')
  const preload = await fs.readFile(path.join(repoRoot, 'desktop', 'preload.cjs'), 'utf8')
  const credentialPreload = await fs.readFile(path.join(repoRoot, 'desktop', 'credential-preload.cjs'), 'utf8')
  const windowHtml = await fs.readFile(path.join(repoRoot, 'desktop', 'credential-window.html'), 'utf8')
  const proxy = await fs.readFile(path.join(repoRoot, 'server', 'proxy.mjs'), 'utf8')
  assert.match(main, /event\.sender !== mainWindow\.webContents/)
  assert.match(main, /event\.sender !== credentialWindow\.webContents/)
  assert.match(main, /safeStorage/)
  assert.match(main, /resolveCredentialWindow\(result\)/)
  assert.match(main, /--env-file-if-exists=\.env/)
  assert.match(main, /status\.pid !== child\.pid/)
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/)
  assert.match(preload, /openApiKeyWindow/)
  assert.doesNotMatch(preload, /apiKey|ANTHROPIC_API_KEY/)
  assert.match(credentialPreload, /geo-save-api-key/)
  assert.match(windowHtml, /maxlength="512"/)
  assert.match(windowHtml, /autofocus/)
  assert.match(windowHtml, /main GEO workspace never receives the key/)
  assert.match(windowHtml, /配置实时写作代理/)
  assert.match(proxy, /GET.*api\/anthropic\/usage/)
  assert.match(proxy, /fetchMiniMaxUsage/)
  assert.match(proxy, /sendJson\(res, 200, usage\)/)
  assert.match(proxy, /pid: process\.pid/)
  assert.doesNotMatch(proxy, /model_remains/)
})

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }

function proxyRequest(req, res, target) {
  const upstream = http.request({ hostname: '127.0.0.1', port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${target.port}`, origin: 'http://127.0.0.1' } }, response => { res.writeHead(response.statusCode || 502, { ...response.headers, 'access-control-allow-origin': '*' }); response.pipe(res) })
  upstream.on('error', error => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: `Local service unavailable: ${error.message}` })) })
  req.pipe(upstream)
}
export async function startLocalRendererServer({ root, publisherPort = 8788, proxyPort = 8787 } = {}) {
  const dist = path.join(root, 'dist')
  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/api/publisher')) return proxyRequest(req, res, { port: publisherPort })
    if ((req.url || '').startsWith('/api/anthropic')) return proxyRequest(req, res, { port: proxyPort })
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0])
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
    const candidate = path.resolve(dist, relative)
    const safe = candidate === dist || candidate.startsWith(`${dist}${path.sep}`)
    const file = safe && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(dist, 'index.html')
    const extension = path.extname(file).toLowerCase()
    res.writeHead(200, { 'content-type': MIME[extension] || 'application/octet-stream', 'cache-control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

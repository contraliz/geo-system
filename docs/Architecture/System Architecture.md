---
tags:
  - architecture
status: active
last_verified: 2026-08-22
---

# System architecture

## Runtime components

| Component | Technology | Responsibility |
| --- | --- | --- |
| Renderer | React 19, TypeScript, Vite 8 | Product UI, local content state, account and queue controls |
| Desktop main process | Electron 43 | Main window, authorization windows, local renderer hosting, and child-service lifecycle |
| AI proxy | Node HTTP service | Holds the upstream model key and proxies Anthropic-format requests |
| Publisher | Node HTTP service | Accounts, encrypted sessions, jobs, leases, platform adapters, and browser workers |
| Publishing browser | Puppeteer Core / Electron Chromium | Platform navigation, editor interaction, and publish confirmation |

## Local topology

```text
React renderer
  |-- /api/anthropic/* --> 127.0.0.1:8787 --> configured model endpoint
  `-- /api/publisher/* --> 127.0.0.1:8788 --> publisher service
                                      |-- Electron authorization window
                                      `-- Zhihu Puppeteer worker
```

Vite serves development UI on `127.0.0.1:5173`. The desktop production path serves the built renderer from a local server rather than a remote website.

## Trust boundaries

- The renderer may request account actions but does not receive raw cookies, encryption keys, or Web Storage payloads.
- Electron owns the authorization browser and its persistent partition.
- The publisher owns the account/job state, account locks, encrypted session vault, and browser worker.
- External platforms are untrusted and may change DOM, redirect, or display security challenges at any time.
- The AI API key exists only in the proxy environment.

## Persistence

| Location | Purpose | Cleanup rule |
| --- | --- | --- |
| Browser `localStorage` | Demo/product records used by the renderer | Reset only through the product reset flow or an explicit migration decision. |
| `.geo-desktop/` | Development Electron profile; its `publisher/` child stores desktop publisher data | Preserve. It can contain active account sessions. |
| `.geo-publisher/` | Standalone publisher state, profiles, encrypted vault, and artifacts | Preserve. It can contain active account sessions. |
| `dist/` | Generated production renderer | Regenerable with `npm run build`. |
| `.electron-cache/`, `.npm-cache-temp/`, `test-results/` | Generated caches/test output | Safe to regenerate; do not treat as source. |

Sensitive runtime directories are ignored by Git. Never paste their contents into issues, logs, or this vault.

## Reliability controls

- Loopback-only local services.
- Desktop/publisher protocol handshake rejects a stale incompatible service.
- Account-scoped browser profiles and an account/platform lock prevent concurrent use.
- Jobs use a five-minute lease and ten-second heartbeat.
- Publishing selectors are defensive and must fail closed when an exact visible control cannot be established.

Related: [[Architecture/Account Authorization]], [[Architecture/Publishing Workflow]], [[Reference/Repository Map]].

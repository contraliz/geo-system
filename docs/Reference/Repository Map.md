---
tags:
  - reference
  - repository
status: active
last_verified: 2026-08-22
---

# Repository map

| Path | Ownership |
| --- | --- |
| `AGENTS.md` | Repository-wide agent rules, mandatory vault maintenance, safety constraints, and verification workflow |
| `src/` | React renderer, feature pages, publishing UI, API client, styles, and localization |
| `desktop/` | Electron main process, preload bridge, authorization UI, local renderer server, readiness/protocol guards |
| `publisher/` | Local publisher HTTP API, accounts/jobs store, vault, locks, browser launch, platform registry/adapters |
| `server/` | Local AI proxy |
| `tests/` | Node unit tests and Playwright smoke tests |
| `docs/` | This Obsidian source-of-truth vault |
| `docs/GEO System Overview.canvas` | Canonical at-a-glance project dashboard maintained alongside the detailed vault notes |
| `skills/` | Repository-specific agent/workflow guidance; preserve unless intentionally retired |
| `dist/` | Generated Vite build |
| `.geo-desktop/` | Ignored desktop runtime profile and desktop publisher state; sensitive |
| `.geo-publisher/` | Ignored standalone publisher runtime state; sensitive |

## High-risk files

- `desktop/main.mjs` — process startup, renderer/publisher readiness, window security
- `desktop/auth-window.mjs` — session capture and authorization bridge
- `publisher/server.mjs` — local API and job transitions
- `publisher/vault.mjs` — encryption and sensitive session storage
- `publisher/zhihu.mjs` — live external editor and publish behavior
- `publisher/platforms.mjs` — operational platform boundary

Changes to these files should update [[Current State]] or an architecture note and run focused tests plus the full unit suite.

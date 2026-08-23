---
tags:
  - operations
  - development
status: active
last_verified: 2026-08-23
---

# Development guide

## Prerequisites

- Current Node.js and npm compatible with the lockfile
- Windows for the currently exercised Electron flow
- Network access to the selected Chinese platform for live authorization tests

## Commands

```powershell
npm install
npm run dev              # Vite renderer only
npm run dev:full         # Vite + AI proxy + standalone publisher
npm run desktop:dev      # Vite + AI proxy + Electron; desktop starts publisher
npm run build
npm run test:unit
npm run test:smoke
```

`concurrently` is a local dev dependency. If PowerShell reports that it is not recognized, run `npm install` from the repository root and use the npm script rather than invoking `concurrently` globally.

The development scripts explicitly invoke Vite, the proxy, and the publisher with `node --no-maglev`. Keep that flag for the affected Windows Node 24.15/Vite `0xC0000409` startup failure; do not add it to production Electron or build commands unless a separate reproducible failure justifies that change.

## Ports

| Port | Service |
| --- | --- |
| 5173 | Vite development renderer |
| 8787 | AI proxy |
| 8788 | Publisher API |

Before restarting a stack, identify the owning process instead of blindly killing all Node/Electron processes. A stale publisher on `8788` can speak an older protocol; the desktop handshake should reject it with a restart instruction.

## Required checks before handoff

```powershell
npm run test:unit
npm run build
git diff --check
```

Use `npm run test:smoke` after UI/navigation changes. Live Zhihu testing is a separate manual verification and must be recorded in [[Current State]] without secrets or private article content.

## Documentation discipline

- Update [[Current State]] when a capability becomes verified or regresses.
- Add architecture decisions to [[Decisions/Decision Log]].
- Add new directories or changed ownership to [[Reference/Repository Map]].
- Add repeatable failures and fixes to [[Operations/Troubleshooting]].
- Prefer evidence and dates over words such as "works" or "same."

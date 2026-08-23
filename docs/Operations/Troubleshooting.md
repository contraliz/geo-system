---
tags:
  - operations
  - troubleshooting
status: active
last_verified: 2026-08-23
---

# Troubleshooting

## `concurrently` is not recognized

Cause: project dependencies are missing or incomplete.

```powershell
npm install
npm run dev:full
```

Do not install a global replacement as the first fix; the lockfile defines the expected local version.

## Electron shows a blank main window

Check the terminal for renderer readiness or mount errors. Development mode requires Vite at `127.0.0.1:5173`; the production desktop path requires a successful `npm run build`. The desktop readiness guard should report a specific failure instead of leaving an unexplained blank surface.

## `ERR_CONNECTION_REFUSED` on port 5173

Vite is not listening, stopped during dependency bundling, or another process owns the expected port. Start with `npm run desktop:dev`, which starts Vite and Electron together and uses a strict port.

## `ERR_FAILED (-2)` loading a long `data:text/html` URL

The authorization toolbar must be loaded from the local HTML file. Long data URLs have failed before the platform page can attach. Current authorization code uses `auth-window-toolbar.html`; a recurrence indicates an old process/build or a regression.

## Authorization toolbar appears but platform area is blank

Inspect the Electron terminal for `did-fail-load` or `render-process-gone`. Confirm the platform URL is HTTPS and reachable outside GEO System. Restart the desktop and publisher together to avoid mixing protocols. Do not weaken TLS checks or disable certificate verification as a workaround.

## Platform page is too small for CAPTCHA

The platform webview must occupy the entire area below the fixed toolbar and resize with the window. The authorization toolbar uses a 64px + `minmax(0, 1fr)` grid, and the Electron window uses `useContentSize: true` with a 760×560 minimum content size. Do not restore a 960px HTML minimum width or use a narrow content card/renderer iframe for the real platform.

## Account name field cannot be typed into

The connection panel uses a dedicated labeled `accountLabel` state, focuses the field when opened, stops parent click/key handlers from interfering, and submits through a real form. If the field still appears inert, rebuild the renderer/Electron app so an older generated `dist/` bundle is not being served; static unit coverage checks the source contract, while live renderer interaction remains unverified when Browser validation is unavailable.

## Error `10001: 请求参数异常，请升级客户端后重试`

This is platform/client behavior, not proof that cookies are wrong. The account-scoped Electron authorization session now sends a normal Chrome UA built from the installed Chromium version, with the Electron token removed and `zh-CN,zh,en-US,en` accepted. Rebuild/restart the desktop app so the updated main process owns the auth window, then retry. Do not downgrade Electron, copy a historical Chrome 124 fingerprint, bypass TLS, or claim a fix until a current login succeeds.

If the error persists, capture only non-sensitive status metadata (Electron/Chromium versions, request URL/status, and the visible platform error), compare it with a normal browser, and leave the account in `login-required`. Never record cookies, storage values, passwords, or private platform content in logs or this vault.

Observed verification on 2026-08-23: the user reported that retrying Zhihu **获取验证码** succeeded after the UA fix, then provided screenshot evidence of **Connected / Healthy** and **Session verified locally** after Confirm logged in. This does not verify session reuse after restart or publishing.

## Windows dev process exits with `0xC0000409`

On affected Node 24.15/Vite setups, use the repository dev scripts, which invoke long-lived Node entrypoints with `node --no-maglev`. This is a narrow startup workaround; it does not change production build behavior or authorize broad process termination. Identify and stop only a process started for the current checkout before retrying.

## Random Unicode folders containing `Microsoft/Spelling/neutral`

These are treated as disposable spellchecker artifacts only after verifying they contain zero files, no reparse points, and no paths outside that exact structure. Electron spellcheck should be disabled for GEO windows that do not need it. Never delete `.geo-desktop/` or `.geo-publisher/` during this cleanup.

## Stale publisher service

Symptoms include missing API routes or an incompatible desktop authorization protocol on `8788`. Identify the process that owns the port, stop only that process, and restart from this checkout. Avoid broad process termination.

Related: [[Operations/Development Guide]], [[Architecture/Account Authorization]].

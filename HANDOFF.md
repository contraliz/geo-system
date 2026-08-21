# GEO Operations — current handoff

## Current goal

Keep the local browser-first GEO Operations webapp reliable for coworker
testing. The product name is undecided. Electron packaging and additional
publishing channels remain out of scope until the local webapp is stable.

## Core workflow

1. Maintain knowledge bases, image libraries, keywords, writing instructions,
   creation tasks, and reviewable articles.
2. Configure exactly one Zhihu account.
3. Verify the account explicitly after manual login or cookie import.
4. Prepare a draft in a real Zhihu editor and stop for human inspection.
5. Publish only after an explicit approval action; record success only after
   confirmed navigation or success text.

## Hard constraints and security decisions

- Local-only Node publisher on loopback; it stores no cloud credentials.
- Session cookies are encrypted locally under `.geo-publisher`; never expose
  cookies, keys, passwords, or session files in logs, UI, or handoffs.
- Account setup and verification are separate. Never automate CAPTCHA, 2FA, or
  security checks.
- Only exact, visible Zhihu publish controls may be clicked, and publishing is
  approval-gated. Draft preparation must never publish.
- Chrome profiles are account-scoped. The in-process platform/account lock is
  held across preparation and retained visible approval sessions so jobs cannot
  launch concurrent processes against one profile.

## Architecture and file map

- `src/` — Vite/React SPA, dashboard, article/task surfaces, and publisher UI.
- `server/proxy.mjs` — loopback AI proxy; credentials remain server-side.
- `publisher/server.mjs` — loopback publisher API on `127.0.0.1:8788`.
- `publisher/store.mjs` — local account/job state and single-account replacement.
- `publisher/zhihu.mjs` — account setup, verification, draft preparation, and
  approval-gated publishing.
- `publisher/puppeteer.mjs` — Puppeteer loading plus macOS LaunchServices/CDP
  browser startup.
- `publisher/vault.mjs` — encrypted cookie storage.
- `publisher/locks.mjs` / `publisher/trace.mjs` — profile concurrency lock and
  bounded diagnostics.
- `tests/publisher-runtime.test.mjs` / `tests/publisher-vault.test.mjs` —
  focused publisher and vault tests.

## Accepted implementation decisions

- Zhihu navigation waits for full page `load`, then exactly the configured
  one-second settle by default before editor discovery/input; the editor path
  does not wait for network-idle or login-detection grace delays.
- Zhihu title and body entry first hit-test and click the discovered real field.
  Exact title placeholder semantics and body-editor metadata are preferred over
  broad first-input/largest-editable fallbacks. Text is inserted through
  Puppeteer `sendCharacter` (Chromium's trusted `Input.insertText` path), with
  a per-character trusted-input retry. Element handles are checked through
  their connected/evaluate API, never the page-only `isClosed()` API.
- Input pacing is configurable: 275ms action pauses by default and 35ms per
  character for the trusted fallback, while the one-second post-load start is
  preserved.
- Visible preparation failures retain the browser/page as `failed-inspection`
  and retain the account lock. The UI's `Close debug browser` action uses the
  cancel/discard route to close the session and release the lock.
- Before a draft becomes approval-ready, the worker only inspects for an exact
  visible, enabled `发布` control. It never clicks during this readiness check;
  approval remains the only publish click path.
- When an approved background job must refill a draft, it waits up to 15
  seconds for that same exact `发布` control to become enabled after Zhihu
  autosaves. Missing or disabled controls time out without any click, and the
  headless browser closes cleanly.
- Publishing requires the first exact toolbar click plus a second exact visible
  confirmation click. An editor URL ending in `/edit` is never success; success
  requires a non-edit article transition or a success signal observed after
  navigation/reload. Ambiguous visible publishes retain the session for
  `Close debug browser` inspection.
- After confirmation controls disappear, publication state is polled through the
  existing bounded deadline so delayed `?just_published=1` or canonical article
  redirects are not reported as failures.
- Direct DOM value/text mutation is not a valid fallback: it can render an
  overlay while leaving React/editor state empty.
- Body verification checks the editor-owned text and rejects a visible body
  placeholder or incorrect/partial text. Exact normalized editor-owned text is
  accepted even when Zhihu's counter is temporarily stale at zero; failures
  are loud and do not proceed to publishing. Every retry clears first.
- Bounded field diagnostics record selector metadata, focus state, placeholder
  visibility, character count, and text length only; article text is not logged.
- macOS Chrome is launched through LaunchServices. The requested remote-debug
  port is checked directly, with a fresh `DevToolsActivePort` fallback to the
  actual endpoint; stale endpoint files are ignored.

## Verified progress (2026-08-20)

- Sol-reviewed syntax checks pass for the changed publisher modules.
- Focused unit suite passes: 31/31 tests.
- `npm run build` passes.
- Isolated `GET /api/publisher/status` pass observed: publisher reachable,
  Puppeteer available, no active jobs or locks.
- Latest local state inspection showed one ready, visible Zhihu account and 48
  local jobs: 19 failed, 7 awaiting approval, 16 queued, 3 published,
  2 editor-open, and 1 cancelled. This is runtime state, not proof of current
  external publication.

## Unresolved or unverified

- No current authenticated Zhihu run has validated editor entry end-to-end;
  live article publication remains unverified and must not be claimed.
- Zhihu selectors, placeholder markup, character-count markup, and success text
  remain dependent on the current platform DOM/version.
- The existing process on port `8788` must be restarted to load source changes;
  an old process can otherwise make tests appear stale.
- In-app browser post-reload testing is currently blocked by URL safety policy.
- Job recovery/polling and non-Zhihu channels remain limited/local demo behavior.

## Safe next steps

1. Restart the local publisher (and Vite/proxy if needed) from this checkout.
2. Recheck `/api/publisher/status` and account state.
3. Use a short authenticated Zhihu draft in visible mode; inspect title, body,
   placeholder disappearance, and character count before approval.
4. Test cancellation/profile-lock behavior, then separately test explicit
   approval and publish confirmation. Do not treat a visible overlay as success.

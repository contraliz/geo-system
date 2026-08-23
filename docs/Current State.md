---
tags:
  - status
  - source-of-truth
status: active
last_verified: 2026-08-23
---

# Current state

## Milestone

GEO System is a React/Vite web application with an Electron desktop shell, a local AI proxy, and a local publishing service. Account authorization is performed in an isolated Electron window. Publishing automation is implemented only for Zhihu.

The canonical target scope is defined in [[Product Requirements]]. Existing code covers parts of all seven requirements, but the overall product milestone is not complete.

## Capability matrix

| Capability | State | Evidence / limitation |
| --- | --- | --- |
| Web application and sidebar navigation | Implemented | React renderer under `src/`; production build is generated in `dist/`. |
| Electron desktop shell | Implemented | `desktop/main.mjs` owns the main window and local services. |
| Zhihu account authorization | Implemented, externally verified for login health | Dedicated labeled account-name form control, isolated persistent partition, manual login, Confirm logged in button, responsive 64px-toolbar/full-area webview layout, runtime-derived current-Chromium UA without the Electron token, and encrypted session capture exist. On 2026-08-23 the user reported that the `10001` / 获取验证码 retry succeeded and provided evidence of Connected / Healthy with Session verified locally after Confirm logged in. Session reuse after restart and publishing remain unverified. |
| Other Chinese-platform authorization | Configured, selectors unvalidated | Login metadata exists for WeChat Official Accounts, Weibo, Baijiahao, Toutiao, Douyin, Sohu, NetEase, Tencent Penguin, CSDN, Xiaohongshu, and Bilibili. Identity selectors are intentionally marked unvalidated. |
| Zhihu article publishing | Implemented, unverified externally | Browser automation, draft filling, optional approval, and publish confirmation logic exist. A current authenticated end-to-end publish has not been proven. |
| Publishing to other platforms | Not implemented | The shared lifecycle is reusable, but every platform still needs a custom editor/publish adapter. |
| Cookie import | Implemented | Session material is normalized and encrypted locally. Imported sessions require verification. |
| Background publishing | Implemented, unverified externally | Puppeteer can run headlessly using saved session state. CAPTCHA, 2FA, and security checks are never automated. |
| Fixed LokeGEO-style sole sidebar navigation | Partially implemented | All modules are represented in the global sidebar, but desktop fixed-position behavior and full-page visual consistency still require verification and refinement. |
| Complete English / Simplified Chinese UI | Partially implemented | A large translation dictionary and persistent language selection exist; full string coverage has not been audited. |
| Complete light / dark UI | Partially implemented | Theme tokens, persistence, and a smoke test exist; publishing surfaces contain hard-coded light colors that require audit. |
| MiniMax keyword distillation | Implemented locally | MiniMax-M3 proxy request, strict JSON validation, deduplication, intent clustering, and focused tests exist. Saving generated results into the keyword-set workflow still needs product confirmation. |
| Knowledge and image bases | Implemented locally | Create/edit/delete/select and local image upload work through browser state. Durable backend/team storage is not implemented. |

## Current truths

- The publisher is not universal at the DOM-operation level. Queueing, leases, vault storage, account locks, and approval states are shared; login/editor/publish selectors and success checks are platform adapters.
- `publisher/platforms.mjs` marks only Zhihu as operational for publishing.
- `publisher/platform-auth-config.mjs` configures account login for twelve Chinese platforms, but returns `selectorsValidated: false` for all of them.
- The default job behavior publishes after preparation when manual review is off. Enabling manual review pauses at `awaiting-approval` until the user approves.
- Visible failures are retained as `failed-inspection` where possible so the operator can inspect the browser and close it explicitly.
- Account and browser state are local. The SPA must not receive raw cookie or Web Storage values.
- Account setup's local label input is isolated from cookie-import state, focused on open, supports Enter submission, and reports a missing label without starting authorization. Static tests cover this contract; live renderer interaction remains unverified because the Browser validation path was unavailable.
- The authorization toolbar uses a 64px grid row plus a `minmax(0, 1fr)` webview row, `display:flex` with width/height 100%, and content-sized Electron window bounds (1280×820 default, 760×560 minimum). Live platform resizing and login usability remain externally unverified.
- Auth sessions configure their user agent before any auth webview exists, using the installed Electron Chromium version and `zh-CN,zh,en-US,en` rather than a copied historical Chrome fingerprint. This is a local compatibility measure, not proof that Zhihu accepts the current client.
- Live evidence on 2026-08-23 covers the user-reported Zhihu `10001` / 获取验证码 retry succeeding after the UA fix and screenshot evidence of local session verification/healthy account state after Confirm logged in. Session reuse after restart and publishing remain unverified.
- Windows development scripts invoke Vite, the proxy, and the publisher with `node --no-maglev` after the observed Node 24.15/Vite `0xC0000409` exit. Production build and live desktop stability remain separate checks.

## Immediate verification backlog

1. Restart the desktop and verify the saved Zhihu session is reused without another login.
2. Restart all local services, prepare a short test article in visible mode, and verify title/body/editor state.
3. Run a manual-review job and confirm no publish click occurs before approval.
4. Separately verify the publish confirmation and returned external URL.
5. Validate each additional platform's identity selectors before describing its account connection as reliable.

See [[Operations/Development Guide]] and [[Operations/Troubleshooting]].

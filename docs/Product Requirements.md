---
aliases:
  - Core Features
tags:
  - requirements
  - roadmap
status: active
last_verified: 2026-08-22
---

# Product requirements

These seven features define the current core scope. A feature is complete only when its acceptance criteria pass in both English and Simplified Chinese, in light and dark mode, at supported desktop sizes, and through the Electron build where applicable.

## R-001 — LokeGEO-style UI with a fixed sole sidebar

**Required outcome:** the product uses the LokeGEO-inspired visual language already established in the publishing/account screens. The sidebar is the sole navigation menu and remains fixed while page content scrolls. There is no competing top navigation bar.

**Current implementation:** all modules appear in the global sidebar and the app uses shared compact blue/neutral styling. The current desktop layout uses grid/sticky behavior in different layers; fixed-position behavior across every route is not yet proven.

**Acceptance criteria:**

- every module and submodule is reachable from the sidebar;
- no primary route links remain in a top navigation bar;
- the desktop sidebar stays fixed and has its own scroll region when necessary;
- the content viewport does not slide under or resize the sidebar incorrectly;
- mobile uses an accessible drawer without losing any route;
- publishing/account pages and all other modules share the same shell, spacing, typography, controls, and states.

## R-002 — Complete English and Simplified Chinese UI

**Required outcome:** users can switch between English and Simplified Chinese, and every user-facing label, status, validation message, empty state, modal, tooltip, notification, and publishing/account string follows the selected language.

**Current implementation:** `src/i18n.tsx` provides a large English-to-Chinese dictionary and the language preference is persisted. Full coverage is not yet audited; several publishing strings and dynamic error paths may still be English-only.

**Acceptance criteria:**

- no unintended English text remains in Chinese mode and no unintended Chinese text remains in English mode;
- dynamic variables are interpolated without using untranslated whole-string fallbacks;
- platform-owned webpages are excluded from this requirement;
- both languages pass route-by-route smoke screenshots and interaction tests;
- the selected language survives reload and desktop restart.

## R-003 — Complete light and dark mode

**Required outcome:** every GEO-owned surface supports both themes with readable contrast and consistent semantic colors.

**Current implementation:** CSS variables, `data-theme="dark"`, persistence, a header/settings toggle, and a smoke test exist. Some newer publishing shell styles use hard-coded light colors and need migration to tokens.

**Acceptance criteria:**

- no GEO-owned page, drawer, modal, table, empty state, toast, or authorization toolbar becomes unreadable in either theme;
- controls meet practical contrast and focus-visible requirements;
- charts, images, borders, disabled states, errors, and success states are theme-aware;
- theme persists across reload and desktop restart;
- platform-owned login/editor pages are displayed in their own chosen theme and are excluded.

## R-004 — Keyword distillation using a MiniMax agent

**Required outcome:** a user supplies a keyword and count; MiniMax returns exactly that many useful, unique questions in the keyword's language; validated questions can enter the keyword-set/content workflow.

**Current implementation:** `src/features/keyword-distillation/logic.ts` calls MiniMax-M3 through the local Anthropic-compatible proxy, enforces a strict JSON contract, normalizes/deduplicates output, clusters intent locally, and has focused Playwright tests. The current generated result is display-only and is not added to `AppState`.

**Acceptance criteria:**

- blank/invalid input is rejected locally;
- API keys remain in the proxy environment;
- the response preserves keyword/language/count and contains no duplicates;
- malformed, partial, or provider-error responses fail visibly without inventing questions;
- the user can review and save the generated questions as a keyword set;
- saved sets can feed automatic creation tasks.

## R-005 — Functional knowledge base and image base

**Required outcome:** users can maintain reusable written knowledge and image collections, select approved assets as generation context, and see where they are used.

**Current implementation:** local knowledge bases support create/open/add/edit/approve/select/delete workflows; image libraries support local uploads, sample placeholders, selection, metadata, and deletion. State is browser-local and images are stored as size-limited data URLs.

**Acceptance criteria:**

- complete create/read/update/delete flows for bases and entries/assets;
- search, empty, validation, duplicate-name, size/type, and deletion-confirmation states;
- explicit grounding selection and task usage references;
- image previews and metadata survive reload within documented limits;
- migration/backups prevent silent loss when the schema changes;
- storage limits and the future durable-storage boundary are documented.

## R-006 — Multiple-site publishing

**Required outcome:** users can connect multiple Chinese media platforms and publish through a common queue while each platform uses a safe custom adapter.

**Current implementation:** accounts, encrypted sessions, jobs, leases, heartbeats, locks, approval, and diagnostics are shared. Twelve Chinese platforms are registered for account authorization. Only Zhihu is operational for article publishing; all other publishing adapters are not implemented.

**Acceptance criteria:**

- each supported platform has validated login, editor, publish, confirmation, and failure behavior;
- platform availability in the UI reflects real implementation rather than placeholders;
- jobs cannot cross account/platform boundaries or reuse the wrong profile;
- visible and background modes are tested separately;
- manual review prevents publishing until approval;
- no platform is marked operational without a current live test and recorded evidence.

The target platform order should be decided in [[Decisions/Decision Log]] before implementation. Shared infrastructure does not make the DOM publisher universal; see [[Architecture/Publishing Workflow]].

## R-007 — LokeGEO-similar personal-media account setup

**Required outcome:** account setup follows the observable LokeGEO-style lifecycle while remaining an independent implementation: select a platform, create an account profile, open the platform's real login page in a dedicated Electron browser, let that page fill the window below a small fixed toolbar, let the user perform every login action, click **Confirm logged in**, capture domain-scoped cookies, save them in the encrypted local session vault, and manage the saved account from the GEO UI.

**Current implementation:** the Electron authorization window, full-area platform webview, account-scoped persistent partition, Confirm logged in button, cookies plus Web Storage capture, AES-256-GCM vault, cookie import, rename, reauthorize, verify, and disconnect flows exist. Zhihu live authentication still needs current end-to-end verification, and non-Zhihu selectors are unvalidated.

**Acceptance criteria:**

- the platform area fills all space below the toolbar and remains usable for QR/CAPTCHA flows;
- the toolbar remains visible without covering platform controls;
- closing/cancelling cannot mark an account connected;
- Confirm logged in is the only UI action that triggers cookie capture and account verification;
- captured cookies are restricted to the configured platform domain, encrypted at rest, and never returned to the React renderer;
- confirmation reports missing cookies, remaining login state, and platform/client errors without exposing secrets;
- session reuse works after desktop restart;
- account cards show honest authorization health and actionable recovery states;
- imported cookies use the same verification and encrypted storage boundary;
- multiple accounts/platforms remain isolated.

## Completion policy

For each requirement, record automated evidence and any live external evidence in [[Current State]]. “Implemented” means code exists; “complete” means all acceptance criteria have been exercised and documented.

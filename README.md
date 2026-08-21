# GEO Operations

This is a neutral, local-only content operations SPA for exploring the path from question discovery and approved knowledge through AI writing, model validation, review, and owned-channel publishing configuration.

## Local setup

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open the local Vite URL shown in the terminal. For a production-like local preview:

```bash
npm run preview -- --host 127.0.0.1
```

Production build command:

```bash
npm run build
```

Optional browser smoke harness (Playwright + Chromium, headless):

```bash
npm run test:smoke:install   # one-time Chromium download
npm run test:smoke           # runs smoke specs against the dev server
```

### Local publisher worker

The publisher is a local-only Node service. It supports exactly one Zhihu account and stores its dedicated local Chrome profile under `.geo-publisher`. A new manual-login configuration or cookie import replaces the previous account. Setup only configures the session; the user must explicitly click `Verify account` before the session is considered ready. Later jobs can use background mode when the saved session is valid. Every job prepares a draft and requires an explicit approval request before a publish click is attempted.

```bash
npm install
npm run dev:full
```

The publisher listens on `http://127.0.0.1:8788` and Vite proxies `/api/publisher/*` to it. On macOS it starts Chrome through LaunchServices and creates visible sessions as one normal Chrome window. It removes Puppeteer's default viewport emulation and applies real browser window bounds through `page.windowId()` and `browser.setWindowBounds()` so the page fills the window instead of appearing as a narrow pane. It connects over a local DevTools endpoint to avoid direct-binary application-registration crashes. Set `GEO_CHROME_EXECUTABLE` if `puppeteer-core` cannot discover Chrome automatically. The worker never accepts or logs passwords/cookies, never automates CAPTCHA or 2FA, and writes encrypted session state under `.geo-publisher` (override with `GEO_PUBLISHER_DATA_DIR`; the Electron build should point this to its OS user-data directory). Zhihu selectors are intentionally defensive; if the editor or exact publish control cannot be found, the job fails without clicking a guessed control. Draft preparation waits for the body, network idle, visible editor fields, and a settle delay, then types the title and article one character at a time, presses Enter for line breaks, adds bounded random pauses, and verifies the title/body remain in the editor. Tune the timing with `GEO_PUBLISHER_NAVIGATION_SETTLE_MS`, `GEO_PUBLISHER_INPUT_DELAY_MS`, `GEO_PUBLISHER_EDITOR_TIMEOUT_MS`, `GEO_PUBLISHER_HUMAN_CHAR_MIN_MS`, `GEO_PUBLISHER_HUMAN_CHAR_MAX_MS`, `GEO_PUBLISHER_HUMAN_PAUSE_PROBABILITY`, `GEO_PUBLISHER_HUMAN_PAUSE_MIN_MS`, and `GEO_PUBLISHER_HUMAN_PAUSE_MAX_MS` if a slower connection needs more time.

### Live writing agent (optional)

Tasks that select a real model label (`MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2.1-highspeed`, `MiniMax-M2`) call a local Node proxy that forwards Anthropic-format requests to the configured upstream. The proxy holds the API key in its environment; the browser never sees it.

```bash
cp .env.example .env       # defaults to MiniMax China endpoint; switch to international or direct-Anthropic as needed
# edit .env: paste your MiniMax API key into ANTHROPIC_API_KEY
npm run dev:full           # vite + the proxy together
```

`.env.example` defaults to `https://api.minimaxi.com/anthropic` (MiniMax China). For MiniMax international, set `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`. For direct Anthropic, set `ANTHROPIC_BASE_URL=https://api.anthropic.com`. The Settings → Live writing agent panel shows connection status and lets you send a test ping.

## Verification checklist

Run `npm run build` after changes. In the browser, check every sidebar route, create/edit/duplicate/delete/filter/reset interaction, the English/简体中文 switch and reload persistence, dark mode, the mobile navigation drawer, and the browser console. The demo stores its state in `localStorage`; malformed, legacy, partial, or nested stored state is defensively migrated back to a valid local snapshot.

Monitoring, model validation, report generation, CSV export, publishing, account setup, website channels, influencer planning, and SEO checks are simulated local records only. The local Node proxy is the only component that talks to a remote upstream, and only when a task uses a real (MiniMax) model label — the proxy URL is configured via `ANTHROPIC_BASE_URL` and the key via `ANTHROPIC_API_KEY`; the browser never holds them.

## Feature inventory

- Responsive grouped/collapsible navigation with mobile drawer, active routes, theme toggle, local connection state, version, user block, and compute balance.
- Dashboard with keyword radar, content output, brand mentions, model calls, seven-day valid-article/publishing charts, team/workspace context, simulated reports, and workflow shortcuts.
- Asset Library for Knowledge Bases and Image Libraries with search, cards, create flows, counts, dates, and local persistence. Every Knowledge Base card opens a full-page local entry library with a back action, KB heading, Add entry control, and readable entry cards containing a category, title, body preview, date, status, grounding selection, and edit/approve/delete controls. Every Image Library card opens a parallel full-page local album with a back action, album heading, thumbnail grid (sample placeholders or uploaded files rendered from base64 data URLs), filename/size/dimensions metadata, pagination, selection state, confirmed deletion, an Add sample-placeholder flow, and an Upload from device flow that stores PNG / JPEG / WebP files (up to 1 MB each) as data URLs in browser storage.
- Keyword Distillation cards with associated brand, question counts, tags, create flow, and prompt detail drawer.
- AI Writing surfaces for grouped Writing Instructions, Automatic Creation task setup, and task cards. A task reuses a body/title instruction, Keyword Set question pool, one or more Knowledge Bases and selected grounding entries, an Image Library and image count, a model label, target quantity, and local-only options. Task cards expose search/filter/refresh, created/updated metadata, progress, linked Article List, duplicate configuration, confirmed deletion, inspect / edit, pause/resume, a sanitized expandable execution log, and Run next batch. Tasks that pick a simulated model create local Review articles and update local records/ledger entries without any network call. Tasks that pick a real model (MiniMax-M3 / -M2.7 / -M2.7-highspeed / -M2.5 / -M2.5-highspeed / -M2.1 / -M2.1-highspeed / -M2) call the local proxy, which forwards to the configured Anthropic-compatible upstream and stores the returned `{ title, body }` as a reviewable Article. Writing Instructions have their own inspect / edit modals (title, description, group, status, plus a usage list) so the prompt strings fed to the live agent can be tuned without touching code.
- Publishing Personal Media table with article pool, account/channel badges, limits, deduplication, AI disclosure, status, local create/duplicate/delete confirmation; functional local Records, Accounts, Website Media, Influencers, and Official-site SEO planning surfaces with seeded records and status/configuration interactions.
- Model Validation Results with platform filters and CSV export, plus a functional local Task Center and Export Tasks subviews.
- Article detail review controls for local title edits, status changes, confirmed deletion, and rendering of the live-agent body when present; keyword detail prompt creation updates the local question count.
- Guided local demo on the dashboard: choose a Knowledge Base, select entries from its full-page library, ask a question-style prompt, generate a reviewable article grounded by those entry IDs, stage a paused Personal Media task, and create a simulated model-validation/brand-exposure result. Each step is persisted in the existing local state. The generated article retains its selected Knowledge Base and grounding entry IDs.
- Compute Points explanation, local ledger, and explicitly simulated recharge.
- Admin overview quick cards with selected configuration detail panels for users, API placeholders, LLM settings, point rules, model checks, and client versions; About & Settings with theme, profile, reset-demo-data, and a Live writing agent status panel that reports provider, key presence, and last test ping.
- Local Node proxy (`server/proxy.mjs`) holds the upstream API key in `ANTHROPIC_API_KEY` and forwards `/v1/messages` to `ANTHROPIC_BASE_URL` (defaults to `https://api.minimaxi.com/anthropic` per `.env.example`). Vite proxies `/api/anthropic/*` to it, so the SPA calls a same-origin endpoint without holding secrets.

## Demo limitations

Most content, metrics, validation, publishing, account/configuration, and connection-state records are simulated local records. Image Library entries are either original CSS/sample placeholders plus local metadata, or files the user selects from their own device; in either case nothing is uploaded, sent, or stored as a remote URL. Real uploads are read locally via `FileReader`, capped at 1 MB per file, and stored as base64 data URLs inside the browser's `localStorage`. No login, scraping, remote fonts/assets, hosting, CMS, social account, payment provider, or other external side effect is included. API key and account surfaces never request or store real secrets.

The live writing agent is opt-in per task — the task's model label must be one of `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2.1-highspeed`, or `MiniMax-M2`. When enabled, the SPA calls the local Node proxy, which forwards a single Anthropic-format message to the configured upstream (`ANTHROPIC_BASE_URL`, defaulting to `https://api.minimaxi.com/anthropic`) and stores the JSON `{ title, body }` response as the article's body. No streaming, tools, multi-turn, or vision. The API key never enters the browser bundle or storage. If `ANTHROPIC_API_KEY` is unset, the proxy is unreachable, or the upstream rejects the request, Run next batch surfaces a notification and no Article is created.

Records are persisted defensively in browser `localStorage`; older demo state is upgraded from source/fact records into entry cards, missing image/task collections and workflow fields are added, and legacy provisional brand text is neutralized on load. Clearing storage or using Reset local demo restores the seed snapshot. CSV export is a local browser download generated from the visible validation table and also creates a local export record.

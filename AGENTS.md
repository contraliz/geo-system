# GEO System agent instructions

These instructions apply to the entire repository.

## Source of truth

Before non-trivial work, read:

1. `docs/Home.md`
2. `docs/Product Requirements.md`
3. `docs/Current State.md`
4. `docs/GEO System Overview.canvas`
5. The relevant note under `docs/Architecture/` or `docs/Operations/`

The `docs/` directory is an Obsidian vault and the project source of truth. When code changes architecture, account authorization, publishing behavior, storage, ports, capability status, or a core requirement, update the relevant vault note in the same change.

### Active vault maintenance is mandatory

Do not treat the vault as end-of-task paperwork. Maintain it while working:

- **Before planning:** read `docs/Home.md`, `docs/Product Requirements.md`, `docs/Current State.md`, and the notes relevant to the task. Use them to determine scope, constraints, and known uncertainty.
- **During investigation:** when the code contradicts, supersedes, or adds important detail to the vault, update the affected note as soon as the fact is established. Code is evidence; reconcile the vault instead of silently working around stale documentation.
- **During implementation:** update requirements, architecture, decisions, troubleshooting, and repository ownership at the same milestone as the corresponding code change. Keep links between related notes current.
- **At meaningful milestones:** synchronize `docs/GEO System Overview.canvas` with the current requirement statuses, runtime relationships, verification evidence, risks, and immediate next steps. Do not wait until the final handoff.
- **For long or multi-stage work:** keep a concise work log based on `docs/Templates/Work Log.md` under `docs/Work Logs/`. Record goals, verified changes, checks, blockers, and source-of-truth updates without secrets or private content.
- **Before completion:** reread every vault note affected by the task, verify its claims against the final code/tests, resolve broken wikilinks, update `last_verified`, validate the Canvas JSON and file-node references, and ensure `docs/Current State.md` distinguishes implemented work from live external verification.
- **In the final handoff:** name the vault notes that changed and call out any unresolved or externally unverified behavior.

A non-trivial change is incomplete when its source-of-truth notes are stale. Do not postpone known vault updates to a future task.

### Canvas maintenance contract

`docs/GEO System Overview.canvas` is the required at-a-glance project dashboard. Markdown notes remain the detailed authority; the canvas summarizes and links to them.

- Keep one canonical project canvas rather than creating competing status canvases.
- Update it whenever a core requirement changes state, architecture/process relationships change, verification evidence changes, a major risk appears or is resolved, or the immediate backlog changes.
- Update the authoritative Markdown note first or in the same milestone, then make the canvas agree with it.
- Keep summaries short enough to scan without opening every file.
- Preserve stable node IDs and positions where practical so updates do not destroy the user's spatial layout.
- Every file node must reference an existing path relative to the `docs/` vault.
- Every edge must reference existing node IDs, and the `.canvas` file must remain valid JSON Canvas 1.0.
- Never include secrets, cookies, session payloads, private account content, or sensitive screenshots.

Use the evidence labels defined in `docs/Home.md`: **verified**, **observed**, **inferred**, **implemented but unverified externally**, and **not implemented**. Never describe an untested external workflow as working.

## Core product requirements

Preserve and advance the seven requirements in `docs/Product Requirements.md`:

1. LokeGEO-style UI with a fixed sidebar as the sole navigation menu.
2. Complete English and Simplified Chinese UI translation.
3. Complete light and dark mode support.
4. Keyword distillation using the MiniMax agent.
5. Functional knowledge bases and image bases.
6. Publishing to multiple Chinese media platforms.
7. LokeGEO-similar personal-media account setup.

Do not mark a requirement complete until its documented acceptance criteria have been exercised.

## Account authorization contract

- Open the selected platform's real login page in a dedicated Electron authorization window.
- Keep a small GEO-owned toolbar visible and let the platform page fill all remaining window space.
- The user performs credentials, CAPTCHA, QR confirmation, 2FA, and every other security interaction manually.
- Only **Confirm logged in / 确认已登录** may trigger domain-scoped cookie capture.
- Store captured cookies and supplemental Web Storage only in the encrypted local publisher vault.
- Never return raw cookies, storage values, passwords, encryption keys, or tokens to the React renderer or logs.
- A loaded page is not proof of authentication. Missing cookies, login pages, platform errors, and undetected identity must not produce a healthy account state.
- Keep accounts isolated by platform/account partition and profile.

The workflow is an independent clean-room implementation of observed behavior. Do not claim access to LokeGEO source code, copy proprietary bundled code, or claim exact internal equivalence without evidence.

## Publishing architecture

The account store, encrypted vault, queue, jobs, leases, heartbeats, account locks, approval states, diagnostics, and cancellation are shared infrastructure. Login, editor discovery, trusted input, publish controls, and success confirmation are platform-specific adapters.

Only Zhihu is currently operational for publishing. Other registered platforms have account-login metadata but unvalidated selectors and no publishing adapter. Keep them visibly unavailable for publishing until implementation, tests, and a live verification are complete.

Publishing must fail closed:

- never click a guessed or ambiguous control;
- never automate CAPTCHA or platform security checks;
- preparation must not publish when manual review is enabled;
- an editor page or locally populated form is not publication success;
- require a platform success signal or transition to a public result;
- retain visible failures for inspection when safe and release account locks on completion or cancellation.

## UI rules

- The sidebar is the sole primary navigation surface and must remain fixed on desktop.
- All routes must use the same shell, spacing, control language, responsive behavior, and semantic theme tokens.
- Do not add a competing top navigation menu. A utility/header bar may contain non-navigation actions such as language, theme, balance, policy, and profile controls.
- Every GEO-owned user-facing string must support English and Simplified Chinese. Platform-owned webpages are excluded.
- Use theme variables instead of hard-coded light colors. Check every changed surface in both themes.
- Preserve accessible names, keyboard behavior, focus visibility, disabled states, and readable contrast.

## Data and security

- `.geo-desktop/` and `.geo-publisher/` contain sensitive runtime profiles and account sessions. Never inspect, copy, commit, clean, or delete them unless the user explicitly requests that exact operation and understands the account impact.
- Never commit `.env`, API keys, cookies, session payloads, vault keys, private article content, or screenshots containing private account data.
- The browser must not receive `ANTHROPIC_API_KEY`; MiniMax requests go through the loopback proxy.
- Keep local services bound to `127.0.0.1`.
- Treat external platform DOM and responses as untrusted and unstable.
- Preserve user work and unrelated dirty-worktree changes.

## Repository ownership

- `src/` — React renderer, features, state, translation, publishing UI, and styles.
- `desktop/` — Electron main process, preload bridge, authorization window, readiness, navigation, and local renderer server.
- `publisher/` — publisher API, account/job store, vault, profiles, locks, platform registry, and adapters.
- `server/` — local MiniMax/Anthropic-compatible proxy.
- `tests/` — Node unit and Playwright smoke/feature tests.
- `docs/` — Obsidian source-of-truth vault.
- `dist/` — generated build output.

See `docs/Reference/Repository Map.md` for high-risk files and ownership details.

## Working method

1. Inspect the existing implementation and working tree before editing.
2. Make the smallest coherent change that satisfies the requirement.
3. Reuse shared lifecycle and UI primitives; keep platform-specific behavior in adapters.
4. Add or update focused tests for behavior and failure boundaries.
5. Update the relevant source-of-truth notes.
6. Synchronize `docs/GEO System Overview.canvas` at each meaningful milestone.
7. Recheck those notes and the canvas against the completed implementation; repair wikilinks and file-node references.
8. Verify in proportion to risk.
9. Report what is implemented separately from what was verified against a live external platform.

Do not use subagents for ceremony. When delegation is useful, prefer one bounded implementation agent and avoid overlapping investigations.

## Required verification

For ordinary code changes, run:

```powershell
npm run test:unit
npm run build
git diff --check
```

Also run `npm run test:smoke` after navigation, interaction, translation, theme, or responsive UI changes. Run focused feature tests when available.

Live account or publishing verification is separate from automated testing. Record its date and result in `docs/Current State.md` without secrets or private content.

## Workspace hygiene

- Preserve source directories, `node_modules/`, `dist/`, `skills/`, `docs/.obsidian/`, and both GEO runtime profile directories unless explicitly in scope.
- Generated `.electron-cache/`, `.npm-cache-temp/`, and `test-results/` may be regenerated.
- Random Unicode directories containing only `Microsoft/Spelling/neutral` are spellchecker artifacts, but validate that they contain no files or reparse points before cleanup.
- Electron windows and account sessions should keep spellcheck disabled to prevent those artifacts from returning.
- Never broadly terminate Node/Electron processes or clear ports. Identify the exact owning process and stop only processes started for the current task.

## Documentation maintenance

- Keep `docs/Product Requirements.md` canonical for scope and acceptance criteria.
- Keep `docs/Current State.md` honest about partial and externally unverified work.
- Keep `docs/GEO System Overview.canvas` synchronized as the at-a-glance dashboard.
- Add major choices to `docs/Decisions/Decision Log.md`.
- Add repeatable failures and fixes to `docs/Operations/Troubleshooting.md`.
- Never store secrets or personal session data in the vault.

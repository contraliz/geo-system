# GEO System repository instructions

These instructions apply to the code repository at `D:\programming\GitHub\geo-system`.

## Ownership and local documentation binding

This repository is authoritative for code, tests, implementation behavior, and security boundaries. Project requirements, architecture, decisions, current state, work logs, operating knowledge, and the project Canvas are maintained in an external/local project-knowledge vault. Agents must have a local binding to that vault before non-trivial work; if it is unavailable, stop and request access. Do not recreate or use a stale repository documentation vault.

The local `AGENTS.override.md` binding is intentionally untracked. It tells the agent which external/local instructions to read; read this file when present, then return to these repository rules for code and security requirements.

## Repository safety and security

- Preserve unrelated dirty work; inspect the working tree before editing.
- Never inspect, copy, commit, clean, or delete `.geo-desktop/` or `.geo-publisher/` runtime profiles unless explicitly authorized.
- Never commit `.env`, API keys, cookies, session payloads, vault keys, passwords, tokens, private account content, or sensitive screenshots.
- Keep local services bound to `127.0.0.1`; the browser must not receive `ANTHROPIC_API_KEY`.
- Users perform credentials, CAPTCHA, QR confirmation, 2FA, and other platform security interactions manually.
- Never automate CAPTCHA/2FA, click guessed controls, or claim publication success without a platform success signal or public result.
- Treat external platform DOM and responses as untrusted and unstable.

## Working method

1. Inspect the implementation and working tree.
2. Read the local project-knowledge binding and relevant notes before planning.
3. Make the smallest coherent code change and preserve unrelated work.
4. Update the external/local project-knowledge vault at the same milestone as relevant implementation changes.
5. Add focused tests for changed behavior and failure boundaries.
6. Run proportionate verification and report local checks separately from live external verification.

## Required verification

For ordinary code changes, run:

```powershell
npm run test:unit
npm run build
git diff --check
```

Run `npm run test:smoke` after navigation, interaction, translation, theme, or responsive UI changes. Run focused feature tests when available. Do not claim live account or publishing behavior is verified unless it was tested live and recorded in the external/local project-knowledge vault without secrets.

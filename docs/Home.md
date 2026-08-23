---
aliases:
  - GEO System Source of Truth
tags:
  - moc
  - project
status: active
last_verified: 2026-08-23
---

# GEO System source of truth

This vault records what the project does, what is actually verified, and what remains uncertain. It must describe the checked-in implementation rather than the intended UI alone.

## Start here

- [[GEO System Overview.canvas|Project Canvas]] — visual status, architecture, risks, and next steps at a glance
- [[Current State]] — current milestone, support matrix, and known gaps
- [[Product Requirements]] — the seven canonical core features and acceptance criteria
- [[Architecture/System Architecture]] — processes, boundaries, ports, and persistence
- [[Architecture/Account Authorization]] — embedded login and session capture
- [[Architecture/Publishing Workflow]] — queue, browser automation, and approval lifecycle
- [[Reference/Repository Map]] — ownership by directory
- [[Operations/Development Guide]] — commands and local workflow
- [[Operations/Troubleshooting]] — recurring failures and safe recovery
- [[Decisions/Decision Log]] — accepted technical decisions and evidence level

## Source-of-truth rules

1. Label external behavior as **verified**, **observed**, **inferred**, or **unverified**.
2. Never claim equivalence with LokeGEO unless a behavior was directly observed and reproduced in a current end-to-end test.
3. Never copy undocumented proprietary code. The current implementation is a clean-room implementation based on observable behavior and locally inspected artifacts.
4. Never commit account secrets or session data. `.geo-desktop/` and `.geo-publisher/` are runtime data, not documentation.
5. A code change that alters architecture, account authorization, publishing state, ports, or storage must update the relevant note in the same change.
6. A real external publish is not proven by unit tests, a populated editor, or a local success state. Record the external URL or platform success signal without recording private content.

## Status labels

- **Verified** — supported by a current automated test or direct end-to-end observation.
- **Implemented, unverified externally** — code exists and local tests pass, but the live platform behavior has not been confirmed.
- **Configured, selectors unvalidated** — an authorization URL and session capture path exist, but identity/login selectors may be wrong after a platform redesign.
- **Not implemented** — UI or registry metadata may exist, but the action intentionally fails safely.

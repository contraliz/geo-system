---
tags:
  - decisions
  - architecture
status: active
last_verified: 2026-08-23
---

# Decision log

## Accepted decisions

### D-001 — Clean-room compatibility, not proprietary source copying

**Decision:** reproduce observable account/publishing behavior with independently written code. Static inspection may inform behavior, but unverified internal details are not presented as facts and proprietary bundled code is not copied into this repository.

**Why:** behavior can be tested; internal source ownership and exact implementation cannot be assumed.

### D-002 — Electron owns interactive account login

**Decision:** use an isolated Electron authorization window with a local top toolbar and account-scoped persistent partition. The user manually completes platform challenges and explicitly clicks Finish.

**Why:** this matches the required desktop UX and keeps session capture out of the React renderer.

### D-003 — Encrypted local session vault

**Decision:** store cookies and Web Storage in an AES-256-GCM vault owned by the publisher. Public account records expose health metadata only.

**Why:** browser sessions are sensitive credentials and must not be logged or stored in renderer state.

### D-004 — Shared lifecycle, custom platform adapters

**Decision:** share accounts, vaults, locks, jobs, leases, approval, and diagnostics; implement platform-specific login/editor/publish behavior per adapter.

**Why:** Chinese publishing sites have different DOMs, editors, controls, and success semantics. A universal click script would fail unsafely.

### D-005 — Manual review is optional but explicit when enabled

**Decision:** default jobs may continue after successful preparation; selecting manual review pauses in `awaiting-approval` and cannot publish before the approval request.

**Why:** this preserves the requested streamlined workflow while providing an operator-controlled safety mode.

### D-006 — Fail closed on uncertain publish controls

**Decision:** never click a guessed publish or confirmation target. Retain visible failed sessions for inspection where possible.

**Why:** a false positive can publish unintended content or misreport external state.

### D-007 — Runtime profiles are not cleanup targets

**Decision:** `.geo-desktop/` and `.geo-publisher/` are protected local state. Only explicitly classified caches and empty artifacts may be cleaned.

**Why:** deleting a profile can destroy account authorization and pending publishing evidence.

### D-008 — Normalize only the auth-session client identity

**Decision:** before creating an authorization webview, configure only that account partition with a Chrome UA built from the current Electron Chromium version, remove the Electron token, and set an explicit ordered Accept-Language list. Do not downgrade Electron, copy an older platform fingerprint, intercept headers without evidence, or weaken TLS checks.

**Why:** the observed Zhihu `10001` response and clean-room runtime report indicate that Electron UA/client identity can be rejected, while a session-scoped runtime-derived override preserves the actual Chromium major and avoids changing unrelated GEO windows.

## Adding a decision

Copy [[Templates/Decision]], assign the next ID, link affected notes/files, and record verification evidence. Supersede older decisions instead of silently rewriting history.

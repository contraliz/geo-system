---
tags:
  - architecture
  - publishing
status: active
last_verified: 2026-08-22
---

# Publishing workflow

## Shared lifecycle

The publisher provides a common lifecycle while delegating platform DOM work to adapters.

```text
queued -> preparing -> editor-open -> content-filled -> draft-saved
                                                        |-- manual review on --> awaiting-approval -> publishing
                                                        `-- manual review off ---------------------> publishing
publishing -> published
any active state -> failed / failed-inspection / cancelled
```

Shared responsibilities:

- account and platform validation;
- job storage, attempt limits, leases, and heartbeats;
- account/platform concurrency locks;
- manual-review state and approval endpoint;
- bounded diagnostics and artifact paths;
- encrypted session loading and refresh;
- cancellation and retained-browser cleanup.

Platform adapter responsibilities:

- login/admin/editor URLs;
- authenticated-state checks;
- editor discovery and trusted title/body input;
- cover and AI-disclosure controls;
- exact publish and confirmation controls;
- platform-specific success evidence.

## Zhihu implementation

The Zhihu adapter opens `https://zhuanlan.zhihu.com/write`, discovers conservative editor targets, inputs through trusted Chromium/Puppeteer paths, verifies editor-owned content, optionally selects a first-image cover and AI disclosure, and requires an exact visible enabled `发布` control before proceeding.

When manual review is enabled, the prepared visible browser is retained and the job waits for explicit approval. When it is disabled, the job records an approval timestamp and continues automatically. The publish path may click a second exact confirmation control and must observe a non-editor article transition or a post-click success signal. An editor URL ending in `/edit` is not success.

## Safety behavior

- Preparation must not guess a publish control.
- CAPTCHA, 2FA, and security checks are never automated.
- Background mode is appropriate only after a healthy manual authorization exists.
- Ambiguous visible failures remain available as `failed-inspection` when possible.
- A local `published` state without verified external success evidence is a bug, not an acceptable shortcut.

## Adding another platform

1. Validate the account authorization metadata and identity selectors.
2. Implement a platform adapter with editor discovery, trusted input, publish controls, and success checks.
3. Add unit tests for every selector decision and failure boundary.
4. Verify a visible draft without publishing.
5. Verify manual approval and publish confirmation using a test account.
6. Only then set the platform's `operational` flag to `true`.

Related: [[Architecture/Account Authorization]], [[Current State]], [[Decisions/Decision Log]].

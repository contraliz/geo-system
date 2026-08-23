---
tags:
  - work-log
date: 2026-08-23
status: complete
---

# Work log — authorization client compatibility

## Goal

Diagnose the observed Zhihu `10001 请求参数异常` response and reduce Electron client-identification rejection without copying a historical platform fingerprint or downgrading Electron.

## Changes

- Added a shared auth-session compatibility helper that builds a normal Chrome UA from the current Electron Chromium version, removes only the Electron token, and sets `zh-CN,zh,en-US,en`.
- Applied the helper before auth webview creation in both the desktop main-process authorization window and the legacy visible-auth child.
- Updated development entrypoints to use `node --no-maglev` for the affected Windows Node 24.15/Vite startup crash.

## Verification

- Focused UA/session and script-contract tests pass. The full unit suite passes 87/87, the production build passes, and `git diff --check` reports no whitespace errors beyond existing LF/CRLF normalization warnings.
- The user reported on 2026-08-23 that the Zhihu `10001` / 获取验证码 retry succeeded after the UA fix and provided screenshot evidence of Connected / Healthy with Session verified locally after Confirm logged in. Session reuse after restart and publishing remain unverified. No runtime profiles, cookies, screenshots, or private platform content were copied into the repository.

## Open issues

- Session reuse after restart and publishing remain separate verification tasks.

## Source-of-truth updates

- [[Current State]]
- [[Architecture/Account Authorization]]
- [[Operations/Troubleshooting]]
- [[Operations/Development Guide]]
- [[Decisions/Decision Log]]
- [[GEO System Overview.canvas|Project Canvas]]

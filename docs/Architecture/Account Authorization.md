---
tags:
  - architecture
  - accounts
  - security
status: active
last_verified: 2026-08-23
---

# Account authorization

## Observable workflow

1. The user chooses a platform and creates an account label in the renderer.
2. The renderer collects a dedicated, labeled local account name in an isolated form control. The field is focused when the connection panel opens, supports Enter-to-submit, and reports missing labels accessibly.
3. The publisher creates an account-scoped profile and requests an Electron authorization window.
4. Electron opens a local toolbar above an isolated platform webview. The toolbar uses a fixed 64px grid row and the webview uses the remaining `minmax(0, 1fr)` row with Electron-compatible `display:flex` sizing. The platform page owns the remaining window area so CAPTCHA and QR-code interactions are usable during resize.
5. The user completes login manually. GEO System does not automate credentials, CAPTCHA, QR confirmation, 2FA, or security challenges.
6. The user clicks **Confirm logged in / 确认已登录** in the local toolbar.
7. Only after that click, Electron captures cookies for the configured platform domain. It also captures that page's `localStorage`, `sessionStorage`, origin, and bounded public identity metadata as supplemental session state.
8. The publisher stores the session in the local AES-256-GCM vault and updates the public account record without exposing raw session data to the renderer.

## Isolation and security

- Partition names are account-scoped persistent Electron partitions (`persist:geo-<platform>-<account>`).
- Authorization windows use content sizing (`useContentSize: true`) with a 1280×820 default and 760×560 minimum content size, avoiding native-frame/content-width clipping on smaller displays.
- Before either auth window creates a webview, its account-scoped session receives a normal Chrome user agent built from the current Electron Chromium version (`process.versions.chrome`) with the Electron token removed and `zh-CN,zh,en-US,en` accepted. The compatibility is session-scoped; Electron is not downgraded and TLS verification is not weakened.
- Navigation is limited to ordinary HTTP/HTTPS URLs; file, data, JavaScript, and custom schemes are blocked from the platform surface.
- Authorization start/result exchange uses a desktop/publisher protocol and one-time token so arbitrary local pages cannot submit captured sessions.
- Cookie import remains available as a fallback, but imported data is not considered healthy until verification succeeds.
- Disconnecting an account removes its stored session/profile through the platform adapter and cancels unfinished work associated with it.

## Platform status

Zhihu has a dedicated account adapter. Other configured platforms use the shared Electron capture lifecycle, but their identity selectors are unvalidated and account inspection is not implemented. A successful page load is not sufficient evidence of a successful authorization.

## Relationship to LokeGEO

The UI lifecycle—open a dedicated login browser, let the user sign in, then click a top completion button to capture a reusable local session—matches behavior observed in LokeGEO. The internal LokeGEO source is not available as verified source code. GEO System's implementation is independent and should not be described as an exact code copy.

## Verification criteria

An authorization flow is verified only when all of the following hold:

- the real platform login surface fills the usable window;
- the user can complete any platform challenge manually;
- Confirm logged in returns an authenticated result with captured domain cookies and a detected identity;
- the account card becomes healthy after the window closes;
- reopening or background verification reuses the saved session;
- logs and API responses contain no raw cookies or storage values.

On 2026-08-23, the user reported that the Zhihu `10001 请求参数异常` / **获取验证码** retry succeeded after the runtime-derived UA fix, then provided a screenshot showing **Confirm logged in** completed and the account row as **Connected / Healthy** with **Session verified locally**. This verifies the login and local session-health milestone only; session reuse after restart and publishing remain unverified.

Related: [[Current State]], [[Architecture/System Architecture]], [[Operations/Troubleshooting]].

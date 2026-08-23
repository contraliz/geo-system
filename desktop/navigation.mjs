export function isAllowedRendererNavigation(destination, allowedRenderer) {
  try {
    const target = new URL(String(destination || ''))
    const allowed = new URL(String(allowedRenderer || ''))
    return target.origin === allowed.origin && target.pathname === allowed.pathname
  } catch {
    return String(destination || '') === String(allowedRenderer || '')
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createPlatformLock } from '../publisher/locks.mjs'
import { buildChromeLaunchSpec, headlessBrowserExecutablePath, launchBrowser, waitForDevtools } from '../publisher/puppeteer.mjs'
import { assertEditorWritable, classifyPublishResponse, clickAndFocus, clickPublishAndConfirm, detectZhihuClientError, dismissDraftLoadingDialog, editorFieldStateIsValid, getZhihuPublishStrategy, getZhihuPublisherMode, inspectDraftLoadingOverlay, inspectDraftStability, inspectPublishReadiness, isPublished, normalizeEditorText, normalizePublicArticleUrl, pasteHtmlWithTrustedInput, pasteWithTrustedInput, prepareZhihuJob, sanitizePublishResponsePayload, selectAllAndClear, selectEditorFieldInfos, summarizePublishDiagnostics, waitForDraftStable, waitForPublishReadiness } from '../publisher/zhihu.mjs'
import { clearTrace, getTrace, trace, traceSnapshot } from '../publisher/trace.mjs'

test('editor verification rejects visible overlay text when Zhihu state is empty', () => {
  assert.equal(editorFieldStateIsValid({ text: 'visible overlay', prefix: 'visible', label: 'body', placeholderVisible: true, charCount: 0 }), false)
  assert.equal(editorFieldStateIsValid({ text: 'entered content', prefix: 'entered', label: 'body', placeholderVisible: false, charCount: 15 }), true)
  assert.equal(editorFieldStateIsValid({ text: 'entered title', prefix: 'entered', label: 'title', placeholderVisible: false, charCount: 0 }), true)
})

test('visible and background publisher modes remain explicit strategies', () => {
  assert.equal(getZhihuPublisherMode({ mode: 'visible' }), 'visible')
  assert.equal(getZhihuPublisherMode({ mode: 'background' }), 'background')
  assert.throws(() => getZhihuPublisherMode({ mode: 'hidden' }), /unsupported zhihu publisher mode/i)
})

test('HTML clipboard insertion fails closed without falling back to DOM mutation', async () => {
  let keyboardPressed = false
  const page = {
    evaluate: async () => false,
    keyboard: { down: async () => {}, press: async () => { keyboardPressed = true }, up: async () => {} },
  }
  assert.equal(await pasteHtmlWithTrustedInput(page, '<p>safe</p>', 'safe'), false)
  assert.equal(keyboardPressed, false)
})

test('visible strategy may retain inspection sessions while background strategy always cleans up', () => {
  assert.deepEqual(getZhihuPublishStrategy('visible'), {
    mode: 'visible', visible: true, headless: false, retainSessionOnFailure: true, usePendingSession: true,
  })
  assert.deepEqual(getZhihuPublishStrategy('background'), {
    mode: 'background', visible: false, headless: true, retainSessionOnFailure: false, usePendingSession: false,
  })
})

test('publish response sanitizer keeps only bounded safe fields', () => {
  const safe = sanitizePublishResponsePayload({ code: 0, message: 'ok', data: { id: 123, url: 'https://zhuanlan.zhihu.com/p/123', cookie: 'secret' }, request: 'secret' })
  assert.deepEqual(safe, { code: 0, message: 'ok', data: { id: 123, url: 'https://zhuanlan.zhihu.com/p/123' } })
})

test('HTTP 200 application-level rate limit is an explicit publish failure', () => {
  const result = classifyPublishResponse({ httpStatus: 200, url: 'https://www.zhihu.com/api/v4/content/publish', payload: { code: 1001, message: '操作频繁，请稍后再试' } })
  assert.equal(result.applicationError, true)
  assert.equal(result.rateLimited, true)
  assert.match(result.message, /操作频繁/)
})

test('Zhihu 10001 response maps to an actionable client-upgrade error', () => {
  const result = classifyPublishResponse({ httpStatus: 200, url: 'https://www.zhihu.com/api/v4/content/publish', payload: { code: 10001, message: '请求参数异常' } })
  assert.equal(result.applicationError, true)
  assert.equal(result.errorCode, 'zhihu-client-outdated')
  assert.match(result.message, /10001|升级客户端/)
})

test('Zhihu login-page 10001 banner maps to an actionable account error', async () => {
  const page = { $eval: async () => '10001:请求参数异常，请升级客户端后重试' }
  assert.deepEqual(await detectZhihuClientError(page), {
    errorCode: 'zhihu-client-outdated',
    message: 'Zhihu returned 10001 (请求参数异常). Update the client or reopen the account profile, then try again.',
  })
  assert.equal(await detectZhihuClientError({ $eval: async () => '登录知乎' }), null)
})

test('successful response article ids normalize to public non-edit URLs', () => {
  const result = classifyPublishResponse({ httpStatus: 200, url: 'https://www.zhihu.com/api/v4/content/publish', payload: { code: 0, data: { id: '12345' } } })
  assert.equal(result.applicationError, false)
  assert.equal(result.publicUrl, 'https://zhuanlan.zhihu.com/p/12345')
  assert.equal(normalizePublicArticleUrl('https://zhuanlan.zhihu.com/p/12345/edit'), '')
})

test('editor input is blocked while the exact draft-loading modal is visible', async () => {
  let clicks = 0
  const page = { evaluate: async () => ({ visible: true, hasExactConfirm: true }) }
  const handle = { evaluate: async () => false, click: async () => { clicks++ } }
  await assert.rejects(() => assertEditorWritable(page, handle), /draft loading modal or overlay/i)
  assert.equal(clicks, 0)
})

test('exact draft-loading confirmation can be dismissed before the overlay idle gate', async () => {
  let modalVisible = true
  const modalRoot = { textContent: '草稿加载中，请等待加载完成后再次修改。 确定', parentElement: null }
  const element = {
    textContent: '确定',
    parentElement: modalRoot,
    getBoundingClientRect: () => ({ width: 80, height: 30 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
  }
  const button = {
    evaluate: async (callback, ...args) => callback(element, ...args),
    click: async () => { modalVisible = false },
  }
  const page = {
    $$: async () => [button],
    evaluate: async () => modalVisible ? { visible: true, hasExactConfirm: true } : { visible: false, hasExactConfirm: false },
  }
  assert.equal(await inspectDraftLoadingOverlay(page).then(state => state.visible), true)
  assert.equal(await dismissDraftLoadingDialog(page), true)
  assert.equal((await inspectDraftLoadingOverlay(page)).visible, false)
})

test('exact editor-owned body text wins over a stale zero character counter', () => {
  const body = 'A body with\nmultiple lines.'
  assert.equal(editorFieldStateIsValid({ text: 'A body with\r\nmultiple lines.\n', expectedText: body, prefix: 'A body', label: 'body', placeholderVisible: false, charCount: 0 }), true)
  assert.equal(editorFieldStateIsValid({ text: `${body} extra`, expectedText: body, prefix: 'A body', label: 'body', placeholderVisible: false, charCount: 0 }), false)
  assert.equal(normalizeEditorText(' A\r\nB\u00a0'), 'A\nB')
})

test('Zhihu trusted paste uses the supported Puppeteer sendCharacter API', async () => {
  const calls = []
  await pasteWithTrustedInput({ keyboard: { sendCharacter: value => calls.push(value) } }, '标题与正文')
  assert.deepEqual(calls, ['标题与正文'])
})

test('editor click/focus accepts an ElementHandle without isClosed()', async () => {
  const calls = []
  let evaluations = 0
  const handle = {
    evaluate: async () => {
      evaluations += 1
      return evaluations === 1 ? true : evaluations === 3
    },
    click: async () => calls.push('click'),
  }
  await clickAndFocus({ isClosed: () => false }, handle)
  assert.deepEqual(calls, ['click'])
  assert.equal(evaluations, 3)
})

test('select-all uses explicit modifier down/press/up events', async () => {
  const events = []
  await selectAllAndClear({ keyboard: {
    down: key => events.push(['down', key]),
    press: key => events.push(['press', key]),
    up: key => events.push(['up', key]),
  } })
  assert.deepEqual(events, [['down', process.platform === 'darwin' ? 'Meta' : 'Control'], ['press', 'A'], ['up', process.platform === 'darwin' ? 'Meta' : 'Control'], ['press', 'Backspace']])
  assert.equal(events.some(([, key]) => String(key).includes('+')), false)
})

test('publish readiness inspects an exact enabled control without clicking it', async () => {
  let clicks = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    disabled: false,
    getAttribute: () => null,
    classList: { contains: () => false },
  }
  const button = { evaluate: async callback => callback(element), click: () => { clicks++ } }
  const readiness = await inspectPublishReadiness({ $$: async () => [button] })
  assert.equal(readiness.ready, true)
  assert.equal(readiness.control.text, '发布')
  assert.equal(clicks, 0)
})

test('background readiness waits for an exact publish control to become enabled without clicking', async () => {
  let polls = 0
  let clicks = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    get disabled() { return polls < 3 },
    getAttribute: () => null,
    classList: { contains: () => false },
  }
  const button = { evaluate: async callback => callback(element), click: () => { clicks++ } }
  const readiness = await waitForPublishReadiness({ $$: async () => { polls++; return [button] } }, { timeoutMs: 50, pollMs: 1 })
  assert.equal(readiness.ready, true)
  assert.equal(polls, 3)
  assert.equal(clicks, 0)
})

test('background readiness times out on a disabled exact control without clicking', async () => {
  let clicks = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    disabled: true,
    getAttribute: () => null,
    classList: { contains: () => false },
  }
  const button = { evaluate: async callback => callback(element), click: () => { clicks++ } }
  await assert.rejects(
    () => waitForPublishReadiness({ $$: async () => [button] }, { timeoutMs: 10, pollMs: 2 }),
    /present but disabled.*no click was attempted/i,
  )
  assert.equal(clicks, 0)
})

test('draft stability rejects loading and saving indicators', async () => {
  const page = { $eval: async () => '草稿加载中，请等待加载完成后再次修改。\n草稿保存中' }
  const state = await inspectDraftStability(page)
  assert.equal(state.loading, true)
  assert.equal(state.saved, false)
  assert.equal(state.stable, false)
  await assert.rejects(
    () => waitForDraftStable(page, { timeoutMs: 3, pollMs: 1 }),
    /still loading or saving.*no publish click was attempted/i,
  )
})

test('draft stability waits for a saved footer before publishing', async () => {
  let polls = 0
  const page = {
    $eval: async () => {
      polls++
      return polls < 3 ? '草稿保存中' : '刚刚 · 草稿'
    },
  }
  const state = await waitForDraftStable(page, { timeoutMs: 50, pollMs: 1 })
  assert.equal(state.stable, true)
  assert.equal(polls, 3)
})

test('draft stability accepts relative-time saved footers', async () => {
  for (const footer of ['6 分钟前 · 草稿', '昨天 · 草稿', '2 hours ago · draft']) {
    const state = await inspectDraftStability({ $eval: async () => footer })
    assert.equal(state.loading, false, footer)
    assert.equal(state.stable, true, footer)
  }
})

test('editor URL is not treated as published, while a non-edit article transition is', async () => {
  const editor = { url: () => 'https://zhuanlan.zhihu.com/p/123/edit', $eval: async () => '' }
  assert.equal(await isPublished(editor, editor.url()), false)
  const article = { url: () => 'https://zhuanlan.zhihu.com/p/123', $eval: async () => '' }
  assert.equal(await isPublished(article, 'https://zhuanlan.zhihu.com/p/123/edit'), true)
  const success = { url: () => 'https://zhuanlan.zhihu.com/p/123/edit', $eval: async () => '发布成功' }
  assert.equal(await isPublished(success, success.url()), false)
  assert.equal(await isPublished(success, success.url(), { navigationObserved: true }), false)
  const publicSuccess = { url: () => 'https://zhuanlan.zhihu.com/p/123', $eval: async () => '发布成功' }
  assert.equal(await isPublished(publicSuccess, publicSuccess.url(), { navigationObserved: true }), true)
})

test('publish confirmation requires a second exact click before success', async () => {
  let phase = 0
  const clicked = []
  const buttonFor = text => {
    const element = {
      getBoundingClientRect: () => ({ width: 80, height: 32 }),
      ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
      textContent: text,
      disabled: false,
      getAttribute: () => null,
      classList: { contains: () => false },
      setAttribute: () => {},
      scrollIntoView: () => {},
    }
    return { evaluate: async callback => callback(element), click: async () => { clicked.push(text); phase++ } }
  }
  const toolbar = buttonFor('发布')
  const confirmation = buttonFor('确定发布')
  const page = {
    isClosed: () => false,
    $$: async () => phase === 0 ? [toolbar] : phase === 1 ? [confirmation] : [],
    url: () => phase >= 2 ? 'https://zhuanlan.zhihu.com/p/123' : 'https://zhuanlan.zhihu.com/p/123/edit',
    waitForNavigation: async () => true,
    $eval: async () => '',
  }
  await clickPublishAndConfirm(page, 'https://zhuanlan.zhihu.com/p/123/edit')
  assert.deepEqual(clicked, ['发布', '确定发布'])
})

test('direct article transition after the toolbar publish click counts as success', async () => {
  let clicked = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    disabled: false,
    getAttribute: () => null,
    classList: { contains: () => false },
    setAttribute: () => {},
    scrollIntoView: () => {},
  }
  const button = { evaluate: async callback => callback(element), click: async () => { clicked++ } }
  const page = {
    isClosed: () => false,
    $$: async () => [button],
    url: () => clicked ? 'https://zhuanlan.zhihu.com/p/2073764119379961215' : 'https://zhuanlan.zhihu.com/p/2073764119379961215/edit',
    waitForNavigation: async () => true,
    $eval: async () => '',
  }
  await clickPublishAndConfirm(page, 'https://zhuanlan.zhihu.com/p/2073764119379961215/edit')
  assert.equal(clicked, 1)
})

test('unchanged enabled publish control is retried once, then succeeds on its observable transition', async () => {
  let clicked = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    disabled: false,
    getAttribute: () => null,
    classList: { contains: () => false },
    setAttribute: () => {},
    scrollIntoView: () => {},
  }
  const button = { evaluate: async callback => callback(element), click: async () => { clicked++ } }
  const page = {
    isClosed: () => false,
    $$: async () => [button],
    url: () => clicked >= 2 ? 'https://zhuanlan.zhihu.com/p/999' : 'https://zhuanlan.zhihu.com/p/999/edit',
    waitForNavigation: async () => false,
    $eval: async () => '',
  }
  await clickPublishAndConfirm(page, 'https://zhuanlan.zhihu.com/p/999/edit', { timeoutMs: 700 })
  assert.equal(clicked, 2)
})

test('publish does not fall back to a programmatic DOM click when the trusted click fails', async () => {
  let domClicks = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    disabled: false,
    getAttribute: () => null,
    classList: { contains: () => false },
    setAttribute: () => {},
    scrollIntoView: () => {},
    click: () => { domClicks++ },
  }
  const button = { evaluate: async callback => callback(element), click: async () => { throw new Error('hit-test blocked') } }
  const page = { isClosed: () => false, $$: async () => [button] }
  await assert.rejects(() => clickPublishAndConfirm(page, 'https://zhuanlan.zhihu.com/p/999/edit', { timeoutMs: 700 }), /hit-test blocked/)
  assert.equal(domClicks, 0)
})

test('publish response blocks retries even when HTTP 200 reports a rate limit', async () => {
  let clicked = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布', disabled: false, getAttribute: () => null,
    classList: { contains: () => false }, setAttribute: () => {}, scrollIntoView: () => {},
  }
  const button = { evaluate: async callback => callback(element), click: async () => { clicked++ } }
  const page = { isClosed: () => false, $$: async () => [button], url: () => 'https://zhuanlan.zhihu.com/p/999/edit' }
  const rateLimit = classifyPublishResponse({ httpStatus: 200, url: 'https://www.zhihu.com/api/v4/content/publish', payload: { code: 429, message: '操作频繁' } })
  await assert.rejects(() => clickPublishAndConfirm(page, page.url(), { effectSignal: () => rateLimit, timeoutMs: 700 }), /rate limited.*操作频繁/i)
  assert.equal(clicked, 1)
})

test('detached frame is reacquired and polled without retrying the publish click', async () => {
  let clicked = 0
  let urlReads = 0
  let reacquired = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布', disabled: false, getAttribute: () => null,
    classList: { contains: () => false }, setAttribute: () => {}, scrollIntoView: () => {},
  }
  const button = { evaluate: async callback => callback(element), click: async () => { clicked++ } }
  const oldPage = {
    isClosed: () => false,
    $$: async () => [button],
    url: () => { if (++urlReads === 1) throw new Error("Attempted to use detached Frame 'frame'") ; return 'https://zhuanlan.zhihu.com/p/999/edit' },
  }
  const publicPage = {
    isClosed: () => false,
    $$: async () => [],
    url: () => 'https://zhuanlan.zhihu.com/p/999',
    $eval: async () => '',
  }
  await clickPublishAndConfirm(oldPage, 'https://zhuanlan.zhihu.com/p/999/edit', {
    timeoutMs: 2_000,
    reacquirePage: async () => { reacquired++; return publicPage },
  })
  assert.equal(clicked, 1)
  assert.equal(reacquired, 1)
})

test('successful publish response with public URL is verified before returning', async () => {
  let clicked = 0
  let verified = ''
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布', disabled: false, getAttribute: () => null,
    classList: { contains: () => false }, setAttribute: () => {}, scrollIntoView: () => {},
  }
  const button = { evaluate: async callback => callback(element), click: async () => { clicked++ } }
  const page = { isClosed: () => false, $$: async () => [button], url: () => 'https://zhuanlan.zhihu.com/p/999/edit' }
  const success = classifyPublishResponse({ httpStatus: 200, url: 'https://www.zhihu.com/api/v4/content/publish', payload: { code: 0, data: { url: 'https://zhuanlan.zhihu.com/p/999' } } })
  await clickPublishAndConfirm(page, page.url(), {
    effectSignal: () => success,
    verifyPublicUrl: async (_page, url) => { verified = url; return true },
    timeoutMs: 700,
  })
  assert.equal(clicked, 1)
  assert.equal(verified, 'https://zhuanlan.zhihu.com/p/999')
})

test('delayed direct article transition is polled after the first click without a second click', async () => {
  let clicked = 0
  let urlPolls = 0
  const element = {
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
    textContent: '发布',
    disabled: false,
    getAttribute: () => null,
    classList: { contains: () => false },
    setAttribute: () => {},
    scrollIntoView: () => {},
  }
  const button = { evaluate: async callback => callback(element), click: async () => { clicked++ } }
  const page = {
    isClosed: () => false,
    $$: async () => clicked ? [] : [button],
    url: () => {
      if (clicked && ++urlPolls >= 4) return 'https://zhuanlan.zhihu.com/p/2073764119379961215'
      return 'https://zhuanlan.zhihu.com/p/2073764119379961215/edit'
    },
    waitForNavigation: async () => false,
    $eval: async () => '',
  }
  await clickPublishAndConfirm(page, 'https://zhuanlan.zhihu.com/p/2073764119379961215/edit')
  assert.equal(clicked, 1)
})

test('delayed post-confirmation navigation is polled without a third click', async () => {
  let phase = 0
  let urlPolls = 0
  const clicked = []
  const buttonFor = text => {
    const element = {
      getBoundingClientRect: () => ({ width: 80, height: 32 }),
      ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } },
      textContent: text,
      disabled: false,
      getAttribute: () => null,
      classList: { contains: () => false },
      setAttribute: () => {},
      scrollIntoView: () => {},
    }
    return { evaluate: async callback => callback(element), click: async () => { clicked.push(text); phase++ } }
  }
  const toolbar = buttonFor('发布')
  const confirmation = buttonFor('确定发布')
  const page = {
    isClosed: () => false,
    $$: async () => phase === 0 ? [toolbar] : phase === 1 ? [confirmation] : [],
    url: () => {
      if (phase >= 2 && ++urlPolls >= 4) return 'https://zhuanlan.zhihu.com/p/2073764119379961215?just_published=1'
      return 'https://zhuanlan.zhihu.com/p/2073764119379961215/edit'
    },
    waitForNavigation: async () => false,
    $eval: async () => '',
  }
  await clickPublishAndConfirm(page, 'https://zhuanlan.zhihu.com/p/2073764119379961215/edit')
  assert.deepEqual(clicked, ['发布', '确定发布'])
})

test('publish diagnostics are bounded and omit GET/query data', () => {
  const diagnostic = summarizePublishDiagnostics({
    currentUrl: 'https://zhuanlan.zhihu.com/p/123?secret=query-value',
    beforeUrl: 'https://zhuanlan.zhihu.com/p/123/edit?draft=private',
    bodyText: '发布失败\n请稍后再试\n' + 'x'.repeat(3_000),
    errorMessage: 'Zhihu did not confirm that the article was published; ' + 'y'.repeat(2_000),
    responses: [
      { method: 'GET', status: 200, url: 'https://www.zhihu.com/api?cookie=secret' },
      { method: 'POST', status: 403, url: 'https://www.zhihu.com/api/articles?token=secret' },
      { method: 'PATCH', status: 500, url: 'https://www.zhihu.com/api/articles/123#fragment' },
    ],
  })
  assert.equal(diagnostic.currentUrl, 'https://zhuanlan.zhihu.com/p/123')
  assert.equal(diagnostic.beforeUrl, 'https://zhuanlan.zhihu.com/p/123/edit')
  assert.ok(diagnostic.bodyTextExcerpt.length <= 2_000)
  assert.ok(diagnostic.error.length <= 1_000)
  assert.deepEqual(diagnostic.nonGetResponses, [
    { method: 'POST', status: 403, url: 'https://www.zhihu.com/api/articles' },
    { method: 'PATCH', status: 500, url: 'https://www.zhihu.com/api/articles/123' },
  ])
  assert.equal(diagnostic.indicators[0].kind, 'error')
  assert.equal(diagnostic.indicators[1].kind, 'toast')
  assert.equal(JSON.stringify(diagnostic).includes('secret'), false)
})

test('browser launch rejection is contained by job preparation', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-publisher-launch-failure-'))
  let launched = false
  try {
    await assert.doesNotReject(() => prepareZhihuJob(
      { id: `missing-launch-${Date.now()}`, title: 'test', content: 'test', artifactDir },
      { id: 'missing-account', mode: 'background', profileDir: artifactDir },
      {
        load: async () => ({ launch: true }),
        launch: async () => { launched = true; throw new Error('simulated DevTools endpoint failure') },
      },
    ))
    assert.equal(launched, true)
  } finally {
    await fs.rm(artifactDir, { recursive: true, force: true })
  }
})

test('editor targeting prefers exact title and body semantics over overlay candidates', () => {
  const selected = selectEditorFieldInfos([
    { tag: 'input', placeholder: 'Search', aria: '', role: 'textbox', contenteditable: false, area: 50_000 },
    { tag: 'textarea', placeholder: '请输入标题', aria: '', role: 'textbox', contenteditable: false, area: 10_000 },
    { tag: 'div', placeholder: '', aria: '', role: 'textbox', className: 'floating-overlay', contenteditable: true, area: 900_000 },
    { tag: 'div', placeholder: '', aria: '', role: 'textbox', className: 'renamed-editor-surface', dataContents: 'true', contenteditable: true, area: 700_000 },
  ])
  assert.equal(selected.title.placeholder, '请输入标题')
  assert.equal(selected.editor.dataContents, 'true')
})

test('DevTools discovery follows a fresh DevToolsActivePort when the requested port is unavailable', async () => {
  const server = http.createServer((request, response) => {
    if (request.url !== '/json/version') {
      response.writeHead(404)
      response.end()
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ Browser: 'test-chrome' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const actualPort = server.address().port
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-publisher-test-'))
  await fs.writeFile(path.join(profileDir, 'DevToolsActivePort'), `${actualPort}\n/devtools/browser/test\n`)
  try {
    const endpoint = await waitForDevtools(9, 2_000, { userDataDir: profileDir, launchedAt: Date.now() })
    assert.equal(endpoint.port, actualPort)
    assert.equal(endpoint.Browser, 'test-chrome')
  } finally {
    await new Promise(resolve => server.close(resolve))
    await fs.rm(profileDir, { recursive: true, force: true })
  }
})

test('macOS background launch uses hidden LaunchServices with proven startup flags', () => {
  const spec = buildChromeLaunchSpec({
    appPath: '/Applications/Google Chrome.app',
    userDataDir: '/private/tmp/geo-publisher-headless-test-profile',
    port: 57512,
    background: true,
  })
  assert.equal(spec.command, 'open')
  assert.deepEqual(spec.openArgs.slice(0, 5), ['-g', '-j', '-n', '-a', '/Applications/Google Chrome.app'])
  assert.equal(spec.chromeArgs.includes('--headless=new'), false)
  assert.equal(spec.chromeArgs.includes('--new-window'), true)
  assert.equal(spec.chromeArgs.includes('--window-size=1100,720'), true)
  assert.equal(spec.chromeArgs.includes('--window-position=40,40'), true)
  assert.equal(spec.chromeArgs.includes('--user-data-dir=/private/tmp/geo-publisher-headless-test-profile'), true)
})

test('Playwright headless shell is discovered and used for background launch', async () => {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-headless-cache-'))
  const relative = process.platform === 'darwin'
    ? 'chrome-headless-shell-mac-arm64/chrome-headless-shell'
    : process.platform === 'win32'
      ? 'chrome-headless-shell-win64/chrome-headless-shell.exe'
      : 'chrome-headless-shell-linux64/chrome-headless-shell'
  const executable = path.join(cacheRoot, 'chromium_headless_shell-1234', relative)
  await fs.mkdir(path.dirname(executable), { recursive: true })
  await fs.writeFile(executable, '')
  try {
    assert.equal(headlessBrowserExecutablePath({ cacheRoot }), executable)
    let launchOptions = null
    let connectCalls = 0
    const browser = { pages: async () => [] }
    const puppeteer = {
      launch: async options => { launchOptions = options; return browser },
      connect: async () => { connectCalls++; return browser },
    }
    const result = await launchBrowser(puppeteer, {
      headless: true,
      userDataDir: '/private/tmp/geo-headless-profile',
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headlessExecutablePath: executable,
    })
    assert.equal(result, browser)
    assert.equal(launchOptions.executablePath, executable)
    assert.equal(launchOptions.headless, true)
    assert.equal(connectCalls, 0)
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true })
  }
})

test('visible macOS launch retains window flags', () => {
  const spec = buildChromeLaunchSpec({
    appPath: '/Applications/Google Chrome.app',
    userDataDir: '/private/tmp/geo-publisher-visible-test-profile',
    port: 57513,
    background: false,
  })
  assert.deepEqual(spec.openArgs.slice(0, 3), ['-na', '/Applications/Google Chrome.app', '--args'])
  assert.equal(spec.chromeArgs.includes('--new-window'), true)
  assert.equal(spec.chromeArgs.includes('--window-size=1100,720'), true)
  assert.equal(spec.chromeArgs.includes('--headless=new'), false)
})

test('platform lock blocks same-platform second acquire', () => {
  const lock = createPlatformLock()
  const first = lock.tryAcquire('acct-1', 'zhihu')
  assert.equal(first.ok, true)
  const second = lock.tryAcquire('acct-2', 'zhihu')
  assert.equal(second.ok, false)
  assert.equal(second.conflict.platform, 'zhihu')
  assert.deepEqual(second.conflict.activeForPlatform, ['acct-1'])
})

test('platform lock allows different platforms in parallel', () => {
  const lock = createPlatformLock()
  assert.equal(lock.tryAcquire('zh-1', 'zhihu').ok, true)
  assert.equal(lock.tryAcquire('weibo-1', 'weibo').ok, true)
  assert.equal(lock.tryAcquire('douyin-1', 'douyin').ok, true)
  assert.equal(lock.snapshot().total, 3)
})

test('platform lock rejects same-account double acquire', () => {
  const lock = createPlatformLock()
  assert.equal(lock.tryAcquire('acct-1', 'zhihu').ok, true)
  const second = lock.tryAcquire('acct-1', 'zhihu')
  assert.equal(second.ok, false)
  assert.equal(second.conflict.sameAccount, true)
})

test('platform lock releases and re-acquires', () => {
  const lock = createPlatformLock()
  assert.equal(lock.tryAcquire('a', 'zhihu').ok, true)
  lock.release('a')
  assert.equal(lock.isPlatformLocked('zhihu'), false)
  assert.equal(lock.tryAcquire('b', 'zhihu').ok, true)
})

test('platform lock snapshot includes startedAt timestamps', () => {
  const lock = createPlatformLock()
  const before = Date.now()
  lock.tryAcquire('acct-1', 'zhihu')
  const after = Date.now()
  const snap = lock.snapshot()
  assert.equal(snap.total, 1)
  assert.equal(snap.byPlatform.zhihu.length, 1)
  assert.ok(snap.byPlatform.zhihu[0].startedAt >= before && snap.byPlatform.zhihu[0].startedAt <= after)
})

test('platform lock rejects missing id or platform', () => {
  const lock = createPlatformLock()
  assert.equal(lock.tryAcquire('', 'zhihu').ok, false)
  assert.equal(lock.tryAcquire('acct', '').ok, false)
})

test('trace records events in order with timestamps and detail', () => {
  clearTrace()
  trace('prepare', 'first event', { accountId: 'a' })
  trace('verify', 'second event')
  const events = getTrace()
  assert.equal(events.length, 2)
  assert.equal(events[0].message, 'first event')
  assert.equal(events[1].category, 'verify')
  assert.ok(typeof events[0].at === 'string' && events[0].at.length > 0)
  assert.equal(events[0].detail.accountId, 'a')
})

test('trace filters by since and category', () => {
  clearTrace()
  trace('prepare', 'older', { n: 1 })
  trace('prepare', 'newer-prep', { n: 2 })
  trace('verify', 'verify-event', { n: 3 })
  assert.equal(getTrace({ category: 'prepare' }).length, 2)
  assert.equal(getTrace({ category: 'verify' }).length, 1)
  assert.equal(getTrace({ since: '1970-01-01T00:00:00.000Z' }).length, 3)
  assert.equal(getTrace({ since: '2999-01-01T00:00:00.000Z' }).length, 0)
  assert.equal(getTrace({ since: '2999-01-01T00:00:00.000Z', category: 'verify' }).length, 0)
})

test('trace ring-buffer caps at 200 events', () => {
  clearTrace()
  for (let i = 0; i < 250; i++) trace('spam', `e${i}`)
  assert.equal(getTrace().length, 200)
  assert.equal(traceSnapshot().total, 200)
})

test('trace clearTrace empties the buffer', () => {
  trace('x', 'y')
  clearTrace()
  assert.equal(getTrace().length, 0)
})

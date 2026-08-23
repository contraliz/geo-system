import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFirstMarkdownImage, markdownToPlainText, markdownToSafeHtml, randomizedPacing, sanitizeSnapshotHtmlFallback, snapshotAttributeIsSensitive } from '../publisher/common.mjs'

test('markdown conversion produces safe editor HTML and preserves readable text', () => {
  const markdown = '# Heading\n\n**Bold** and [safe](https://example.com)\n\n![cover](https://example.com/cover.png)\n\n<script>alert(1)</script>'
  const html = markdownToSafeHtml(markdown)
  assert.match(html, /<h1>Heading<\/h1>/)
  assert.match(html, /<strong>Bold<\/strong>/)
  assert.match(html, /href="https:\/\/example\.com"/)
  assert.match(html, /<img src="https:\/\/example\.com\/cover\.png"/)
  assert.doesNotMatch(html, /<script>/i)
  assert.equal(extractFirstMarkdownImage(markdown), 'https://example.com/cover.png')
  assert.match(markdownToPlainText(markdown), /Heading/)
})

test('markdown paragraph line breaks become real HTML breaks', () => {
  assert.equal(markdownToSafeHtml('first line\nsecond line'), '<p>first line<br>second line</p>')
})

test('snapshot sanitizer removes scripts and sensitive attributes', () => {
  const sanitized = sanitizeSnapshotHtmlFallback('<div onclick="steal()" data-token="secret"><script>bad()</script><input value="cookie"></div>')
  assert.doesNotMatch(sanitized, /script|onclick|data-token/i)
  assert.equal(snapshotAttributeIsSensitive('onmouseover'), true)
  assert.equal(snapshotAttributeIsSensitive('authorization'), true)
  assert.equal(snapshotAttributeIsSensitive('class'), false)
})

test('markdown image extraction rejects unsafe URLs', () => {
  assert.equal(extractFirstMarkdownImage('![x](javascript:alert(1))'), null)
})

test('randomized pacing can be disabled deterministically for tests', async () => {
  let slept = 0
  const result = await randomizedPacing(8000, 15000, { mode: 'disabled', sleep: value => { slept = value }, random: () => 0 })
  assert.equal(result, 0)
  assert.equal(slept, 0)
})

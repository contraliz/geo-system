import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCookies, normalizeSameSite } from '../publisher/vault.mjs'

test('normalizeSameSite maps Cookie-Editor no_restriction to None', () => {
  assert.equal(normalizeSameSite('no_restriction'), 'None')
})

test('normalizeSameSite accepts canonical Puppeteer values', () => {
  assert.equal(normalizeSameSite('Strict'), 'Strict')
  assert.equal(normalizeSameSite('Lax'), 'Lax')
  assert.equal(normalizeSameSite('None'), 'None')
})

test('normalizeSameSite accepts lowercase and capitalizes them', () => {
  assert.equal(normalizeSameSite('strict'), 'Strict')
  assert.equal(normalizeSameSite('lax'), 'Lax')
  assert.equal(normalizeSameSite('none'), 'None')
})

test('normalizeSameSite returns undefined for unknown values', () => {
  assert.equal(normalizeSameSite('lax-when-cross-site'), undefined)
  assert.equal(normalizeSameSite(''), undefined)
  assert.equal(normalizeSameSite(undefined), undefined)
  assert.equal(normalizeSameSite(null), undefined)
})

test('normalizeCookies preserves Cookie-Editor format with no_restriction', () => {
  const input = [
    { name: 'z_c0', value: 'abc123', domain: '.zhihu.com', path: '/', expirationDate: 9999999999, httpOnly: false, secure: true, sameSite: 'no_restriction' },
    { name: 'SESSIONID', value: 'xyz789', domain: '.zhihu.com', path: '/', expirationDate: 9999999999, httpOnly: true, secure: true, sameSite: 'no_restriction' },
  ]
  const result = normalizeCookies(input)
  assert.equal(result.length, 2)
  assert.equal(result[0].sameSite, 'None')
  assert.equal(result[1].sameSite, 'None')
  assert.equal(result[0].secure, true)
  assert.equal(result[0].domain, '.zhihu.com')
})

test('normalizeCookies handles wrapped object {cookies: [...]}', () => {
  const result = normalizeCookies({ cookies: [{ name: 'a', value: 'b', sameSite: 'no_restriction' }] })
  assert.equal(result.length, 1)
  assert.equal(result[0].sameSite, 'None')
})

test('normalizeCookies defaults domain to .zhihu.com and path to /', () => {
  const result = normalizeCookies([{ name: 'a', value: 'b', sameSite: 'None' }])
  assert.equal(result[0].domain, '.zhihu.com')
  assert.equal(result[0].path, '/')
})

test('normalizeCookies drops empty entries', () => {
  const result = normalizeCookies([
    { name: 'good', value: 'x', sameSite: 'None' },
    { name: '', value: 'y', sameSite: 'None' },
    { name: 'noValue', sameSite: 'None' },
    { name: 'good2', value: 'z', sameSite: 'None' },
  ])
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(c => c.name), ['good', 'good2'])
})

test('normalizeCookies throws on bad input', () => {
  assert.throws(() => normalizeCookies('not json'), /array/)
  assert.throws(() => normalizeCookies({}), /array/)
  assert.throws(() => normalizeCookies([]), /usable cookies/)
})
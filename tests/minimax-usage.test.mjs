import test from 'node:test'
import assert from 'node:assert/strict'
import { clearMiniMaxUsageCache, fetchMiniMaxUsage, parseMiniMaxUsage, resolveMiniMaxUsageUrl } from '../server/minimax-usage.mjs'

test('MiniMax usage selects the general text row and clamps remaining percent', () => {
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'video', current_interval_remaining_percent: 12 }, { model_name: 'general', current_interval_remaining_percent: 184 }] }), { available: true, remainingPercent: 100 })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'general', current_interval_remaining_percent: 84 }] }), { available: true, remainingPercent: 84 })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'MiniMax-M3', current_interval_remaining_percent: 84, current_interval_usage_count: 999999 }] }), { available: true, remainingPercent: 84 })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'MiniMax-M*', current_interval_remaining_percent: 73 }] }), { available: true, remainingPercent: 73 })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'MiniMax-M2.7-highspeed', current_interval_remaining_percent: 42 }] }), { available: true, remainingPercent: 42 })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'general' }, { model_name: 'MiniMax-M3', current_interval_remaining_percent: 61 }] }), { available: true, remainingPercent: 61 })
})

test('MiniMax usage reports unavailable without inventing a percentage', () => {
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'general' }] }), { available: false })
  assert.deepEqual(parseMiniMaxUsage({ base_resp: { status_code: 1001 }, model_remains: [{ model_name: 'general', current_interval_remaining_percent: 84 }] }), { available: false })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'video', current_interval_remaining_percent: 84 }] }), { available: false })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'general', current_interval_usage_count: 12 }] }), { available: false })
  assert.deepEqual(parseMiniMaxUsage({ model_remains: [{ model_name: 'general', current_interval_remaining_percent: Number.NaN }] }), { available: false })
})

test('MiniMax usage uses the region-matched endpoint and caches sanitized output', async () => {
  assert.equal(resolveMiniMaxUsageUrl('https://api.minimaxi.com/anthropic'), 'https://www.minimaxi.com/v1/token_plan/remains')
  assert.equal(resolveMiniMaxUsageUrl('https://api.minimax.io/anthropic'), 'https://www.minimax.io/v1/token_plan/remains')
  clearMiniMaxUsageCache()
  let calls = 0
  const fetchImpl = async (_url, request) => {
    calls += 1
    assert.equal(request.headers.Authorization, 'Bearer test-key')
    return new Response(JSON.stringify({ model_remains: [{ model_name: 'general', current_interval_remaining_percent: 84, secret_payload: 'must-not-escape' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const first = await fetchMiniMaxUsage({ apiKey: 'test-key', baseUrl: 'https://api.minimax.io/anthropic', fetchImpl })
  const second = await fetchMiniMaxUsage({ apiKey: 'test-key', baseUrl: 'https://api.minimax.io/anthropic', fetchImpl })
  assert.deepEqual(first, { available: true, remainingPercent: 84 })
  assert.deepEqual(second, first)
  assert.equal(calls, 1)
})

import { test, expect } from '@playwright/test'
import {
  KeywordDistillationPage,
  clusterQuestions,
  deduplicateQuestions,
  extractAnthropicText,
  generateKeywordQuestions,
  normalizeQuestion,
  parseKeywordDistillationPayload,
  validateAndNormalizePayload,
} from '../src/features/keyword-distillation'

test.describe('keyword distillation feature logic', () => {
  test('normalizes Unicode, whitespace, list prefixes, and conservative near duplicates', () => {
    expect(normalizeQuestion('  １．\u3000How to choose an indoor monitor?  ')).toBe('How to choose an indoor monitor?')
    expect(deduplicateQuestions([
      '1. How to choose an indoor monitor?',
      'How to choose an indoor monitor ? ',
      'How do I choose an indoor monitor for a small room?',
      '2) Which measurements matter for an indoor monitor?',
    ])).toEqual([
      'How to choose an indoor monitor?',
      'How do I choose an indoor monitor for a small room?',
      'Which measurements matter for an indoor monitor?',
    ])
  })

  test('extracts multiple Anthropic text blocks and parses fenced JSON', () => {
    const response = {
      content: [
        { type: 'text', text: 'Here is the result:\n' },
        { type: 'text', text: '```json\n{"keyword":"家庭储能系统","count":2,"questions":["家庭储能系统如何选型","家庭储能系统如何维护"]}\n```' },
      ],
    }
    expect(extractAnthropicText(response)).toContain('家庭储能系统')
    expect(parseKeywordDistillationPayload(response)).toEqual({
      keyword: '家庭储能系统',
      count: 2,
      questions: ['家庭储能系统如何选型', '家庭储能系统如何维护'],
    })
  })

  test('validates exact count and rejects too few unique questions without retrying', () => {
    expect(validateAndNormalizePayload({
      keyword: 'home battery',
      count: 3,
      questions: ['1. How does a home battery work?', 'How does a home battery work?', 'How do I size a home battery?', 'How do I maintain a home battery?'],
    }, 'home battery', 3)).toEqual({
      keyword: 'home battery',
      count: 3,
      questions: ['How does a home battery work?', 'How do I size a home battery?', 'How do I maintain a home battery?'],
    })
    expect(() => validateAndNormalizePayload({ keyword: 'x', count: 2, questions: ['What is x?', 'What is x?'] }, 'x', 2)).toThrow(/unique questions/i)
  })

  test('clusters English and Chinese questions deterministically by useful intent', () => {
    expect(clusterQuestions([
      'Which indoor air quality monitor should I choose?',
      'How do indoor air quality monitors work?',
      'How do I compare indoor air quality monitors?',
      'Where can I buy an indoor air quality monitor?',
      '室内空气质量监测仪适合哪些场景？',
    ])).toEqual([
      { id: 'comparison', label: 'Comparison', questions: ['How do I compare indoor air quality monitors?'] },
      { id: 'procurement', label: 'Procurement', questions: ['Where can I buy an indoor air quality monitor?'] },
      { id: 'selection', label: 'Selection', questions: ['Which indoor air quality monitor should I choose?'] },
      { id: 'scenario', label: 'Scenario', questions: ['室内空气质量监测仪适合哪些场景?'] },
      { id: 'how', label: 'How to', questions: ['How do indoor air quality monitors work?'] },
    ])
  })

  test('calls the configured MiniMax proxy once and returns validated local output', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ keyword: '家庭储能系统', count: 3, questions: ['家庭储能系统如何选型', '家庭储能系统如何与光伏配合', '家庭储能系统日常如何维护'] }) }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    await expect(generateKeywordQuestions('家庭储能系统', 3, { fetcher })).resolves.toEqual({
      keyword: '家庭储能系统',
      count: 3,
      questions: ['家庭储能系统如何选型', '家庭储能系统如何与光伏配合', '家庭储能系统日常如何维护'],
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].input).toBe('/api/anthropic/v1/messages')
    const body = JSON.parse(String(calls[0].init?.body)) as { model: string; messages: Array<{ role: string; content: string }>; system: string }
    expect(body.model).toBe('MiniMax-M3')
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[0].content).toContain('家庭储能系统')
    expect(body.system).toContain('same language as the keyword')
    expect(body.system).toContain('unsupported')
  })

  test('surfaces proxy configuration errors without a hidden retry', async () => {
    let calls = 0
    const fetcher: typeof fetch = async () => {
      calls += 1
      return new Response(JSON.stringify({ type: 'configuration_error', error: 'ANTHROPIC_API_KEY is not configured' }), { status: 503 })
    }
    await expect(generateKeywordQuestions('home battery', 2, { fetcher })).rejects.toThrow(/ANTHROPIC_API_KEY/)
    expect(calls).toBe(1)
  })

  test('exports the compatibility page component', () => {
    expect(KeywordDistillationPage).toEqual(expect.any(Function))
  })
})

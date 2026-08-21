export const MINIMAX_MODEL = 'MiniMax-M3'
export const MINIMAX_MESSAGES_ENDPOINT = '/api/anthropic/v1/messages'

export const KEYWORD_DISTILLATION_SYSTEM_PROMPT = `You are a keyword-distillation question generator.

Follow this contract exactly:
- The user supplies one non-empty keyword and one positive integer count.
- Return exactly one valid JSON object with exactly these keys: keyword, count, questions.
- Preserve the supplied keyword and count. The questions array must contain exactly count unique strings.
- Write every question in the same language as the keyword. Preserve proper nouns, product names, acronyms, and intentional mixed-language terms. If the keyword is language-indeterminate, use the surrounding request language, otherwise English.
- Keep questions concise, natural search/discovery questions grounded in the keyword. Put the highest-value questions first and diversify useful intent (what/how, selection, comparison, problem, scenario, implementation, or procurement) only when relevant.
- Do not invent or imply rankings, dates, sales, popularity, certifications, guarantees, or other unsupported factual claims.
- Do not return Markdown, a code fence, commentary, or any key other than keyword, count, and questions.

The client will validate, normalize, deduplicate, and cluster your response. It will not generate replacement questions.`

export type KeywordDistillationPayload = {
  keyword: string
  count: number
  questions: string[]
}

export type IntentClusterId = 'comparison' | 'procurement' | 'selection' | 'problem' | 'scenario' | 'how' | 'what' | 'other'

export type QuestionCluster = {
  id: IntentClusterId
  label: string
  questions: string[]
}

export type GenerateKeywordQuestionsOptions = {
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export function assertKeywordDistillationInput(keyword: unknown, count: unknown): asserts keyword is string {
  if (typeof keyword !== 'string' || !keyword.trim()) throw new Error('Enter a keyword before generating questions.')
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) throw new Error('Count must be a positive integer.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textFromBlock(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textFromBlock).filter(Boolean).join('\n')
  if (!isRecord(value)) return ''
  if (value.type === 'text' && typeof value.text === 'string') return value.text
  if (typeof value.text === 'string' && !value.type) return value.text
  if (Array.isArray(value.content)) return value.content.map(textFromBlock).filter(Boolean).join('\n')
  return ''
}

/** Extract text blocks from an Anthropic-compatible response without assuming a single block. */
export function extractAnthropicText(response: unknown): string {
  if (typeof response === 'string') return response
  if (Array.isArray(response)) return response.map(textFromBlock).filter(Boolean).join('\n')
  if (!isRecord(response)) return ''
  if (Array.isArray(response.content)) return response.content.map(textFromBlock).filter(Boolean).join('\n')
  if (isRecord(response.message)) return extractAnthropicText(response.message)
  if (typeof response.text === 'string') return response.text
  return ''
}

function jsonCandidates(text: string): string[] {
  const candidates: string[] = []
  const fenced = /```(?:json|javascript|js)?\s*([\s\S]*?)```/gi
  for (const match of text.matchAll(fenced)) if (match[1]) candidates.push(match[1].trim())
  candidates.push(text.trim())

  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return [...new Set(candidates.filter(Boolean))]
}

/** Parse raw JSON, fenced JSON, or JSON surrounded by a short model preamble. */
export function parseKeywordDistillationPayload(response: unknown): unknown {
  if (isRecord(response) && 'keyword' in response && 'count' in response && 'questions' in response) return response
  const text = extractAnthropicText(response)
  if (!text.trim()) throw new Error('MiniMax returned no text content.')
  for (const candidate of jsonCandidates(text)) {
    try { return JSON.parse(candidate) as unknown } catch { /* Try the next fenced or balanced candidate. */ }
  }
  throw new Error('MiniMax returned content that was not valid JSON.')
}

export function normalizeQuestion(value: string): string {
  let normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim()
  normalized = normalized.replace(/^(?:[•●▪◦·]|[-–—])\s*/u, '')
  normalized = normalized.replace(/^\(?\s*\d{1,4}\s*[.)、，,:：-]\s*/u, '')
  normalized = normalized.replace(/^\s*["'“”‘’「」『』`]+|["'“”‘’「」『』`]+\s*$/gu, '').trim()
  return normalized.replace(/\s+/gu, ' ')
}

function comparableQuestion(value: string): string {
  return normalizeQuestion(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function levenshtein(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length]
}

function qgrams(value: string): Set<string> {
  const characters = Array.from(value)
  if (characters.length < 3) return new Set([value])
  return new Set(Array.from({ length: characters.length - 2 }, (_, index) => characters.slice(index, index + 3).join('')))
}

function diceSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1
  let overlap = 0
  for (const value of left) if (right.has(value)) overlap += 1
  return (2 * overlap) / (left.size + right.size)
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.match(/[\p{L}\p{N}]+/gu) || [])
  const rightTokens = new Set(right.match(/[\p{L}\p{N}]+/gu) || [])
  if (leftTokens.size < 3 || rightTokens.size < 3) return 0
  let overlap = 0
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1
  return overlap / (leftTokens.size + rightTokens.size - overlap)
}

function isNearDuplicate(left: string, right: string): boolean {
  const a = comparableQuestion(left)
  const b = comparableQuestion(right)
  if (!a || !b) return true
  if (a === b) return true
  const lengthRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length)
  if (lengthRatio >= 0.88 && levenshtein(a, b) <= Math.max(2, Math.floor(Math.min(a.length, b.length) * 0.1))) return true
  if (lengthRatio >= 0.72 && diceSimilarity(qgrams(a), qgrams(b)) >= 0.92) return true
  return tokenSimilarity(a, b) >= 0.9
}

/** Keep the first useful wording while removing exact and conservative near duplicates. */
export function deduplicateQuestions(questions: readonly string[]): string[] {
  const result: string[] = []
  for (const question of questions) {
    if (typeof question !== 'string') continue
    const normalized = normalizeQuestion(question)
    if (!normalized || result.some(existing => isNearDuplicate(existing, normalized))) continue
    result.push(normalized)
  }
  return result
}

const CLUSTER_LABELS: Record<IntentClusterId, string> = {
  comparison: 'Comparison',
  procurement: 'Procurement',
  selection: 'Selection',
  problem: 'Problem solving',
  scenario: 'Scenario',
  how: 'How to',
  what: 'What or why',
  other: 'Other',
}

const CLUSTER_RULES: Array<{ id: IntentClusterId; test: (question: string) => boolean }> = [
  { id: 'comparison', test: value => /\b(compare|comparison|versus|vs\.?|difference|better|pros and cons)\b/i.test(value) || /比较|对比|区别|优缺点/u.test(value) },
  { id: 'procurement', test: value => /\b(buy|purchase|supplier|vendor|price|cost|quote|procurement)\b/i.test(value) || /采购|供应商|厂家|价格|报价|成本|预算/u.test(value) },
  { id: 'scenario', test: value => /\b(when|where|use case|scenario|suitable)\b/i.test(value) || /场景|适用|用于|面向|情况下/u.test(value) },
  { id: 'selection', test: value => /\b(which|choose|choice|select|recommend|best for)\b/i.test(value) || /哪家|哪个|哪些|怎么选|选择|推荐|适合/u.test(value) },
  { id: 'problem', test: value => /\b(problem|issue|fix|solve|troubleshoot|avoid|prevent)\b/i.test(value) || /问题|故障|解决|排查|避免|预防/u.test(value) },
  { id: 'how', test: value => /\b(how|steps?|ways?)\b/i.test(value) || /如何|怎么|怎样|方法|步骤/u.test(value) },
  { id: 'what', test: value => /\b(what|why|who|when|where)\b/i.test(value) || /什么|为何|为什么|谁/u.test(value) },
]

/** Group questions with stable, conservative intent labels for local display. */
export function clusterQuestions(questions: readonly string[]): QuestionCluster[] {
  const buckets = new Map<IntentClusterId, string[]>()
  for (const question of questions) {
    const value = normalizeQuestion(question)
    if (!value) continue
    const match = CLUSTER_RULES.find(rule => rule.test(value))?.id || 'other'
    const bucket = buckets.get(match) || []
    bucket.push(value)
    buckets.set(match, bucket)
  }
  const order: IntentClusterId[] = ['comparison', 'procurement', 'selection', 'problem', 'scenario', 'how', 'what', 'other']
  return order.filter(id => buckets.has(id)).map(id => ({ id, label: CLUSTER_LABELS[id], questions: buckets.get(id) || [] }))
}

export function validateAndNormalizePayload(response: unknown, keyword: string, count: number): KeywordDistillationPayload {
  assertKeywordDistillationInput(keyword, count)
  const payload = parseKeywordDistillationPayload(response)
  if (!isRecord(payload)) throw new Error('MiniMax returned an invalid question object.')
  if (typeof payload.keyword !== 'string' || payload.keyword.normalize('NFKC').trim() !== keyword.normalize('NFKC').trim()) throw new Error('MiniMax changed the supplied keyword.')
  if (payload.count !== count) throw new Error(`MiniMax returned count ${String(payload.count)} instead of ${count}.`)
  if (!Array.isArray(payload.questions)) throw new Error('MiniMax returned no questions array.')
  const questions = deduplicateQuestions(payload.questions.filter((question): question is string => typeof question === 'string'))
  if (questions.length < count) throw new Error(`MiniMax returned only ${questions.length} unique questions; ${count} are required.`)
  return { keyword, count, questions: questions.slice(0, count) }
}

export function buildKeywordDistillationUserPrompt(keyword: string, count: number): string {
  return `Generate exactly ${count} questions for this keyword: ${JSON.stringify(keyword)}. Return exactly one JSON object with exactly the keys keyword, count, and questions. Preserve the keyword and count, keep all questions unique and grounded in the keyword, write them in the keyword's language, and avoid unsupported rankings, dates, or factual claims.`
}

export async function generateKeywordQuestions(keyword: string, count: number, options: GenerateKeywordQuestionsOptions = {}): Promise<KeywordDistillationPayload> {
  assertKeywordDistillationInput(keyword, count)
  const fetcher = options.fetcher || globalThis.fetch
  if (typeof fetcher !== 'function') throw new Error('The browser fetch API is unavailable.')
  let response: Response
  try {
    response = await fetcher(MINIMAX_MESSAGES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: Math.max(512, count * 32),
        temperature: 0.2,
        system: KEYWORD_DISTILLATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildKeywordDistillationUserPrompt(keyword, count) }],
      }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(`Unable to reach the configured MiniMax proxy: ${error instanceof Error ? error.message : 'network request failed'}`)
  }

  let body: unknown = null
  try { body = await response.json() } catch { /* Surface a useful proxy error below. */ }
  if (!response.ok) {
    const detail = isRecord(body) && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
    throw new Error(`MiniMax proxy error: ${detail}`)
  }
  const result = validateAndNormalizePayload(body, keyword, count)
  return result
}

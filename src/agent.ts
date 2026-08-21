import type { Article, CreationTask, KnowledgeBase, KnowledgeEntry, KeywordSet, WritingInstruction } from './data'

export type AgentStatus = { configured: boolean; provider: 'minimax' | 'anthropic' | 'unknown'; display: string }

export async function fetchAgentStatus(): Promise<AgentStatus> {
  try {
    const response = await fetch('/api/anthropic/status')
    if (!response.ok) return { configured: false, provider: 'unknown', display: '' }
    return await response.json() as AgentStatus
  } catch {
    return { configured: false, provider: 'unknown', display: '' }
  }
}

type GenerationContext = {
  task: CreationTask
  prompt: string
  knowledgeBase?: KnowledgeBase
  groundingEntries: KnowledgeEntry[]
  writingInstruction?: WritingInstruction
  titleInstruction?: WritingInstruction
}

function buildSystemPrompt(): string {
  return [
    'You are a content operations writer producing grounded, reviewable articles for a neutral workspace.',
    'You only use the supplied knowledge entries as facts. If a claim is not in the entries, mark it as needing review rather than inventing.',
    'Output a JSON object with exactly two string fields: "title" (10-90 chars, no leading # or quotes) and "body" (plain text with paragraph breaks as \\n\\n, 400-900 words).',
    'Do not include any other keys, markdown fences, or commentary.',
  ].join('\n')
}

function buildUserPrompt(context: GenerationContext): string {
  const { task, prompt, knowledgeBase, groundingEntries, writingInstruction, titleInstruction } = context
  const kbName = knowledgeBase?.name || task.knowledgeBase || 'Local knowledge base'
  const grounding = groundingEntries.length
    ? groundingEntries.map((entry, index) => `[${index + 1}] (${entry.category}) ${entry.title} — ${entry.body}`).join('\n')
    : '(No approved grounding entries supplied. Treat the article as a reviewable draft.)'
  const writing = writingInstruction?.description || task.writingInstruction || 'Use a concise opening, direct answers, and sourced claims.'
  const titleRule = titleInstruction?.description || task.titleInstruction || 'Lead with the use case and avoid exaggerated superlatives.'
  return [
    `Keyword cluster: ${task.keyword}`,
    `Question to answer: ${prompt}`,
    `Knowledge base: ${kbName}`,
    '',
    `Writing instruction: ${writing}`,
    `Title instruction: ${titleRule}`,
    '',
    'Approved grounding entries:',
    grounding,
    '',
    'Return JSON only with { "title": ..., "body": ... }.',
  ].join('\n')
}

export type GenerationResult = {
  article: Omit<Article, 'id'>
  logMessage: string
  logTone: 'info' | 'success' | 'warning'
}

function safeJsonParse(text: string): { title: string; body: string } | null {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenceMatch ? fenceMatch[1] : trimmed
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null
  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
    if (typeof parsed.title === 'string' && typeof parsed.body === 'string') {
      return { title: parsed.title, body: parsed.body }
    }
    return null
  } catch { return null }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export async function runAgentForTask(task: CreationTask, context: { keywordSet?: KeywordSet; knowledgeBase?: KnowledgeBase; groundingEntries: KnowledgeEntry[]; writingInstruction?: WritingInstruction; titleInstruction?: WritingInstruction }): Promise<GenerationResult> {
  const prompt = context.keywordSet?.prompts[task.generated % Math.max(1, context.keywordSet.prompts.length)] || `${task.keyword} question ${task.generated + 1}`
  const system = buildSystemPrompt()
  const userPrompt = buildUserPrompt({ task, prompt, knowledgeBase: context.knowledgeBase, groundingEntries: context.groundingEntries, writingInstruction: context.writingInstruction, titleInstruction: context.titleInstruction })

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: task.model,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    throw new Error(err.error || `Agent responded with HTTP ${response.status}`)
  }

  const payload = await response.json() as { content?: Array<{ type: string; text?: string }>; stop_reason?: string }
  const text = (payload.content || []).filter(block => block.type === 'text').map(block => block.text || '').join('\n').trim()
  const parsed = safeJsonParse(text)
  const baseFields: Omit<Article, 'id' | 'title' | 'body' | 'wordCount'> = {
    prompt,
    knowledgeBaseId: context.knowledgeBase?.id,
    groundedSourceIds: task.groundingEntryIds || [],
    imageIds: [],
    creationTaskId: task.id,
    task: task.name,
    keyword: task.keyword,
    model: task.model || 'Unknown',
    status: 'Review',
    date: new Date().toISOString().slice(0, 10),
    channel: 'Local review queue',
  }

  if (!parsed) {
    return {
      article: {
        ...baseFields,
        title: `${prompt.replace(/[?]+$/, '')} — live agent draft`,
        body: text || '(The live agent returned no parseable content.)',
        wordCount: countWords(text || ''),
      },
      logMessage: 'Live agent responded but returned non-JSON content; stored raw text for review.',
      logTone: 'warning',
    }
  }

  return {
    article: {
      ...baseFields,
      title: parsed.title,
      body: parsed.body,
      wordCount: countWords(parsed.body),
    },
    logMessage: `Live agent returned a reviewable draft via ${task.model}.`,
    logTone: 'success',
  }
}

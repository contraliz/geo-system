import { useEffect, useState } from 'react'
import { defaultAppState, type AppState, type CreationLog, type CreationTask, type ImageLibrary, type KnowledgeBase } from '../data'

export const STORAGE_KEY = 'geoflow-demo-state-v1'

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return parsed as T
  } catch {
    return fallback
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function neutralizeLegacyText(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(new RegExp('North' + 'star', 'gi'), 'Workspace')
  if (Array.isArray(value)) return value.map(neutralizeLegacyText)
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, neutralizeLegacyText(entry)]))
  return value
}

export function normalizeState(value: unknown): AppState {
  const migratedValue = neutralizeLegacyText(value)
  const stored = isRecord(migratedValue) ? migratedValue : {}
  const current = isRecord(stored.data) ? stored.data : stored
  const preferences = isRecord(current.preferences) ? current.preferences : {}
  const adminConfig = isRecord(current.adminConfig) ? current.adminConfig : {}
  const storedGuidedWorkflow = isRecord(current.guidedWorkflow) ? current.guidedWorkflow : null
  return {
    ...defaultAppState,
    ...current,
    theme: current.theme === 'dark' || preferences.theme === 'dark' ? 'dark' : 'light',
    language: current.language === 'zh' || preferences.language === 'zh' || current.locale === 'zh-CN' ? 'zh' : 'en',
    balance: typeof current.balance === 'number' && Number.isFinite(current.balance) ? Math.max(0, current.balance) : defaultAppState.balance,
    knowledgeBases: Array.isArray(current.knowledgeBases) ? current.knowledgeBases.map((value, index) => {
      const item = isRecord(value) ? value : {}
      const seeded = defaultAppState.knowledgeBases.find(entry => entry.id === item.id) || defaultAppState.knowledgeBases[index]
      const sources = Array.isArray(item.sources) ? item.sources : (seeded?.sources || [])
      const facts = Array.isArray(item.facts) ? item.facts : (seeded?.facts || [])
      const entries = Array.isArray(item.entries) ? item.entries : [
        ...sources.map(source => ({ id: `entry-${source.id}`, category: 'Source' as const, title: source.title, body: source.excerpt, status: source.status, updated: source.updated })),
        ...facts.map(fact => ({ id: `entry-${fact.id}`, category: 'Fact' as const, title: 'Verified fact', body: fact.claim, status: fact.status, updated: fact.updated })),
      ]
      return { ...seeded, ...item, sourceCount: entries.length, entries, sources, facts } as KnowledgeBase
    }) : defaultAppState.knowledgeBases,
    imageLibraries: Array.isArray(current.imageLibraries) ? current.imageLibraries.map((value, index) => {
      const item = isRecord(value) ? value : {}
      const seeded = defaultAppState.imageLibraries.find(entry => entry.id === item.id) || defaultAppState.imageLibraries[index]
      const images = Array.isArray(item.images) ? item.images : (seeded?.images || [])
      const selectedImageIds = Array.isArray(item.selectedImageIds) ? item.selectedImageIds.filter(id => typeof id === 'string' && images.some(image => isRecord(image) && image.id === id)) : []
      return { ...seeded, ...item, images, selectedImageIds, imageCount: images.length } as ImageLibrary
    }) : defaultAppState.imageLibraries,
    keywordSets: Array.isArray(current.keywordSets) ? current.keywordSets : defaultAppState.keywordSets,
    instructions: Array.isArray(current.instructions) ? current.instructions : defaultAppState.instructions,
    creationTasks: Array.isArray(current.creationTasks) ? current.creationTasks.map((value, index) => {
      const item = isRecord(value) ? value : {}
      const seeded = defaultAppState.creationTasks.find(entry => entry.id === item.id) || defaultAppState.creationTasks[index]
      const logs = Array.isArray(item.logs) ? item.logs.filter(isRecord).map((log, logIndex) => ({ id: typeof log.id === 'string' ? log.id : `log-${index}-${logIndex}`, time: typeof log.time === 'string' ? log.time : 'local', message: typeof log.message === 'string' ? log.message : 'Local task event.', tone: log.tone === 'success' || log.tone === 'warning' ? log.tone : 'info' } as CreationLog)) : (seeded?.logs || [{ id: `log-${index}`, time: typeof item.updated === 'string' ? item.updated : 'local', message: 'Local task configuration is ready; no external execution has occurred.', tone: 'info' as const }])
      const knowledgeBases = Array.isArray(item.knowledgeBases) ? item.knowledgeBases.filter(entry => typeof entry === 'string') as string[] : (typeof item.knowledgeBase === 'string' ? [item.knowledgeBase] : (seeded?.knowledgeBases || []))
      const generated = typeof item.generated === 'number' && Number.isFinite(item.generated) ? Math.max(0, item.generated) : (seeded?.generated || 0)
      const target = typeof item.target === 'number' && Number.isFinite(item.target) ? Math.max(0, item.target) : (seeded?.target || 0)
      return { ...seeded, ...item, generated, target, knowledgeBases, knowledgeBaseIds: Array.isArray(item.knowledgeBaseIds) ? item.knowledgeBaseIds.filter(entry => typeof entry === 'string') : (seeded?.knowledgeBaseIds || []), groundingEntryIds: Array.isArray(item.groundingEntryIds) ? item.groundingEntryIds.filter(entry => typeof entry === 'string') : (seeded?.groundingEntryIds || []), imageIds: Array.isArray(item.imageIds) ? item.imageIds.filter(entry => typeof entry === 'string') : (seeded?.imageIds || []), imageCount: typeof item.imageCount === 'number' ? Math.max(0, item.imageCount) : (seeded?.imageCount || 0), imagesPerArticle: typeof item.imagesPerArticle === 'number' ? Math.max(0, item.imagesPerArticle) : (seeded?.imagesPerArticle || 0), model: typeof item.model === 'string' ? item.model : (seeded?.model || 'Local simulation'), created: typeof item.created === 'string' ? item.created : (seeded?.created || (typeof item.updated === 'string' ? item.updated : 'local')), localOnly: true, logs } as CreationTask
    }) : defaultAppState.creationTasks,
    articles: Array.isArray(current.articles) ? current.articles : defaultAppState.articles,
    publishingTasks: Array.isArray(current.publishingTasks) ? current.publishingTasks : defaultAppState.publishingTasks,
    validationResults: Array.isArray(current.validationResults) ? current.validationResults : defaultAppState.validationResults,
    ledger: Array.isArray(current.ledger) ? current.ledger : defaultAppState.ledger,
    records: Array.isArray(current.records) ? current.records : defaultAppState.records,
    accounts: Array.isArray(current.accounts) ? current.accounts : defaultAppState.accounts,
    websiteChannels: Array.isArray(current.websiteChannels) ? current.websiteChannels : defaultAppState.websiteChannels,
    influencers: Array.isArray(current.influencers) ? current.influencers : defaultAppState.influencers,
    seoChecks: Array.isArray(current.seoChecks) ? current.seoChecks : defaultAppState.seoChecks,
    validationTasks: Array.isArray(current.validationTasks) ? current.validationTasks : defaultAppState.validationTasks,
    exportTasks: Array.isArray(current.exportTasks) ? current.exportTasks : defaultAppState.exportTasks,
    guidedWorkflow: storedGuidedWorkflow ? {
      ...defaultAppState.guidedWorkflow,
      ...storedGuidedWorkflow,
      selectedKnowledgeBaseId: typeof storedGuidedWorkflow.selectedKnowledgeBaseId === 'string' && Array.isArray(current.knowledgeBases) && current.knowledgeBases.some(item => isRecord(item) && item.id === storedGuidedWorkflow.selectedKnowledgeBaseId) ? storedGuidedWorkflow.selectedKnowledgeBaseId : defaultAppState.guidedWorkflow.selectedKnowledgeBaseId,
      step: Math.min(5, Math.max(1, Number(storedGuidedWorkflow.step) || 1)) as 1 | 2 | 3 | 4 | 5,
    } : defaultAppState.guidedWorkflow,
    adminConfig: {
      ...defaultAppState.adminConfig,
      ...adminConfig,
      users: Array.isArray(adminConfig.users) ? adminConfig.users : defaultAppState.adminConfig.users,
      apiKeys: Array.isArray(adminConfig.apiKeys) ? adminConfig.apiKeys : defaultAppState.adminConfig.apiKeys,
      llmConfigs: Array.isArray(adminConfig.llmConfigs) ? adminConfig.llmConfigs : defaultAppState.adminConfig.llmConfigs,
      pointRules: Array.isArray(adminConfig.pointRules) ? adminConfig.pointRules : defaultAppState.adminConfig.pointRules,
      modelChecks: Array.isArray(adminConfig.modelChecks) ? adminConfig.modelChecks : defaultAppState.adminConfig.modelChecks,
      clientVersions: Array.isArray(adminConfig.clientVersions) ? adminConfig.clientVersions : defaultAppState.adminConfig.clientVersions,
    },
  }
}

export function usePersistentState<T>(key: string, fallback: T, migrate?: (value: unknown) => T) {
  const [value, setValue] = useState<T>(() => migrate ? migrate(readStorage<unknown>(key, fallback)) : readStorage(key, fallback))
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* local persistence is best effort */ } }, [key, value])
  return [value, setValue] as const
}

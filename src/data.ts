export type Theme = 'light' | 'dark'
export type Language = 'en' | 'zh'

export type KnowledgeSource = { id: string; title: string; reference: string; excerpt: string; status: 'Approved' | 'Review' | 'Draft'; updated: string }
export type KnowledgeFact = { id: string; claim: string; sourceId: string; status: 'Approved' | 'Review'; updated: string }
export type KnowledgeEntry = { id: string; category: 'Source' | 'Fact' | 'Product' | 'Research' | 'Customer voice' | 'Workflow'; title: string; body: string; status: 'Approved' | 'Review' | 'Draft'; updated: string }
export type KnowledgeBase = { id: string; name: string; description: string; sourceCount: number; updated: string; tone: string; entries: KnowledgeEntry[]; sources: KnowledgeSource[]; facts: KnowledgeFact[] }
export type LocalImage = { id: string; name: string; size: number; width: number; height: number; kind: 'sample' | 'local' | 'uploaded'; updated: string; dataUrl?: string }
export type ImageLibrary = { id: string; name: string; description: string; imageCount: number; updated: string; style: string; images: LocalImage[]; selectedImageIds?: string[] }
export type KeywordSet = { id: string; name: string; brand: string; questionCount: number; date: string; tags: string[]; prompts: string[] }
export type WritingInstruction = { id: string; title: string; group: 'Article' | 'Title' | 'Traffic Replication'; description: string; updated: string; status: 'Active' | 'Draft' }
export type CreationLog = { id: string; time: string; message: string; tone: 'info' | 'success' | 'warning' }
export type CreationTask = { id: string; name: string; keyword: string; questionCount: number; writingInstruction: string; titleInstruction: string; knowledgeBase: string; imageLibrary: string; generated: number; target: number; status: 'Running' | 'Ready' | 'Paused' | 'Completed'; updated: string; created?: string; model?: string; localOnly?: boolean; keywordSetId?: string; writingInstructionId?: string; titleInstructionId?: string; knowledgeBaseIds?: string[]; knowledgeBases?: string[]; groundingEntryIds?: string[]; imageLibraryId?: string; imageCount?: number; imageIds?: string[]; imagesPerArticle?: number; logs?: CreationLog[] }
export type Article = { id: string; title: string; keyword: string; task: string; model: string; status: 'Draft' | 'Review' | 'Published' | 'Scheduled'; date: string; wordCount: number; channel: string; knowledgeBaseId?: string; prompt?: string; groundedSourceIds?: string[]; creationTaskId?: string; imageIds?: string[]; body?: string }
export type PublishingTask = { id: string; name: string; pool: string; account: string; channel: string; limit: number; deduplication: boolean; aiDisclosure: boolean; status: 'Active' | 'Paused'; lastRun: string; articleId?: string; knowledgeBaseId?: string }
export type ValidationResult = { id: string; keyword: string; model: string; platform: string; score: number; citations: number; responseTime: string; status: 'Passed' | 'Review' | 'Failed'; checked: string; brandExposure?: number; articleId?: string; knowledgeBaseId?: string }
export type LedgerEntry = { id: string; type: 'Usage' | 'Recharge' | 'Adjustment'; detail: string; amount: number; balance: number; date: string }
export type OperationsRecord = { id: string; type: 'Generation' | 'Review' | 'Publishing' | 'Validation'; summary: string; owner: string; status: 'Complete' | 'In review' | 'Queued'; date: string }
export type AccountConfig = { id: string; name: string; type: 'CMS' | 'Newsletter' | 'Social'; channel: string; status: 'Not connected' | 'Configured'; owner: string }
export type WebsiteChannel = { id: string; name: string; domain: string; contentType: string; approval: 'Manual' | 'Auto review'; status: 'Draft' | 'Ready'; updated: string }
export type InfluencerPartner = { id: string; name: string; focus: string; stage: 'Research' | 'Briefed' | 'Approved'; audience: string; note: string }
export type SeoCheck = { id: string; area: 'Crawlability' | 'Schema' | 'Internal links' | 'Freshness'; status: 'Healthy' | 'Needs review' | 'Opportunity'; score: number; note: string; updated: string }
export type ValidationTask = { id: string; name: string; promptCount: number; models: string[]; status: 'Ready' | 'Running' | 'Completed'; created: string; lastRun: string }
export type ExportTask = { id: string; name: string; format: 'CSV' | 'JSON'; rows: number; status: 'Queued' | 'Ready'; created: string; destination: string }
export type AdminConfig = { users: { id: string; name: string; role: string; status: 'Active' | 'Invited'; lastSeen: string }[]; apiKeys: { id: string; label: string; scope: string; status: 'Placeholder'; created: string }[]; llmConfigs: { id: string; model: string; mode: 'Balanced' | 'Fast' | 'Quality'; enabled: boolean; dailyLimit: number }[]; pointRules: { id: string; action: string; cost: number; note: string }[]; modelChecks: { id: string; model: string; cadence: string; status: 'Enabled' | 'Paused'; lastRun: string }[]; clientVersions: { id: string; version: string; channel: string; status: 'Current' | 'Review'; released: string }[] }
export type GuidedWorkflow = { selectedKnowledgeBaseId: string; selectedEntryIds?: string[]; prompt: string; articleId?: string; publishingTaskId?: string; validationResultId?: string; step: 1 | 2 | 3 | 4 | 5 }

export type AppState = {
  theme: Theme
  language: Language
  balance: number
  knowledgeBases: KnowledgeBase[]
  imageLibraries: ImageLibrary[]
  keywordSets: KeywordSet[]
  instructions: WritingInstruction[]
  creationTasks: CreationTask[]
  articles: Article[]
  publishingTasks: PublishingTask[]
  validationResults: ValidationResult[]
  ledger: LedgerEntry[]
  records: OperationsRecord[]
  accounts: AccountConfig[]
  websiteChannels: WebsiteChannel[]
  influencers: InfluencerPartner[]
  seoChecks: SeoCheck[]
  validationTasks: ValidationTask[]
  exportTasks: ExportTask[]
  adminConfig: AdminConfig
  guidedWorkflow: GuidedWorkflow
}

export const models = ['DeepSeek', 'Kimi', 'Doubao', 'Qwen', 'ERNIE', 'Yuanbao', 'Zhipu']
export const realModels = ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2']
export const allModels = [...models, ...realModels]
export const isRealModel = (model: string | undefined) => Boolean(model && realModels.includes(model))

const entriesFromRecords = (sources: KnowledgeSource[], facts: KnowledgeFact[]): KnowledgeEntry[] => [
  ...sources.map(source => ({ id: `entry-${source.id}`, category: 'Source' as const, title: source.title, body: source.excerpt, status: source.status, updated: source.updated })),
  ...facts.map(fact => ({ id: `entry-${fact.id}`, category: 'Fact' as const, title: 'Verified fact', body: fact.claim, status: fact.status, updated: fact.updated })),
]

export const seedKnowledgeBases: KnowledgeBase[] = [
  { id: 'kb-1', name: 'Product Library', description: 'Approved product facts, differentiators, and customer proof for the workspace.', sourceCount: 3, updated: '2026-08-17', tone: 'Clear & practical', entries: [], sources: [{ id: 'src-1', title: 'Product overview brief', reference: 'Internal brief · 2026-08-17', excerpt: 'The workspace brings question discovery, approved knowledge, review, and owned-channel planning into one place.', status: 'Approved', updated: '2026-08-17' }, { id: 'src-2', title: 'Operations workflow notes', reference: 'Research note · 2026-08-15', excerpt: 'Teams can make operational bottlenecks visible by connecting recurring questions to reviewable content tasks.', status: 'Approved', updated: '2026-08-15' }, { id: 'src-3', title: 'Customer proof excerpt', reference: 'Interview note · 2026-08-11', excerpt: 'Operators prefer a clear review checkpoint before content is staged for an owned channel.', status: 'Review', updated: '2026-08-11' }], facts: [{ id: 'fact-1', claim: 'The workspace uses a question-led content workflow.', sourceId: 'src-1', status: 'Approved', updated: '2026-08-17' }, { id: 'fact-2', claim: 'Content remains reviewable before local publishing is staged.', sourceId: 'src-3', status: 'Review', updated: '2026-08-11' }] },
  { id: 'kb-2', name: 'Editorial Research Pack', description: 'Research notes and source briefs for evergreen editorial content.', sourceCount: 2, updated: '2026-08-12', tone: 'Evidence-led', entries: [], sources: [{ id: 'src-4', title: 'Evergreen brief template', reference: 'Editorial note · 2026-08-12', excerpt: 'Evergreen briefs should state the reader question, evidence boundary, and review owner.', status: 'Approved', updated: '2026-08-12' }, { id: 'src-5', title: 'Research synthesis note', reference: 'Research note · 2026-08-10', excerpt: 'A concise source map makes it easier to check claims before publication.', status: 'Review', updated: '2026-08-10' }], facts: [{ id: 'fact-3', claim: 'Evergreen briefs should state their evidence boundary.', sourceId: 'src-4', status: 'Approved', updated: '2026-08-12' }] },
  { id: 'kb-3', name: 'Customer Voice', description: 'Anonymized interview snippets and recurring customer questions.', sourceCount: 2, updated: '2026-08-08', tone: 'Warm & direct', entries: [], sources: [{ id: 'src-6', title: 'Interview synthesis', reference: 'Interview note · 2026-08-08', excerpt: 'Customers ask for practical ways to understand work across distributed teams.', status: 'Approved', updated: '2026-08-08' }, { id: 'src-7', title: 'Recurring questions log', reference: 'Question log · 2026-08-06', excerpt: 'Recurring questions are useful inputs for a reviewable content brief.', status: 'Draft', updated: '2026-08-06' }], facts: [{ id: 'fact-4', claim: 'Customer questions can become practical content briefs.', sourceId: 'src-6', status: 'Approved', updated: '2026-08-08' }] },
]

for (const knowledgeBase of seedKnowledgeBases) knowledgeBase.entries = entriesFromRecords(knowledgeBase.sources, knowledgeBase.facts)

const sampleImages = (prefix: string, count: number, date: string): LocalImage[] => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index + 1}`,
  name: `${prefix}-sample-${String(index + 1).padStart(2, '0')}.png`,
  size: 180000 + index * 42000,
  width: 1600,
  height: 1000,
  kind: 'sample',
  updated: date,
}))

export const seedImageLibraries: ImageLibrary[] = [
  { id: 'img-1', name: 'Brand Kit', description: 'Illustrations, product UI crops, and campaign-safe imagery.', imageCount: 8, updated: '2026-08-15', style: 'Editorial', images: sampleImages('brand-kit', 8, '2026-08-15') },
  { id: 'img-2', name: 'Field Notes', description: 'Workplace and operations photography for practical guides.', imageCount: 6, updated: '2026-08-06', style: 'Documentary', images: sampleImages('field-notes', 6, '2026-08-06') },
  { id: 'img-3', name: 'No-image articles', description: 'A controlled library for text-first publishing workflows.', imageCount: 0, updated: '2026-07-31', style: 'Text only', images: [] },
]

export const seedKeywordSets: KeywordSet[] = [
  { id: 'ks-1', name: 'Operations planning', brand: 'Example brand', questionCount: 86, date: '2026-08-17', tags: ['operations', 'planning', 'workflow'], prompts: ['How do operations teams plan work across multiple locations?', 'What is the simplest operations planning workflow for a growing team?', 'Which tools help make operational bottlenecks visible?'] },
  { id: 'ks-2', name: 'Customer support automation', brand: 'Example brand', questionCount: 64, date: '2026-08-14', tags: ['support', 'automation'], prompts: ['What customer support tasks are safe to automate?', 'How should a team evaluate support automation software?', 'What are the best ways to keep automated support helpful?'] },
  { id: 'ks-3', name: 'Remote team rituals', brand: 'Example brand', questionCount: 42, date: '2026-08-09', tags: ['remote', 'team culture'], prompts: ['Which remote team rituals actually improve collaboration?', 'How often should distributed teams run planning meetings?'] },
]

export const seedInstructions: WritingInstruction[] = [
  { id: 'wi-1', title: 'Long-form standard', group: 'Article', description: 'Use a concise opening, direct answers, sourced claims, and a helpful next step.', updated: '2026-08-16', status: 'Active' },
  { id: 'wi-2', title: 'Practical comparison title', group: 'Title', description: 'Lead with the use case, keep titles specific, and avoid exaggerated superlatives.', updated: '2026-08-12', status: 'Active' },
  { id: 'wi-3', title: 'Answer-first structure', group: 'Article', description: 'Place the core answer in the first 60 words and support it with scannable sections.', updated: '2026-08-10', status: 'Active' },
  { id: 'wi-4', title: 'Search result replication', group: 'Traffic Replication', description: 'Mirror high-intent query language while adding original evidence and point of view.', updated: '2026-08-03', status: 'Draft' },
  { id: 'wi-5', title: 'Question-led headline', group: 'Title', description: 'Use the reader question as the organizing idea, without clickbait.', updated: '2026-07-28', status: 'Active' },
]

export const seedCreationTasks: CreationTask[] = [
  { id: 'ct-1', name: 'Operations pillar sprint', keyword: 'operations planning', questionCount: 86, writingInstruction: 'Long-form standard', titleInstruction: 'Practical comparison title', knowledgeBase: 'Product Library', imageLibrary: 'Brand Kit', generated: 34, target: 86, status: 'Running', updated: '12 min ago', created: '2026-08-17', model: 'Local simulation', localOnly: true, keywordSetId: 'ks-1', writingInstructionId: 'wi-1', titleInstructionId: 'wi-2', knowledgeBaseIds: ['kb-1'], groundingEntryIds: seedKnowledgeBases[0].entries.slice(0, 2).map(entry => entry.id), imageLibraryId: 'img-1', imageCount: 8, imageIds: seedImageLibraries[0].images.slice(0, 4).map(image => image.id), imagesPerArticle: 1, logs: [{ id: 'ct-1-log-1', time: '12 min ago', message: 'Seeded local task is ready for review; no external execution has occurred.', tone: 'info' }] },
  { id: 'ct-2', name: 'Support automation cluster', keyword: 'customer support automation', questionCount: 64, writingInstruction: 'Answer-first structure', titleInstruction: 'Question-led headline', knowledgeBase: 'Customer Voice', imageLibrary: 'Field Notes', generated: 64, target: 64, status: 'Completed', updated: 'Yesterday', created: '2026-08-14', model: 'Local simulation', localOnly: true, keywordSetId: 'ks-2', writingInstructionId: 'wi-3', titleInstructionId: 'wi-5', knowledgeBaseIds: ['kb-3'], groundingEntryIds: seedKnowledgeBases[2].entries.slice(0, 2).map(entry => entry.id), imageLibraryId: 'img-2', imageCount: 6, imageIds: seedImageLibraries[1].images.slice(0, 2).map(image => image.id), imagesPerArticle: 1, logs: [{ id: 'ct-2-log-1', time: 'Yesterday', message: 'Local review articles are available in the article list.', tone: 'success' }] },
  { id: 'ct-3', name: 'Remote team starter set', keyword: 'remote team rituals', questionCount: 42, writingInstruction: 'Long-form standard', titleInstruction: 'Question-led headline', knowledgeBase: 'Editorial Research Pack', imageLibrary: 'No-image articles', generated: 0, target: 42, status: 'Ready', updated: 'Aug 09', created: '2026-08-09', model: 'Local simulation', localOnly: true, keywordSetId: 'ks-3', writingInstructionId: 'wi-1', titleInstructionId: 'wi-5', knowledgeBaseIds: ['kb-2'], groundingEntryIds: seedKnowledgeBases[1].entries.slice(0, 2).map(entry => entry.id), imageLibraryId: 'img-3', imageCount: 0, imageIds: [], imagesPerArticle: 0, logs: [{ id: 'ct-3-log-1', time: 'Aug 09', message: 'Task configuration saved locally and awaiting a simulated batch.', tone: 'info' }] },
  { id: 'ct-4', name: 'Live MiniMax pilot', keyword: 'content operations workflow', questionCount: 12, writingInstruction: 'Long-form standard', titleInstruction: 'Question-led headline', knowledgeBase: 'Product Library', imageLibrary: 'Brand Kit', generated: 0, target: 4, status: 'Ready', updated: 'just now', created: '2026-08-19', model: 'MiniMax-M3', localOnly: false, keywordSetId: 'ks-1', writingInstructionId: 'wi-1', titleInstructionId: 'wi-5', knowledgeBaseIds: ['kb-1'], groundingEntryIds: seedKnowledgeBases[0].entries.slice(0, 3).map(entry => entry.id), imageLibraryId: 'img-1', imageCount: 4, imageIds: seedImageLibraries[0].images.slice(0, 2).map(image => image.id), imagesPerArticle: 1, logs: [{ id: 'ct-4-log-1', time: 'just now', message: 'Live pilot task is wired to the local proxy. Set ANTHROPIC_API_KEY to enable real generation.', tone: 'info' }] },
]

export const seedArticles: Article[] = [
  { id: 'art-1', title: 'Operations planning: a practical guide for growing teams', keyword: 'operations planning', task: 'Operations pillar sprint', model: 'DeepSeek', status: 'Published', date: '2026-08-17', wordCount: 1480, channel: 'Main blog' },
  { id: 'art-2', title: 'How to make operational bottlenecks visible', keyword: 'operations planning', task: 'Operations pillar sprint', model: 'Kimi', status: 'Review', date: '2026-08-16', wordCount: 1320, channel: 'Main blog' },
  { id: 'art-3', title: 'What customer support tasks are safe to automate?', keyword: 'customer support automation', task: 'Support automation cluster', model: 'Qwen', status: 'Scheduled', date: '2026-08-18', wordCount: 1160, channel: 'Main newsletter' },
  { id: 'art-4', title: 'Remote team rituals that improve collaboration', keyword: 'remote team rituals', task: 'Remote team starter set', model: 'ERNIE', status: 'Draft', date: '2026-08-09', wordCount: 980, channel: 'Main blog' },
  { id: 'art-5', title: 'How often should distributed teams plan together?', keyword: 'remote team rituals', task: 'Remote team starter set', model: 'Doubao', status: 'Published', date: '2026-08-07', wordCount: 1040, channel: 'Main blog' },
]

export const seedPublishingTasks: PublishingTask[] = [
  { id: 'pub-1', name: 'Blog queue', pool: 'Operations pillar sprint', account: 'CMS account', channel: 'Website', limit: 5, deduplication: true, aiDisclosure: true, status: 'Active', lastRun: 'Today, 09:20' },
  { id: 'pub-2', name: 'Newsletter digest', pool: 'Support automation cluster', account: 'Mail account', channel: 'Newsletter', limit: 2, deduplication: true, aiDisclosure: true, status: 'Paused', lastRun: 'Aug 16, 14:10' },
]

export const seedValidationResults: ValidationResult[] = [
  { id: 'vr-1', keyword: 'operations planning', model: 'DeepSeek', platform: 'DeepSeek', score: 92, citations: 8, responseTime: '1.8s', status: 'Passed', checked: 'Today, 09:42' },
  { id: 'vr-2', keyword: 'support automation software', model: 'Kimi', platform: 'Kimi', score: 86, citations: 6, responseTime: '2.2s', status: 'Passed', checked: 'Today, 09:38' },
  { id: 'vr-3', keyword: 'remote team rituals', model: 'Doubao', platform: 'Doubao', score: 74, citations: 4, responseTime: '2.6s', status: 'Review', checked: 'Yesterday' },
  { id: 'vr-4', keyword: 'operations workflow tools', model: 'Qwen', platform: 'Qwen', score: 68, citations: 3, responseTime: '3.1s', status: 'Review', checked: 'Yesterday' },
  { id: 'vr-5', keyword: 'automate support tickets', model: 'ERNIE', platform: 'ERNIE', score: 48, citations: 1, responseTime: '4.4s', status: 'Failed', checked: 'Aug 16' },
  { id: 'vr-6', keyword: 'distributed planning cadence', model: 'Zhipu', platform: 'Zhipu', score: 81, citations: 5, responseTime: '2.9s', status: 'Passed', checked: 'Aug 15' },
]

export const seedLedger: LedgerEntry[] = [
  { id: 'led-1', type: 'Usage', detail: 'Automatic creation · Operations pillar sprint', amount: -86, balance: 914, date: 'Today, 09:20' },
  { id: 'led-2', type: 'Usage', detail: 'Model validation · 12 prompts', amount: -24, balance: 1000, date: 'Yesterday, 16:48' },
  { id: 'led-3', type: 'Recharge', detail: 'Demo workspace allocation', amount: 1024, balance: 1024, date: 'Aug 01, 10:00' },
]

export const seedRecords: OperationsRecord[] = [
  { id: 'rec-1', type: 'Generation', summary: '34 articles generated · Operations pillar sprint', owner: 'Editorial team', status: 'Complete', date: 'Today, 09:20' },
  { id: 'rec-2', type: 'Review', summary: 'Article review queue updated', owner: 'SEO team', status: 'In review', date: 'Today, 08:46' },
  { id: 'rec-3', type: 'Publishing', summary: 'Blog queue paused', owner: 'Growth team', status: 'Queued', date: 'Yesterday, 16:12' },
  { id: 'rec-4', type: 'Validation', summary: 'Six model checks completed', owner: 'Editorial team', status: 'Complete', date: 'Yesterday, 14:35' },
]

export const seedAccounts: AccountConfig[] = [
  { id: 'acct-1', name: 'CMS account', type: 'CMS', channel: 'Website', status: 'Not connected', owner: 'Editorial team' },
  { id: 'acct-2', name: 'Mail account', type: 'Newsletter', channel: 'Newsletter', status: 'Configured', owner: 'Growth team' },
  { id: 'acct-3', name: 'Social account', type: 'Social', channel: 'Owned social', status: 'Not connected', owner: 'Growth team' },
]

export const seedWebsiteChannels: WebsiteChannel[] = [
  { id: 'site-1', name: 'Main blog', domain: 'example.local/blog', contentType: 'Long-form article', approval: 'Manual', status: 'Ready', updated: 'Today' },
  { id: 'site-2', name: 'Resource center', domain: 'example.local/resources', contentType: 'Guide / template', approval: 'Auto review', status: 'Draft', updated: 'Aug 14' },
]

export const seedInfluencers: InfluencerPartner[] = [
  { id: 'inf-1', name: 'Ops Field Notes', focus: 'Operations leadership', stage: 'Briefed', audience: '18k subscribers', note: 'Practical workflow stories' },
  { id: 'inf-2', name: 'Distributed Work Weekly', focus: 'Remote teams', stage: 'Research', audience: '42k subscribers', note: 'Potential guest guide placement' },
]

export const seedSeoChecks: SeoCheck[] = [
  { id: 'seo-1', area: 'Crawlability', status: 'Healthy', score: 88, note: 'Primary content paths are represented in the local plan.', updated: 'Today' },
  { id: 'seo-2', area: 'Schema', status: 'Needs review', score: 61, note: 'Add a review checkpoint for Article and FAQ schema.', updated: 'Yesterday' },
  { id: 'seo-3', area: 'Internal links', status: 'Opportunity', score: 54, note: 'Connect pillar articles to related question clusters.', updated: 'Aug 12' },
  { id: 'seo-4', area: 'Freshness', status: 'Healthy', score: 79, note: 'Most priority briefs were updated in the last 30 days.', updated: 'Aug 10' },
]

export const seedValidationTasks: ValidationTask[] = [
  { id: 'vt-1', name: 'Weekly model sweep', promptCount: 24, models: ['DeepSeek', 'Kimi', 'Qwen'], status: 'Ready', created: 'Aug 17', lastRun: 'Yesterday, 16:48' },
  { id: 'vt-2', name: 'Operations cluster check', promptCount: 12, models: ['Doubao', 'ERNIE', 'Zhipu'], status: 'Completed', created: 'Aug 12', lastRun: 'Today, 09:42' },
]

export const seedExportTasks: ExportTask[] = [
  { id: 'ex-1', name: 'Validation results · Aug 18', format: 'CSV', rows: 6, status: 'Ready', created: 'Today, 09:45', destination: 'Local download' },
]

export const seedAdminConfig: AdminConfig = {
  users: [{ id: 'usr-1', name: 'Ethan Tan', role: 'Owner', status: 'Active', lastSeen: 'Now' }, { id: 'usr-2', name: 'Mina Zhou', role: 'Editor', status: 'Active', lastSeen: 'Today, 08:45' }, { id: 'usr-3', name: 'Leo Park', role: 'Reviewer', status: 'Invited', lastSeen: 'Never' }],
  apiKeys: [{ id: 'key-1', label: 'Local validation placeholder', scope: 'Model checks', status: 'Placeholder', created: 'Aug 01' }, { id: 'key-2', label: 'Publishing placeholder', scope: 'Owned channels', status: 'Placeholder', created: 'Aug 01' }],
  llmConfigs: models.map((model, index) => ({ id: `llm-${index}`, model, mode: index % 3 === 0 ? 'Quality' : index % 3 === 1 ? 'Balanced' : 'Fast', enabled: index !== 5, dailyLimit: 1000 })),
  pointRules: [{ id: 'rule-1', action: 'Generate article', cost: 8, note: 'Demo estimate per article' }, { id: 'rule-2', action: 'Validate prompt', cost: 2, note: 'Demo estimate per model check' }, { id: 'rule-3', action: 'Create export', cost: 1, note: 'Demo estimate per export task' }],
  modelChecks: models.slice(0, 5).map((model, index) => ({ id: `check-${index}`, model, cadence: index % 2 ? 'Weekly' : 'Daily', status: index === 4 ? 'Paused' : 'Enabled', lastRun: index === 0 ? 'Today, 09:42' : 'Yesterday' })),
  clientVersions: [{ id: 'ver-1', version: 'v0.8.4', channel: 'Stable demo', status: 'Current', released: 'Aug 18' }, { id: 'ver-2', version: 'v0.8.5-preview', channel: 'Preview', status: 'Review', released: 'Aug 19' }],
}

export const defaultAppState: AppState = {
  theme: 'light', language: 'en', balance: 914, knowledgeBases: seedKnowledgeBases, imageLibraries: seedImageLibraries, keywordSets: seedKeywordSets, instructions: seedInstructions,
  creationTasks: seedCreationTasks, articles: seedArticles, publishingTasks: seedPublishingTasks, validationResults: seedValidationResults, ledger: seedLedger,
  records: seedRecords, accounts: seedAccounts, websiteChannels: seedWebsiteChannels, influencers: seedInfluencers, seoChecks: seedSeoChecks,
  validationTasks: seedValidationTasks, exportTasks: seedExportTasks, adminConfig: seedAdminConfig,
  guidedWorkflow: { selectedKnowledgeBaseId: 'kb-1', prompt: 'How does Workspace help teams make operational bottlenecks visible?', step: 1 },
}

export const radarData = [
  { subject: 'Coverage', value: 78 }, { subject: 'Freshness', value: 64 }, { subject: 'Citations', value: 72 }, { subject: 'Clarity', value: 86 }, { subject: 'Authority', value: 58 }, { subject: 'Recall', value: 69 },
]

export const weeklyData = [
  { day: 'Mon', articles: 12, published: 7 }, { day: 'Tue', articles: 18, published: 12 }, { day: 'Wed', articles: 15, published: 10 }, { day: 'Thu', articles: 22, published: 15 }, { day: 'Fri', articles: 20, published: 13 }, { day: 'Sat', articles: 26, published: 18 }, { day: 'Sun', articles: 31, published: 21 },
]

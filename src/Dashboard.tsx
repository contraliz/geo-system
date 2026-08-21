
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Bot, BrainCircuit, Check, Cloud, Database, FileCheck2, FileText, RotateCcw, ShieldCheck, Sparkles, Tag, WandSparkles, Zap } from 'lucide-react'
import { useTranslation } from './i18n'
import { Kpi } from './shared'
import { Article, AppState, KnowledgeBase, KeywordSet, PublishingTask, ValidationResult, models, radarData, weeklyData } from './data'
import { formatDate, uid } from './utils'
import type { Route } from './types'
import { ExposureTrackingPanel, selectExposureMetrics } from './features/exposure-tracking'

function TargetIcon(props: { size?: number }) { return <Tag {...props} /> }
function MessageIcon(props: { size?: number }) { return <Tag {...props} /> }

function ChartCard({ title, subtitle, action, className = '', children }: { title: string; subtitle: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`card chart-card ${className}`}><CardHeader title={title} subtitle={subtitle} action={action} />{children}</section>
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { t: tr } = useTranslation()
  return <div className="card-header"><div><h2>{tr(title)}</h2>{subtitle && <p>{tr(subtitle)}</p>}</div>{action}</div>
}

function MiniTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number }[]; label?: string }) {
  const { t: tr } = useTranslation()
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label ? tr(label) : ''}</strong>{payload.map(item => <span key={item.name}>{item.name ? tr(item.name) : ''}: <b>{item.value}</b></span>)}</div>
}

function GuidedDemo({ state, patch, navigate, onOpenKnowledgeBase, onDetail, notify }: { state: AppState; patch: (next: Partial<AppState>) => void; navigate: (route: Route) => void; onOpenKnowledgeBase: (item: KnowledgeBase) => void; onDetail: (item: KeywordSet | Article) => void; notify: (message: string) => void }) {
  const { t: tr } = useTranslation()
  const flow = state.guidedWorkflow
  const selected = state.knowledgeBases.find(item => item.id === flow.selectedKnowledgeBaseId) || state.knowledgeBases[0]
  const [prompt, setPrompt] = useState(flow.prompt)
  useEffect(() => setPrompt(flow.prompt), [flow.prompt])
  if (!selected) return null
  const advance = (step: 1 | 2 | 3 | 4 | 5, extra: Partial<AppState['guidedWorkflow']> = {}) => patch({ guidedWorkflow: { ...flow, ...extra, step } })
  const article = flow.articleId ? state.articles.find(item => item.id === flow.articleId) : undefined
  const publishingTask = flow.publishingTaskId ? state.publishingTasks.find(item => item.id === flow.publishingTaskId) : undefined
  const validation = flow.validationResultId ? state.validationResults.find(item => item.id === flow.validationResultId) : undefined
  const savePrompt = () => { const value = prompt.trim(); if (!value) return; advance(3, { prompt: value }); notify(tr('Question prompt saved locally')) }
  const generate = () => {
    const value = prompt.trim() || flow.prompt
    const groundingIds = flow.selectedEntryIds?.filter(id => selected.entries.some(entry => entry.id === id)) || selected.entries.filter(entry => entry.status === 'Approved').map(entry => entry.id)
    const created: Article = { id: uid('guided-art'), title: value.replace(/^how\s+/i, 'How ').replace(/[?]+$/, '') + ' — a grounded guide', keyword: selected.name, task: `Guided local demo · ${selected.name}`, model: 'Local simulation', status: 'Review', date: formatDate(), wordCount: 640, channel: 'Local review queue', knowledgeBaseId: selected.id, prompt: value, groundedSourceIds: groundingIds }
    patch({ articles: [created, ...state.articles], guidedWorkflow: { ...flow, prompt: value, articleId: created.id, step: 4 } })
    notify(tr('Reviewable article generated locally'))
  }
  const stage = () => {
    if (!article) return
    const created: PublishingTask = { id: uid('guided-pub'), name: `Guided review · ${selected.name}`, pool: article.task, account: 'Local personal media', channel: 'Website', limit: 1, deduplication: true, aiDisclosure: true, status: 'Paused', lastRun: 'Never', articleId: article.id, knowledgeBaseId: selected.id }
    patch({ publishingTasks: [created, ...state.publishingTasks], guidedWorkflow: { ...flow, publishingTaskId: created.id, step: 5 } })
    notify(tr('Article staged in local personal media'))
  }
  const validate = () => {
    if (!article) return
    const created: ValidationResult = { id: uid('guided-val'), keyword: flow.prompt, model: 'Local simulation', platform: 'Local simulator', score: 88, citations: selected.sources.length, responseTime: '0.1s', status: 'Passed', checked: 'just now', brandExposure: 76, articleId: article.id, knowledgeBaseId: selected.id }
    patch({ validationResults: [created, ...state.validationResults], guidedWorkflow: { ...flow, validationResultId: created.id, step: 5 } })
    notify(tr('Simulated validation and brand exposure result created'))
  }
  const restart = () => patch({ guidedWorkflow: { selectedKnowledgeBaseId: selected.id, prompt: 'How does the workspace help teams make operational bottlenecks visible?', step: 1 } })
  const steps = [
    { number: 1, title: 'Choose knowledge base', detail: 'Select the approved source set for this local run.' },
    { number: 2, title: 'Ask a question', detail: 'Use a question-style prompt to define the article.' },
    { number: 3, title: 'Generate for review', detail: 'Create a reviewable article grounded in the selected sources.' },
    { number: 4, title: 'Stage personal media', detail: 'Create a paused local publishing task with disclosure.' },
    { number: 5, title: 'Validate exposure', detail: 'Create a simulated model result and brand-exposure signal.' },
  ] as const
  return <section className="guided-demo card"><div className="guided-head"><div><span className="eyebrow">{tr('GUIDED DEMO · LOCAL ONLY')}</span><h2>{tr('Run the question-to-validation flow')}</h2><p>{tr('Every step stays in this browser. No article is sent, published, scraped, or checked against a live model.')}</p></div><button className="button button-outline button-small" onClick={restart}><RotateCcw size={13} /> {tr('Restart demo flow')}</button></div><div className="guided-grid"><div className="guided-steps">{steps.map(item => <div className={`guided-step ${flow.step === item.number ? 'current' : ''} ${flow.step > item.number ? 'complete' : ''}`} key={item.number}><span>{flow.step > item.number ? <Check size={13} /> : item.number}</span><div><strong>{tr(item.title)}</strong><small>{tr(item.detail)}</small></div></div>)}</div><div className="guided-panel">
    {flow.step === 1 && <><label className="guided-label">{tr('Knowledge base')}<select value={selected.id} onChange={event => patch({ guidedWorkflow: { ...flow, selectedKnowledgeBaseId: event.target.value } })}>{state.knowledgeBases.map(item => <option value={item.id} key={item.id}>{tr(item.name)}</option>)}</select></label><p className="guided-note">{selected.entries.length} {tr('seeded entries')} · {selected.entries.filter(entry => entry.status === 'Approved').length} {tr('approved entries')}</p><button className="button button-primary" onClick={() => { advance(2); onOpenKnowledgeBase(selected) }}><Database size={14} /> {tr('Open and use this knowledge base')}</button></>}
    {flow.step === 2 && <><label className="guided-label">{tr('Question-style prompt')}<textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} placeholder={tr('Ask a question about the selected knowledge base')} /></label><p className="guided-note">{tr('The next article will retain this prompt and the source IDs used for grounding.')}</p><button className="button button-primary" disabled={!prompt.trim()} onClick={savePrompt}><ArrowDownRight size={14} /> {tr('Use this question')}</button></>}
    {flow.step === 3 && <><div className="guided-context"><span className="guided-icon"><FileText size={16} /></span><div><strong>{tr('Ready to generate a reviewable article')}</strong><small>{tr(selected.name)} · {tr(flow.prompt)}</small></div></div><div className="guided-facts"><span>{(flow.selectedEntryIds?.length || selected.entries.filter(entry => entry.status === 'Approved').length)} {tr('entries grounded')}</span><span>{selected.entries.filter(entry => entry.status === 'Approved').length} {tr('approved entries')}</span></div><button className="button button-primary" onClick={generate}><WandSparkles size={14} /> {tr('Generate local article')}</button></>}
    {flow.step === 4 && article && <><div className="guided-context"><span className="guided-icon"><FileCheck2 size={16} /></span><div><strong>{tr('Article is ready for review')}</strong><small>{tr(article.title)}</small></div></div><p className="guided-note">{tr('It is linked to the selected knowledge base and remains in Review until you change it in Article List.')}</p><div className="guided-actions"><button className="button button-outline" onClick={() => onDetail(article)}>{tr('Review article')}</button><button className="button button-primary" onClick={stage}><Cloud size={14} /> {tr('Stage local task')}</button></div></>}
    {flow.step === 5 && !validation && publishingTask && <><div className="guided-context"><span className="guided-icon"><Cloud size={16} /></span><div><strong>{tr('Paused personal-media task is staged')}</strong><small>{tr(publishingTask.name)} · {tr('No account connected')}</small></div></div><p className="guided-note">{tr('The task is local and paused, so it cannot publish anything.')}</p><div className="guided-actions"><button className="button button-outline" onClick={() => navigate('personal-media')}>{tr('Open personal media')}</button><button className="button button-primary" onClick={validate}><ShieldCheck size={14} /> {tr('Create validation result')}</button></div></>}
    {flow.step === 5 && validation && <><div className="guided-context"><span className="guided-icon success"><ShieldCheck size={16} /></span><div><strong>{tr('Simulated result created')}</strong><small>{tr('No live model or brand search was called.')}</small></div></div><div className="guided-result"><div><span>{tr('Quality')}</span><strong>{validation.score}</strong></div><div><span>{tr('Citations')}</span><strong>{validation.citations}</strong></div><div><span>{tr('Brand exposure')}</span><strong>{validation.brandExposure}%</strong></div></div><div className="guided-actions"><button className="button button-outline" onClick={() => navigate('model-validation')}>{tr('Open model validation')}</button><button className="button button-soft" onClick={restart}>{tr('Run again')}</button></div></>}
  </div></div></section>
}

function Dashboard({ state, patch, navigate, onOpenKnowledgeBase, onDetail, notify }: { state: AppState; patch: (next: Partial<AppState>) => void; navigate: (route: Route) => void; onOpenKnowledgeBase: (item: KnowledgeBase) => void; onDetail: (item: KeywordSet | Article) => void; notify: (message: string) => void }) {
  const { t: tr } = useTranslation()
  const totalArticles = state.creationTasks.reduce((sum, task) => sum + task.generated, 0)
  const exposureMetrics = selectExposureMetrics(state.validationResults)
  const exposureValue = exposureMetrics.averageExposure === null ? '—' : `${Math.round(exposureMetrics.averageExposure)}%`
  const exposureDelta = exposureMetrics.change === null ? 'Derived from local validation results' : `${exposureMetrics.change >= 0 ? '+' : ''}${Math.round(exposureMetrics.change)} pts vs previous`
  const [team, setTeam] = useState('All content teams')
  const chartData = weeklyData.map(item => ({ ...item, day: tr(item.day) }))
  const radar = radarData.map(item => ({ ...item, subject: tr(item.subject) }))
  return <div className="content-stack"><section className="notice-banner"><div className="notice-mark"><Sparkles size={17} /></div><div><strong>{tr("Welcome to your content operations control room")}</strong><p>{tr("Everything below is simulated in this browser. Use the full workflow to move from questions to a reviewable article.")}</p></div><select className="team-select" aria-label={tr("Select team")} value={team} onChange={event => setTeam(event.target.value)}><option value="All content teams">{tr("All content teams")}</option><option value="Editorial team">{tr("Editorial team")}</option><option value="SEO team">{tr("SEO team")}</option><option value="Growth team">{tr("Growth team")}</option></select><button className="button button-soft" onClick={() => navigate('keyword-distillation')}>{tr("Open full workflow")} <ArrowUpRight size={15} /></button></section>
    <GuidedDemo state={state} patch={patch} navigate={navigate} onOpenKnowledgeBase={onOpenKnowledgeBase} onDetail={onDetail} notify={notify} />
    <div className="kpi-grid"><Kpi label="Keyword coverage" value="78%" delta="+6.4%" icon={TargetIcon} tone="cobalt" /><Kpi label="Content output" value={totalArticles.toLocaleString()} delta="+18 this week" icon={FileCheck2} tone="cyan" /><Kpi label="Brand exposure" value={exposureValue} delta={exposureDelta} icon={MessageIcon} tone="green" /><Kpi label="Model calls" value="4,612" delta="-4.2% cost" icon={Bot} tone="violet" /></div>
    <div className="dashboard-grid"><ChartCard title={tr("Keyword radar")} subtitle="Six signals across the active question universe" className="radar-card"><ResponsiveContainer width="100%" height={245}><RadarChart data={radar} cx="50%" cy="50%" outerRadius="70%"><PolarGrid stroke="var(--line)" /><PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted)', fontSize: 10 }} /><Radar dataKey="value" stroke="var(--cobalt)" fill="var(--cobalt)" fillOpacity={0.18} strokeWidth={2} /></RadarChart></ResponsiveContainer></ChartCard><ChartCard title={tr("Content output")} subtitle="Generated articles by day" action={<span className="metric-highlight">+18.4%</span>}><ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} /><YAxis hide /><Tooltip content={<MiniTooltip />} /><Area type="monotone" dataKey="articles" stroke="var(--cobalt)" fill="var(--cobalt-soft)" strokeWidth={2} /></AreaChart></ResponsiveContainer></ChartCard></div>
    <div className="dashboard-grid">{exposureMetrics.trackedChecks > 0 && <ExposureTrackingPanel validationResults={state.validationResults} />}<ChartCard title={tr("Model calls")} subtitle="Distribution across configured models"><div className="model-bars">{models.slice(0, 5).map((model, index) => <div className="model-bar" key={model}><div><span>{model}</span><strong>{[31, 24, 18, 15, 12][index]}%</strong></div><div className="progress"><span style={{ width: `${[31, 24, 18, 15, 12][index]}%`, background: ['var(--cobalt)', 'var(--cyan)', 'var(--violet)', 'var(--orange)', 'var(--green)'][index] }} /></div></div>)}</div><div className="card-foot"><span>{tr("Active model pool")}</span><strong>7 {tr("platforms")}</strong></div></ChartCard></div>
    <div className="section-row"><div><h2>{tr("Workflow pulse")}</h2><p>{tr("Choose the next operating surface.")}</p></div><span className="simulated-label"><span className="status-dot" /> {tr("Simulated data")}</span></div><div className="workflow-grid">{[{ route: 'keyword-distillation' as Route, icon: WandSparkles, title: 'Distill questions', text: 'Find the prompts behind a theme.' }, { route: 'automatic-creation' as Route, icon: BrainCircuit, title: 'Create content', text: 'Turn a keyword set into a task.' }, { route: 'article-list' as Route, icon: FileText, title: 'Review articles', text: 'Inspect model output and status.' }, { route: 'personal-media' as Route, icon: Cloud, title: 'Publish locally', text: 'Configure an owned-channel queue.' }].map(item => <button className="workflow-card" key={item.route} onClick={() => navigate(item.route)}><span className="workflow-icon"><item.icon size={18} /></span><strong>{tr(item.title)}</strong><span>{tr(item.text)}</span><ArrowUpRight size={15} /></button>)}</div><section className="card table-card"><CardHeader title={tr("Recent operating events")} subtitle="A local snapshot of the latest content movement" action={<button className="text-button" onClick={() => navigate('records')}>{tr("View records")} <ArrowUpRight size={14} /></button>} /><div className="event-list">{state.ledger.map(item => <div className="event-row" key={item.id}><span className={`event-icon ${item.type.toLowerCase()}`}>{item.type === 'Usage' ? <Zap size={14} /> : <ArrowUpRight size={14} />}</span><div><strong>{tr(item.detail)}</strong><span>{tr(item.date)}</span></div><b className={item.amount > 0 ? 'positive' : ''}>{item.amount > 0 ? '+' : ''}{item.amount} {tr("pts")}</b></div>)}</div></section></div>
}

export default Dashboard

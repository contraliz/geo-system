import { useState, type FormEvent } from 'react'
import { LoaderCircle, MoreHorizontal, Plus, WandSparkles } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { AppState, KeywordSet } from '../../data'
import { Toolbar } from '../../shared'
import { clusterQuestions, generateKeywordQuestions, type KeywordDistillationPayload } from './logic'

export type KeywordDistillationPageProps = {
  state: AppState
  onCreate: () => void
  onDetail: (item: KeywordSet) => void
}

function GenerationPanel() {
  const { t: tr } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [count, setCount] = useState('5')
  const [result, setResult] = useState<KeywordDistillationPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedCount = Number(count.trim())
    if (!keyword.trim()) {
      setError(tr('Enter a keyword before generating questions.'))
      setResult(null)
      return
    }
    if (!/^[1-9]\d*$/.test(count.trim()) || !Number.isSafeInteger(parsedCount) || parsedCount <= 0) {
      setError(tr('Count must be a positive integer.'))
      setResult(null)
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setResult(await generateKeywordQuestions(keyword.trim(), parsedCount))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('MiniMax generation failed.'))
    } finally {
      setLoading(false)
    }
  }

  const clusters = result ? clusterQuestions(result.questions) : []

  return <section className="card" style={{ padding: 18 }} data-testid="keyword-generation-panel">
    <div className="section-row" style={{ alignItems: 'flex-start' }}>
      <div>
        <span className="eyebrow"><WandSparkles size={12} /> MINIMAX QUESTION DISTILLATION</span>
        <h2 style={{ marginTop: 8, fontSize: 16 }}>{tr('Generate a question set')}</h2>
        <p style={{ maxWidth: 650, marginTop: 5, color: 'var(--muted)', fontSize: 9, lineHeight: 1.5 }}>{tr('Send a keyword and count to the configured MiniMax proxy. The browser validates and displays the returned questions without writing external state.')}</p>
      </div>
    </div>
    <form className="creation-form" onSubmit={submit}>
      <div className="creation-form-grid" style={{ marginTop: 15 }}>
        <label>{tr('Keyword')}<input aria-label={tr('Keyword')} value={keyword} onChange={event => setKeyword(event.target.value)} placeholder={tr('e.g. operations planning')} /></label>
        <label>{tr('Question count')}<input aria-label={tr('Question count')} inputMode="numeric" type="number" min="1" step="1" value={count} onChange={event => setCount(event.target.value)} /></label>
      </div>
      <div className="creation-local-options" style={{ marginTop: 15 }}>
        <WandSparkles size={16} />
        <div><strong>{tr('Remote model, local result')}</strong><p>{tr('Your keyword and count are sent to the configured MiniMax proxy. The returned result remains in this browser and is not added to AppState.')}</p></div>
      </div>
      <div className="editor-actions">
        <button className="button button-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle size={14} className="spin" /> : <WandSparkles size={14} />} {loading ? tr('Generating…') : tr('Generate questions')}</button>
      </div>
    </form>
    {error && <div className="publisher-error" role="alert" style={{ margin: '14px 0 0' }}>{error}</div>}
    {result && <section aria-live="polite" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <div className="section-row"><div><h3 style={{ fontSize: 12 }}>{tr('Generated questions')}</h3><p style={{ marginTop: 4, color: 'var(--muted)', fontSize: 9 }}>{result.questions.length} {tr('questions')} · {tr('MiniMax-M3')}</p></div><span className="status-pill active">{tr('Validated locally')}</span></div>
      <div className="article-body" style={{ maxHeight: 280, marginTop: 11 }}>
        {result.questions.map((question, index) => <p key={question}><strong style={{ color: 'var(--cobalt)', marginRight: 8 }}>{String(index + 1).padStart(2, '0')}</strong>{question}</p>)}
      </div>
      <div className="tag-row" style={{ marginTop: 10 }}>
        {clusters.map(cluster => <span className="tag" key={cluster.id}>{cluster.label} · {cluster.questions.length}</span>)}
      </div>
    </section>}
  </section>
}

export function KeywordDistillationPage({ state, onCreate, onDetail }: KeywordDistillationPageProps) {
  const { t: tr } = useTranslation()
  const [search, setSearch] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)
  const items = state.keywordSets.filter(item => `${item.name} ${item.brand} ${item.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))

  return <div className="content-stack">
    <Toolbar search={search} setSearch={setSearch} action={<>
      <button className="button button-soft" type="button" onClick={() => setShowGenerator(value => !value)}><WandSparkles size={15} /> {showGenerator ? tr('Hide generator') : tr('Generate questions')}</button>
      <button className="button button-primary" type="button" onClick={onCreate}><Plus size={15} /> {tr('New keyword set')}</button>
    </>} />
    {showGenerator && <GenerationPanel />}
    <div className="keyword-grid">{items.map(item => <button className="keyword-card card" key={item.id} onClick={() => onDetail(item)}><div className="keyword-top"><span className="set-icon"><WandSparkles size={17} /></span><MoreHorizontal size={17} /></div><h3>{tr(item.name)}</h3><p className="brand-line"><span className="brand-badge">{item.brand.slice(0, 1)}</span>{tr(item.brand)} · {tr('active brand')}</p><div className="keyword-stats"><div><strong>{item.questionCount}</strong><span>{tr('questions')}</span></div><div><strong>{item.prompts.length}</strong><span>{tr('sample prompts')}</span></div><span className="asset-date">{tr('Updated')} {tr(item.date)}</span></div><div className="tag-row">{item.tags.map(tag => <span className="tag" key={tag}>{tr(tag)}</span>)}</div></button>)}</div>
  </div>
}


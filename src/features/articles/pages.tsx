import { useState } from 'react'
import type { Article, AppState } from '../../data'
import { Toolbar } from '../../shared'
import { useTranslation } from '../../i18n'

export function ArticlePage({ state, onDetail }: { state: AppState; onDetail: (item: Article) => void }) {
  const { t: tr } = useTranslation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [task, setTask] = useState('All tasks')
  const [page, setPage] = useState(1)
  const tasks = [...new Set(state.articles.map(item => item.task))]
  const filtered = state.articles.filter(item => (status === 'All statuses' || item.status === status) && (task === 'All tasks' || item.task === task) && `${item.title} ${item.keyword} ${item.model}`.toLowerCase().includes(search.toLowerCase()))
  const shown = filtered.slice((page - 1) * 4, page * 4)
  return <div className="content-stack">
    <Toolbar search={search} setSearch={value => { setSearch(value); setPage(1) }} selects={<>
      <select aria-label={tr('Filter by article task')} value={task} onChange={e => { setTask(e.target.value); setPage(1) }}><option value="All tasks">{tr('All tasks')}</option>{tasks.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <select aria-label={tr('Filter by article status')} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="All statuses">{tr('All statuses')}</option><option value="Draft">{tr('Draft')}</option><option value="Review">{tr('Review')}</option><option value="Published">{tr('Published')}</option><option value="Scheduled">{tr('Scheduled')}</option></select>
    </>} />
    <section className="card table-card"><div className="table-scroll"><table><thead><tr><th>{tr('Article')}</th><th>{tr('Task')}</th><th>{tr('Model')}</th><th>{tr('Status')}</th><th>{tr('Publication')}</th><th>{tr('Words')}</th><th>{tr('Date')}</th></tr></thead><tbody>{shown.map(item => <tr key={item.id}><td><button className="table-title-button" onClick={() => onDetail(item)}>{item.title}</button><small className="table-subtitle">{item.keyword}</small></td><td>{item.task}</td><td><span className="model-badge">{item.model}</span></td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{tr(item.status)}</span></td><td>{item.channel}</td><td>{item.wordCount.toLocaleString()}</td><td>{item.date}</td></tr>)}</tbody></table></div><div className="table-footer"><span>{filtered.length} {tr('articles · model attribution is simulated')}</span><div className="pagination"><button className="icon-button" disabled={page === 1} aria-label={tr('Previous page')} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button><span>{tr(`Page ${page}`)}</span><button className="icon-button" disabled={page * 4 >= filtered.length} aria-label={tr('Next page')} onClick={() => setPage(value => value + 1)}>›</button></div></div></section>
  </div>
}


import { Cloud, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import type { AppState, PublishingTask } from '../../data'
import type { ConfirmRequest } from '../../shared/contracts'
import { useTranslation } from '../../i18n'
import { Toolbar } from '../../shared'
import { uid } from '../../utils'
import { PublisherPanel } from '../../PublisherPanel'

type Patch = (next: Partial<AppState>) => void
type Confirm = (confirmation: ConfirmRequest) => void

export function PublishingPage({ state, patch, onCreate, onConfirm, notify }: { state: AppState; patch: Patch; onCreate: () => void; onConfirm: Confirm; notify: (message: string) => void }) {
  const { t: tr } = useTranslation()
  const duplicate = (task: PublishingTask) => { patch({ publishingTasks: [...state.publishingTasks, { ...task, id: uid('pub'), name: `${task.name} copy`, status: 'Paused' }] }); notify(tr('Publishing task duplicated locally')) }
  const remove = (task: PublishingTask) => onConfirm({ title: `Delete ${task.name}?`, action: () => { patch({ publishingTasks: state.publishingTasks.filter(item => item.id !== task.id) }); notify(tr('Publishing task deleted locally')) } })
  return <div className="content-stack"><PublisherPanel articles={state.articles} notify={notify} /><section className="notice-banner compact-banner"><div className="notice-mark"><Cloud size={17} /></div><div><strong>{tr('Owned-channel publishing is simulated')}</strong><p>{tr('No account is connected. These queues only demonstrate configuration and status management.')}</p></div><button className="button button-primary" onClick={onCreate}><Plus size={15} /> {tr('New media task')}</button></section><section className="card table-card"><div className="table-toolbar"><div><h2>{tr('Personal Media')}</h2><p className="toolbar-subtitle">{tr('Article pools, channel rules, and last local run')}</p></div><span className="simulated-label"><span className="status-dot" /> {tr('Local records')}</span></div><div className="table-scroll"><table><thead><tr><th>{tr('Task')}</th><th>{tr('Article pool')}</th><th>{tr('Account / channel')}</th><th>{tr('Limit')}</th><th>{tr('Rules')}</th><th>{tr('Status')}</th><th>{tr('Last run')}</th><th>{tr('Actions')}</th></tr></thead><tbody>{state.publishingTasks.map(task => <tr key={task.id}><td><strong className="table-title">{tr(task.name)}</strong></td><td>{tr(task.pool)}</td><td><span className="channel-badge">{tr(task.account)}</span> <span className="channel-badge muted">{tr(task.channel)}</span></td><td>{task.limit} {tr('/ run')}</td><td><span className="rule-chip">{task.deduplication ? tr('Dedup') : tr('No dedup')}</span><span className="rule-chip">{task.aiDisclosure ? tr('AI disclosed') : tr('No disclosure')}</span></td><td><span className={`status-pill ${task.status.toLowerCase()}`}>{tr(task.status)}</span></td><td>{tr(task.lastRun)}</td><td><div className="row-actions"><button className="icon-button" aria-label={tr(`Duplicate ${task.name}`)} onClick={() => duplicate(task)}><MoreHorizontal size={15} /></button><button className="icon-button danger-icon" aria-label={tr(`Delete ${task.name}`)} onClick={() => remove(task)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div></section></div>
}

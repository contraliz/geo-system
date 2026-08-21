import type { ReactNode } from 'react'
import { ArrowUpRight, FolderKanban, Search, Trash2, X } from 'lucide-react'
import { useTranslation } from './i18n'

type IconType = (props: { size?: number }) => ReactNode

export function Kpi({ label, value, delta, icon: Icon, tone }: { label: string; value: string; delta: string; icon: IconType; tone: string }) {
  const { t: tr } = useTranslation()
  return <section className={`card kpi-card ${tone}`}><div className="kpi-top"><span>{tr(label)}</span><span className="kpi-icon"><Icon size={16} /></span></div><strong className="kpi-value">{value}</strong><div className="kpi-delta"><ArrowUpRight size={13} />{tr(delta)}</div></section>
}

export function Toolbar({ search, setSearch, selects, action }: { search?: string; setSearch?: (value: string) => void; selects?: ReactNode; action?: ReactNode }) {
  const { t: tr } = useTranslation()
  return <div className="toolbar"><div className="toolbar-left">{setSearch && <label className="search-box"><Search size={15} /><input aria-label={tr('Search')} value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('Search local records')} /></label>}{selects}</div>{action && <div className="toolbar-actions">{action}</div>}</div>
}

export function Modal({ title, onClose, headerAction, children }: { title: string; onClose: () => void; headerAction?: ReactNode; children: ReactNode }) {
  const { t: tr } = useTranslation()
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="modal"><div className="modal-head"><div><span className="eyebrow">{tr('LOCAL RECORD')}</span><h2>{tr(title)}</h2><p>{tr('Use this form to add a simulated record to the current browser workspace.')}</p></div><div className="modal-head-actions">{headerAction}<button className="icon-button" aria-label={tr('Close modal')} onClick={onClose}><X size={18} /></button></div></div>{children}</section></div>
}

export function ConfirmModal({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: () => void }) {
  const { t: tr } = useTranslation()
  return <Modal title={tr('Confirm local deletion')} onClose={onClose}><div className="confirm-body"><span className="confirm-icon"><Trash2 size={20} /></span><p>{tr(title)} {tr('This action only changes this browser’s demo data.')}</p></div><div className="modal-foot"><span>{tr('Recover by resetting demo data')}</span><div><button className="button button-outline" onClick={onClose}>{tr('Cancel')}</button><button className="button button-danger" onClick={onConfirm}>{tr('Delete locally')}</button></div></div></Modal>
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  const { t: tr } = useTranslation()
  return <div className="empty-state"><FolderKanban size={20} /><strong>{tr(title)}</strong><span>{tr(text)}</span></div>
}

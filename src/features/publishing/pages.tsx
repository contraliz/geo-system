import type { AppState } from '../../data'
import { PublishingQueuePanel } from '../../PublisherPanel'

export function PublishingPage({ state, notify }: { state: AppState; patch?: (next: Partial<AppState>) => void; onCreate?: () => void; onConfirm?: (request: { title: string; action: () => void }) => void; notify: (message: string) => void }) {
  return <div className="content-stack publishing-route"><PublishingQueuePanel articles={state.articles} notify={notify} /></div>
}

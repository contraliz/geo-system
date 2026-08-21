import type { AppState } from '../data'

export type StatePatch = (next: Partial<AppState>) => void
export type Notify = (message: string) => void
export type ConfirmRequest = { title: string; action: () => void }
export type ConfirmHandler = (request: ConfirmRequest) => void

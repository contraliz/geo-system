import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { ValidationResult } from '../../data'
import { selectExposureMetrics } from './selectors'

function ExposureTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  const { t: tr } = useTranslation()
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label ? tr(label) : ''}</strong><span>{tr('Average exposure')}: <b>{Math.round(payload[0].value || 0)}%</b></span></div>
}

export function ExposureTrackingPanel({ validationResults }: { validationResults: readonly ValidationResult[] }) {
  const { t: tr } = useTranslation()
  const metrics = selectExposureMetrics(validationResults)
  const formatPercent = (value: number | null) => value === null ? '—' : `${Math.round(value)}%`
  const changeLabel = metrics.change === null ? tr('Waiting for a second tracked check') : `${metrics.change >= 0 ? '+' : ''}${Math.round(metrics.change)} pts vs previous`
  return <section className="card chart-card exposure-tracking-panel" data-testid="exposure-tracking-panel">
    <div className="card-header"><div><span className="eyebrow">{tr('EXPOSURE TRACKING · LOCAL SIMULATION')}</span><h2>{tr('Brand exposure')}</h2><p>{tr('Derived from validation results saved in this browser.')}</p></div><span className="simulated-label"><span className="status-dot" /> {tr('Simulated / local data')}</span></div>
    <div className="guided-result exposure-summary" aria-label={tr('Exposure summary')}>
      <div><span>{tr('Validation checks')}</span><strong>{metrics.totalChecks}</strong></div>
      <div><span>{tr('Tracked checks')}</span><strong>{metrics.trackedChecks}</strong></div>
      <div><span>{tr('Average exposure')}</span><strong>{formatPercent(metrics.averageExposure)}</strong></div>
      <div><span>{tr('Latest change')}</span><strong>{changeLabel}</strong></div>
    </div>
    {metrics.trend.length ? <ResponsiveContainer width="100%" height={190}><AreaChart data={metrics.trend} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} /><YAxis domain={[0, 100]} hide /><Tooltip content={<ExposureTooltip />} /><Area type="monotone" dataKey="exposure" name={tr('Exposure')} stroke="var(--green)" fill="var(--green-soft)" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <div className="empty-state"><ShieldCheck size={20} /><strong>{tr('No tracked exposure signals yet')}</strong><span>{tr('Complete the guided local validation step to add the first simulated signal.')}</span></div>}
    <div className="card-foot"><span>{tr('Exposure points total')}: {Math.round(metrics.totalExposure)}</span><span>{tr('All records remain local')}</span></div>
  </section>
}

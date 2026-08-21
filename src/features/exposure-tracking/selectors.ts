import type { ValidationResult } from '../../data'

/** The portion of a validation result needed to calculate exposure metrics. */
export type ExposureValidationResult = Pick<ValidationResult, 'brandExposure' | 'checked'>

export type ExposureTrendPoint = {
  label: string
  exposure: number
  value: number
  checks: number
}

export type ExposureMetrics = {
  totalChecks: number
  trackedChecks: number
  totalExposure: number
  averageExposure: number | null
  latestExposure: number | null
  change: number | null
  trend: ExposureTrendPoint[]
}

const hasExposure = (result: ExposureValidationResult): result is ExposureValidationResult & { brandExposure: number } => (
  typeof result.brandExposure === 'number' && Number.isFinite(result.brandExposure)
)

/** Returns only validation records that contain a numeric exposure signal. */
export function selectExposureResults(results: readonly ExposureValidationResult[]): (ExposureValidationResult & { brandExposure: number })[] {
  return results.filter(hasExposure)
}

/**
 * Builds a chronological, pure view of the exposure signals in validationResults.
 * State currently stores the newest result first, so reversing preserves that
 * local ordering without inventing a second timestamp/source of truth.
 */
export function selectExposureTrend(results: readonly ExposureValidationResult[]): ExposureTrendPoint[] {
  const grouped = new Map<string, { total: number; count: number }>()
  for (const result of selectExposureResults(results).slice().reverse()) {
    const label = result.checked || 'Unknown'
    const current = grouped.get(label) || { total: 0, count: 0 }
    current.total += result.brandExposure
    current.count += 1
    grouped.set(label, current)
  }
  return Array.from(grouped, ([label, group]) => {
    const exposure = group.total / group.count
    return { label, exposure, value: exposure, checks: group.count }
  })
}

/** Derives totals and changes exclusively from the supplied validation records. */
export function selectExposureMetrics(results: readonly ExposureValidationResult[]): ExposureMetrics {
  const tracked = selectExposureResults(results)
  const totalExposure = tracked.reduce((sum, result) => sum + result.brandExposure, 0)
  const trend = selectExposureTrend(results)
  const latestExposure = trend.length ? trend[trend.length - 1].exposure : null
  const previousExposure = trend.length > 1 ? trend[trend.length - 2].exposure : null
  return {
    totalChecks: results.length,
    trackedChecks: tracked.length,
    totalExposure,
    averageExposure: tracked.length ? totalExposure / tracked.length : null,
    latestExposure,
    change: latestExposure !== null && previousExposure !== null ? latestExposure - previousExposure : null,
    trend,
  }
}

export const selectExposureTotal = (results: readonly ExposureValidationResult[]) => selectExposureMetrics(results).totalExposure
export const selectAverageExposure = (results: readonly ExposureValidationResult[]) => selectExposureMetrics(results).averageExposure

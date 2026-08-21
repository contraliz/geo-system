# Exposure tracking worker boundary

Owned paths:

- `src/features/exposure-tracking/**`
- `src/Dashboard.tsx` for dashboard integration only
- `tests/exposure-tracking.spec.ts`

Do not edit `src/app/**`, `src/shared/**`, `src/data.ts`, `src/types.ts`,
publisher files, or any other feature directory. Keep feature-specific types,
selectors, sample-series transformations, and components inside this folder.

Public contract:

- Export `ExposureTrackingPanel` and pure exposure metric selectors from
  `index.ts`.
- Derive dashboard results from the existing `AppState.validationResults`
  records; do not add a second global source of truth.
- Update `src/Dashboard.tsx` so exposure totals/trends reflect current results
  rather than hard-coded brand-mention values.
- Clearly label simulated/local data and preserve the guided workflow.
- Add focused dashboard coverage in `tests/exposure-tracking.spec.ts`.

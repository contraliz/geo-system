# Keyword distillation worker boundary

Owned paths:

- `src/features/keyword-distillation/**`
- `tests/keyword-distillation.spec.ts`

Do not edit `src/app/**`, `src/shared/**`, `src/data.ts`, `src/types.ts`,
`src/Dashboard.tsx`, publisher files, or any other feature directory. Request a
small integration change from the lead instead.

Public contract:

- Export `KeywordDistillationPage` from `index.ts`.
- Preserve the current page props: `state: AppState`, `onCreate: () => void`,
  and `onDetail: (item: KeywordSet) => void`.
- Keep all new parsing, normalization, clustering, deduplication, and UI
  components inside this directory.
- Preserve local-only behavior and existing keyword-set records.

The lead will replace the compatibility import in
`src/app/legacy/KeywordDistillationPage.tsx` after the feature is ready.

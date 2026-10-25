# Shared packages

Code used by more than one app lives here, once.

- `grading-engine/`: normalisation, status codes, weights, coefficients, averages, ranks and appreciation
  (pure, versioned, test-covered; see `docs/spec/03-module-plans.md` §Module 2). Used by `apps/office`; the Teacher
  App and the server will use the same code.
- `ui/` (planned): shared components once a second app needs School Admin's.

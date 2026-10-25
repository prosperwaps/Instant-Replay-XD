# 0002: Rebuild School Admin as a typed, tested app

**Date:** 2026-10-25 · **Status:** accepted

## Context

The School Admin prototype (`apps/web/office`) is about 1,000 lines of string-built HTML in a few very long
lines of JavaScript, with two separate browser data stores, no tests and client-only security. A design review
found a blocking bug (mark entry renders black on black), colour used against its meaning, a dashboard without
decisions on it, and an XSS path through unescaped fields. Decision 0001 anticipated this moment: "When the
admin dashboard gets a real backend and login, it may move to its own app (`apps/office`)."

## Decision

- Build `apps/office` with Vite, React 19 and strict TypeScript, deployed as its own site.
- Put the grading engine in `packages/grading-engine` as a pure, versioned library (spec 03 §Module 2), shared
  later with the Teacher App and the server.
- All data changes go through one repository that checks permissions, detects stale writes and writes the
  audit log. A `localStorage` adapter serves the demo; an Appwrite adapter replaces it in Phase 6.
- Fonts are self-hosted. Numeric grids use JetBrains Mono for tabular alignment, as the Student Portal and
  Teacher App already do; all other School Admin text stays Poppins.
- The README's "no tiny text" rule is kept as a 13px floor in a 7-step type scale instead of an 18px root size.
- The legacy prototype stays in `apps/web/office` until every page has moved. The plan and its phases are in
  `docs/office-rebuild/PLAN.md`.

## Consequences

- The project gains a build step for School Admin (`npm run dev -w apps/office`). The public site, portal,
  Teacher App and Gate App remain static.
- Shared styles for the static site are untouched; the new app has its own token file. Merging the two into
  `packages/ui` is deferred until a second app needs the components.
- Security still depends on Phase 6: until then the app is a demonstration and says so on screen.

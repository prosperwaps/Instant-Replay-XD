# 0001: Project structure

**Date:** 2026-10-05 · **Status:** accepted

## Context

Work had been saved under `outputs/MODULE n/Views/<NAME -- n>/`, with `styles.css` (1.1 MB) copied into four folders so every page could reach it, plus `- Copy` backups beside the originals. Every copy had to be edited separately, and copies were bound to drift apart.

## Decision

- One repository with `apps/` (things users open), `backend/`, `packages/` (shared code), `docs/`, `design/`, `archive/`.
- All web pages (public site, admissions, student portal, admin office) live in **one site**, `apps/web/`, sharing one `assets/` folder. One copy of `styles.css`, reached by relative path.
- The 9 fonts that were base64-embedded in `styles.css` were extracted into `apps/web/assets/fonts/`. `styles.css` went from ~1.1 MB to ~31 KB, and browsers now cache fonts separately.
- Original state preserved in `archive/original-snapshot-2026-10-05.zip`.

## Consequences

- Deploying `apps/web` to Vercel serves all pages from one domain: `/`, `/admissions.html`, `/portal.html`, `/office/`.
- When the admin dashboard gets a real backend and login, it may move to its own app (`apps/office`) with its own deployment. At that point shared styles should become a package (`packages/ui`) consumed through a build tool (e.g. Vite), not copied.
- Mobile apps (teacher, parent, scanner) are planned as one cross-platform codebase with three build flavours (see `docs/spec/03-module-plans.md`). Their folders exist as placeholders until the framework is chosen.

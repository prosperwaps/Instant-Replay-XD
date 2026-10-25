/**
 * Mark sheet changes, expressed as repository mutations. Each function decides the permission, whether the
 * change is audited, and the revision it was made against.
 *
 * Workflow (spec 03 §Module 2): not started → in progress → submitted → locked.
 * A locked sheet changes only through "Edit locked marks", which the Vice Principal may do with a reason.
 */
import { isValidRaw, STATUS_LABELS } from '@cbc/grading-engine';
import type { Mutation } from './repository';
import type { Mark, MarkSheet } from './schema';
import { isEntered } from './queries';

export class MarkInputError extends Error {
  override readonly name = 'MarkInputError';
}

/** What a person may type into a mark cell. */
export type ParsedMark = { ok: true; mark: Mark } | { ok: false; error: string };

const STATUS_KEYS: Record<string, Mark['status']> = {
  abs: 'ABS',
  a: 'ABS',
  exc: 'EXC',
  e: 'EXC',
  nt: 'NT',
  n: 'NT',
  mal: 'MAL',
  m: 'MAL',
};

/**
 * Reads a cell: a number out of `max` ("14", "13.5", "13,5"), a status code ("ABS" or just "a"),
 * or nothing (clears the mark).
 */
export function parseMarkInput(input: string, max: number): ParsedMark {
  const text = input.trim().toLowerCase();
  if (text === '') return { ok: true, mark: { raw: null, status: null } };
  const status = STATUS_KEYS[text];
  if (status) return { ok: true, mark: { raw: null, status } };
  const normalised = text.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalised)) return { ok: false, error: 'Type a score, or A, E, N or M for a status.' };
  const raw = Number(normalised);
  if (raw > max) return { ok: false, error: `The paper is out of ${max}.` };
  if (!isValidRaw(raw, max)) return { ok: false, error: 'Use at most two decimal places.' };
  return { ok: true, mark: { raw, status: null } };
}

export function formatMark(mark: Mark): string {
  if (mark.status) return mark.status;
  if (mark.raw === null) return '';
  return String(mark.raw);
}

export function describeMark(mark: Mark): string {
  if (mark.status) return STATUS_LABELS[mark.status];
  if (mark.raw === null) return 'no mark';
  return String(mark.raw);
}

const sameMark = (a: Mark | undefined, b: Mark) => (a?.raw ?? null) === b.raw && (a?.status ?? null) === b.status;

interface SheetContext {
  sheet: MarkSheet;
  /** "Form 3A Mathematics · Sequence 2" — used in audit summaries. */
  label: string;
  actorId: string;
  now: Date;
}

/** One mark changed. On a locked sheet this needs the Vice Principal's "Edit locked marks" and a reason. */
export function setMark(ctx: SheetContext, student: { id: string; name: string }, mark: Mark, reason?: string): Mutation | null {
  const { sheet } = ctx;
  if (sameMark(sheet.marks[student.id], mark)) return null;
  if (mark.raw !== null && !isValidRaw(mark.raw, sheet.max)) throw new MarkInputError(`${mark.raw} is not a valid score out of ${sheet.max}`);
  const locked = sheet.state === 'locked';
  if (locked && !reason?.trim()) throw new MarkInputError('A reason is needed to change a locked mark.');
  const before = describeMark(sheet.marks[student.id] ?? { raw: null, status: null });

  return {
    permission: locked ? 'marks.editLocked' : 'marks.enter',
    action: locked ? 'mark.editLocked' : 'mark.set',
    entity: 'markSheet',
    entityId: sheet.id,
    summary: `${student.name}: ${before} → ${describeMark(mark)} · ${ctx.label}`,
    reason: reason ?? null,
    audit: locked,
    expect: { collection: 'markSheets', id: sheet.id, rev: sheet.rev },
    apply(draft) {
      const target = draft.markSheets.find((s) => s.id === sheet.id)!;
      target.marks[student.id] = mark;
      if (target.state === 'not-started') target.state = 'in-progress';
      target.updatedAt = ctx.now.toISOString();
      target.updatedBy = ctx.actorId;
    },
  };
}

/** Hands the sheet in. Every student on the roster needs a score or a status first. */
export function submitSheet(ctx: SheetContext, rosterIds: readonly string[]): Mutation {
  const { sheet } = ctx;
  if (sheet.state === 'submitted' || sheet.state === 'locked') throw new MarkInputError('This sheet has already been submitted.');
  const missing = rosterIds.filter((id) => !isEntered(sheet.marks[id])).length;
  if (missing > 0) throw new MarkInputError(`${missing} ${missing === 1 ? 'student has' : 'students have'} no mark yet.`);
  return {
    permission: 'marks.submit',
    action: 'markSheet.submit',
    entity: 'markSheet',
    entityId: sheet.id,
    summary: `Submitted ${ctx.label}`,
    audit: true,
    expect: { collection: 'markSheets', id: sheet.id, rev: sheet.rev },
    apply(draft) {
      const target = draft.markSheets.find((s) => s.id === sheet.id)!;
      target.state = 'submitted';
      target.submittedAt = ctx.now.toISOString();
      target.updatedAt = ctx.now.toISOString();
      target.updatedBy = ctx.actorId;
    },
  };
}

/** Locks a submitted sheet so its marks can feed report cards. */
export function lockSheet(ctx: SheetContext): Mutation {
  const { sheet } = ctx;
  if (sheet.state !== 'submitted') throw new MarkInputError('Only a submitted sheet can be locked.');
  return {
    permission: 'marks.lock',
    action: 'markSheet.lock',
    entity: 'markSheet',
    entityId: sheet.id,
    summary: `Locked ${ctx.label}`,
    audit: true,
    expect: { collection: 'markSheets', id: sheet.id, rev: sheet.rev },
    apply(draft) {
      const target = draft.markSheets.find((s) => s.id === sheet.id)!;
      target.state = 'locked';
      target.lockedAt = ctx.now.toISOString();
    },
  };
}

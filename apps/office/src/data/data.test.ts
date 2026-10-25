import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../domain/permissions';
import { ConflictError, NotFoundError, Repository, memoryAdapter, type Actor } from './repository';
import { DatabaseSchema, type Database } from './schema';
import { createSeed } from './seed';
import { MarkInputError, lockSheet, parseMarkInput, setMark, submitSheet } from './marks';
import { attendanceOn, feesSummary, isEntered, pendingApplications, progressByClass, roster, sheetRows, sheetStatistics, sheetsForSequence } from './queries';
import { latestSchoolDay, schoolDay } from '../domain/dates';

const NOW = new Date('2026-10-25T09:00:00Z');
const registrar: Actor = { staffId: 'st-nji', role: 'registrar' };
const vp: Actor = { staffId: 'st-fon', role: 'vicePrincipal' };
const bursar: Actor = { staffId: 'st-achiri', role: 'bursar' };

let idN = 0;
function makeRepo(initial: string | null = null) {
  const adapter = memoryAdapter(initial);
  const repo = new Repository(adapter, { seed: createSeed, now: () => NOW, newId: () => `id-${++idN}` });
  return { adapter, repo };
}

const ctx = (db: Database, sheetId: string, actorId = 'st-nji') => ({
  sheet: db.markSheets.find((s) => s.id === sheetId)!,
  label: 'Test sheet',
  actorId,
  now: NOW,
});

function sheetIn(db: Database, state: Database['markSheets'][number]['state']) {
  const sheet = db.markSheets.find((s) => s.sequenceId === 'sq-2' && s.state === state);
  if (!sheet) throw new Error(`No ${state} sheet in seed`);
  return sheet;
}

describe('seed', () => {
  const db = createSeed(NOW);

  it('is valid against the schema', () => {
    expect(DatabaseSchema.safeParse(db).success).toBe(true);
  });
  it('is the same school every time', () => {
    expect(JSON.stringify(createSeed(NOW))).toBe(JSON.stringify(db));
  });
  it('has a realistic shape', () => {
    expect(db.classes).toHaveLength(6);
    expect(db.students.length).toBeGreaterThan(200);
    expect(db.markSheets.filter((s) => s.sequenceId === 'sq-2')).toHaveLength(db.classSubjects.length);
    const states = new Set(db.markSheets.filter((s) => s.sequenceId === 'sq-2').map((s) => s.state));
    expect(states).toEqual(new Set(['not-started', 'in-progress', 'submitted', 'locked']));
  });
  it('gives every class unique roll numbers in surname order', () => {
    for (const cls of db.classes) {
      const nos = roster(db, cls.id).map((s) => s.rollNo);
      expect(nos).toEqual(nos.map((_, i) => i + 1));
    }
  });
  it('leaves two registers to take on the latest school day', () => {
    const day = latestSchoolDay(schoolDay(NOW));
    expect(attendanceOn(db, day).filter((a) => !a.taken).map((a) => a.name)).toEqual(['Form 3A', 'Upper Sixth Arts']);
  });
});

describe('Repository', () => {
  it('seeds when storage is empty and reads back what it saved', () => {
    const { adapter, repo } = makeRepo();
    expect(repo.loadOutcome).toBe('seeded');
    const again = new Repository(adapter, { seed: createSeed, now: () => NOW });
    expect(again.loadOutcome).toBe('loaded');
    expect(again.snapshot().students).toHaveLength(repo.snapshot().students.length);
  });

  it('recovers from a corrupted stored copy instead of crashing', () => {
    expect(makeRepo('{not json').repo.loadOutcome).toBe('recovered');
    expect(makeRepo(JSON.stringify({ version: 99 })).repo.loadOutcome).toBe('recovered');
  });

  it('refuses a change the role may not make, and records the refusal', () => {
    const { repo } = makeRepo();
    const sheet = sheetIn(repo.snapshot(), 'in-progress');
    const classId = repo.snapshot().classSubjects.find((c) => c.id === sheet.classSubjectId)!.classId;
    const student = roster(repo.snapshot(), classId).find((s) => !isEntered(sheet.marks[s.id]))!;
    const mutation = setMark(ctx(repo.snapshot(), sheet.id, bursar.staffId), student, { raw: 12, status: null })!;
    expect(() => repo.commit(bursar, mutation)).toThrow(ForbiddenError);
    const last = repo.snapshot().audit.at(-1)!;
    expect(last).toMatchObject({ outcome: 'denied', actorId: 'st-achiri', action: 'mark.set' });
    expect(repo.snapshot().markSheets.find((s) => s.id === sheet.id)!.marks[student.id]).toEqual(sheet.marks[student.id]);
  });

  it('applies a change, bumps the revision and notifies subscribers', () => {
    const { repo } = makeRepo();
    const before = repo.snapshot();
    const sheet = sheetIn(before, 'not-started');
    const student = Object.keys(sheet.marks)[0]!;
    let notified = 0;
    repo.subscribe(() => notified++);
    repo.commit(registrar, setMark(ctx(before, sheet.id), { id: student, name: 'X' }, { raw: 15, status: null })!);
    const after = repo.snapshot().markSheets.find((s) => s.id === sheet.id)!;
    expect(after.marks[student]).toEqual({ raw: 15, status: null });
    expect(after.state).toBe('in-progress');
    expect(after.rev).toBe(sheet.rev + 1);
    expect(after.updatedBy).toBe('st-nji');
    expect(notified).toBe(1);
    expect(repo.snapshot()).not.toBe(before);
  });

  it('refuses a stale write instead of overwriting another tab', () => {
    const { adapter, repo } = makeRepo();
    const db = repo.snapshot();
    const sheet = sheetIn(db, 'in-progress');
    const [first, second] = Object.keys(sheet.marks);

    // Another tab saves a change to the same sheet first.
    const other = new Repository(adapter, { seed: createSeed, now: () => NOW });
    other.commit(registrar, setMark(ctx(other.snapshot(), sheet.id), { id: first!, name: 'A' }, { raw: 1, status: null })!);

    // This tab still holds the old revision.
    const stale = setMark(ctx(db, sheet.id), { id: second!, name: 'B' }, { raw: 2, status: null })!;
    expect(() => repo.commit(registrar, stale)).toThrow(ConflictError);
  });

  it('picks up changes saved in another tab', () => {
    const { adapter, repo } = makeRepo();
    const changed = structuredClone(repo.snapshot());
    changed.school.name = 'Changed elsewhere';
    let notified = 0;
    repo.subscribe(() => notified++);
    adapter.external(JSON.stringify(changed));
    expect(repo.snapshot().school.name).toBe('Changed elsewhere');
    expect(notified).toBe(1);
  });

  it('ignores an invalid copy written by another tab', () => {
    const { adapter, repo } = makeRepo();
    adapter.external('{"broken":true}');
    expect(repo.snapshot().school.shortName).toBe('BCHS Nkwen');
  });

  it('never saves data that breaks the schema', () => {
    const { repo } = makeRepo();
    expect(() =>
      repo.commit(registrar, {
        permission: null,
        action: 'test',
        entity: 'test',
        entityId: null,
        summary: '',
        audit: false,
        apply: (d) => {
          d.students[0]!.rollNo = -4;
        },
      }),
    ).toThrow(/Refused to save invalid data/);
    expect(repo.snapshot().students[0]!.rollNo).toBe(1);
  });

  it('reports a missing record', () => {
    const { repo } = makeRepo();
    expect(() =>
      repo.commit(registrar, { permission: null, action: 't', entity: 't', entityId: null, summary: '', audit: false, expect: { collection: 'markSheets', id: 'nope', rev: 0 } }),
    ).toThrow(NotFoundError);
  });

  it('resets to the sample school and records it', () => {
    const { repo } = makeRepo();
    repo.reset(vp);
    expect(repo.snapshot().audit.at(-1)).toMatchObject({ action: 'demo.reset', actorId: 'st-fon' });
  });
});

describe('mark input', () => {
  it('reads scores, comma decimals and status shortcuts', () => {
    expect(parseMarkInput('14', 20)).toEqual({ ok: true, mark: { raw: 14, status: null } });
    expect(parseMarkInput('13,5', 20)).toEqual({ ok: true, mark: { raw: 13.5, status: null } });
    expect(parseMarkInput(' a ', 20)).toEqual({ ok: true, mark: { raw: null, status: 'ABS' } });
    expect(parseMarkInput('EXC', 20)).toEqual({ ok: true, mark: { raw: null, status: 'EXC' } });
    expect(parseMarkInput('', 20)).toEqual({ ok: true, mark: { raw: null, status: null } });
  });
  it('explains what is wrong', () => {
    expect(parseMarkInput('21', 20)).toEqual({ ok: false, error: 'The paper is out of 20.' });
    expect(parseMarkInput('12.345', 20)).toEqual({ ok: false, error: 'Use at most two decimal places.' });
    expect(parseMarkInput('-3', 20)).toEqual({ ok: false, error: 'Type a score, or A, E, N or M for a status.' });
    expect(parseMarkInput('twelve', 20)).toEqual({ ok: false, error: 'Type a score, or A, E, N or M for a status.' });
  });
});

describe('mark sheet workflow', () => {
  it('skips a change that changes nothing', () => {
    const db = createSeed(NOW);
    const sheet = sheetIn(db, 'in-progress');
    const [id, mark] = Object.entries(sheet.marks)[0]!;
    expect(setMark(ctx(db, sheet.id), { id, name: 'X' }, mark)).toBeNull();
  });

  it('will not submit an incomplete sheet', () => {
    const db = createSeed(NOW);
    const sheet = sheetIn(db, 'in-progress');
    const ids = Object.keys(sheet.marks);
    expect(() => submitSheet(ctx(db, sheet.id), ids)).toThrow(MarkInputError);
  });

  it('submits a complete sheet, then a Vice Principal locks it, both audited', () => {
    const { repo } = makeRepo();
    let db = repo.snapshot();
    const sheet = sheetIn(db, 'in-progress');
    const ids = Object.keys(sheet.marks);
    for (const id of ids) {
      if (!isEntered(db.markSheets.find((s) => s.id === sheet.id)!.marks[id])) {
        const m = setMark(ctx(db, sheet.id), { id, name: id }, { raw: 10, status: null });
        if (m) db = repo.commit(registrar, m);
      }
    }
    db = repo.commit(registrar, submitSheet(ctx(db, sheet.id), ids));
    expect(db.markSheets.find((s) => s.id === sheet.id)!.state).toBe('submitted');
    expect(() => repo.commit(registrar, lockSheet(ctx(db, sheet.id)))).toThrow(ForbiddenError);
    db = repo.commit(vp, lockSheet(ctx(db, sheet.id, 'st-fon')));
    expect(db.markSheets.find((s) => s.id === sheet.id)!.state).toBe('locked');
    expect(db.audit.slice(-3).map((a) => [a.action, a.outcome])).toEqual([
      ['markSheet.submit', 'done'],
      ['markSheet.lock', 'denied'],
      ['markSheet.lock', 'done'],
    ]);
  });

  it('changes a locked mark only with a reason, only for the Vice Principal, and audits it', () => {
    const { repo } = makeRepo();
    const db = repo.snapshot();
    const sheet = sheetIn(db, 'locked');
    const id = Object.keys(sheet.marks)[0]!;
    expect(() => setMark(ctx(db, sheet.id), { id, name: 'Grace' }, { raw: 3, status: null })).toThrow('A reason is needed');
    const m = setMark(ctx(db, sheet.id), { id, name: 'Grace' }, { raw: 3, status: null }, 'Script re-marked after appeal')!;
    expect(() => repo.commit(registrar, m)).toThrow(ForbiddenError);
    const after = repo.commit(vp, setMark(ctx(repo.snapshot(), sheet.id, 'st-fon'), { id, name: 'Grace' }, { raw: 3, status: null }, 'Script re-marked after appeal')!);
    expect(after.audit.at(-1)).toMatchObject({ action: 'mark.editLocked', reason: 'Script re-marked after appeal', outcome: 'done' });
    expect(after.audit.at(-1)!.summary).toMatch(/^Grace: .+ → 3 · Test sheet$/);
  });

  it('rejects an out-of-range score even if the UI is bypassed', () => {
    const db = createSeed(NOW);
    const sheet = sheetIn(db, 'in-progress');
    expect(() => setMark(ctx(db, sheet.id), { id: 'x', name: 'x' }, { raw: sheet.max + 1, status: null })).toThrow(MarkInputError);
  });
});

describe('queries', () => {
  const db = createSeed(NOW);

  it('summarises sheets with progress', () => {
    const sheets = sheetsForSequence(db, 'sq-2');
    expect(sheets.length).toBe(db.classSubjects.length);
    const locked = sheets.find((s) => s.sheet.state === 'locked')!;
    expect(locked.entered).toBe(locked.total);
    const progress = progressByClass(db, 'sq-2');
    expect(progress.reduce((n, p) => n + p.total, 0)).toBe(sheets.length);
  });

  it('ranks a sheet and leaves excused students unranked', () => {
    const sheet = db.markSheets.find((s) => s.sequenceId === 'sq-1')!;
    const rows = sheetRows(db, sheet);
    const ranked = rows.filter((r) => r.rank !== null);
    expect(Math.min(...ranked.map((r) => r.rank!))).toBe(1);
    rows.filter((r) => r.mark.status === 'EXC').forEach((r) => expect(r.rank).toBeNull());
    const stats = sheetStatistics(rows);
    expect(stats.count).toBe(ranked.length);
    expect(stats.mean).toBeGreaterThan(5);
  });

  it('adds up fees exactly', () => {
    const fees = feesSummary(db, 1, schoolDay(NOW));
    expect(fees.collected + fees.outstanding).toBe(fees.billed);
    expect(fees.paidInFull + fees.partlyPaid + fees.nothingPaid).toBe(fees.accounts);
  });

  it('counts pending applications and their age', () => {
    const p = pendingApplications(db, schoolDay(NOW));
    expect(p.count).toBe(9);
    expect(p.oldestDays).toBeGreaterThan(0);
  });
});

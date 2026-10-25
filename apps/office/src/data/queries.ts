/**
 * Read-only views over the database, shared by pages. Pure functions of (db, …), so they are easy to test
 * and cheap to memoise.
 */
import { classStatistics, rank, scoreEntry, type MarkStatus } from '@cbc/grading-engine';
import { addFrancs, francs, subtractFrancs, type Francs } from '../domain/money';
import { daysBetween } from '../domain/dates';
import { className, sequenceName, type Database, type Mark, type MarkSheet, type SchoolClass, type SheetState, type Staff, type Student } from './schema';

export const isEntered = (m: Mark | undefined): boolean => !!m && (m.raw !== null || m.status !== null);

export function staffById(db: Database, id: string | null): Staff | undefined {
  return id ? db.staff.find((s) => s.id === id) : undefined;
}

export function displayName(s: Pick<Staff, 'title' | 'name'> | undefined): string {
  if (!s) return 'Unknown';
  const surname = s.name.split(' ').slice(-1)[0];
  return `${s.title} ${surname}`;
}

export function classesInOrder(db: Database): SchoolClass[] {
  return [...db.classes].sort((a, b) => a.order - b.order);
}

export function roster(db: Database, classId: string): Student[] {
  return db.students.filter((s) => s.classId === classId && s.status === 'active').sort((a, b) => a.rollNo - b.rollNo);
}

export function openSequence(db: Database) {
  const seq = db.sequences.find((s) => s.id === db.school.openSequenceId);
  if (!seq) throw new Error('The open sequence is missing');
  return seq;
}

export interface SheetSummary {
  sheet: MarkSheet;
  classId: string;
  className: string;
  classOrder: number;
  subjectName: string;
  subjectCode: string;
  coefficient: number;
  teacher: Staff | undefined;
  entered: number;
  total: number;
}

export function sheetSummary(db: Database, sheet: MarkSheet): SheetSummary {
  const cs = db.classSubjects.find((c) => c.id === sheet.classSubjectId);
  if (!cs) throw new Error(`Class subject ${sheet.classSubjectId} is missing`);
  const cls = db.classes.find((c) => c.id === cs.classId)!;
  const subject = db.subjects.find((s) => s.id === cs.subjectId)!;
  const students = roster(db, cs.classId);
  return {
    sheet,
    classId: cls.id,
    className: className(cls),
    classOrder: cls.order,
    subjectName: subject.name,
    subjectCode: subject.code,
    coefficient: cs.coefficient,
    teacher: staffById(db, cs.teacherId),
    entered: students.filter((s) => isEntered(sheet.marks[s.id])).length,
    total: students.length,
  };
}

export function sheetsForSequence(db: Database, sequenceId: string): SheetSummary[] {
  return db.markSheets
    .filter((s) => s.sequenceId === sequenceId)
    .map((s) => sheetSummary(db, s))
    .sort((a, b) => a.classOrder - b.classOrder || a.subjectName.localeCompare(b.subjectName));
}

export type StateCounts = Record<SheetState, number>;

export function countStates(sheets: readonly { sheet: MarkSheet }[]): StateCounts {
  const counts: StateCounts = { 'not-started': 0, 'in-progress': 0, submitted: 0, locked: 0 };
  sheets.forEach(({ sheet }) => (counts[sheet.state] += 1));
  return counts;
}

export function progressByClass(db: Database, sequenceId: string) {
  const sheets = sheetsForSequence(db, sequenceId);
  return classesInOrder(db).map((cls) => {
    const own = sheets.filter((s) => s.classId === cls.id);
    return { cls, name: className(cls), counts: countStates(own), total: own.length };
  });
}

/** A mark sheet ready to display: each student with their score on 20, standing and rank. */
export interface SheetRow {
  student: Student;
  mark: Mark;
  on20: number | null;
  excludedReason: MarkStatus | 'MISSING' | null;
  rank: number | null;
}

export function sheetRows(db: Database, sheet: MarkSheet): SheetRow[] {
  const cs = db.classSubjects.find((c) => c.id === sheet.classSubjectId)!;
  const students = roster(db, cs.classId);
  const rows = students.map((student) => {
    const mark = sheet.marks[student.id] ?? { raw: null, status: null };
    const valid = mark.raw === null || (mark.raw >= 0 && mark.raw <= sheet.max);
    const score = valid ? scoreEntry({ raw: mark.raw, status: mark.status }, sheet.max) : null;
    return {
      student,
      mark,
      on20: score?.kind === 'scored' ? score.value : null,
      excludedReason: score?.kind === 'excluded' ? score.reason : null,
    };
  });
  const ranks = rank(rows.map((r) => ({ id: r.student.id, value: r.on20 })));
  return rows.map((r) => ({ ...r, rank: ranks.get(r.student.id) ?? null }));
}

export function sheetStatistics(rows: readonly SheetRow[]) {
  return classStatistics(rows.flatMap((r) => (r.on20 === null ? [] : [r.on20])));
}

/** Previous sequence's sheet for the same class and subject, for comparison. */
export function previousSheet(db: Database, sheet: MarkSheet): MarkSheet | undefined {
  const seq = db.sequences.find((s) => s.id === sheet.sequenceId);
  if (!seq) return undefined;
  const prev = db.sequences.find((s) => s.term === seq.term && s.number === seq.number - 1);
  return prev && db.markSheets.find((m) => m.sequenceId === prev.id && m.classSubjectId === sheet.classSubjectId);
}

export interface AttendanceDay {
  cls: SchoolClass;
  name: string;
  taken: boolean;
  present: number;
  late: number;
  absent: number;
  total: number;
}

export function attendanceOn(db: Database, day: string): AttendanceDay[] {
  return classesInOrder(db).map((cls) => {
    const register = db.registers.find((r) => r.classId === cls.id && r.day === day);
    const total = roster(db, cls.id).length;
    if (!register) return { cls, name: className(cls), taken: false, present: 0, late: 0, absent: 0, total };
    const codes = Object.values(register.marks);
    return {
      cls,
      name: className(cls),
      taken: true,
      present: codes.filter((c) => c === 'P').length,
      late: codes.filter((c) => c === 'L').length,
      absent: codes.filter((c) => c === 'A').length,
      total,
    };
  });
}

export interface FeesSummary {
  billed: Francs;
  collected: Francs;
  outstanding: Francs;
  accounts: number;
  paidInFull: number;
  partlyPaid: number;
  nothingPaid: number;
  nothingPaidAmount: Francs;
  overdue: boolean;
}

export function feesSummary(db: Database, term: number, today: string): FeesSummary {
  const accounts = db.feeAccounts.filter((f) => f.term === term);
  const billed = addFrancs(...accounts.map((a) => francs(a.billed)));
  const collected = addFrancs(...accounts.map((a) => francs(a.paid)));
  const nothing = accounts.filter((a) => a.paid === 0);
  return {
    billed,
    collected,
    outstanding: subtractFrancs(billed, collected),
    accounts: accounts.length,
    paidInFull: accounts.filter((a) => a.paid >= a.billed).length,
    partlyPaid: accounts.filter((a) => a.paid > 0 && a.paid < a.billed).length,
    nothingPaid: nothing.length,
    nothingPaidAmount: addFrancs(...nothing.map((a) => francs(a.billed))),
    overdue: accounts.some((a) => a.paid < a.billed && daysBetween(a.dueOn, today) > 0),
  };
}

export function pendingApplications(db: Database, today: string) {
  const pending = db.applications.filter((a) => a.status === 'pending');
  const oldest = pending.reduce<number>((max, a) => Math.max(max, daysBetween(a.submittedOn, today)), 0);
  return { count: pending.length, oldestDays: oldest };
}

export function sequenceLabel(db: Database, sequenceId: string): string {
  const seq = db.sequences.find((s) => s.id === sequenceId);
  return seq ? `Term ${seq.term} · ${sequenceName(seq)}` : '';
}

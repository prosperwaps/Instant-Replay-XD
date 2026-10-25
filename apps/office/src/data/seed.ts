/**
 * A believable sample school for the demonstration: six classes, about 220 students, two sequences of
 * mark sheets in different states, recent attendance registers, term fees and admissions.
 *
 * Everything is generated from a fixed random seed, so every browser starts with the same school.
 * Only the calendar moves: dates are placed around the day the data is created, so the open sequence
 * is always open and "today" always has registers.
 */
import { addDays, latestSchoolDay, recentSchoolDays, schoolDay, type IsoDate } from '../domain/dates';
import type { Role } from '../domain/permissions';
import {
  SCHEMA_VERSION,
  className,
  type Application,
  type AuditEntry,
  type ClassSubject,
  type Database,
  type FeeAccount,
  type Mark,
  type MarkSheet,
  type Register,
  type SchoolClass,
  type Sequence,
  type Staff,
  type Student,
  type Subject,
} from './schema';

/** mulberry32: small, fast and good enough for sample data. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)]!;
}

/** Normal distribution (Box–Muller). */
function gaussian(r: () => number, mean: number, sd: number): number {
  const u = Math.max(r(), 1e-9);
  const v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const FIRST_F = ['Grace', 'Precious', 'Blessing', 'Mercy', 'Comfort', 'Brenda', 'Faith', 'Joy', 'Sandrine', 'Linda', 'Vanessa', 'Pamela', 'Gladys', 'Doris', 'Esther', 'Ruth', 'Glory', 'Peace', 'Rita', 'Ivy', 'Nadine', 'Clarisse', 'Belinda', 'Stella', 'Prudence'];
const FIRST_M = ['Divine', 'Prosper', 'Emmanuel', 'Elvis', 'Brandon', 'Valery', 'Clinton', 'Rodrigue', 'Collins', 'Bryan', 'Ivan', 'Lionel', 'Nelson', 'Derick', 'Ferdinand', 'Godlove', 'Wilfred', 'Achille', 'Kenneth', 'Raoul', 'Bertrand', 'Cyril', 'Hilary', 'Joel', 'Terence'];
const SURNAMES = ['Fon', 'Ndifor', 'Achu', 'Tanyi', 'Ngwa', 'Nji', 'Fuh', 'Ashu', 'Bih', 'Atem', 'Fonyuy', 'Wirba', 'Nkwain', 'Tamfu', 'Che', 'Ngu', 'Awah', 'Mbah', 'Nchang', 'Kum', 'Ambe', 'Neba', 'Fru', 'Akum', 'Tabe', 'Nfor', 'Lukong', 'Mofor', 'Ngong', 'Tangwa', 'Shu', 'Fomba', 'Ndze', 'Yuh', 'Sama', 'Muma', 'Asong', 'Ayuk', 'Enow', 'Tebid'];

const STAFF: readonly [string, Staff['title'], string, Role][] = [
  ['st-ngwa', 'Mrs', 'Esther Ngwa', 'systemAdmin'],
  ['st-tanyi', 'Mr', 'Samuel Tanyi', 'principal'],
  ['st-fon', 'Mrs', 'Mary Fon', 'vicePrincipal'],
  ['st-nji', 'Mr', 'Godlove Nji', 'registrar'],
  ['st-achiri', 'Mr', 'Paul Achiri', 'bursar'],
  ['st-ambe', 'Dr', 'Clarisse Ambe', 'hod'],
  ['st-tita', 'Mrs', 'Miriam Tita', 'classMaster'],
  ['st-achu', 'Mr', 'Bertrand Achu', 'classMaster'],
  ['st-neba', 'Ms', 'Gladys Neba', 'classMaster'],
  ['st-fomba', 'Mr', 'Wilfred Fomba', 'classMaster'],
  ['st-tabe', 'Mr', 'Kenneth Tabe', 'classMaster'],
  ['st-asong', 'Mrs', 'Ruth Asong', 'classMaster'],
  ['st-ayuk', 'Mr', 'Lionel Ayuk', 'teacher'],
  ['st-enow', 'Ms', 'Prudence Enow', 'teacher'],
  ['st-muma', 'Mr', 'Cyril Muma', 'teacher'],
  ['st-nkwain', 'Mrs', 'Stella Nkwain', 'teacher'],
  ['st-lukong', 'Mr', 'Derick Lukong', 'teacher'],
  ['st-ngong', 'Mrs', 'Rita Ngong', 'teacher'],
  ['st-tebid', 'Mr', 'Joel Tebid', 'teacher'],
  ['st-disc', 'Mr', 'Raoul Mbah', 'disciplineMaster'],
];

const SUBJECTS: readonly [string, string][] = [
  ['MAT', 'Mathematics'],
  ['FMA', 'Further Mathematics'],
  ['ENG', 'English Language'],
  ['LIT', 'Literature in English'],
  ['FRE', 'French'],
  ['PHY', 'Physics'],
  ['CHE', 'Chemistry'],
  ['BIO', 'Biology'],
  ['CSC', 'Computer Science'],
  ['HIS', 'History'],
  ['GEO', 'Geography'],
  ['ECO', 'Economics'],
  ['REL', 'Religious Studies'],
];

/** Who teaches what. Each class takes the first teacher of the list, rotating by class. */
const TEACHERS_BY_SUBJECT: Record<string, readonly string[]> = {
  MAT: ['st-tita', 'st-ayuk', 'st-fomba'],
  FMA: ['st-ayuk'],
  ENG: ['st-asong', 'st-enow'],
  LIT: ['st-asong'],
  FRE: ['st-enow', 'st-ngong'],
  PHY: ['st-fomba', 'st-muma'],
  CHE: ['st-ambe', 'st-muma'],
  BIO: ['st-ambe', 'st-nkwain'],
  CSC: ['st-tabe', 'st-lukong'],
  HIS: ['st-neba', 'st-tebid'],
  GEO: ['st-tebid', 'st-neba'],
  ECO: ['st-lukong'],
  REL: ['st-achu', 'st-ngong'],
};

const LOWER_FORMS: readonly [string, number][] = [['MAT', 4], ['ENG', 4], ['FRE', 3], ['BIO', 2], ['CHE', 2], ['PHY', 2], ['HIS', 2], ['GEO', 2], ['CSC', 2], ['REL', 1]];

const CLASSES: readonly { id: string; level: string; stream: string; master: string; size: number; capacity: number; max: number; subjects: readonly [string, number][] }[] = [
  { id: 'cl-f1a', level: 'Form 1', stream: 'A', master: 'st-tita', size: 42, capacity: 45, max: 20, subjects: LOWER_FORMS },
  { id: 'cl-f1b', level: 'Form 1', stream: 'B', master: 'st-achu', size: 41, capacity: 45, max: 20, subjects: LOWER_FORMS },
  { id: 'cl-f3a', level: 'Form 3', stream: 'A', master: 'st-neba', size: 38, capacity: 45, max: 20, subjects: LOWER_FORMS },
  { id: 'cl-f5s', level: 'Form 5', stream: 'Science', master: 'st-fomba', size: 36, capacity: 40, max: 20, subjects: [['MAT', 5], ['ENG', 3], ['FRE', 3], ['PHY', 4], ['CHE', 4], ['BIO', 4], ['CSC', 2], ['REL', 1]] },
  { id: 'cl-l6s', level: 'Lower Sixth', stream: 'Science', master: 'st-tabe', size: 31, capacity: 35, max: 40, subjects: [['MAT', 5], ['FMA', 4], ['PHY', 5], ['CHE', 5], ['BIO', 4], ['CSC', 3]] },
  { id: 'cl-u6a', level: 'Upper Sixth', stream: 'Arts', master: 'st-asong', size: 28, capacity: 35, max: 40, subjects: [['LIT', 5], ['HIS', 5], ['GEO', 4], ['ECO', 4], ['FRE', 3], ['REL', 2]] },
];

/** Registers not yet taken on the latest school day, so the overview has something real to show. */
const REGISTER_MISSING_TODAY = new Set(['cl-f3a', 'cl-u6a']);

function emailOf(name: string): string {
  const [first, ...rest] = name.toLowerCase().split(' ');
  return `${first![0]}.${rest.join('')}@bchs.edu.cm`;
}

/** A moment on `day` at hh:mm in Cameroon (UTC+1). Minutes past 59 roll into the next hour. */
function at(day: IsoDate, hh: number, mm: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hh - 1, mm)).toISOString();
}

function makeStudents(r: () => number, cls: (typeof CLASSES)[number]): Student[] {
  const used = new Set<string>();
  const list: { name: string; gender: 'F' | 'M'; surname: string }[] = [];
  while (list.length < cls.size) {
    const gender = r() < 0.5 ? 'F' : 'M';
    const first = pick(r, gender === 'F' ? FIRST_F : FIRST_M);
    const middle = pick(r, SURNAMES);
    const surname = pick(r, SURNAMES);
    const name = middle !== surname && r() < 0.4 ? `${first} ${middle} ${surname}` : `${first} ${surname}`;
    if (used.has(name)) continue;
    used.add(name);
    list.push({ name, gender, surname });
  }
  list.sort((a, b) => a.surname.localeCompare(b.surname) || a.name.localeCompare(b.name));
  return list.map((s, i) => ({
    id: `${cls.id.replace('cl-', 'sd-')}-${String(i + 1).padStart(2, '0')}`,
    classId: cls.id,
    rollNo: i + 1,
    name: s.name,
    gender: s.gender,
    status: 'active',
  }));
}

function markFor(r: () => number, ability: number, max: number): Mark {
  const roll = r();
  if (roll < 0.022) return { raw: null, status: 'ABS' };
  if (roll < 0.03) return { raw: null, status: 'EXC' };
  if (roll < 0.0315) return { raw: null, status: 'MAL' };
  const on20 = clamp(gaussian(r, ability, 2.3), 1, 20);
  const raw = clamp(Math.round(((on20 * max) / 20) * 2) / 2, 0, max);
  return { raw, status: null };
}

export function createSeed(now: Date): Database {
  const r = rng(20261025);
  const today = schoolDay(now);
  const lastSchoolDay = latestSchoolDay(today);

  const staff: Staff[] = STAFF.map(([id, title, name, role]) => ({ id, title, name, email: emailOf(name), role }));
  const subjects: Subject[] = SUBJECTS.map(([code, name]) => ({ id: `sb-${code.toLowerCase()}`, code, name }));
  const classes: SchoolClass[] = CLASSES.map((c, order) => ({ id: c.id, level: c.level, stream: c.stream, classMasterId: c.master, capacity: c.capacity, order }));

  const students: Student[] = [];
  const ability = new Map<string, number>();
  for (const cls of CLASSES) {
    for (const s of makeStudents(r, cls)) {
      students.push(s);
      ability.set(s.id, clamp(gaussian(r, 11.6, 2.9), 3, 18.5));
    }
  }

  const classSubjects: ClassSubject[] = [];
  CLASSES.forEach((cls, classIndex) => {
    for (const [code, coefficient] of cls.subjects) {
      const teachers = TEACHERS_BY_SUBJECT[code]!;
      classSubjects.push({
        id: `cs-${cls.id.slice(3)}-${code.toLowerCase()}`,
        classId: cls.id,
        subjectId: `sb-${code.toLowerCase()}`,
        teacherId: teachers[classIndex % teachers.length]!,
        coefficient,
      });
    }
  });

  const sequences: Sequence[] = [
    { id: 'sq-1', term: 1, number: 1, opensOn: addDays(today, -52), closesOn: addDays(today, -24) },
    { id: 'sq-2', term: 1, number: 2, opensOn: addDays(today, -20), closesOn: addDays(today, 6) },
  ];

  const markSheets: MarkSheet[] = [];
  const audit: AuditEntry[] = [];
  const classStudents = (classId: string) => students.filter((s) => s.classId === classId);
  const maxOf = (classId: string) => CLASSES.find((c) => c.id === classId)!.max;

  for (const cs of classSubjects) {
    const roster = classStudents(cs.classId);
    const max = maxOf(cs.classId);

    // Sequence 1: closed, every sheet complete and locked.
    const seq1Marks: Record<string, Mark> = {};
    roster.forEach((s) => (seq1Marks[s.id] = markFor(r, ability.get(s.id)!, max)));
    const seq1Submitted = addDays(sequences[0]!.closesOn, -Math.floor(r() * 5) - 1);
    markSheets.push({
      id: `ms-1-${cs.id.slice(3)}`,
      classSubjectId: cs.id,
      sequenceId: 'sq-1',
      max,
      state: 'locked',
      marks: seq1Marks,
      rev: 3,
      updatedAt: at(seq1Submitted, 16, 20),
      updatedBy: cs.teacherId,
      submittedAt: at(seq1Submitted, 16, 20),
      lockedAt: at(addDays(seq1Submitted, 1), 16, 30),
    });

    // Sequence 2: open, in every state.
    const roll = r();
    const state: MarkSheet['state'] = roll < 0.2 ? 'locked' : roll < 0.44 ? 'submitted' : roll < 0.8 ? 'in-progress' : 'not-started';
    const filled = state === 'not-started' ? 0 : state === 'in-progress' ? Math.floor(roster.length * (0.25 + r() * 0.6)) : roster.length;
    const seq2Marks: Record<string, Mark> = {};
    roster.forEach((s, i) => {
      seq2Marks[s.id] = i < filled ? markFor(r, ability.get(s.id)!, max) : { raw: null, status: null };
    });
    const touched = addDays(today, -Math.floor(r() * 6) - 1);
    markSheets.push({
      id: `ms-2-${cs.id.slice(3)}`,
      classSubjectId: cs.id,
      sequenceId: 'sq-2',
      max,
      state,
      marks: seq2Marks,
      rev: state === 'not-started' ? 0 : 2,
      updatedAt: state === 'not-started' ? null : at(touched, 17, 5),
      updatedBy: state === 'not-started' ? null : cs.teacherId,
      submittedAt: state === 'submitted' || state === 'locked' ? at(touched, 17, 5) : null,
      lockedAt: state === 'locked' ? at(addDays(touched, 1), 17, 10) : null,
    });
  }

  // Registers for the last ten school days.
  const registers: Register[] = [];
  for (const day of recentSchoolDays(lastSchoolDay, 10)) {
    for (const cls of CLASSES) {
      if (day === lastSchoolDay && REGISTER_MISSING_TODAY.has(cls.id)) continue;
      const marks: Register['marks'] = {};
      for (const s of classStudents(cls.id)) {
        const x = r();
        marks[s.id] = x < 0.9 ? 'P' : x < 0.94 ? 'L' : x < 0.985 ? 'A' : 'E';
      }
      registers.push({ id: `rg-${cls.id.slice(3)}-${day}`, classId: cls.id, day, takenBy: cls.master, takenAt: at(day, 7, 40 + Math.floor(r() * 25)), marks });
    }
  }

  // Term 1 fees.
  const feeAccounts: FeeAccount[] = students.map((s) => {
    const sixth = s.classId === 'cl-l6s' || s.classId === 'cl-u6a';
    const billed = sixth ? 95_000 : 85_000;
    const x = r();
    const paid = x < 0.52 ? billed : x < 0.83 ? Math.round((billed * (0.2 + r() * 0.6)) / 5_000) * 5_000 : 0;
    return { id: `fa-${s.id.slice(3)}-t1`, studentId: s.id, term: 1, billed, paid, dueOn: addDays(sequences[0]!.opensOn, 30) };
  });

  // Applications for next intake.
  const applications: Application[] = [];
  const applicantCount = 17;
  for (let i = 0; i < applicantCount; i++) {
    const gender = r() < 0.5 ? 'F' : 'M';
    const name = `${pick(r, gender === 'F' ? FIRST_F : FIRST_M)} ${pick(r, SURNAMES)}`;
    const status: Application['status'] = i < 9 ? 'pending' : i < 15 ? 'admitted' : 'declined';
    applications.push({
      id: `ap-${String(i + 1).padStart(3, '0')}`,
      name,
      level: r() < 0.75 ? 'Form 1' : 'Lower Sixth',
      submittedOn: addDays(today, -(status === 'pending' ? 1 + Math.floor(r() * 14) : 15 + Math.floor(r() * 20))),
      status,
    });
  }

  // A short history so the audit log is not empty on first open.
  const subjectName = (cs: ClassSubject) => subjects.find((s) => s.id === cs.subjectId)!.name;
  const classLabel = (classId: string) => className(classes.find((c) => c.id === classId)!);
  let auditN = 0;
  const log = (day: IsoDate, hh: number, mm: number, actorId: string, action: string, entity: string, entityId: string | null, summary: string) => {
    const actor = staff.find((s) => s.id === actorId)!;
    audit.push({ id: `au-seed-${++auditN}`, at: at(day, hh, mm), actorId, role: actor.role, action, entity, entityId, summary, reason: null, outcome: 'done' });
  };
  const seq1Close = sequences[0]!.closesOn;
  log(addDays(seq1Close, 1), 8, 2, 'st-fon', 'session.signIn', 'session', null, 'Signed in');
  classSubjects.slice(0, 6).forEach((cs, i) => {
    log(addDays(seq1Close, 1), 8, 10 + i * 3, 'st-fon', 'markSheet.lock', 'markSheet', `ms-1-${cs.id.slice(3)}`, `Locked ${classLabel(cs.classId)} ${subjectName(cs)} · Sequence 1`);
  });
  log(addDays(today, -2), 9, 15, 'st-nji', 'session.signIn', 'session', null, 'Signed in');
  log(addDays(today, -1), 7, 58, 'st-tanyi', 'session.signIn', 'session', null, 'Signed in');

  return {
    version: SCHEMA_VERSION,
    seededAt: now.toISOString(),
    school: { name: 'Baptist Comprehensive High School', shortName: 'BCHS Nkwen', town: 'Nkwen, Bamenda', academicYear: '2026/2027', currentTerm: 1, openSequenceId: 'sq-2' },
    staff,
    classes,
    students,
    subjects,
    classSubjects,
    sequences,
    markSheets,
    registers,
    feeAccounts,
    applications,
    audit: audit.sort((a, b) => a.at.localeCompare(b.at)),
  };
}

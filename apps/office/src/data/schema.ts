/**
 * The shape of everything School Admin stores. The same schemas validate data read back from storage,
 * so a corrupted or hand-edited copy is caught on load instead of breaking a page later.
 *
 * Names follow docs/spec/03 §Module 2 "Data" where they overlap.
 */
import { z } from 'zod';
import { ROLES } from '../domain/permissions';

export const SCHEMA_VERSION = 1;

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoMoment = z.iso.datetime();
const francs = z.number().int().safe();

export const StaffSchema = z.object({
  id,
  title: z.enum(['Mr', 'Mrs', 'Ms', 'Dr', 'Rev']),
  name: z.string().min(1).max(120),
  email: z.email(),
  role: z.enum(ROLES),
});

export const ClassSchema = z.object({
  id,
  /** "Form 1", "Lower Sixth" */
  level: z.string().min(1).max(40),
  /** "A", "Science" */
  stream: z.string().min(1).max(40),
  classMasterId: id,
  capacity: z.number().int().positive(),
  /** Order on lists, lowest first. */
  order: z.number().int(),
});

export const StudentSchema = z.object({
  id,
  classId: id,
  /** Class number, in alphabetical order of surname as on paper class lists. */
  rollNo: z.number().int().positive(),
  name: z.string().min(1).max(120),
  gender: z.enum(['F', 'M']),
  status: z.enum(['active', 'withdrawn']),
});

export const SubjectSchema = z.object({
  id,
  code: z.string().min(2).max(6),
  name: z.string().min(1).max(60),
});

export const ClassSubjectSchema = z.object({
  id,
  classId: id,
  subjectId: id,
  teacherId: id,
  coefficient: z.number().int().positive().max(10),
});

export const SequenceSchema = z.object({
  id,
  term: z.number().int().min(1).max(3),
  number: z.number().int().min(1).max(6),
  opensOn: isoDate,
  closesOn: isoDate,
});

export const MARK_STATUSES = ['ABS', 'EXC', 'NT', 'MAL'] as const;

export const MarkSchema = z.object({
  raw: z.number().min(0).nullable(),
  status: z.enum(MARK_STATUSES).nullable(),
});

export const SHEET_STATES = ['not-started', 'in-progress', 'submitted', 'locked'] as const;
export type SheetState = (typeof SHEET_STATES)[number];

export const MarkSheetSchema = z.object({
  id,
  classSubjectId: id,
  sequenceId: id,
  /** The paper is marked out of this. */
  max: z.number().positive().max(200),
  state: z.enum(SHEET_STATES),
  marks: z.record(id, MarkSchema),
  /** Bumped on every write; a write that names an older revision is refused (see Repository.commit). */
  rev: z.number().int().nonnegative(),
  updatedAt: isoMoment.nullable(),
  updatedBy: id.nullable(),
  submittedAt: isoMoment.nullable(),
  lockedAt: isoMoment.nullable(),
});

export const ATTENDANCE_CODES = ['P', 'L', 'A', 'E'] as const;

export const RegisterSchema = z.object({
  id,
  classId: id,
  day: isoDate,
  takenBy: id,
  takenAt: isoMoment,
  marks: z.record(id, z.enum(ATTENDANCE_CODES)),
});

/** Term fees per student. Becomes a ledger of entries in Phase 4 (Finance). */
export const FeeAccountSchema = z.object({
  id,
  studentId: id,
  term: z.number().int().min(1).max(3),
  billed: francs.nonnegative(),
  paid: francs.nonnegative(),
  dueOn: isoDate,
});

export const ApplicationSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  level: z.string().min(1).max(40),
  submittedOn: isoDate,
  status: z.enum(['pending', 'admitted', 'declined']),
});

export const AuditSchema = z.object({
  id,
  at: isoMoment,
  actorId: id,
  role: z.enum(ROLES),
  action: z.string().min(1).max(64),
  entity: z.string().min(1).max(64),
  entityId: id.nullable(),
  summary: z.string().max(400),
  reason: z.string().max(500).nullable(),
  outcome: z.enum(['done', 'denied']),
});

export const SchoolSchema = z.object({
  name: z.string(),
  shortName: z.string(),
  town: z.string(),
  academicYear: z.string(),
  currentTerm: z.number().int().min(1).max(3),
  openSequenceId: id,
});

export const DatabaseSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  seededAt: isoMoment,
  school: SchoolSchema,
  staff: z.array(StaffSchema),
  classes: z.array(ClassSchema),
  students: z.array(StudentSchema),
  subjects: z.array(SubjectSchema),
  classSubjects: z.array(ClassSubjectSchema),
  sequences: z.array(SequenceSchema),
  markSheets: z.array(MarkSheetSchema),
  registers: z.array(RegisterSchema),
  feeAccounts: z.array(FeeAccountSchema),
  applications: z.array(ApplicationSchema),
  audit: z.array(AuditSchema),
});

export type Staff = z.infer<typeof StaffSchema>;
export type SchoolClass = z.infer<typeof ClassSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type ClassSubject = z.infer<typeof ClassSubjectSchema>;
export type Sequence = z.infer<typeof SequenceSchema>;
export type Mark = z.infer<typeof MarkSchema>;
export type MarkSheet = z.infer<typeof MarkSheetSchema>;
export type Register = z.infer<typeof RegisterSchema>;
export type FeeAccount = z.infer<typeof FeeAccountSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
export type AuditEntry = z.infer<typeof AuditSchema>;
export type School = z.infer<typeof SchoolSchema>;
export type Database = z.infer<typeof DatabaseSchema>;

export function className(c: Pick<SchoolClass, 'level' | 'stream'>): string {
  return c.stream.length <= 2 ? `${c.level}${c.stream}` : `${c.level} ${c.stream}`;
}

export function sequenceName(s: Pick<Sequence, 'number'>): string {
  return `Sequence ${s.number}`;
}

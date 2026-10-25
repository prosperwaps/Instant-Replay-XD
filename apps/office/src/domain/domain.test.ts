import { describe, expect, it } from 'vitest';
import { MoneyError, addFrancs, formatFrancs, formatFrancsCompact, francs, parseFrancs, subtractFrancs } from './money';
import { count, formatPercent, initials, listSentence } from './text';
import { addDays, daysBetween, greeting, latestSchoolDay, recentSchoolDays, relativeDay, schoolDay, formatLongDay } from './dates';
import { ForbiddenError, ROLES, TWO_STEP_ROLES, can, permissionsOf } from './permissions';

describe('money', () => {
  it('only holds whole francs', () => {
    expect(francs(150_000)).toBe(150_000);
    expect(() => francs(10.5)).toThrow(MoneyError);
    expect(() => francs(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
  it('adds and subtracts exactly, refusing overflow', () => {
    expect(addFrancs(francs(85_000), francs(10_000), francs(5))).toBe(95_005);
    expect(subtractFrancs(francs(25_000), francs(30_000))).toBe(-5_000);
    expect(() => addFrancs(francs(Number.MAX_SAFE_INTEGER), francs(1))).toThrow(MoneyError);
  });
  it('formats like a statement', () => {
    expect(formatFrancs(francs(150_000))).toBe('FCFA 150,000');
    expect(formatFrancs(francs(-5_000))).toBe('FCFA −5,000');
    expect(formatFrancs(francs(0))).toBe('FCFA 0');
  });
  it('shortens headline figures without rounding up', () => {
    expect(formatFrancsCompact(francs(9_500))).toBe('FCFA 9,500');
    expect(formatFrancsCompact(francs(850_000))).toBe('FCFA 850k');
    expect(formatFrancsCompact(francs(12_480_000))).toBe('FCFA 12.4M');
    expect(formatFrancsCompact(francs(3_000_000))).toBe('FCFA 3M');
    expect(formatFrancsCompact(francs(-1_250_000))).toBe('FCFA −1.2M');
  });
  it('parses what people type', () => {
    expect(parseFrancs('150 000')).toEqual({ ok: true, value: 150_000 });
    expect(parseFrancs('FCFA 150,000')).toEqual({ ok: true, value: 150_000 });
    expect(parseFrancs('')).toEqual({ ok: false, error: 'Enter an amount.' });
    expect(parseFrancs('12.50')).toEqual({ ok: false, error: 'Use whole francs, digits only.' });
    expect(parseFrancs('-5')).toEqual({ ok: false, error: 'Use whole francs, digits only.' });
  });
});

describe('text', () => {
  it('pluralises properly', () => {
    expect(count(1, 'student')).toBe('1 student');
    expect(count(3, 'student')).toBe('3 students');
    expect(count(2, 'class', 'classes')).toBe('2 classes');
    expect(count(1200, 'student')).toBe('1,200 students');
  });
  it('formats percentages and never shows NaN', () => {
    expect(formatPercent(0.7345)).toBe('73%');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
  it('builds readable lists', () => {
    expect(listSentence(['Form 1A'])).toBe('Form 1A');
    expect(listSentence(['Form 1A', 'Form 3A'])).toBe('Form 1A and Form 3A');
    expect(listSentence(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });
  it('takes initials', () => {
    expect(initials('Ngwa Esther')).toBe('NE');
    expect(initials('  Grace  Nkemtabuh Fon ')).toBe('GN');
  });
});

describe('dates', () => {
  it('reads the calendar day in Cameroon', () => {
    // 23:30 UTC on the 24th is already 00:30 on the 25th in Douala (UTC+1).
    expect(schoolDay(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
  });
  it('steps across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-25', '2026-10-31')).toBe(6);
  });
  it('maps weekends to the Friday before', () => {
    expect(latestSchoolDay('2026-10-25')).toBe('2026-10-23'); // Sunday → Friday
    expect(latestSchoolDay('2026-10-21')).toBe('2026-10-21'); // Wednesday stays
    expect(recentSchoolDays('2026-10-25', 3)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
  });
  it('describes days relative to today', () => {
    expect(relativeDay('2026-10-25', '2026-10-25')).toBe('today');
    expect(relativeDay('2026-10-31', '2026-10-25')).toBe('in 6 days');
    expect(relativeDay('2026-10-13', '2026-10-25')).toBe('12 days ago');
    expect(relativeDay('2026-10-24', '2026-10-25')).toBe('yesterday');
  });
  it('writes long days and greetings on the school clock', () => {
    expect(formatLongDay('2026-10-23')).toBe('Friday 23 October');
    expect(greeting(new Date('2026-10-25T07:00:00Z'))).toBe('Good morning'); // 08:00 in Douala
    expect(greeting(new Date('2026-10-25T13:00:00Z'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-10-25T18:00:00Z'))).toBe('Good evening');
  });
});

describe('permissions', () => {
  it('follows the spec matrix', () => {
    expect(can('vicePrincipal', 'marks.editLocked')).toBe(true);
    expect(can('principal', 'marks.editLocked')).toBe(false);
    expect(can('bursar', 'payments.record')).toBe(true);
    expect(can('bursar', 'marks.view')).toBe(false);
    expect(can('systemAdmin', 'users.manage')).toBe(true);
    expect(can('teacher', 'overview.view')).toBe(false);
  });
  it('gives every office role at least the overview, except teachers who use the Teacher App', () => {
    for (const role of ROLES) expect(can(role, 'overview.view')).toBe(role !== 'teacher');
  });
  it('lists a role’s permissions and requires two-step sign-in for privileged roles', () => {
    expect(permissionsOf('bursar')).toEqual(expect.arrayContaining(['fees.view', 'payments.record', 'waivers.propose']));
    expect(TWO_STEP_ROLES.has('bursar')).toBe(true);
    expect(TWO_STEP_ROLES.has('teacher')).toBe(false);
  });
  it('explains a refusal', () => {
    expect(new ForbiddenError('bursar', 'marks.enter').message).toBe('Bursar may not marks.enter');
  });
});

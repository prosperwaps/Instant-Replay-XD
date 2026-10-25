/**
 * "Needs you": what the signed-in person should act on today, most urgent first, built from the data
 * and filtered by what their role may do. Each item says what, how many, and by when.
 */
import type { Database } from '../../data/schema';
import { attendanceOn, feesSummary, openSequence, pendingApplications, sheetsForSequence } from '../../data/queries';
import { daysBetween, formatLongDay, latestSchoolDay } from '../../domain/dates';
import { can, type Role } from '../../domain/permissions';
import { formatFrancsCompact } from '../../domain/money';
import { count, formatPercent, listSentence } from '../../domain/text';
import type { IconName } from '../../ui';

export interface NeedItem {
  id: string;
  tone: 'bad' | 'warn' | 'neutral';
  icon: IconName;
  title: string;
  detail: string;
  /** Where the work is done. Absent while that page is still to be built (see PLAN.md §4). */
  to?: string;
}

const TONE_ORDER = { bad: 0, warn: 1, neutral: 2 } as const;

export function needsFor(db: Database, role: Role, today: string, now: Date): NeedItem[] {
  const items: NeedItem[] = [];
  const seq = openSequence(db);
  const daysLeft = daysBetween(today, seq.closesOn);
  const closes = daysLeft === 0 ? 'closes today' : daysLeft === 1 ? 'closes tomorrow' : daysLeft > 0 ? `closes in ${daysLeft} days` : 'has closed';

  if (can(role, 'marks.view')) {
    const sheets = sheetsForSequence(db, seq.id);
    const notStarted = sheets.filter((s) => s.sheet.state === 'not-started');
    if (notStarted.length) {
      items.push({
        id: 'marks-not-started',
        tone: daysLeft <= 3 ? 'bad' : 'warn',
        icon: 'chart',
        title: `${count(notStarted.length, 'mark sheet')} not started`,
        detail: `Sequence ${seq.number} ${closes}. ${listSentence(notStarted.map((s) => `${s.className} ${s.subjectName}`), 2)}.`,
        to: '/marks?state=not-started',
      });
    }

    if (can(role, 'marks.lock')) {
      const submitted = sheets.filter((s) => s.sheet.state === 'submitted');
      if (submitted.length) {
        const oldest = submitted.reduce((min, s) => (s.sheet.submittedAt && s.sheet.submittedAt < min ? s.sheet.submittedAt : min), now.toISOString());
        const age = Math.floor((now.getTime() - new Date(oldest).getTime()) / 86_400_000);
        items.push({
          id: 'marks-to-lock',
          tone: age >= 2 ? 'warn' : 'neutral',
          icon: 'lock',
          title: `${count(submitted.length, 'submitted sheet')} to check and lock`,
          detail: `Locked marks feed report cards. The oldest was handed in ${age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`}.`,
          to: '/marks?state=submitted',
        });
      }
    }

    const inProgress = sheets.filter((s) => s.sheet.state === 'in-progress');
    if (inProgress.length) {
      const entered = inProgress.reduce((n, s) => n + s.entered, 0);
      const total = inProgress.reduce((n, s) => n + s.total, 0);
      items.push({
        id: 'marks-in-progress',
        tone: 'neutral',
        icon: 'pencil',
        title: `${count(inProgress.length, 'mark sheet')} in progress`,
        detail: `${formatPercent(total ? entered / total : null)} of their marks are in. Teachers finish them in the Teacher App.`,
        to: '/marks?state=in-progress',
      });
    }
  }

  if (can(role, 'attendance.view')) {
    const day = latestSchoolDay(today);
    const missing = attendanceOn(db, day).filter((a) => !a.taken);
    if (missing.length) {
      items.push({
        id: 'registers-missing',
        tone: day === today ? 'warn' : 'bad',
        icon: 'check',
        title: day === today ? `${count(missing.length, 'register')} not taken today` : `${count(missing.length, 'register')} missing for ${formatLongDay(day)}`,
        detail: `${listSentence(missing.map((a) => a.name))}. Class masters take registers in the Teacher App.`,
      });
    }
  }

  if (can(role, 'admissions.view')) {
    const pending = pendingApplications(db, today);
    if (pending.count) {
      items.push({
        id: 'admissions',
        tone: pending.oldestDays > 10 ? 'warn' : 'neutral',
        icon: 'inbox',
        title: `${count(pending.count, 'application')} waiting for a decision`,
        detail: `The oldest was sent ${pending.oldestDays === 1 ? 'yesterday' : `${pending.oldestDays} days ago`}.`,
      });
    }
  }

  if (can(role, 'fees.view')) {
    const fees = feesSummary(db, db.school.currentTerm, today);
    if (fees.nothingPaid) {
      items.push({
        id: 'fees-unpaid',
        tone: fees.overdue ? 'bad' : 'warn',
        icon: 'receipt',
        title: `${count(fees.nothingPaid, 'student has', 'students have')} paid nothing this term`,
        detail: `${formatFrancsCompact(fees.nothingPaidAmount)} owed by them. ${fees.overdue ? 'Term fees are past their due date.' : ''}`.trim(),
      });
    }
  }

  if (can(role, 'audit.view')) {
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const denied = db.audit.filter((a) => a.outcome === 'denied' && a.at >= weekAgo);
    if (denied.length) {
      items.push({
        id: 'audit-denied',
        tone: 'warn',
        icon: 'shield',
        title: `${count(denied.length, 'refused action')} in the last 7 days`,
        detail: 'Someone tried something their role does not allow. Check it was a mistake.',
        to: '/audit?outcome=denied',
      });
    }
  }

  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

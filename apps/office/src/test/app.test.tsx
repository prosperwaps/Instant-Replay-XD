import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, NOW } from './render';
import { createSeed } from '../data/seed';
import { needsFor } from '../features/overview/needs';
import { matches } from '../shell/CommandPalette';
import { isEntered, roster } from '../data/queries';
import { schoolDay } from '../domain/dates';

const db = createSeed(NOW);
const firstSheet = (state: string) => db.markSheets.find((s) => s.sequenceId === 'sq-2' && s.state === state)!;

describe('sign-in', () => {
  it('offers one demo account per office role and opens the overview', async () => {
    renderApp('/');
    const user = userEvent.setup();
    expect(screen.getByRole('heading', { name: 'Sign in to School Admin' })).toBeInTheDocument();
    expect(screen.queryByText('Teacher')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mary Fon/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Mrs Fon$/ })).toBeInTheDocument();
  });

  it('records the sign-in in the audit log', async () => {
    const { repo } = renderApp('/');
    await userEvent.setup().click(screen.getByRole('button', { name: /Samuel Tanyi/ }));
    expect(repo.snapshot().audit.at(-1)).toMatchObject({ action: 'session.signIn', actorId: 'st-tanyi' });
  });

  it('ignores an expired or tampered session', () => {
    sessionStorage.setItem('bchs-admin-session', JSON.stringify({ staffId: 'st-fon', signedInAt: '2026-10-01T00:00:00Z' }));
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Sign in to School Admin' })).toBeInTheDocument();
  });
});

describe('navigation by role', () => {
  it('shows the Vice Principal the overview and mark sheets, not the audit log', () => {
    renderApp('/', 'st-fon');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Mark sheets' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
  });

  it('explains instead of showing a blank page when a role opens a page it may not see', () => {
    renderApp('/marks', 'st-achiri');
    expect(screen.getByRole('heading', { level: 1, name: 'This page isn’t part of your role' })).toBeInTheDocument();
    expect(screen.getByText(/As Bursar/)).toBeInTheDocument();
  });

  it('has a not-found page', () => {
    renderApp('/nowhere', 'st-fon');
    expect(screen.getByRole('heading', { level: 1, name: 'There’s no page here' })).toBeInTheDocument();
  });
});

describe('overview', () => {
  it('lists what needs the Vice Principal, with the sequence board', () => {
    renderApp('/', 'st-fon');
    expect(screen.getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
    expect(screen.getByText(/submitted sheets? to check and lock/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Form 1A mark sheets' })).toBeInTheDocument();
  });

  it('shows the bursar fees, not marks', () => {
    renderApp('/', 'st-achiri');
    expect(screen.getByRole('region', { name: 'Term 1 fees' })).toBeInTheDocument();
    expect(screen.queryByText(/mark sheets/i)).not.toBeInTheDocument();
  });
});

describe('needsFor', () => {
  const today = schoolDay(NOW);
  it('builds role-specific items, most urgent first', () => {
    const vp = needsFor(db, 'vicePrincipal', today, NOW).map((n) => n.id);
    expect(vp).toEqual(expect.arrayContaining(['marks-not-started', 'marks-to-lock', 'marks-in-progress', 'registers-missing', 'admissions']));
    expect(vp).not.toContain('fees-unpaid');
    const bursar = needsFor(db, 'bursar', today, NOW).map((n) => n.id);
    expect(bursar).toEqual(['fees-unpaid']);
    const tones = needsFor(db, 'vicePrincipal', today, NOW).map((n) => n.tone);
    expect(tones).toEqual([...tones].sort((a, b) => ['bad', 'warn', 'neutral'].indexOf(a) - ['bad', 'warn', 'neutral'].indexOf(b)));
  });
  it('never writes "(s)"', () => {
    for (const role of ['principal', 'vicePrincipal', 'registrar', 'bursar', 'systemAdmin'] as const) {
      needsFor(db, role, today, NOW).forEach((n) => expect(`${n.title} ${n.detail}`).not.toMatch(/\(s\)/));
    }
  });
});

describe('mark sheets monitor', () => {
  it('filters by state from the address, so a filtered view can be shared', () => {
    renderApp('/marks?state=locked', 'st-fon');
    expect(screen.getByRole('button', { name: /^Locked/ })).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table');
    within(table)
      .getAllByRole('row')
      .slice(1)
      .forEach((row) => {
        if (within(row).queryByRole('link')) expect(row).toHaveTextContent('Locked');
      });
  });
});

describe('mark entry', () => {
  it('lets the Registrar type marks, save with Enter and move down', async () => {
    const sheet = firstSheet('in-progress');
    const { repo } = renderApp(`/marks/${sheet.id}`, 'st-nji');
    const user = userEvent.setup();
    const classId = db.classSubjects.find((c) => c.id === sheet.classSubjectId)!.classId;
    const students = roster(db, classId);
    const i = students.findIndex((s) => !isEntered(sheet.marks[s.id]));
    const first = screen.getByRole('textbox', { name: new RegExp(`^Mark for ${students[i]!.name},`) });

    await user.click(first);
    await user.keyboard('13,5{Enter}');
    expect(repo.snapshot().markSheets.find((s) => s.id === sheet.id)!.marks[students[i]!.id]).toEqual({ raw: 13.5, status: null });
    expect(screen.getByRole('textbox', { name: new RegExp(`^Mark for ${students[i + 1]!.name},`) })).toHaveFocus();

    await user.keyboard('e{Enter}');
    expect(repo.snapshot().markSheets.find((s) => s.id === sheet.id)!.marks[students[i + 1]!.id]).toEqual({ raw: null, status: 'EXC' });
  });

  it('refuses an impossible mark and says why, without saving', async () => {
    const sheet = firstSheet('in-progress');
    const { repo } = renderApp(`/marks/${sheet.id}`, 'st-nji');
    const user = userEvent.setup();
    const input = screen.getAllByRole('textbox', { name: /^Mark for/ })[0]!;
    const before = repo.snapshot().markSheets.find((s) => s.id === sheet.id)!.rev;
    await user.clear(input);
    await user.type(input, '99{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(`The paper is out of ${sheet.max}.`);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(repo.snapshot().markSheets.find((s) => s.id === sheet.id)!.rev).toBe(before);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps Submit disabled until every student has a mark', () => {
    renderApp(`/marks/${firstSheet('in-progress').id}`, 'st-nji');
    expect(screen.getByRole('button', { name: /Submit sheet/ })).toBeDisabled();
  });

  it('shows read-only marks to roles that cannot enter them', () => {
    renderApp(`/marks/${firstSheet('in-progress').id}`, 'st-tanyi');
    expect(screen.queryAllByRole('textbox', { name: /^Mark for/ })).toHaveLength(0);
    expect(screen.getByText(/You can read this sheet/)).toBeInTheDocument();
  });

  it('lets the Vice Principal lock a submitted sheet after confirming', async () => {
    const sheet = firstSheet('submitted');
    const { repo } = renderApp(`/marks/${sheet.id}`, 'st-fon');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Lock sheet/ }));
    const dialog = screen.getByRole('dialog', { name: 'Lock this sheet?' });
    await user.click(within(dialog).getByRole('button', { name: /Lock sheet/ }));
    expect(repo.snapshot().markSheets.find((s) => s.id === sheet.id)!.state).toBe('locked');
    expect(repo.snapshot().audit.at(-1)).toMatchObject({ action: 'markSheet.lock', outcome: 'done' });
  });

  it('corrects a locked mark only with a reason, and audits it', async () => {
    const sheet = firstSheet('locked');
    const { repo } = renderApp(`/marks/${sheet.id}`, 'st-fon');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^Correct the mark for/ })[0]!);
    const dialog = screen.getByRole('dialog');
    const markInput = within(dialog).getByLabelText(/New mark/);
    await user.clear(markInput);
    await user.type(markInput, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Say what happened/);

    await user.type(within(dialog).getByLabelText('Reason'), 'Script re-marked after appeal');
    await user.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    expect(repo.snapshot().audit.at(-1)).toMatchObject({ action: 'mark.editLocked', reason: 'Script re-marked after appeal', actorId: 'st-fon' });
  });
});

describe('command palette search', () => {
  it('matches every typed word anywhere', () => {
    expect(matches('form 3 math', 'Form 3A Mathematics MAT')).toBe(true);
    expect(matches('MAT tita', 'Form 1A Mathematics MAT Miriam Tita')).toBe(true);
    expect(matches('physics', 'Form 1A Mathematics')).toBe(false);
  });
});

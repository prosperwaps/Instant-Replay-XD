import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { STATUS_LABELS, round, standing, type Standing } from '@cbc/grading-engine';
import { useDb, useNow, useSession, useUser } from '../../app/context';
import { PageHeader } from '../../shell/Shell';
import { Button, Dialog, Icon, LinkButton, Meter, Panel, TextArea, useToast } from '../../ui';
import { displayName, previousSheet, roster, sheetRows, sheetStatistics, sheetSummary, staffById, type SheetRow } from '../../data/queries';
import { lockSheet, parseMarkInput, setMark, submitSheet, formatMark, MarkInputError } from '../../data/marks';
import { ConflictError } from '../../data/repository';
import { sequenceName, type Mark, type MarkSheet } from '../../data/schema';
import { ForbiddenError } from '../../domain/permissions';
import { formatTime, formatShortDay, schoolDay } from '../../domain/dates';
import { count, formatNumber, formatPercent } from '../../domain/text';
import { SheetGlyph, STATE_LABEL } from './SequenceBoard';
import { Distribution } from './Distribution';
import t from '../../ui/table.module.css';
import s from './marks.module.css';

const STANDING: Record<Standing, { label: string; className: string }> = {
  pass: { label: 'Pass', className: s.pass! },
  'at-risk': { label: 'At risk', className: s.atRisk! },
  fail: { label: 'Below pass', className: s.fail! },
};

/** Explains a failed save in the interface's voice. */
function saveError(error: unknown): string {
  if (error instanceof ConflictError || error instanceof MarkInputError) return error.message;
  if (error instanceof ForbiddenError) return 'Your role cannot change this sheet. The attempt has been recorded.';
  return 'The change could not be saved. Try again; if it keeps failing, restore the sample school from your account menu.';
}

export function SheetPage() {
  const { sheetId } = useParams();
  const db = useDb();
  const sheet = db.markSheets.find((m) => m.id === sheetId);
  if (!sheet) {
    return (
      <>
        <PageHeader back={{ to: '/marks', label: 'Mark sheets' }} title="This mark sheet doesn’t exist" description="It may have been removed when the sample school was restored. Pick a sheet from the list." />
        <LinkButton to="/marks" variant="primary">
          Go to mark sheets
        </LinkButton>
      </>
    );
  }
  return <Sheet key={sheet.id} sheet={sheet} />;
}

function Sheet({ sheet }: { sheet: MarkSheet }) {
  const db = useDb();
  const { user } = useUser();
  const { can, commit } = useSession();
  const now = useNow();
  const toast = useToast();

  const summary = sheetSummary(db, sheet);
  const seq = db.sequences.find((q) => q.id === sheet.sequenceId)!;
  const label = `${summary.className} ${summary.subjectName} · ${sequenceName(seq)}`;
  const rows = useMemo(() => sheetRows(db, sheet), [db, sheet]);
  const stats = sheetStatistics(rows);
  const prev = previousSheet(db, sheet);
  const prevStats = useMemo(() => (prev ? sheetStatistics(sheetRows(db, prev)) : null), [db, prev]);
  const rosterIds = roster(db, summary.classId).map((st) => st.id);
  const missing = summary.total - summary.entered;

  const locked = sheet.state === 'locked';
  const editable = !locked && sheet.state !== 'submitted' && can('marks.enter');
  const canFixLocked = locked && can('marks.editLocked');
  const canSubmit = (sheet.state === 'not-started' || sheet.state === 'in-progress') && can('marks.submit');
  const canLock = sheet.state === 'submitted' && can('marks.lock');

  const [confirm, setConfirm] = useState<'submit' | 'lock' | null>(null);
  const [fixing, setFixing] = useState<SheetRow | null>(null);

  const ctx = useCallback(() => ({ sheet, label, actorId: user.id, now: new Date() }), [sheet, label, user.id]);

  /** Saves one mark. Returns an error message, or null when saved (or nothing changed). */
  const save = useCallback(
    (row: SheetRow, mark: Mark): string | null => {
      try {
        const mutation = setMark(ctx(), { id: row.student.id, name: row.student.name }, mark);
        if (mutation) commit(mutation);
        return null;
      } catch (error) {
        const message = saveError(error);
        toast(message, 'error');
        return message;
      }
    },
    [commit, ctx, toast],
  );

  const runWorkflow = (kind: 'submit' | 'lock') => {
    try {
      commit(kind === 'submit' ? submitSheet(ctx(), rosterIds) : lockSheet(ctx()));
      toast(kind === 'submit' ? `${summary.className} ${summary.subjectName} submitted.` : `${summary.className} ${summary.subjectName} locked.`);
    } catch (error) {
      toast(saveError(error), 'error');
    }
    setConfirm(null);
  };

  const editor = staffById(db, sheet.updatedBy);

  return (
    <>
      <PageHeader
        back={{ to: '/marks', label: 'Mark sheets' }}
        title={`${summary.className} ${summary.subjectName}`}
        meta={
          <>
            <span className={s.stateCell}>
              <SheetGlyph state={sheet.state} ratio={summary.total ? summary.entered / summary.total : 0} size={16} />
              <b>{STATE_LABEL[sheet.state]}</b>
            </span>
            <span>
              {sequenceName(seq)}, term {seq.term}
            </span>
            <span>Out of {sheet.max}</span>
            <span>Coefficient {summary.coefficient}</span>
            <span>Taught by {displayName(summary.teacher)}</span>
            {sheet.updatedAt && (
              <span>
                Last saved {schoolDay(new Date(sheet.updatedAt)) === schoolDay(now) ? `at ${formatTime(sheet.updatedAt)}` : `on ${formatShortDay(schoolDay(new Date(sheet.updatedAt)))}`} by {displayName(editor)}
              </span>
            )}
          </>
        }
        actions={
          <>
            {canSubmit && (
              <Button variant="primary" icon="send" disabled={missing > 0} onClick={() => setConfirm('submit')} title={missing > 0 ? `${count(missing, 'mark')} still to enter` : undefined}>
                Submit sheet
              </Button>
            )}
            {canLock && (
              <Button variant="primary" icon="lock" onClick={() => setConfirm('lock')}>
                Lock sheet
              </Button>
            )}
          </>
        }
      />

      <SheetNotice sheet={sheet} editable={editable} canFixLocked={canFixLocked} canSubmit={canSubmit} missing={missing} />

      <div className={s.sheetLayout}>
        <Panel title="Marks" subtitle={editable ? 'Type a mark and press Enter to save and move down.' : `${count(rows.length, 'student')}, in class-number order.`} bodyless>
          <MarkGrid rows={rows} max={sheet.max} editable={editable} canFixLocked={canFixLocked} onSave={save} onFix={setFixing} />
        </Panel>

        <aside className={s.side} aria-label="Sheet summary">
          <section className={s.sideBlock}>
            <h2 className={s.sideLabel}>Progress</h2>
            <p className={s.sideFigure}>
              {summary.entered} <span>of {summary.total} marks in</span>
            </p>
            <Meter value={summary.entered} max={summary.total} label="Marks entered" />
            <p className={s.sideNote}>{missing === 0 ? 'Every student has a mark or a status.' : `${count(missing, 'student')} still without a mark.`}</p>
          </section>

          <section className={s.sideBlock}>
            <h2 className={s.sideLabel}>The class, on 20</h2>
            <dl className={s.figures}>
              <div>
                <dt>Average</dt>
                <dd>
                  {stats.mean === null ? '—' : formatNumber(stats.mean, 2)}
                  {stats.mean !== null && typeof prevStats?.mean === 'number' && <Trend now={stats.mean} before={prevStats.mean} />}
                </dd>
              </div>
              <div>
                <dt>Highest</dt>
                <dd>{stats.max === null ? '—' : formatNumber(stats.max, 2)}</dd>
              </div>
              <div>
                <dt>Lowest</dt>
                <dd>{stats.min === null ? '—' : formatNumber(stats.min, 2)}</dd>
              </div>
              <div>
                <dt>Passed</dt>
                <dd>
                  {stats.passed} of {stats.count} <span className={s.dim}>({formatPercent(stats.passRate)})</span>
                </dd>
              </div>
            </dl>
            {typeof prevStats?.mean === 'number' && <p className={s.sideNote}>Compared with Sequence {seq.number - 1}, when the average was {formatNumber(prevStats.mean, 2)}.</p>}
          </section>

          {stats.count > 0 && (
            <section className={s.sideBlock}>
              <Distribution values={rows.flatMap((r) => (r.on20 === null ? [] : [r.on20]))} />
            </section>
          )}

          {editable && (
            <section className={s.sideBlock}>
              <h2 className={s.sideLabel}>Keyboard</h2>
              <ul className={s.keys}>
                <li>
                  <kbd>Enter</kbd> save and go down
                </li>
                <li>
                  <kbd>↑</kbd> <kbd>↓</kbd> move between students
                </li>
                <li>
                  <kbd>A</kbd> absent, <kbd>E</kbd> excused, <kbd>N</kbd> not taken, <kbd>M</kbd> malpractice
                </li>
                <li>
                  <kbd>Esc</kbd> undo what you typed
                </li>
              </ul>
            </section>
          )}
        </aside>
      </div>

      <Dialog
        open={confirm === 'submit'}
        title="Submit this sheet?"
        description={`All ${summary.total} marks for ${label} go to the Vice Principal and HOD to check and lock. While it waits, nobody can change it.`}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Keep editing</Button>
            <Button variant="primary" icon="send" onClick={() => runWorkflow('submit')}>
              Submit sheet
            </Button>
          </>
        }
      />
      <Dialog
        open={confirm === 'lock'}
        title="Lock this sheet?"
        description={`Locked marks for ${label} feed report cards. After locking, only the Vice Principal can change a mark, and must give a reason that is recorded.`}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Not yet</Button>
            <Button variant="primary" icon="lock" onClick={() => runWorkflow('lock')}>
              Lock sheet
            </Button>
          </>
        }
      />
      <FixLockedDialog row={fixing} max={sheet.max} onClose={() => setFixing(null)} ctx={ctx} />
    </>
  );
}

function Trend({ now, before }: { now: number; before: number }) {
  const diff = round(now - before, 2);
  if (diff === 0) return <span className={s.trend}>no change</span>;
  return (
    <span className={s.trend}>
      <Icon name={diff > 0 ? 'arrowUp' : 'arrowDown'} size={14} />
      {formatNumber(Math.abs(diff), 2)}
      <span className="visually-hidden">{diff > 0 ? 'higher' : 'lower'} than last sequence</span>
    </span>
  );
}

function SheetNotice({ sheet, editable, canFixLocked, canSubmit, missing }: { sheet: MarkSheet; editable: boolean; canFixLocked: boolean; canSubmit: boolean; missing: number }) {
  let text: string | null = null;
  if (sheet.state === 'locked') {
    text = canFixLocked
      ? 'This sheet is locked. To correct a mark, choose Correct beside it and give a reason; the change is written to the audit log.'
      : `This sheet was locked on ${sheet.lockedAt ? formatShortDay(schoolDay(new Date(sheet.lockedAt))) : 'an earlier date'}. Ask the Vice Principal if a mark needs correcting.`;
  } else if (sheet.state === 'submitted') {
    text = 'This sheet has been submitted and is waiting to be checked and locked. Nobody can change it meanwhile.';
  } else if (!editable) {
    text = 'You can read this sheet. Teachers enter marks in the Teacher App; the Registrar can enter them here from paper.';
  } else if (canSubmit && missing > 0) {
    text = `${count(missing, 'student')} still need a mark before the sheet can be submitted. Use a status (A, E, N, M) for anyone without a score.`;
  }
  if (!text) return null;
  return (
    <p className={s.notice} role="note">
      <Icon name={sheet.state === 'locked' ? 'lock' : 'info'} />
      {text}
    </p>
  );
}

function rankLabel(rows: readonly SheetRow[]) {
  const tally = new Map<number, number>();
  rows.forEach((r) => r.rank !== null && tally.set(r.rank, (tally.get(r.rank) ?? 0) + 1));
  return (rank: number | null) => (rank === null ? '—' : `${(tally.get(rank) ?? 0) > 1 ? '=' : ''}${rank}`);
}

function MarkGrid({
  rows,
  max,
  editable,
  canFixLocked,
  onSave,
  onFix,
}: {
  rows: SheetRow[];
  max: number;
  editable: boolean;
  canFixLocked: boolean;
  onSave: (row: SheetRow, mark: Mark) => string | null;
  onFix: (row: SheetRow) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const showOn20 = max !== 20;
  const rankOf = rankLabel(rows);
  const focusRow = (i: number) => {
    const el = inputs.current[Math.max(0, Math.min(rows.length - 1, i))];
    el?.focus();
    el?.select();
  };

  return (
    <div className={t.wrap}>
      <table className={`${t.table} ${s.grid}`}>
        <thead>
          <tr>
            <th scope="col" className={t.numeric}>
              No.
            </th>
            <th scope="col">Student</th>
            <th scope="col" className={t.numeric}>
              Mark / {max}
            </th>
            {showOn20 && (
              <th scope="col" className={t.numeric}>
                On 20
              </th>
            )}
            <th scope="col" className={`${t.numeric} ${s.wide}`}>
              Rank
            </th>
            <th scope="col" className={s.wide}>
              Standing
            </th>
            {canFixLocked && (
              <th scope="col">
                <span className="visually-hidden">Correct</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const st = row.on20 !== null ? STANDING[standing(row.on20)] : null;
            return (
              <tr key={row.student.id}>
                <td className={`${t.numeric} ${t.muted}`}>{row.student.rollNo}</td>
                <td className={s.studentName}>{row.student.name}</td>
                <td className={t.numeric}>
                  {editable ? (
                    <MarkCell
                      row={row}
                      max={max}
                      inputRef={(el) => (inputs.current[i] = el)}
                      onSave={onSave}
                      onMove={(delta) => focusRow(i + delta)}
                    />
                  ) : (
                    <span className={s.markValue}>{formatMark(row.mark) || '—'}</span>
                  )}
                </td>
                {showOn20 && <td className={`${t.numeric} ${s.mono}`}>{row.on20 === null ? '—' : formatNumber(row.on20, 2)}</td>}
                <td className={`${t.numeric} ${s.mono} ${s.wide}`}>{rankOf(row.rank)}</td>
                <td className={s.wide}>
                  {row.mark.status ? (
                    <span className={t.muted}>
                      {STATUS_LABELS[row.mark.status]}
                      {row.mark.status === 'ABS' || row.mark.status === 'MAL' ? ', counts as 0' : ', left out'}
                    </span>
                  ) : st ? (
                    <span className={`${s.standing} ${st.className}`}>{st.label}</span>
                  ) : (
                    <span className={t.muted}>No mark yet</span>
                  )}
                </td>
                {canFixLocked && (
                  <td>
                    <Button size="small" variant="ghost" icon="pencil" onClick={() => onFix(row)} aria-label={`Correct the mark for ${row.student.name}`}>
                      Correct
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarkCell({
  row,
  max,
  inputRef,
  onSave,
  onMove,
}: {
  row: SheetRow;
  max: number;
  inputRef: (el: HTMLInputElement | null) => void;
  onSave: (row: SheetRow, mark: Mark) => string | null;
  onMove: (delta: number) => void;
}) {
  const [draft, setDraftState] = useState<string | null>(null);
  // Mirrors `draft` synchronously: Enter saves and moves focus, which fires blur before React re-renders,
  // and blur must see that the draft is already saved.
  const draftRef = useRef<string | null>(null);
  const setDraft = (value: string | null) => {
    draftRef.current = value;
    setDraftState(value);
  };
  const [error, setError] = useState<string | null>(null);
  const errorId = `mark-error-${row.student.id}`;

  /** Saves the draft. Returns true when the cell may be left. */
  const commitDraft = (): boolean => {
    const pending = draftRef.current;
    if (pending === null) return true;
    const parsed = parseMarkInput(pending, max);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    setDraft(null);
    const failure = onSave(row, parsed.mark);
    if (failure) {
      setDraft(pending);
      setError(failure);
      return false;
    }
    setError(null);
    return true;
  };

  return (
    <div className={s.cell}>
      <input
        ref={inputRef}
        className={s.markInput}
        value={draft ?? formatMark(row.mark)}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        maxLength={6}
        aria-label={`Mark for ${row.student.name}, out of ${max}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          const parsed = parseMarkInput(value, max);
          setError(parsed.ok ? null : parsed.error);
        }}
        onBlur={() => {
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (commitDraft()) onMove(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commitDraft()) onMove(-1);
          } else if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
      />
      {error && (
        <span id={errorId} className={s.cellError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function FixLockedDialog({ row, max, onClose, ctx }: { row: SheetRow | null; max: number; onClose: () => void; ctx: () => { sheet: MarkSheet; label: string; actorId: string; now: Date } }) {
  const { commit } = useSession();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ value?: string; reason?: string }>({});
  const [lastRow, setLastRow] = useState<SheetRow | null>(null);

  // Start fresh each time a different student is chosen.
  if (row && row !== lastRow) {
    setLastRow(row);
    setValue(formatMark(row.mark));
    setReason('');
    setErrors({});
  }

  const submit = () => {
    if (!row) return;
    const parsed = parseMarkInput(value, max);
    const next: typeof errors = {};
    if (!parsed.ok) next.value = parsed.error;
    if (reason.trim().length < 10) next.reason = 'Say what happened in a few words, for example “Script re-marked after appeal”.';
    setErrors(next);
    if (!parsed.ok || next.reason) return;
    try {
      const mutation = setMark(ctx(), { id: row.student.id, name: row.student.name }, parsed.mark, reason);
      if (!mutation) {
        setErrors({ value: 'That is the mark already on the sheet.' });
        return;
      }
      commit(mutation);
      toast(`Mark corrected for ${row.student.name}. The change is in the audit log.`);
      onClose();
    } catch (error) {
      toast(saveError(error), 'error');
    }
  };

  return (
    <Dialog
      open={!!row}
      title={row ? `Correct the mark for ${row.student.name}` : 'Correct a mark'}
      description={row ? `Currently ${formatMark(row.mark) || 'no mark'} out of ${max}. The sheet stays locked; this one change is recorded with your reason.` : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Save correction
          </Button>
        </>
      }
    >
      <div className={s.fixField}>
        <label htmlFor="fix-mark" className={s.fixLabel}>
          New mark, out of {max}
        </label>
        <input
          id="fix-mark"
          className={s.markInput}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={errors.value ? true : undefined}
          aria-describedby={errors.value ? 'fix-mark-error' : undefined}
        />
        {errors.value && (
          <span id="fix-mark-error" className={s.cellError} role="alert">
            {errors.value}
          </span>
        )}
      </div>
      <TextArea label="Reason" hint="Kept in the audit log with your name." value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} maxLength={500} />
    </Dialog>
  );
}

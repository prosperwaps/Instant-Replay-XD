import { Link } from 'react-router';
import type { SheetSummary } from '../../data/queries';
import type { SheetState } from '../../data/schema';
import { count } from '../../domain/text';
import s from './marks.module.css';

export const STATE_LABEL: Record<SheetState, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  submitted: 'Submitted',
  locked: 'Locked',
};

/**
 * One square per mark sheet. State is carried by shape first and colour second, so it reads without colour:
 * empty frame (not started), black filling from the bottom (in progress, by share entered),
 * green square inset in a green frame (submitted), solid green (locked).
 */
export function SheetGlyph({ state, ratio = 0, size = 36 }: { state: SheetState; ratio?: number; size?: number }) {
  const inner = size - 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" className={s.glyph}>
      {state === 'not-started' && <rect x="0.5" y="0.5" width={size - 1} height={size - 1} fill="#fff" stroke="var(--line-strong)" strokeDasharray="3 3" />}
      {state === 'in-progress' && (
        <>
          <rect x="0.5" y="0.5" width={size - 1} height={size - 1} fill="#fff" stroke="#000" />
          <rect x="1" y={1 + inner * (1 - ratio)} width={inner} height={inner * ratio} fill="#000" />
        </>
      )}
      {state === 'submitted' && (
        <>
          <rect x="1" y="1" width={size - 2} height={size - 2} fill="#fff" stroke="var(--green)" strokeWidth="2" />
          <rect x={size * 0.3} y={size * 0.3} width={size * 0.4} height={size * 0.4} fill="var(--green)" />
        </>
      )}
      {state === 'locked' && <rect width={size} height={size} fill="var(--green)" />}
    </svg>
  );
}

export function BoardLegend() {
  return (
    <ul className={s.legend} aria-label="Key">
      {(['not-started', 'in-progress', 'submitted', 'locked'] as const).map((state) => (
        <li key={state}>
          <SheetGlyph state={state} ratio={0.5} size={16} />
          {STATE_LABEL[state]}
        </li>
      ))}
    </ul>
  );
}

export interface BoardRow {
  classId: string;
  name: string;
  sheets: SheetSummary[];
}

export function SequenceBoard({ rows }: { rows: BoardRow[] }) {
  return (
    <div className={s.board}>
      {rows.map((row) => {
        const done = row.sheets.filter((x) => x.sheet.state === 'locked').length;
        return (
          <div key={row.classId} className={s.boardRow}>
            <div className={s.boardClass}>
              <b>{row.name}</b>
              <span>
                {done} of {count(row.sheets.length, 'sheet')} locked
              </span>
            </div>
            <ul className={s.boardSheets} aria-label={`${row.name} mark sheets`}>
              {row.sheets.map((x) => {
                const ratio = x.total ? x.entered / x.total : 0;
                const label = `${row.name} ${x.subjectName}: ${STATE_LABEL[x.sheet.state]}${x.sheet.state === 'in-progress' ? `, ${x.entered} of ${x.total} marks` : ''}`;
                return (
                  <li key={x.sheet.id}>
                    <Link to={`/marks/${x.sheet.id}`} className={s.boardCell} aria-label={label} title={label}>
                      <SheetGlyph state={x.sheet.state} ratio={ratio} />
                      <span>{x.subjectCode}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDb, useNow, useToday } from '../../app/context';
import { PageHeader } from '../../shell/Shell';
import { Button, EmptyState, Meter, Panel, Segmented, Select } from '../../ui';
import { classesInOrder, countStates, displayName, openSequence, sheetsForSequence, type SheetSummary } from '../../data/queries';
import { SHEET_STATES, className, sequenceName, type SheetState } from '../../data/schema';
import { daysBetween, formatLongDay, relativeDay, schoolDay } from '../../domain/dates';
import { capitalise, count } from '../../domain/text';
import { SheetGlyph, STATE_LABEL } from './SequenceBoard';
import t from '../../ui/table.module.css';
import s from './marks.module.css';

type StateFilter = SheetState | 'all';

export function MarkSheets() {
  const db = useDb();
  const today = useToday();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const seq = openSequence(db);
  const sheets = useMemo(() => sheetsForSequence(db, seq.id), [db, seq.id]);
  const counts = countStates(sheets);

  const stateParam = params.get('state');
  const state: StateFilter = (SHEET_STATES as readonly string[]).includes(stateParam ?? '') ? (stateParam as SheetState) : 'all';
  const classParam = params.get('class') ?? 'all';
  const classId = db.classes.some((c) => c.id === classParam) ? classParam : 'all';

  const setFilter = (key: 'state' | 'class', value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const inClass = classId === 'all' ? sheets : sheets.filter((x) => x.classId === classId);
  const shown = state === 'all' ? inClass : inClass.filter((x) => x.sheet.state === state);
  const classCounts = countStates(inClass);
  const daysLeft = daysBetween(today, seq.closesOn);

  return (
    <>
      <PageHeader
        title="Mark sheets"
        description={`${sequenceName(seq)} of term ${seq.term} ${daysLeft >= 0 ? `closes on ${formatLongDay(seq.closesOn)}, ${relativeDay(seq.closesOn, today)}` : 'has closed'}. Teachers enter marks in the Teacher App; sheets are checked and locked here.`}
      />

      <div className={s.toolbar}>
        <Segmented<StateFilter>
          label="Show sheets"
          value={state}
          onChange={(v) => setFilter('state', v)}
          options={[
            { value: 'all', label: 'All', count: inClass.length },
            ...SHEET_STATES.map((st) => ({ value: st, label: STATE_LABEL[st], count: classCounts[st] })),
          ]}
        />
        <Select
          label="Class"
          value={classId}
          onChange={(v) => setFilter('class', v)}
          options={[{ value: 'all', label: 'All classes' }, ...classesInOrder(db).map((c) => ({ value: c.id, label: className(c) }))]}
        />
      </div>

      <Panel
        title={state === 'all' ? 'All sheets' : STATE_LABEL[state]}
        subtitle={`${count(shown.length, 'sheet')}${classId !== 'all' ? ` in ${className(db.classes.find((c) => c.id === classId)!)}` : ''}. Across the school: ${counts.locked} locked, ${counts.submitted} submitted, ${counts['in-progress']} in progress, ${counts['not-started']} not started.`}
        bodyless
      >
        {shown.length === 0 ? (
          <EmptyState
            title="No sheets match these filters"
            action={
              <Button size="small" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Show all sheets
              </Button>
            }
          >
            Try another state or class.
          </EmptyState>
        ) : (
          <div className={t.wrap}>
            <table className={`${t.table} ${t.rowLink}`}>
              <thead>
                <tr>
                  <th scope="col">Sheet</th>
                  <th scope="col">Teacher</th>
                  <th scope="col">Marks entered</th>
                  <th scope="col">State</th>
                  <th scope="col">Last change</th>
                </tr>
              </thead>
              {groupByClass(shown).map(([name, group]) => (
                <tbody key={name}>
                  <tr className={s.groupRow}>
                    <th scope="colgroup" colSpan={5}>
                      {name}
                      <span>{count(group.length, 'sheet')}</span>
                    </th>
                  </tr>
                  {group.map((x) => (
                    <tr key={x.sheet.id}>
                      <td>
                        <div className={s.sheetCell}>
                          <span className={s.code}>{x.subjectCode}</span>
                          <span>
                            <Link to={`/marks/${x.sheet.id}`} className={t.stretch}>
                              <span className="visually-hidden">{x.className} </span>
                              {x.subjectName}
                            </Link>
                            <small className={s.cellSub}>Coefficient {x.coefficient}</small>
                          </span>
                        </div>
                      </td>
                      <td>{displayName(x.teacher)}</td>
                      <td>
                        <div className={s.progressCell}>
                          <Meter value={x.entered} max={x.total} label={`${x.entered} of ${x.total} marks entered`} />
                          <span className="num">
                            {x.entered} of {x.total}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={s.stateCell}>
                          <SheetGlyph state={x.sheet.state} ratio={x.total ? x.entered / x.total : 0} size={16} />
                          {STATE_LABEL[x.sheet.state]}
                        </span>
                      </td>
                      <td className={t.muted}>{x.sheet.updatedAt ? capitalise(relativeDay(schoolDay(new Date(x.sheet.updatedAt)), schoolDay(now))) : 'Nothing yet'}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function groupByClass(sheets: readonly SheetSummary[]): [string, SheetSummary[]][] {
  const groups = new Map<string, SheetSummary[]>();
  for (const x of sheets) groups.set(x.className, [...(groups.get(x.className) ?? []), x]);
  return [...groups.entries()];
}

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDb, useToday } from '../../app/context';
import { PageHeader } from '../../shell/Shell';
import { Badge, Button, EmptyState, Panel, Segmented, Select } from '../../ui';
import { ROLE_LABELS } from '../../domain/permissions';
import { capitalise, count } from '../../domain/text';
import { formatLongDay, formatTime, relativeDay, schoolDay } from '../../domain/dates';
import type { AuditEntry } from '../../data/schema';
import t from '../../ui/table.module.css';
import s from './audit.module.css';

const PAGE = 60;

type Outcome = 'all' | 'denied';

export function AuditLog() {
  const db = useDb();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const outcome: Outcome = params.get('outcome') === 'denied' ? 'denied' : 'all';
  const person = params.get('person') ?? 'all';
  const [limit, setLimit] = useState(PAGE);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const entries = useMemo(
    () =>
      [...db.audit]
        .reverse()
        .filter((a) => (outcome === 'all' || a.outcome === 'denied') && (person === 'all' || a.actorId === person)),
    [db.audit, outcome, person],
  );
  const shown = entries.slice(0, limit);
  const days = groupByDay(shown);
  const people = useMemo(() => {
    const ids = new Set(db.audit.map((a) => a.actorId));
    return db.staff.filter((st) => ids.has(st.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [db.audit, db.staff]);
  const deniedCount = db.audit.filter((a) => a.outcome === 'denied').length;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sensitive action, newest first: who did it, in which role, what changed and why. Entries are added, never edited or removed."
      />
      <div className={s.toolbar}>
        <Segmented<Outcome>
          label="Show"
          value={outcome}
          onChange={(v) => set('outcome', v)}
          options={[
            { value: 'all', label: 'Everything', count: db.audit.length },
            { value: 'denied', label: 'Refused', count: deniedCount },
          ]}
        />
        <Select label="Person" value={person} onChange={(v) => set('person', v)} options={[{ value: 'all', label: 'Everyone' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      </div>

      <Panel title={count(entries.length, 'entry', 'entries')} subtitle={entries.length > shown.length ? `Showing the newest ${shown.length}.` : undefined} bodyless>
        {entries.length === 0 ? (
          <EmptyState title="No entries match">Try everyone, or every kind of entry.</EmptyState>
        ) : (
          days.map(([day, list]) => (
            <section key={day} className={s.day} aria-label={formatLongDay(day)}>
              <h3 className={s.dayHead}>
                {formatLongDay(day)}
                <span>{capitalise(relativeDay(day, today))}</span>
              </h3>
              <div className={t.wrap}>
                <table className={t.table}>
                  <thead className="visually-hidden">
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Person</th>
                      <th scope="col">What happened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <AuditRow key={a.id} entry={a} name={db.staff.find((st) => st.id === a.actorId)?.name ?? a.actorId} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
        {entries.length > shown.length && (
          <div className={s.more}>
            <Button onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, entries.length - shown.length)} older entries</Button>
          </div>
        )}
      </Panel>
    </>
  );
}

function AuditRow({ entry, name }: { entry: AuditEntry; name: string }) {
  return (
    <tr>
      <td className={`${s.time} ${t.muted}`}>{formatTime(entry.at)}</td>
      <td className={s.person}>
        <b>{name}</b>
        <span>{ROLE_LABELS[entry.role]}</span>
      </td>
      <td>
        <p className={s.summary}>
          {entry.outcome === 'denied' && <Badge tone="bad">Refused</Badge>}
          {entry.summary}
        </p>
        {entry.reason && <p className={s.reason}>Reason: {entry.reason}</p>}
        <p className={s.action}>{entry.action}</p>
      </td>
    </tr>
  );
}

function groupByDay(entries: AuditEntry[]): [string, AuditEntry[]][] {
  const map = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const day = schoolDay(new Date(e.at));
    map.set(day, [...(map.get(day) ?? []), e]);
  }
  return [...map.entries()];
}

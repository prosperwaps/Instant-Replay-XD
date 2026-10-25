import { useMemo } from 'react';
import { Link } from 'react-router';
import { useDb, useNow, useSession, useToday, useUser } from '../../app/context';
import { PageHeader } from '../../shell/Shell';
import { Badge, EmptyState, Icon, LinkButton, Meter, Panel } from '../../ui';
import { attendanceOn, classesInOrder, countStates, displayName, feesSummary, openSequence, pendingApplications, sheetsForSequence } from '../../data/queries';
import { formatLongDay, greeting, latestSchoolDay } from '../../domain/dates';
import { formatFrancsCompact } from '../../domain/money';
import { count, formatPercent } from '../../domain/text';
import { className, sequenceName } from '../../data/schema';
import { BoardLegend, SequenceBoard } from '../marks/SequenceBoard';
import { needsFor, type NeedItem } from './needs';
import s from './overview.module.css';

export function Overview() {
  const db = useDb();
  const { user } = useUser();
  const { can } = useSession();
  const now = useNow();
  const today = useToday();
  const needs = useMemo(() => needsFor(db, user.role, today, now), [db, user.role, today, now]);

  return (
    <>
      <PageHeader title={`${greeting(now)}, ${displayName(user)}`} description={`${formatLongDay(today)}. Here is what needs you, and how the school stands.`} />
      <div className={s.top}>
        <Panel title="Needs you" subtitle={needs.length ? `${count(needs.length, 'item')}, most urgent first` : undefined} bodyless>
          {needs.length === 0 ? (
            <EmptyState title="Nothing needs you right now">New work for your role appears here as soon as it arrives.</EmptyState>
          ) : (
            <ul className={s.needs}>
              {needs.map((item) => (
                <li key={item.id}>
                  <NeedRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className={s.glance}>
          {can('attendance.view') && <AttendanceTile />}
          {can('fees.view') && <FeesTile />}
          {can('admissions.view') && <AdmissionsTile />}
        </div>
      </div>
      {can('marks.view') && <BoardPanel />}
    </>
  );
}

const TONE_BADGE = { bad: { tone: 'bad', label: 'Urgent' }, warn: { tone: 'warn', label: 'Soon' }, neutral: null } as const;

function NeedRow({ item }: { item: NeedItem }) {
  const badge = TONE_BADGE[item.tone];
  const body = (
    <>
      <span className={`${s.needIcon} ${s[item.tone]}`}>
        <Icon name={item.icon} />
      </span>
      <span className={s.needText}>
        <span className={s.needTitle}>
          <b>{item.title}</b>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </span>
        <span>{item.detail}</span>
      </span>
      {item.to && <Icon name="chevronRight" className={s.needChevron} />}
    </>
  );
  return item.to ? (
    <Link to={item.to} className={`${s.need} ${s.needLink}`}>
      {body}
    </Link>
  ) : (
    <div className={s.need}>{body}</div>
  );
}

function Tile({ title, figure, context, children }: { title: string; figure: string; context: string; children?: React.ReactNode }) {
  return (
    <section className={s.tile} aria-label={title}>
      <h2 className={s.tileTitle}>{title}</h2>
      <p className={s.tileFigure}>{figure}</p>
      <p className={s.tileContext}>{context}</p>
      {children}
    </section>
  );
}

function AttendanceTile() {
  const db = useDb();
  const today = useToday();
  const day = latestSchoolDay(today);
  const classes = attendanceOn(db, day);
  const taken = classes.filter((c) => c.taken);
  const present = taken.reduce((n, c) => n + c.present + c.late, 0);
  const counted = taken.reduce((n, c) => n + c.total, 0);
  return (
    <Tile
      title={day === today ? 'Attendance today' : `Attendance, ${formatLongDay(day)}`}
      figure={formatPercent(counted ? present / counted : null)}
      context={`present in the ${count(taken.length, 'class', 'classes')} registered, ${taken.length} of ${classes.length} registers taken`}
    >
      <Meter value={taken.length} max={classes.length} label="Registers taken" />
    </Tile>
  );
}

function FeesTile() {
  const db = useDb();
  const today = useToday();
  const fees = feesSummary(db, db.school.currentTerm, today);
  return (
    <Tile title={`Term ${db.school.currentTerm} fees`} figure={formatFrancsCompact(fees.collected)} context={`collected, ${formatPercent(fees.billed ? fees.collected / fees.billed : null)} of ${formatFrancsCompact(fees.billed)} billed`}>
      <Meter value={fees.collected} max={fees.billed} label="Share of fees collected" />
    </Tile>
  );
}

function AdmissionsTile() {
  const db = useDb();
  const today = useToday();
  const pending = pendingApplications(db, today);
  const admitted = db.applications.filter((a) => a.status === 'admitted').length;
  return <Tile title="Admissions" figure={String(pending.count)} context={`waiting for a decision, ${admitted} admitted for the next intake so far`} />;
}

function BoardPanel() {
  const db = useDb();
  const seq = openSequence(db);
  const sheets = useMemo(() => sheetsForSequence(db, seq.id), [db, seq.id]);
  const counts = countStates(sheets);
  const rows = useMemo(
    () => classesInOrder(db).map((cls) => ({ classId: cls.id, name: className(cls), sheets: sheets.filter((x) => x.classId === cls.id) })),
    [db, sheets],
  );
  return (
    <Panel
      className={s.boardPanel}
      title={`${sequenceName(seq)} mark sheets`}
      subtitle={`${counts.locked} locked, ${counts.submitted} submitted, ${counts['in-progress']} in progress and ${counts['not-started']} not started, out of ${sheets.length}. Select a square to open its sheet.`}
      actions={
        <LinkButton to="/marks" size="small">
          All mark sheets
        </LinkButton>
      }
    >
      <BoardLegend />
      <SequenceBoard rows={rows} />
    </Panel>
  );
}

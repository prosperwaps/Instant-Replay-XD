import { useId } from 'react';
import { DEFAULT_POLICY } from '@cbc/grading-engine';
import { count } from '../../domain/text';
import s from './marks.module.css';

const BIN = 2;
const BINS = 20 / BIN;

export function binScores(values: readonly number[]): number[] {
  const bins = Array.from({ length: BINS }, () => 0);
  for (const v of values) {
    const i = Math.min(BINS - 1, Math.max(0, Math.floor(v / BIN)));
    bins[i]! += 1;
  }
  return bins;
}

/**
 * How the class scored, on 20, in two-point bands. One series in black on a recessive axis,
 * the pass mark drawn as a rule, each bar named for screen readers and on hover.
 */
export function Distribution({ values }: { values: readonly number[] }) {
  const titleId = useId();
  const bins = binScores(values);
  const top = Math.max(1, ...bins);
  const W = 300;
  const H = 120;
  const base = H - 20;
  const slot = W / BINS;
  const pass = (DEFAULT_POLICY.passMark / 20) * W;

  return (
    <figure className={s.distribution} aria-labelledby={titleId}>
      <figcaption id={titleId} className={s.sideLabel}>
        Spread of marks, on 20
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spread of ${count(values.length, 'mark')} on 20, in two-point bands`}>
        {bins.map((n, i) => {
          const h = n === 0 ? 0 : Math.max(3, (n / top) * (base - 14));
          const label = `${i === BINS - 1 ? `${i * BIN} to 20` : `${i * BIN} to under ${i * BIN + BIN}`}: ${count(n, 'student')}`;
          return (
            <g key={i}>
              <title>{label}</title>
              {/* Full-height hit area so small bars are easy to hover. */}
              <rect x={i * slot} y={0} width={slot} height={base} fill="transparent" />
              <rect x={i * slot + 2} y={base - h} width={slot - 4} height={h} fill="var(--black)" />
              {n === top && n > 0 && (
                <text x={i * slot + slot / 2} y={base - h - 4} textAnchor="middle" className={s.binLabel}>
                  {n}
                </text>
              )}
            </g>
          );
        })}
        <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--line-strong)" />
        <line x1={pass} x2={pass} y1={0} y2={base + 6} stroke="var(--black)" strokeDasharray="3 3" />
        <text x={0} y={H - 4} textAnchor="start" className={s.axisLabel}>
          0
        </text>
        <text x={pass} y={H - 4} textAnchor="middle" className={s.axisLabel}>
          10, pass mark
        </text>
        <text x={W} y={H - 4} textAnchor="end" className={s.axisLabel}>
          20
        </text>
      </svg>
      <table className="visually-hidden">
        <caption>Students per two-point band</caption>
        <tbody>
          {bins.map((n, i) => (
            <tr key={i}>
              <th scope="row">
                {i * BIN} to {i * BIN + BIN}
              </th>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

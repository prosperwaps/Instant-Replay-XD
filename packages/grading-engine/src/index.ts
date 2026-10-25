/**
 * CBC grading engine — the rules in docs/spec/03-module-plans.md §Module 2 ("Grading engine").
 *
 * Pure functions only: no I/O, no clock, no globals. The same code is meant to run in School Admin,
 * the Teacher App (preview) and the server (authoritative results). Every result that leaves the engine
 * carries ENGINE_VERSION so a report card can always be reproduced with the rules it was made with.
 *
 * Precision: values are kept at full precision. Rounding happens only for display and for ranking
 * (see `rank`), never inside averages.
 */

export const ENGINE_VERSION = '1.0.0';

/** Mark status codes. Each one has a defined effect on averages (spec: "Mark status codes"). */
export type MarkStatus = 'ABS' | 'EXC' | 'NT' | 'MAL';

export const STATUS_LABELS: Record<MarkStatus, string> = {
  ABS: 'Absent',
  EXC: 'Excused',
  NT: 'Not taken',
  MAL: 'Malpractice',
};

/** How each status is treated: counted as zero, or left out of the average. */
export const STATUS_EFFECT: Record<MarkStatus, 'zero' | 'excluded'> = {
  ABS: 'zero',
  EXC: 'excluded',
  NT: 'excluded',
  MAL: 'zero',
};

export interface MarkEntry {
  /** Score as written on the paper, out of the assessment's maximum. `null` when a status is used or nothing is entered yet. */
  raw: number | null;
  status: MarkStatus | null;
  /** Bonus (+) or penalty (−) in points on the policy base. Stored apart from the raw score. */
  adjustment?: number;
}

export interface GradingPolicy {
  /** Every score is normalised to this base. CBC schools use 20. */
  base: number;
  /** When false, adjustments cannot push a score above `base`. */
  allowOverflow: boolean;
  /** At or above this on the base, a result is a pass. */
  passMark: number;
  /** A pass within this many points of the pass mark is flagged "at risk". */
  atRiskBand: number;
  /** Decimal places that decide ties when ranking. */
  rankPrecision: number;
}

export const DEFAULT_POLICY: Readonly<GradingPolicy> = Object.freeze({
  base: 20,
  allowOverflow: false,
  passMark: 10,
  atRiskBand: 2,
  rankPrecision: 2,
});

export type ScoreFlag = 'ABS' | 'MAL' | 'ADJUSTED' | 'CAPPED';

/** A mark after the rules have been applied: either a value on the base, or left out with a reason. */
export type Score =
  | { kind: 'scored'; value: number; flags: ScoreFlag[] }
  | { kind: 'excluded'; reason: 'EXC' | 'NT' | 'MISSING' };

export class GradingError extends Error {
  override readonly name = 'GradingError';
}

/** Rounds half away from zero at `dp` decimal places, without binary floating-point surprises (1.005 → 1.01). */
export function round(value: number, dp = 2): number {
  if (!Number.isFinite(value)) throw new GradingError(`Cannot round ${value}`);
  const sign = value < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(value)}e${dp}`);
  return sign * Number(`${Math.round(shifted)}e-${dp}`);
}

/** True when `raw` is a usable score out of `max`: finite, within range, at most two decimal places. */
export function isValidRaw(raw: number, max: number): boolean {
  return Number.isFinite(raw) && raw >= 0 && raw <= max && round(raw, 2) === raw;
}

function assertMax(max: number): void {
  if (!Number.isFinite(max) || max <= 0) throw new GradingError(`Maximum must be a positive number, got ${max}`);
}

/** `raw / max × base` (spec: "Normalization"). */
export function normalise(raw: number, max: number, base = DEFAULT_POLICY.base): number {
  assertMax(max);
  if (!isValidRaw(raw, max)) throw new GradingError(`Score ${raw} is not valid out of ${max}`);
  return (raw / max) * base;
}

/** Applies status codes, normalisation and adjustments to one mark. */
export function scoreEntry(entry: MarkEntry, max: number, policy: GradingPolicy = DEFAULT_POLICY): Score {
  if (entry.status) {
    if (STATUS_EFFECT[entry.status] === 'excluded') return { kind: 'excluded', reason: entry.status as 'EXC' | 'NT' };
    return { kind: 'scored', value: 0, flags: [entry.status as 'ABS' | 'MAL'] };
  }
  if (entry.raw === null) return { kind: 'excluded', reason: 'MISSING' };

  const flags: ScoreFlag[] = [];
  let value = normalise(entry.raw, max, policy.base);
  const adjustment = entry.adjustment ?? 0;
  if (!Number.isFinite(adjustment)) throw new GradingError('Adjustment must be a finite number');
  if (adjustment !== 0) {
    flags.push('ADJUSTED');
    value += adjustment;
  }
  if (value < 0) value = 0;
  if (!policy.allowOverflow && value > policy.base) {
    value = policy.base;
    flags.push('CAPPED');
  }
  return { kind: 'scored', value, flags };
}

/** Weights for one subject's assessments must be positive and sum to 100 (spec: "Weighting"). */
export function validateWeights(weights: readonly number[]): { ok: true } | { ok: false; error: string } {
  if (weights.length === 0) return { ok: false, error: 'At least one assessment is needed.' };
  if (weights.some((w) => !Number.isFinite(w) || w <= 0)) return { ok: false, error: 'Every weight must be more than 0.' };
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (round(total, 6) !== 100) return { ok: false, error: `Weights add up to ${round(total, 2)}, not 100.` };
  return { ok: true };
}

export interface WeightedScore {
  score: Score;
  weight: number;
}

/**
 * Weighted subject average on the base. Excluded assessments (EXC, NT, missing) are left out and the
 * remaining weights are scaled back up to 100, so an excused student is not penalised.
 * Returns `null` when nothing is left to average.
 */
export function subjectAverage(parts: readonly WeightedScore[]): { value: number; flags: ScoreFlag[] } | null {
  const check = validateWeights(parts.map((p) => p.weight));
  if (!check.ok) throw new GradingError(check.error);
  let weighted = 0;
  let weightUsed = 0;
  const flags = new Set<ScoreFlag>();
  for (const { score, weight } of parts) {
    if (score.kind === 'excluded') continue;
    weighted += score.value * weight;
    weightUsed += weight;
    score.flags.forEach((f) => flags.add(f));
  }
  if (weightUsed === 0) return null;
  return { value: weighted / weightUsed, flags: [...flags] };
}

export interface CoefficientAverage {
  average: number | null;
  coefficient: number;
}

/** Σ(subject average × coefficient) / Σ(coefficient), over subjects that have an average (spec: "Coefficients"). */
export function termAverage(subjects: readonly CoefficientAverage[]): { value: number; coefficients: number } | null {
  let weighted = 0;
  let coefficients = 0;
  for (const { average, coefficient } of subjects) {
    if (!Number.isFinite(coefficient) || coefficient <= 0) throw new GradingError(`Coefficient must be more than 0, got ${coefficient}`);
    if (average === null) continue;
    weighted += average * coefficient;
    coefficients += coefficient;
  }
  if (coefficients === 0) return null;
  return { value: weighted / coefficients, coefficients };
}

/**
 * Competition ranking ("1, 1, 3"): equal results share a rank and the next rank skips (spec: "Ranking").
 * Ties are decided at `precision` decimal places, which is what appears on the report card.
 * Students without a result get `null` and do not take a place.
 */
export function rank<T extends { id: string; value: number | null }>(
  rows: readonly T[],
  precision = DEFAULT_POLICY.rankPrecision,
): Map<string, number | null> {
  const ranked = rows
    .filter((r): r is T & { value: number } => r.value !== null)
    .map((r) => ({ id: r.id, key: round(r.value, precision) }))
    .sort((a, b) => b.key - a.key);
  const out = new Map<string, number | null>();
  ranked.forEach((row, i) => {
    const previous = ranked[i - 1];
    out.set(row.id, previous && previous.key === row.key ? (out.get(previous.id) ?? i + 1) : i + 1);
  });
  rows.forEach((r) => {
    if (!out.has(r.id)) out.set(r.id, null);
  });
  return out;
}

export type Standing = 'pass' | 'at-risk' | 'fail';

/** Pass, a pass close to the line ("at risk"), or fail (spec: "Thresholds"). */
export function standing(value: number, policy: GradingPolicy = DEFAULT_POLICY): Standing {
  if (value < policy.passMark) return 'fail';
  if (value < policy.passMark + policy.atRiskBand) return 'at-risk';
  return 'pass';
}

export interface AppreciationBand {
  min: number;
  en: string;
  fr: string;
}

/**
 * Default bilingual appreciation scale on /20. To be confirmed with the school before report cards
 * are released (spec: "Grade scale & comments"); pass a different scale to `appreciation` to override.
 */
export const DEFAULT_APPRECIATION: readonly AppreciationBand[] = Object.freeze([
  { min: 18, en: 'Excellent', fr: 'Excellent' },
  { min: 16, en: 'Very good', fr: 'Très bien' },
  { min: 14, en: 'Good', fr: 'Bien' },
  { min: 12, en: 'Fairly good', fr: 'Assez bien' },
  { min: 10, en: 'Average', fr: 'Passable' },
  { min: 7, en: 'Weak', fr: 'Faible' },
  { min: 0, en: 'Very weak', fr: 'Très faible' },
]);

export function appreciation(value: number, scale: readonly AppreciationBand[] = DEFAULT_APPRECIATION): AppreciationBand {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const band = sorted.find((b) => value >= b.min) ?? sorted[sorted.length - 1];
  if (!band) throw new GradingError('Appreciation scale is empty');
  return band;
}

export interface ClassStatistics {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  passed: number;
  /** 0–1, or null with no results. */
  passRate: number | null;
}

/** Class mean, lowest, highest and pass rate over values on the base. */
export function classStatistics(values: readonly number[], policy: GradingPolicy = DEFAULT_POLICY): ClassStatistics {
  if (values.length === 0) return { count: 0, mean: null, min: null, max: null, passed: 0, passRate: null };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let passed = 0;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v >= policy.passMark) passed += 1;
  }
  return { count: values.length, mean: sum / values.length, min, max, passed, passRate: passed / values.length };
}

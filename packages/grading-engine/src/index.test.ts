import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  GradingError,
  appreciation,
  classStatistics,
  isValidRaw,
  normalise,
  rank,
  round,
  scoreEntry,
  standing,
  subjectAverage,
  termAverage,
  validateWeights,
  type Score,
} from './index';

const scored = (value: number): Score => ({ kind: 'scored', value, flags: [] });

describe('round', () => {
  it('rounds half away from zero without float error', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(12.345, 2)).toBe(12.35);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(14, 2)).toBe(14);
  });
  it('rejects non-finite input', () => {
    expect(() => round(Number.NaN)).toThrow(GradingError);
  });
});

describe('isValidRaw', () => {
  it('accepts scores within range with up to two decimals', () => {
    expect(isValidRaw(0, 20)).toBe(true);
    expect(isValidRaw(20, 20)).toBe(true);
    expect(isValidRaw(13.5, 20)).toBe(true);
    expect(isValidRaw(13.25, 20)).toBe(true);
  });
  it('rejects negatives, over-max, three decimals and non-numbers', () => {
    expect(isValidRaw(-1, 20)).toBe(false);
    expect(isValidRaw(20.5, 20)).toBe(false);
    expect(isValidRaw(13.333, 20)).toBe(false);
    expect(isValidRaw(Number.NaN, 20)).toBe(false);
    expect(isValidRaw(Infinity, 20)).toBe(false);
  });
});

describe('normalise', () => {
  it('scales raw / max × base', () => {
    expect(normalise(30, 40)).toBe(15);
    expect(normalise(45, 60)).toBe(15);
    expect(normalise(7, 20)).toBe(7);
  });
  it('refuses an invalid maximum or score', () => {
    expect(() => normalise(5, 0)).toThrow(GradingError);
    expect(() => normalise(41, 40)).toThrow(GradingError);
  });
});

describe('scoreEntry — status codes', () => {
  it('counts ABS and MAL as zero, flagged', () => {
    expect(scoreEntry({ raw: null, status: 'ABS' }, 20)).toEqual({ kind: 'scored', value: 0, flags: ['ABS'] });
    expect(scoreEntry({ raw: 18, status: 'MAL' }, 20)).toEqual({ kind: 'scored', value: 0, flags: ['MAL'] });
  });
  it('excludes EXC, NT and missing marks', () => {
    expect(scoreEntry({ raw: null, status: 'EXC' }, 20)).toEqual({ kind: 'excluded', reason: 'EXC' });
    expect(scoreEntry({ raw: null, status: 'NT' }, 20)).toEqual({ kind: 'excluded', reason: 'NT' });
    expect(scoreEntry({ raw: null, status: null }, 20)).toEqual({ kind: 'excluded', reason: 'MISSING' });
  });
});

describe('scoreEntry — adjustments', () => {
  it('adds a bonus and flags it', () => {
    expect(scoreEntry({ raw: 14, status: null, adjustment: 1.5 }, 20)).toEqual({ kind: 'scored', value: 15.5, flags: ['ADJUSTED'] });
  });
  it('caps at the base unless overflow is allowed', () => {
    expect(scoreEntry({ raw: 19, status: null, adjustment: 2 }, 20)).toEqual({ kind: 'scored', value: 20, flags: ['ADJUSTED', 'CAPPED'] });
    expect(scoreEntry({ raw: 19, status: null, adjustment: 2 }, 20, { ...DEFAULT_POLICY, allowOverflow: true })).toEqual({
      kind: 'scored',
      value: 21,
      flags: ['ADJUSTED'],
    });
  });
  it('never goes below zero with a penalty', () => {
    expect(scoreEntry({ raw: 1, status: null, adjustment: -3 }, 20)).toMatchObject({ value: 0 });
  });
});

describe('validateWeights', () => {
  it('accepts weights that sum to 100', () => {
    expect(validateWeights([20, 20, 60])).toEqual({ ok: true });
    expect(validateWeights([33.3, 33.3, 33.4])).toEqual({ ok: true });
  });
  it('explains what is wrong', () => {
    expect(validateWeights([])).toEqual({ ok: false, error: 'At least one assessment is needed.' });
    expect(validateWeights([50, 0, 50])).toEqual({ ok: false, error: 'Every weight must be more than 0.' });
    expect(validateWeights([20, 20, 50])).toEqual({ ok: false, error: 'Weights add up to 90, not 100.' });
  });
});

describe('subjectAverage', () => {
  it('weights Seq1 20 / Seq2 20 / Exam 60 (worked example)', () => {
    // 12×0.2 + 14×0.2 + 11×0.6 = 2.4 + 2.8 + 6.6 = 11.8
    const result = subjectAverage([
      { score: scored(12), weight: 20 },
      { score: scored(14), weight: 20 },
      { score: scored(11), weight: 60 },
    ]);
    expect(round(result!.value)).toBe(11.8);
  });
  it('re-weights over what remains when an assessment is excused', () => {
    // Seq2 excused: (12×20 + 11×60) / 80 = 900 / 80 = 11.25
    const result = subjectAverage([
      { score: scored(12), weight: 20 },
      { score: { kind: 'excluded', reason: 'EXC' }, weight: 20 },
      { score: scored(11), weight: 60 },
    ]);
    expect(result!.value).toBe(11.25);
  });
  it('counts an absence as zero', () => {
    const result = subjectAverage([
      { score: { kind: 'scored', value: 0, flags: ['ABS'] }, weight: 50 },
      { score: scored(16), weight: 50 },
    ]);
    expect(result).toEqual({ value: 8, flags: ['ABS'] });
  });
  it('returns null when every assessment is excluded', () => {
    expect(subjectAverage([{ score: { kind: 'excluded', reason: 'NT' }, weight: 100 }])).toBeNull();
  });
  it('refuses weights that do not add up', () => {
    expect(() => subjectAverage([{ score: scored(10), weight: 90 }])).toThrow('Weights add up to 90, not 100.');
  });
});

describe('termAverage', () => {
  it('applies coefficients (worked example)', () => {
    // Maths 14 × 5, English 12 × 3, History 9 × 2 → (70 + 36 + 18) / 10 = 12.4
    const result = termAverage([
      { average: 14, coefficient: 5 },
      { average: 12, coefficient: 3 },
      { average: 9, coefficient: 2 },
    ]);
    expect(result).toEqual({ value: 12.4, coefficients: 10 });
  });
  it('leaves out subjects without an average', () => {
    expect(termAverage([{ average: 14, coefficient: 5 }, { average: null, coefficient: 3 }])).toEqual({ value: 14, coefficients: 5 });
  });
  it('returns null with no averages, and rejects bad coefficients', () => {
    expect(termAverage([{ average: null, coefficient: 2 }])).toBeNull();
    expect(() => termAverage([{ average: 12, coefficient: 0 }])).toThrow(GradingError);
  });
});

describe('rank', () => {
  it('shares a rank on ties and skips the next', () => {
    const ranks = rank([
      { id: 'a', value: 15 },
      { id: 'b', value: 17 },
      { id: 'c', value: 15 },
      { id: 'd', value: 12 },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ b: 1, a: 2, c: 2, d: 4 });
  });
  it('decides ties at the displayed precision', () => {
    const ranks = rank([
      { id: 'a', value: 14.004 },
      { id: 'b', value: 14.001 },
    ]);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(1);
  });
  it('gives no rank to students without a result', () => {
    const ranks = rank([
      { id: 'a', value: null },
      { id: 'b', value: 9 },
    ]);
    expect(ranks.get('a')).toBeNull();
    expect(ranks.get('b')).toBe(1);
  });
  it('handles three-way ties', () => {
    const ranks = rank([
      { id: 'a', value: 10 },
      { id: 'b', value: 10 },
      { id: 'c', value: 10 },
      { id: 'd', value: 9 },
    ]);
    expect([...ranks.values()]).toEqual([1, 1, 1, 4]);
  });
});

describe('standing', () => {
  it('separates fail, at risk and pass', () => {
    expect(standing(9.99)).toBe('fail');
    expect(standing(10)).toBe('at-risk');
    expect(standing(11.99)).toBe('at-risk');
    expect(standing(12)).toBe('pass');
  });
});

describe('appreciation', () => {
  it('maps a value to its bilingual band', () => {
    expect(appreciation(18.5)).toMatchObject({ en: 'Excellent' });
    expect(appreciation(12)).toMatchObject({ en: 'Fairly good', fr: 'Assez bien' });
    expect(appreciation(9.99)).toMatchObject({ en: 'Weak' });
    expect(appreciation(0)).toMatchObject({ en: 'Very weak' });
  });
  it('accepts a school-specific scale', () => {
    expect(appreciation(11, [{ min: 0, en: 'Fail', fr: 'Échec' }, { min: 10, en: 'Pass', fr: 'Admis' }])).toMatchObject({ en: 'Pass' });
  });
  it('rejects an empty scale', () => {
    expect(() => appreciation(10, [])).toThrow(GradingError);
  });
});

describe('classStatistics', () => {
  it('reports mean, range and pass rate', () => {
    expect(classStatistics([8, 10, 12, 18])).toEqual({ count: 4, mean: 12, min: 8, max: 18, passed: 3, passRate: 0.75 });
  });
  it('is empty-safe', () => {
    expect(classStatistics([])).toEqual({ count: 0, mean: null, min: null, max: null, passed: 0, passRate: null });
  });
});

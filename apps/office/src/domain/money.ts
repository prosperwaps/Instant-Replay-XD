/**
 * Money in CFA francs (XAF). The franc has no subunit in circulation, so every amount is a whole number
 * of francs, stored as a safe integer. Arithmetic refuses anything that would lose precision.
 */

declare const francsBrand: unique symbol;
export type Francs = number & { readonly [francsBrand]: true };

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

export function francs(value: number): Francs {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`${value} is not a whole number of francs`);
  return value as Francs;
}

export function addFrancs(...amounts: readonly Francs[]): Francs {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    if (!Number.isSafeInteger(total)) throw new MoneyError('Total is too large to hold exactly');
  }
  return total as Francs;
}

export function subtractFrancs(a: Francs, b: Francs): Francs {
  return francs(a - b);
}

const grouping = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** "FCFA 150,000", "FCFA −5,000" (a true minus sign, after the currency, as statements print it). */
export function formatFrancs(amount: Francs): string {
  const sign = amount < 0 ? '−' : '';
  return `FCFA ${sign}${grouping.format(Math.abs(amount))}`;
}

const compactUnits: readonly [number, string][] = [
  [1_000_000_000, 'bn'],
  [1_000_000, 'M'],
  [1_000, 'k'],
];

/**
 * Short form for headline figures, so they never need truncating on a phone: "FCFA 12.4M", "FCFA 850k".
 * Amounts under 10,000 are written in full.
 */
export function formatFrancsCompact(amount: Francs): string {
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  if (abs < 10_000) return formatFrancs(amount);
  for (const [unit, suffix] of compactUnits) {
    if (abs >= unit) {
      const scaled = abs / unit;
      const digits = scaled >= 100 ? 0 : 1;
      const text = (Math.floor(scaled * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0$/, '');
      return `FCFA ${sign}${text}${suffix}`;
    }
  }
  return formatFrancs(amount);
}

/** Reads what a person typed ("150 000", "150,000", "FCFA 150000") into francs, or explains why not. */
export function parseFrancs(input: string): { ok: true; value: Francs } | { ok: false; error: string } {
  const cleaned = input.replace(/fcfa|xaf/gi, '').replace(/[\s,\u00a0\u202f]/g, '');
  if (cleaned === '') return { ok: false, error: 'Enter an amount.' };
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: 'Use whole francs, digits only.' };
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value)) return { ok: false, error: 'That amount is too large.' };
  return { ok: true, value: value as Francs };
}

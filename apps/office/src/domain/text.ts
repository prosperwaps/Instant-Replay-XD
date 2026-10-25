/** "1 student", "3 students", "1 class", "2 classes". Never "student(s)". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${grouping.format(n)} ${n === 1 ? singular : plural}`;
}

const grouping = new Intl.NumberFormat('en-GB');

export function formatNumber(n: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits }).format(n);
}

/** 0.7345 → "73%". `null` reads as an em dash so empty figures never show "NaN%". */
export function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

/** Joins a list for a sentence: "A", "A and B", "A, B and 3 more". */
export function listSentence(items: readonly string[], max = 3): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length <= max) return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}

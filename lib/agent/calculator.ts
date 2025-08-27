// A deterministic calculator the LLM must use for all arithmetic.
// Keeps us safe from hallucinated math. All operations are pure and validated.

export type Numeric = number | string;

function normalizeNumericInput(raw: Numeric): string {
  if (typeof raw === 'number') return String(raw);
  let s = String(raw || '').trim();
  if (!s) return '0';
  // Normalize Unicode minus to ASCII
  s = s.replace(/−/g, '-');
  // Detect negative via parentheses e.g. (123.45)
  let isNegative = false;
  if (/^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1);
  }
  // Remove common currency symbols and letters (keep digits, sign, dot, comma, percent)
  s = s.replace(/[^0-9+\-.,%]/g, '');
  // Remove thousands separators (commas). We assume dot as decimal.
  s = s.replace(/,/g, '');
  // Handle trailing percentage
  let isPercent = false;
  if (/%$/.test(s)) {
    isPercent = true;
    s = s.replace(/%$/, '');
  }
  // If string is just sign or empty, treat as 0
  if (/^\s*[+\-]?\s*$/.test(s)) s = '0';
  // Re-apply negativity from parentheses
  if (isNegative && !s.startsWith('-')) s = '-' + s;
  // Convert percent to fraction
  if (isPercent) {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Invalid percent: ${raw}`);
    s = String(n / 100);
  }
  return s;
}

function toNumber(value: Numeric): number {
  if (typeof value === 'number') return value;
  const normalized = normalizeNumericInput(value);
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${value}`);
  return n;
}

export class Calculator {
  add(a: Numeric, b: Numeric): number {
    return toNumber(a) + toNumber(b);
  }
  sub(a: Numeric, b: Numeric): number {
    return toNumber(a) - toNumber(b);
  }
  mul(a: Numeric, b: Numeric): number {
    return toNumber(a) * toNumber(b);
  }
  div(a: Numeric, b: Numeric): number {
    const denom = toNumber(b);
    if (denom === 0) throw new Error('Division by zero');
    return toNumber(a) / denom;
  }
  sum(values: Numeric[]): number {
    return values.reduce((acc: number, v: Numeric) => acc + toNumber(v), 0);
  }
  avg(values: Numeric[]): number {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }
  round(value: Numeric, digits = 2): number {
    const n = toNumber(value);
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
  }
  percentOf(percent: Numeric, value: Numeric): number {
    // "12% of 250" => percentOf(12, 250)
    return toNumber(value) * (toNumber(percent) / 100);
  }
  percentChange(from: Numeric, to: Numeric): number {
    const a = toNumber(from);
    const b = toNumber(to);
    if (a === 0) return b === 0 ? 0 : (b > 0 ? Infinity : -Infinity);
    return ((b - a) / Math.abs(a)) * 100;
  }
  formatCurrency(value: Numeric, locale = 'en-US', currency = 'USD', digits = 2): string {
    const n = toNumber(value);
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  }
}

export const calculator = new Calculator();



// A deterministic calculator the LLM must use for all arithmetic.
// Keeps us safe from hallucinated math. All operations are pure and validated.

export type Numeric = number | string;

function toNumber(value: Numeric): number {
  if (typeof value === 'number') return value;
  // Remove currency symbols and commas if present
  const cleaned = value.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
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
    return values.reduce((acc, v) => acc + toNumber(v), 0);
  }
  avg(values: Numeric[]): number {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }
}

export const calculator = new Calculator();



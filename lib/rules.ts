export interface Rule {
  id: string;
  pattern: string;
  category: string;
}

/**
 * Applies rules to a merchant string and returns the matched category.
 */
export function categorize(merchant: string, rules: Rule[]): string | undefined {
  for (const rule of rules) {
    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(merchant)) return rule.category;
  }
  return undefined;
}

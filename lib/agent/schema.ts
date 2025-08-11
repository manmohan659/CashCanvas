// Minimal schemas and safe query helpers the LLM agent can call.
// Expose read-only aggregations and parameterized queries; never raw exec.

import { query, run, getCurrentUserId, applyRulesToTransactions, autoCategorizeAndAnnotate } from '../sqlite/init';
import { chatLLM, hasLLM } from './llm';
import { calculator } from './calculator';

export interface SpendByCategoryRow { category: string; total: number }
export interface MonthlyAggregateRow { month: string; income: number; spend: number; net: number }
export interface DailyRow { date: string; value: number }

export const AgentTools = {
  // Read-only: total spend for a time range
  async totalSpend({ from, to }: { from?: string; to?: string }): Promise<number> {
    const userId = await getCurrentUserId();
    const rows = await query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS v
       FROM transactions
       WHERE user_id = ? AND amount < 0
         AND (? IS NULL OR date >= ?)
         AND (? IS NULL OR date <= ?)`,
      [userId, from ?? null, from ?? null, to ?? null, to ?? null]
    );
    return calculator.add(0, (rows?.[0]?.v as number) || 0);
  },

  // Read-only: spend by category
  async spendByCategory({ from, to }: { from?: string; to?: string }): Promise<SpendByCategoryRow[]> {
    const userId = await getCurrentUserId();
    const rows = await query(
      `SELECT COALESCE(category, 'Unknown') AS category, SUM(ABS(amount)) AS total
       FROM transactions
       WHERE user_id = ? AND amount < 0
         AND (? IS NULL OR date >= ?)
         AND (? IS NULL OR date <= ?)
       GROUP BY category
       ORDER BY total DESC`,
      [userId, from ?? null, from ?? null, to ?? null, to ?? null]
    );
    return (rows as any[]).map(r => ({ category: r.category, total: Number(r.total) || 0 }));
  },

  // Read-only: income vs expenses by month
  async monthlyNet(): Promise<MonthlyAggregateRow[]> {
    const userId = await getCurrentUserId();
    const rows = await query(
      `SELECT 
         strftime('%Y-%m', date) AS month,
         SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS spend
       FROM transactions
       WHERE user_id = ?
       GROUP BY strftime('%Y-%m', date)
       ORDER BY month`,
      [userId]
    );
    return (rows as any[]).map(r => {
      const income = Number(r.income) || 0;
      const spend = Number(r.spend) || 0; // negative
      return { month: r.month, income, spend, net: income + spend };
    });
  },

  // Read-only: list existing categories with counts and totals
  async listCategories(): Promise<Array<{ category: string; count: number; total: number }>> {
    const userId = await getCurrentUserId();
    const rows = await query(
      `SELECT COALESCE(category, '') AS category, COUNT(*) AS count, SUM(amount) AS total
       FROM transactions
       WHERE user_id = ?
       GROUP BY category
       ORDER BY count DESC, lower(category) ASC`,
      [userId]
    );
    return (rows as any[]).map(r => ({ category: r.category || '', count: Number(r.count) || 0, total: Number(r.total) || 0 }));
  },

  // Read-only: few sample uncategorized transactions (for review/UI)
  async uncategorizedSamples(limit = 10): Promise<Array<{ id: string; date: string; description: string; merchant?: string; amount: number }>> {
    const userId = await getCurrentUserId();
    const rows = await query(
      `SELECT id, date, description, merchant, amount
       FROM transactions
       WHERE user_id = ? AND (category IS NULL OR TRIM(category) = '')
       ORDER BY date DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows as any[];
  },

  async uncategorizedCount(): Promise<number> {
    const userId = await getCurrentUserId();
    const rows = await query(
      `SELECT COUNT(*) AS c FROM transactions WHERE user_id = ? AND (category IS NULL OR TRIM(category) = '')`,
      [userId]
    );
    return Number(rows?.[0]?.c || 0);
  },

  // Action: apply rules first, then heuristic categorizer
  async autoCategorize(): Promise<{ updatedByRules: number; updatedByHeuristics: number }> {
    const updatedByRules = await applyRulesToTransactions();
    const updatedByHeuristics = await autoCategorizeAndAnnotate();
    // Attempt an LLM pass on remaining uncategorized if configured
    let updatedByLLM = 0;
    try {
      updatedByLLM = await llmCategorizeUncategorized(20);
    } catch {
      // ignore LLM errors; keep rules+heuristics results
      updatedByLLM = 0;
    }
    try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-data-changed')); } catch {}
    // Backward compatible return shape while adding updatedByLLM
    return { updatedByRules, updatedByHeuristics, ...(updatedByLLM ? { updatedByLLM } : {}) } as any;
  },
};

export type AgentToolName = keyof typeof AgentTools;

/**
 * Uses the configured LLM to categorize up to `limit` uncategorized transactions.
 * The LLM receives only the fields required to make a grounded decision:
 *  - description, merchant, amount, date, and the list of existing categories.
 * Returns the number of rows updated. Safe no-op when no LLM is configured.
 */
async function llmCategorizeUncategorized(limit = 20): Promise<number> {
  if (!hasLLM()) return 0;
  const userId = await getCurrentUserId();
  // Gather existing non-empty categories to prefer reuse
  const cats = await query(
    `SELECT DISTINCT TRIM(category) AS c
     FROM transactions
     WHERE user_id = ? AND TRIM(COALESCE(category,'')) != ''
     ORDER BY lower(c)`,
    [userId]
  );
  const categories = (cats as any[]).map(r => String(r.c)).filter(Boolean);
  // Fetch a batch of uncategorized transactions
  const rows = await query(
    `SELECT id, date, description, merchant, amount
     FROM transactions
     WHERE user_id = ? AND (category IS NULL OR TRIM(category) = '')
     ORDER BY date DESC, id DESC
     LIMIT ?`,
    [userId, limit]
  );
  const txs = rows as Array<{ id: string; date: string; description?: string; merchant?: string; amount: number }>;
  if (!txs || txs.length === 0) return 0;

  // Build a strict JSON-only prompt to avoid hallucinated formats.
  const system = [
    'You are a transaction categorization engine. Output STRICT JSON only, no prose.',
    'Ground rules:',
    '- Prefer assigning to one of the provided existing categories if it clearly fits.',
    "- If none fits, you MAY propose a short NEW category name appropriate for personal finance (e.g., 'Pet Care').",
    "- If truly ambiguous, use 'Unknown'.",
    '- Use both merchant and description. Consider sign (negative = expense, positive = income).',
    '- Keep decisions conservative and grounded; do not invent facts.',
    '',
    'Return JSON object with shape: { "assignments": [ { "id": string, "category": string } ] }',
  ].join('\n');

  const payload = {
    existingCategories: categories,
    uncategorized: txs.map(t => ({
      id: t.id,
      date: t.date,
      amount: Number(t.amount || 0),
      merchant: t.merchant || '',
      description: t.description || '',
    })),
  };

  let raw: string;
  try {
    raw = await chatLLM([
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) },
    ]);
  } catch (e) {
    return 0; // LLM not available or failed
  }

  // Best-effort parse of JSON output
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to extract JSON block if model added extra text
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}
    }
  }
  if (!parsed || !Array.isArray(parsed.assignments)) return 0;

  let updated = 0;
  for (const a of parsed.assignments as Array<{ id?: string; category?: string }>) {
    const id = String(a?.id || '').trim();
    const category = String(a?.category || '').trim();
    if (!id || !category) continue;
    try {
      await run(
        `UPDATE transactions
         SET category = CASE WHEN (category IS NULL OR TRIM(category) = '') THEN ? ELSE category END
         WHERE id = ? AND user_id = ?`,
        [category, id, userId]
      );
      updated++;
    } catch {
      // skip row on failure
    }
  }

  return updated;
}



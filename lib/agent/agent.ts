import { chatLLM, loadLLMConfig, systemPrompt } from './llm';
import { AgentTools } from './schema';

type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
};

// Tools the model can call via chat.completions tool_calls
const toolDefs: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_transactions',
      description: 'Search transactions by freeform text and optional date range. Returns rows with date, description, merchant, amount, category.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          limit: { type: 'number' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spend_by_category',
      description: 'Aggregate spending by category for an optional date range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'total_spend',
      description: 'Total spend (absolute value of negative amounts) for an optional date range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' }
        }
      }
    }
  }
];

async function execTool(name: string, args: any): Promise<any> {
  // Debug: tool execution
  try { console.debug('[agent] execTool', name, args); } catch {}
  switch (name) {
    case 'search_transactions': {
      const q = String(args?.query || '').trim();
      // Use FTS via AgentTools by mapping to list of fields using searchTransactions in DB
      const rows = await (await import('../sqlite/init')).query(
        `SELECT date, description, merchant, amount, category
         FROM transactions
         WHERE user_id = (SELECT value FROM settings WHERE key='current_user_id' LIMIT 1)
           AND (
             lower(coalesce(description,'')) LIKE ? OR
             lower(coalesce(merchant,'')) LIKE ? OR
             lower(coalesce(category,'')) LIKE ?
           )
           AND (? IS NULL OR date >= ?)
           AND (? IS NULL OR date <= ?)
         ORDER BY date ASC
         LIMIT ?`,
        [
          `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`,
          args?.from ?? null, args?.from ?? null, args?.to ?? null, args?.to ?? null,
          Number(args?.limit || 200)
        ]
      );
      return rows;
    }
    case 'spend_by_category':
      return AgentTools.spendByCategory({ from: args?.from, to: args?.to });
    case 'total_spend':
      return AgentTools.totalSpend({ from: args?.from, to: args?.to });
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function tokenize(text: string): string[] {
  const stop = new Set(['how','much','did','i','in','the','a','an','to','is','on','my','for','trip','spend','spent','cost','vs','vs.','and','or']);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stop.has(t));
}

async function heuristicSpend(question: string): Promise<string> {
  const tokens = tokenize(question);
  if (tokens.length === 0) {
    const total = await AgentTools.totalSpend({});
    return `### Estimated spend
Total expenses (all time in your DB): $${Number(total).toFixed(2)}.`;
  }
  const likeClauses = tokens.map(() => `lower(coalesce(description,'')) LIKE ? OR lower(coalesce(merchant,'')) LIKE ?`).join(' OR ');
  const params: any[] = [];
  for (const t of tokens) { const p = `%${t}%`; params.push(p, p); }
  // last 180 days window to avoid excessive matches
  const sql = `SELECT date, description, merchant, amount FROM transactions
               WHERE (date >= date('now','-180 day')) AND (${likeClauses}) AND amount < 0
               ORDER BY date ASC`;
  const rows = await (await import('../sqlite/init')).query(sql, params);
  const sum = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
  const sample = (rows as any[]).slice(0, 10);
  let md = `### Estimated spend (heuristic)
Matched tokens: ${tokens.map(t => '`'+t+'`').join(' ')}

Total: $${sum.toFixed(2)} across ${rows.length} transactions in the last 180 days.

| Date | Merchant | Description | Amount |
|---|---|---|---|
`;
  for (const r of sample) {
    md += `| ${r.date} | ${r.merchant || ''} | ${r.description || ''} | $${Math.abs(Number(r.amount)).toFixed(2)} |\n`;
  }
  if (rows.length > sample.length) md += `\n… and ${rows.length - sample.length} more rows.`;
  md += `\n\nTip: refine with dates or keywords (e.g., "NYC June flights + hotels").`;
  return md;
}

export async function runFinanceAgent(question: string): Promise<string> {
  const cfg = loadLLMConfig();
  if (!cfg) throw new Error('LLM not configured');

  // If not using OpenAI, fall back to a simple chat without tool-calling
  if (cfg.vendor !== 'openai') {
    const reply = await chatLLM([
      { role: 'system', content: `${systemPrompt}\n\nNote: Tools are unavailable with this model vendor. Answer using only the information provided in the question. If you need exact numbers, instruct the user which UI action or query to run.` },
      { role: 'user', content: question }
    ]);
    return reply;
  }

  const messages: any[] = [
    { role: 'system', content: `${systemPrompt}\n\nUse the provided tools to fetch transactions and compute exact answers. Respond with structured Markdown. Include short tables when listing transactions.` },
    { role: 'user', content: question }
  ];

  // Loop up to a few turns until content is produced
  for (let i = 0; i < 6; i++) {
    try { console.debug('[agent] turn', i, 'sending to model'); } catch {}
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: cfg.model, messages, tools: toolDefs, tool_choice: 'auto', parallel_tool_calls: true })
    });
    if (!resp.ok) {
      let detail = 'unknown error';
      try { const j = await resp.json(); detail = j?.error?.message || JSON.stringify(j); } catch { detail = await resp.text(); }
      throw new Error(`OpenAI ${resp.status}: ${detail}`);
    }
    const data = await resp.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;
    const toolCalls = msg?.tool_calls;
    try { console.debug('[agent] model response toolCalls', toolCalls ? toolCalls.length : 0); } catch {}
    if (toolCalls && toolCalls.length > 0) {
      // Execute all tools and push results
      for (const call of toolCalls) {
        const name = call.function?.name as string;
        const args = (() => { try { return JSON.parse(call.function?.arguments || '{}'); } catch { return {}; } })();
        try { console.debug('[agent] executing', name, args); } catch {}
        const result = await execTool(name, args);
        messages.push({ role: 'assistant', tool_calls: [call] });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue; // ask model again with tool results
    }
    const content = msg?.content?.trim();
    if (content) return content;
  }
  // Fallback: heuristic local compute
  try { console.warn('[agent] no tool calls after loop; using heuristic fallback'); } catch {}
  return heuristicSpend(question);
}



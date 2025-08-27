import { chatLLM, loadLLMConfig, systemPrompt } from './llm';
import { AgentTools } from './schema';
import { calculator } from './calculator';
import type { SmartExpenseIntent } from '../split/types';

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
      name: 'calculator',
      description: 'Perform validated arithmetic. Always use this for any math (add, sub, mul, div, sum, avg, round, percentOf, percentChange, formatCurrency).',
      parameters: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add','sub','mul','div','sum','avg','round','percentOf','percentChange','formatCurrency'] },
          a: { anyOf: [ { type: 'number' }, { type: 'string' } ] },
          b: { anyOf: [ { type: 'number' }, { type: 'string' } ] },
          values: { type: 'array', items: { anyOf: [ { type: 'number' }, { type: 'string' } ] } },
          digits: { type: 'number' },
          locale: { type: 'string' },
          currency: { type: 'string' }
        },
        required: ['op']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_record_expense_smart',
      description: 'Record a shared expense using itemized OCR + instructions. Can create/extend group and assign different items to different participants.',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'object',
            description: 'Smart intent with optional image base64 and participant directives',
            properties: {
              group_hint: { type: 'string' },
              create_group_if_missing: { type: 'boolean' },
              participants_all: { type: 'array', items: { type: 'string' } },
              participants_subset: { type: 'array', items: { type: 'string' } },
              payer: { type: 'string' },
              date: { type: 'string' },
              currency: { type: 'string' },
              description: { type: 'string' },
              notes: { type: 'string' },
              items_image_base64: { type: 'string' },
              items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: 'number' }, participants: { type: 'array', items: { type: 'string' } } } } },
              split_rest_with: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        required: ['intent']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_preview',
      description: 'Preview an expense split for a group given total, split type, and options.',
      parameters: {
        type: 'object',
        properties: {
          group_id: { type: 'string' },
          amount: { type: 'number' },
          split_type: { type: 'string', enum: ['equal','exact','percent','shares','itemized','time'] },
          options: { type: 'object' }
        },
        required: ['group_id','amount','split_type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_balances',
      description: 'Get per-member balances and suggested edges for a group.',
      parameters: {
        type: 'object',
        properties: { group_id: { type: 'string' } },
        required: ['group_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_simplify',
      description: 'Simplify debts for a group to minimize number of payments.',
      parameters: { type: 'object', properties: { group_id: { type: 'string' } }, required: ['group_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_list_friends',
      description: 'List friends available for shared expenses.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_create_friend',
      description: 'Create a new friend/contact for shared expenses.',
      parameters: { type: 'object', properties: { display_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } }, required: ['display_name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_list_groups',
      description: 'List existing groups.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_create_group',
      description: 'Create a group and add members by friend ids.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, member_friend_ids: { type: 'array', items: { type: 'string' } }, default_currency: { type: 'string' } }, required: ['name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_add_member',
      description: 'Add a friend to a group as a member.',
      parameters: { type: 'object', properties: { group_id: { type: 'string' }, friend_id: { type: 'string' } }, required: ['group_id','friend_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detect_trip_ranges',
      description: 'Detect likely trip date ranges by scanning travel-related transactions and continuity. Optionally bias by location keywords.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Optional location hint (e.g., "NY", "NYC", "New York")' },
          limit: { type: 'number', description: 'Max ranges to return (default 3)' },
          monthsBack: { type: 'number', description: 'How many months back to scan (default 12)' }
        }
      }
    }
  },
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
  },
  {
    type: 'function',
    function: {
      name: 'analyze_location_spend',
      description: 'Analyze spending for a specific location by searching transaction descriptions and merchants for location keywords.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Location name (e.g., "NY", "New York", "NYC")' },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' }
        },
        required: ['location']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_trip_spend',
      description: 'Analyze travel and trip-related spending by detecting travel categories and keywords.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_trip_spend_for_location',
      description: 'Analyze trip spending within a date range and verify transactions by target location (e.g., NYC) using meta.city and strong keywords.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Location name or code (e.g., "NY", "NYC", "New York")' },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' }
        },
        required: ['location']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'monthly_spend_trend',
      description: 'Get monthly spending trends with income vs expenses breakdown.',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'Number of months to analyze (default: 12)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'category_deep_dive',
      description: 'Deep analysis of spending within a specific category with trends and patterns.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category name to analyze' },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' }
        },
        required: ['category']
      }
    }
  }
];

async function execTool(name: string, args: any): Promise<any> {
  // Debug: tool execution
  try { console.debug('[agent] execTool', name, args); } catch {}
  switch (name) {
    case 'calculator': {
      const op = String(args?.op || '').trim();
      switch (op) {
        case 'add': return calculator.add(args?.a ?? 0, args?.b ?? 0);
        case 'sub': return calculator.sub(args?.a ?? 0, args?.b ?? 0);
        case 'mul': return calculator.mul(args?.a ?? 0, args?.b ?? 0);
        case 'div': return calculator.div(args?.a ?? 0, args?.b ?? 1);
        case 'sum': return calculator.sum(Array.isArray(args?.values) ? args.values : []);
        case 'avg': return calculator.avg(Array.isArray(args?.values) ? args.values : []);
        case 'round': return calculator.round(args?.a ?? 0, Number(args?.digits ?? 2));
        case 'percentOf': return calculator.percentOf(args?.a ?? 0, args?.b ?? 0);
        case 'percentChange': return calculator.percentChange(args?.a ?? 0, args?.b ?? 0);
        case 'formatCurrency': return calculator.formatCurrency(args?.a ?? 0, String(args?.locale || 'en-US'), String(args?.currency || 'USD'), Number(args?.digits ?? 2));
        default: throw new Error(`Unknown calculator op: ${op}`);
      }
    }
    case 'detect_trip_ranges': {
      const loc = String(args?.location || '').trim();
      const limit = Number(args?.limit || 3);
      const monthsBack = Number(args?.monthsBack || 12);
      return await detectTripRanges(loc || undefined, limit, monthsBack);
    }
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
    case 'analyze_location_spend': {
      const location = String(args?.location || '').toLowerCase();
      let locationKeywords: string[] = [];

      // Map common location names to search keywords
      if (location.includes('ny') || location.includes('new york')) {
        // Avoid plain 'ny' to prevent false matches like 'company'. Prefer strong signals.
        locationKeywords = ['new york', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'mta', 'jfk', 'lga', 'ewr', 'liberty'];
      } else if (location.includes('la') || location.includes('los angeles')) {
        locationKeywords = ['la', 'los angeles', 'lax', 'hollywood', 'beverly hills'];
      } else if (location.includes('chicago')) {
        locationKeywords = ['chicago', 'chi town', 'windy city'];
      } else if (location.includes('miami') || location.includes('florida')) {
        locationKeywords = ['miami', 'florida', 'beach'];
      } else {
        // Generic location search
        locationKeywords = [location];
      }

      return await analyzeLocationSpend(`Location analysis for ${args?.location}`, locationKeywords, args?.from, args?.to);
    }
    case 'analyze_trip_spend': {
      return await analyzeTripSpendWithDateRange(args?.from, args?.to);
    }
    case 'analyze_trip_spend_for_location': {
      const loc = String(args?.location || '').trim();
      return await analyzeTripSpendForLocation(loc, args?.from, args?.to);
    }
    case 'split_record_expense_smart': {
      const { recordExpenseSmart } = await import('../split/smart');
      const intent = args?.intent as SmartExpenseIntent;
      return await recordExpenseSmart(intent);
    }
    case 'split_preview': {
      const { getGroupMembers, computeSplits } = await import('../split/logic');
      const groupId = String(args?.group_id || '').trim();
      const amount = Number(args?.amount || 0);
      const split_type = String(args?.split_type || 'equal');
      const options = args?.options || {};
      const members = await getGroupMembers(groupId);
      const memberIds = members.map(m => m.member_id);
      return computeSplits(split_type as any, amount, memberIds, options);
    }
    case 'split_balances': {
      const { groupBalances } = await import('../split/logic');
      const group_id = String(args?.group_id || '').trim();
      return await groupBalances(group_id);
    }
    case 'split_simplify': {
      const { simplifyDebts } = await import('../split/logic');
      const group_id = String(args?.group_id || '').trim();
      return await simplifyDebts(group_id);
    }
    case 'split_list_friends': {
      const { listFriends } = await import('../split/logic');
      return await listFriends();
    }
    case 'split_create_friend': {
      const { createFriend } = await import('../split/logic');
      const name = String(args?.display_name || '').trim();
      if (!name) throw new Error('display_name required');
      const id = await createFriend(name, args?.email || null, args?.phone || null);
      return { id };
    }
    case 'split_list_groups': {
      const { listGroups } = await import('../split/logic');
      return await listGroups();
    }
    case 'split_create_group': {
      const { createGroup } = await import('../split/logic');
      const name = String(args?.name || '').trim();
      if (!name) throw new Error('name required');
      const member_friend_ids = Array.isArray(args?.member_friend_ids) ? args.member_friend_ids : [];
      const id = await createGroup(name, member_friend_ids, String(args?.default_currency || 'USD'));
      return { id };
    }
    case 'split_add_member': {
      const { addMember } = await import('../split/logic');
      const group_id = String(args?.group_id || '').trim();
      const friend_id = String(args?.friend_id || '').trim();
      if (!group_id || !friend_id) throw new Error('group_id and friend_id required');
      const id = await addMember(group_id, friend_id);
      return { id };
    }
    case 'monthly_spend_trend': {
      const months = Number(args?.months || 12);
      const rows = await AgentTools.monthlyNet();
      return rows.slice(-months); // Return last N months
    }
    case 'category_deep_dive': {
      const category = String(args?.category || '').trim();
      if (!category) throw new Error('Category is required');

      const userId = await (await import('../sqlite/init')).getCurrentUserId();
      const rows = await (await import('../sqlite/init')).query(
        `SELECT date, description, merchant, amount
         FROM transactions
         WHERE user_id = ? AND lower(coalesce(category,'')) LIKE ?
           AND (? IS NULL OR date >= ?)
           AND (? IS NULL OR date <= ?)
           AND amount < 0
         ORDER BY date ASC`,
        [userId, `%${category.toLowerCase()}%`, args?.from ?? null, args?.from ?? null, args?.to ?? null, args?.to ?? null]
      );

      const total = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
      const avgTransaction = rows.length > 0 ? total / rows.length : 0;

      // Group by month
      const monthlyData: { [month: string]: { count: number; total: number } } = {};
      for (const r of rows as any[]) {
        const month = r.date.substring(0, 7);
        if (!monthlyData[month]) monthlyData[month] = { count: 0, total: 0 };
        monthlyData[month].count++;
        monthlyData[month].total += Math.abs(Number(r.amount || 0));
      }

      return {
        category,
        totalSpent: total,
        transactionCount: rows.length,
        averageTransaction: avgTransaction,
        monthlyBreakdown: monthlyData,
        recentTransactions: (rows as any[]).slice(-10) // Last 10 transactions
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// Enhanced location analysis with date range support
async function analyzeLocationSpend(question: string, locationKeywords: string[], from?: string, to?: string): Promise<string> {
  const userId = await (await import('../sqlite/init')).getCurrentUserId();
  const likeClauses = locationKeywords.map(() => `lower(coalesce(description,'')) LIKE ? OR lower(coalesce(merchant,'')) LIKE ?`).join(' OR ');
  const params: any[] = [];
  for (const keyword of locationKeywords) {
    const p = `%${keyword}%`;
    params.push(p, p);
  }

  // Exclude future-dated rows and default to last 365 days when no explicit range
  let dateClause = 'AND date <= date(\'now\') AND date >= date(\'now\',\'-365 day\')';
  if (from || to) {
    dateClause = 'AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)';
    params.push(from ?? null, from ?? null, to ?? null, to ?? null);
  }

  const sql = `SELECT date, description, merchant, amount, category
               FROM transactions
               WHERE user_id = ? AND (${likeClauses}) ${dateClause} AND amount < 0
               ORDER BY date ASC`;
  params.unshift(userId);

  const rows = await (await import('../sqlite/init')).query(sql, params);
  const total = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);

  let md = `### Location-Based Spending Analysis
**Location:** ${question.replace('Location analysis for ', '')}
**Total spent:** $${total.toFixed(2)}
**Transactions found:** ${rows.length}
**Date range:** ${from && to ? `${from} to ${to}` : 'Last 365 days'}

| Date | Category | Merchant | Description | Amount |
|---|---|---|---|---|
`;

  // Group by month for summary
  const monthlyTotals: { [month: string]: number } = {};
  for (const r of rows as any[]) {
    const month = r.date.substring(0, 7); // YYYY-MM
    monthlyTotals[month] = (monthlyTotals[month] || 0) + Math.abs(Number(r.amount || 0));

    md += `| ${r.date} | ${r.category || ''} | ${r.merchant || ''} | ${r.description || ''} | $${Math.abs(Number(r.amount)).toFixed(2)} |\n`;
  }

  md += `\n### Monthly Breakdown\n`;
  Object.entries(monthlyTotals).sort().forEach(([month, amount]) => {
    md += `**${month}:** $${amount.toFixed(2)}\n`;
  });

  md += `\n💡 **Tip:** This analysis looks for location keywords in transaction descriptions. For more accurate trip analysis, consider categorizing your travel expenses.`;

  return md;
}

// Trip analysis with date range support
async function analyzeTripSpendWithDateRange(from?: string, to?: string): Promise<string> {
  const userId = await (await import('../sqlite/init')).getCurrentUserId();

  // Look for travel-related categories and keywords
  const travelCategories = ['Travel', 'Flights', 'Hotels', 'Transportation', 'Transport', 'Airbnb', 'Uber', 'Lyft', 'Taxi', 'Rental Car'];
  const categoryClause = travelCategories.map(() => `lower(category) LIKE ?`).join(' OR ');
  const categoryParams = travelCategories.map(cat => `%${cat.toLowerCase()}%`);

  // Also look for travel-related keywords in descriptions
  const travelKeywords = ['flight', 'hotel', 'airbnb', 'uber', 'lyft', 'taxi', 'rental', 'train', 'bus', 'airport', 'travel', 'trip', 'vacation'];
  const keywordClause = travelKeywords.map(() => `lower(description) LIKE ? OR lower(merchant) LIKE ?`).join(' OR ');
  const keywordParams: string[] = [];
  for (const keyword of travelKeywords) {
    const p = `%${keyword}%`;
    keywordParams.push(p, p);
  }

  // Exclude future-dated rows and default to last 365 days
  let dateClause = 'AND date <= date(\'now\') AND date >= date(\'now\',\'-365 day\')';
  const params: any[] = [userId, ...categoryParams, ...keywordParams];
  if (from || to) {
    dateClause = 'AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)';
    params.push(from ?? null, from ?? null, to ?? null, to ?? null);
  }

  const sql = `SELECT date, description, merchant, amount, category
               FROM transactions
               WHERE user_id = ? AND (
                 (${categoryClause}) OR
                 (${keywordClause})
               ) ${dateClause} AND amount < 0
               ORDER BY date ASC`;

  const rows = await (await import('../sqlite/init')).query(sql, params);
  const total = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);

  let md = `### Trip & Travel Spending Analysis
**Total travel expenses:** $${total.toFixed(2)}
**Transactions found:** ${rows.length}
**Date range:** ${from && to ? `${from} to ${to}` : 'Last 365 days'}

| Date | Category | Merchant | Description | Amount |
|---|---|---|---|---|
`;

  for (const r of rows as any[]) {
    md += `| ${r.date} | ${r.category || ''} | ${r.merchant || ''} | ${r.description || ''} | $${Math.abs(Number(r.amount)).toFixed(2)} |\n`;
  }

  md += `\n💡 **Categories included:** Flights, Hotels, Transportation, Travel, etc.`;
  md += `\n💡 **Keywords detected:** flight, hotel, uber, taxi, airport, etc.`;

  return md;
}

// Trip analysis constrained to a location using strong keyword verification and meta.city
async function analyzeTripSpendForLocation(location: string, from?: string, to?: string): Promise<string> {
  const userId = await (await import('../sqlite/init')).getCurrentUserId();
  // Ensure meta annotations are populated for reliable city detection
  try { await (await import('../sqlite/init')).autoCategorizeAndAnnotate(); } catch {}

  const loc = (location || '').toLowerCase().trim();
  const mapToCityCode = (l: string): string => {
    if (l.includes('new york') || l === 'ny' || l === 'nyc') return 'NY';
    if (l.includes('san francisco') || l === 'sf' || l === 'sfo') return 'SF';
    if (l.includes('los angeles') || l === 'la' || l === 'lax') return 'LA';
    if (l.includes('seattle') || l === 'sea') return 'SEA';
    if (l.includes('austin') || l === 'aus') return 'AUS';
    if (l.includes('boston') || l === 'bos') return 'BOS';
    if (l.includes('mumbai') || l === 'bom') return 'Mumbai';
    return l.toUpperCase();
  };
  const cityCode = mapToCityCode(loc);

  const nyStrong = ['new york', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'mta', 'jfk', 'lga', 'ewr', 'liberty'];
  const sfStrong = ['san francisco', 'sf', 'sfo', 'bart', 'muni', 'caltrain', 'waymo', 'clipper'];
  const strongKeywords = cityCode === 'NY' ? nyStrong
    : cityCode === 'SF' ? sfStrong
    : [loc];
  const antiKeywords = cityCode === 'NY' ? sfStrong
    : cityCode === 'SF' ? nyStrong
    : [];

  // Exclude future-dated rows by default; honor explicit range when provided
  let dateClause = 'AND date <= date(\'now\') AND date >= date(\'now\',\'-365 day\')';
  const params: any[] = [userId];
  if (from || to) {
    dateClause = 'AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)';
    params.push(from ?? null, from ?? null, to ?? null, to ?? null);
  }

  // Verification via strong keywords OR meta.city equals target city code
  const verifyClause = strongKeywords.map(() => `lower(coalesce(description,'')) LIKE ? OR lower(coalesce(merchant,'')) LIKE ?`).join(' OR ');
  const verifyParams: string[] = [];
  for (const k of strongKeywords) { const p = `%${k}%`; verifyParams.push(p, p); }

  // Anti-verification: exclude rows that strongly indicate other cities
  const antiClause = antiKeywords.length > 0
    ? 'AND NOT ( ' + antiKeywords.map(() => `lower(coalesce(description,'')) LIKE ? OR lower(coalesce(merchant,'')) LIKE ?`).join(' OR ') + ' )'
    : '';
  const antiParams: string[] = [];
  for (const k of antiKeywords) { const p = `%${k}%`; antiParams.push(p, p); }

  // Use meta.city LIKE when present
  const metaCityLike = `%\"city\":\"${cityCode}\"%`;

  const sql = `SELECT date, description, merchant, amount, category, meta
               FROM transactions
               WHERE user_id = ? AND amount < 0 ${dateClause}
                 AND ( ((${verifyClause})) OR (coalesce(meta,'') LIKE ?) )
                 ${antiClause}
               ORDER BY date ASC`;

  const rows = await (await import('../sqlite/init')).query(sql, [...params, ...verifyParams, metaCityLike, ...antiParams]);

  const total = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);

  let md = `### Trip Spending (Location-Verified)
**Location:** ${location}
**Total expenses:** $${total.toFixed(2)}
**Transactions found:** ${rows.length}
**Date range:** ${from && to ? `${from} to ${to}` : 'Last 365 days'}

| Date | Category | Merchant | Description | Amount |
|---|---|---|---|---|
`;
  for (const r of rows as any[]) {
    md += `| ${r.date} | ${r.category || ''} | ${r.merchant || ''} | ${r.description || ''} | $${Math.abs(Number(r.amount)).toFixed(2)} |\n`;
  }
  md += `\n🔎 Verified using strong location keywords and meta.city to avoid cross-city leakage.`;
  return md;
}

// Detect likely trip date ranges by scanning travel-related rows and grouping contiguous days
async function detectTripRanges(location?: string, limit = 3, monthsBack = 12): Promise<Array<{ start: string; end: string; days: number; spend: number; txCount: number; confidence: number }>> {
  const userId = await (await import('../sqlite/init')).getCurrentUserId();
  const fromIso = new Date(Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = await (await import('../sqlite/init')).query(
    `SELECT date, description, merchant, amount, category
     FROM transactions
     WHERE user_id = ? AND amount < 0 AND date >= ? AND date <= date('now')
     ORDER BY date ASC`,
    [userId, fromIso]
  );
  type Row = { date: string; description?: string; merchant?: string; amount: number; category?: string };
  const travelCategories = ['Travel', 'Flights', 'Hotels', 'Transportation', 'Transport', 'Lodging', 'Taxi', 'Rideshare'];
  const keywordStrong = ['flight', 'airport', 'hotel', 'airbnb', 'lodging'];
  const keywordWeak = ['uber', 'lyft', 'taxi', 'rental', 'train', 'bus', 'travel', 'trip', 'vacation'];
  const locationKeys = (() => {
    const l = (location || '').toLowerCase();
    if (!l) return [] as string[];
    if (l.includes('new york') || l === 'ny' || l === 'nyc') return ['ny', 'nyc', 'new york', 'manhattan', 'brooklyn', 'queens', 'bronx'];
    if (l.includes('los angeles') || l === 'la') return ['la', 'los angeles', 'lax', 'hollywood'];
    return [l];
  })();

  const dayStats = new Map<string, { score: number; spend: number; txCount: number }>();
  for (const r of rows as Row[]) {
    const date = r.date;
    const text = `${(r.description || '').toLowerCase()} ${(r.merchant || '').toLowerCase()}`;
    let score = 0;
    const cat = String(r.category || '').toLowerCase();
    if (travelCategories.some(c => cat.includes(c.toLowerCase()))) score += 3;
    if (keywordStrong.some(k => text.includes(k))) score += 2;
    if (keywordWeak.some(k => text.includes(k))) score += 1;
    if (locationKeys.some(k => text.includes(k))) score += 2;
    const s = dayStats.get(date) || { score: 0, spend: 0, txCount: 0 };
    s.score += score;
    s.spend += Math.abs(Number(r.amount || 0));
    s.txCount += 1;
    dayStats.set(date, s);
  }
  const days = Array.from(dayStats.keys()).sort();
  const results: Array<{ start: string; end: string; days: number; spend: number; txCount: number; confidence: number }> = [];
  let i = 0;
  function dateToTime(d: string): number { return new Date(d + 'T00:00:00Z').getTime(); }
  function addDays(d: string, n: number): string { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0,10); }
  while (i < days.length) {
    const start = days[i];
    let end = start;
    let spend = 0;
    let tx = 0;
    let scoreSum = 0;
    while (i < days.length) {
      const d = days[i];
      const prevTime = dateToTime(end);
      const thisTime = dateToTime(d);
      const gapDays = Math.round((thisTime - prevTime) / (24*60*60*1000));
      if (d !== start && gapDays > 2) break; // break sequence if more than 2-day gap
      const st = dayStats.get(d)!;
      spend += st.spend;
      tx += st.txCount;
      scoreSum += st.score;
      end = d;
      i++;
      // advance contiguous run; if next is adjacent continue; else decide in next loop
      const next = days[i];
      if (!next) break;
    }
    const numDays = Math.max(1, Math.round((dateToTime(end) - dateToTime(start)) / (24*60*60*1000)) + 1);
    if (scoreSum >= 3 || (numDays >= 2 && scoreSum >= 2)) {
      // expand by one day before/after when present for continuity
      const before = dayStats.has(addDays(start, -1));
      const after = dayStats.has(addDays(end, 1));
      const finalStart = before ? addDays(start, -1) : start;
      const finalEnd = after ? addDays(end, 1) : end;
      const confidence = Math.min(1, (scoreSum / (numDays * 3)) + (spend > 0 ? 0.15 : 0));
      results.push({ start: finalStart, end: finalEnd, days: numDays + (before?1:0) + (after?1:0), spend: Number(spend.toFixed(2)), txCount: tx, confidence: Number(confidence.toFixed(2)) });
    }
    // if sequence was too weak, continue scanning (i already advanced)
  }
  results.sort((a, b) => (b.confidence - a.confidence) || (b.spend - a.spend) || (b.txCount - a.txCount));
  return results.slice(0, limit);
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
               WHERE user_id = ? AND (date >= date('now','-180 day')) AND (${likeClauses}) AND amount < 0
               ORDER BY date ASC`;
  const userId = await (await import('../sqlite/init')).getCurrentUserId();
  params.unshift(userId);
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

// Enhanced heuristic analysis with location detection and trip analysis
async function smartHeuristicAnalysis(question: string): Promise<string> {
  try { console.debug('[agent] smartHeuristicAnalysis for question:', question); } catch {}

  const question_lower = question.toLowerCase();

  // Location-based queries (NY, NYC, New York, etc.)
  if (/(\bnyc\b|new\s*york|\bny\b)/i.test(question)) {
    // Use strong signals for NYC; avoid plain 'ny' substring matches like 'company'
    return await analyzeLocationSpend(question, ['new york', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'mta', 'jfk', 'lga', 'ewr']);
  }

  // Trip-related queries
  if (question_lower.includes('trip') || question_lower.includes('travel') || question_lower.includes('vacation')) {
    // Try to detect a location in the question first (e.g., ny, nyc, new york, sf)
    const locationTokens = ['new york', 'nyc', ' ny ', ' sf ', 'san francisco', 'los angeles', 'la ', 'seattle', 'austin', 'boston'];
    const matchedLoc = locationTokens.find(tok => question_lower.includes(tok));
    if (matchedLoc) {
      const loc = matchedLoc.trim();
      const ranges = await detectTripRanges(loc, 3, 12);
      if (ranges && ranges.length > 0) {
        const best = ranges[0];
        return await analyzeTripSpendForLocation(loc, best.start, best.end);
      }
      // Fallback: location-verified without explicit range
      return await analyzeTripSpendForLocation(loc);
    }

    const ranges = await detectTripRanges(undefined, 3, 12);
    if (ranges && ranges.length > 0) {
      const best = ranges[0];
      const md = await analyzeTripSpendWithDateRange(best.start, best.end);
      const alt = ranges.slice(1).map(r => `- ${r.start} → ${r.end} (${r.days} days, ${r.txCount} tx, $${r.spend.toFixed(2)})`).join('\n');
      return md + (alt ? `\n\nOther possible trips:\n${alt}` : '');
    }
    return await analyzeTripSpendWithDateRange(undefined, undefined);
  }

  // General spending queries with enhanced analysis
  if (question_lower.includes('spend') || question_lower.includes('spent') || question_lower.includes('cost') || question_lower.includes('expense')) {
    const locMatch = question_lower.match(/in\s+([a-z\s]+)/i);
    const loc = locMatch ? locMatch[1].trim() : '';
    if (loc) {
      const ranges = await detectTripRanges(loc, 3, 12);
      if (ranges && ranges.length > 0) {
        const best = ranges[0];
        return await analyzeLocationSpend(`Location analysis for ${loc}`, [loc], best.start, best.end);
      }
    }
    return await analyzeGeneralSpend(question);
  }

  // Fallback to basic heuristic
  return await heuristicSpend(question);
}

// (Removed duplicate analyzeLocationSpend without date range)

// Analyze trip-related spending
async function analyzeTripSpend(question: string): Promise<string> {
  const userId = await (await import('../sqlite/init')).getCurrentUserId();

  // Look for travel-related categories and keywords
  const travelCategories = ['Travel', 'Flights', 'Hotels', 'Transportation', 'Transport', 'Airbnb', 'Uber', 'Lyft', 'Taxi', 'Rental Car'];
  const categoryClause = travelCategories.map(() => `lower(category) LIKE ?`).join(' OR ');
  const categoryParams = travelCategories.map(cat => `%${cat.toLowerCase()}%`);

  // Also look for travel-related keywords in descriptions
  const travelKeywords = ['flight', 'hotel', 'airbnb', 'uber', 'lyft', 'taxi', 'rental', 'train', 'bus', 'airport', 'travel', 'trip', 'vacation'];
  const keywordClause = travelKeywords.map(() => `lower(description) LIKE ? OR lower(merchant) LIKE ?`).join(' OR ');
  const keywordParams: string[] = [];
  for (const keyword of travelKeywords) {
    const p = `%${keyword}%`;
    keywordParams.push(p, p);
  }

  const sql = `SELECT date, description, merchant, amount, category
               FROM transactions
               WHERE user_id = ? AND (
                 (${categoryClause}) OR
                 (${keywordClause})
               ) AND amount < 0 AND date <= date('now') AND date >= date('now','-365 day')
               ORDER BY date ASC`;

  const params = [userId, ...categoryParams, ...keywordParams];
  const rows = await (await import('../sqlite/init')).query(sql, params);
  const total = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);

  let md = `### Trip & Travel Spending Analysis
**Total travel expenses:** $${total.toFixed(2)}
**Transactions found:** ${rows.length}

| Date | Category | Merchant | Description | Amount |
|---|---|---|---|---|
`;

  for (const r of rows as any[]) {
    md += `| ${r.date} | ${r.category || ''} | ${r.merchant || ''} | ${r.description || ''} | $${Math.abs(Number(r.amount)).toFixed(2)} |\n`;
  }

  md += `\n💡 **Categories included:** Flights, Hotels, Transportation, Travel, etc.`;
  md += `\n💡 **Keywords detected:** flight, hotel, uber, taxi, airport, etc.`;

  return md;
}

// Enhanced general spending analysis
async function analyzeGeneralSpend(question: string): Promise<string> {
  const tokens = tokenize(question);

  if (tokens.length === 0) {
    const total = await AgentTools.totalSpend({});
    return `### Total Spending
**All expenses:** $${Number(total).toFixed(2)}

To get more specific analysis, try questions like:
- "How much did I spend on groceries?"
- "NY trip expenses"
- "Coffee spending this month"`;
  }

  // Use existing search functionality with better formatting
  const likeClauses = tokens.map(() => `lower(coalesce(description,'')) LIKE ? OR lower(coalesce(merchant,'')) LIKE ?`).join(' OR ');
  const params: any[] = [];
  for (const t of tokens) { const p = `%${t}%`; params.push(p, p); }

  const userId = await (await import('../sqlite/init')).getCurrentUserId();
  const sql = `SELECT date, description, merchant, amount, category
               FROM transactions
               WHERE user_id = ? AND (${likeClauses}) AND amount < 0 AND date >= date('now','-180 day')
               ORDER BY date ASC`;
  params.unshift(userId);

  const rows = await (await import('../sqlite/init')).query(sql, params);
  const sum = (rows as any[]).reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);

  let md = `### Spending Analysis
**Search terms:** ${tokens.map(t => '`' + t + '`').join(' ')}
**Total spent:** $${sum.toFixed(2)}
**Transactions found:** ${rows.length}

| Date | Category | Merchant | Description | Amount |
|---|---|---|---|---|
`;

  const sample = (rows as any[]).slice(0, 15); // Show more results
  for (const r of sample) {
    md += `| ${r.date} | ${r.category || ''} | ${r.merchant || ''} | ${r.description || ''} | $${Math.abs(Number(r.amount)).toFixed(2)} |\n`;
  }

  if (rows.length > sample.length) {
    md += `\n… and ${rows.length - sample.length} more transactions.`;
  }

  return md;
}

export async function runFinanceAgent(question: string): Promise<string> {
  const cfg = loadLLMConfig();
  // Fast intent path: handle clear location/trip queries locally to reduce latency
  const ql = (question || '').toLowerCase();
  const fastIntent = /(\bnyc\b|new\s*york|\bny\b|\bsf\b|san\s*francisco|\btrip\b|travel|vacation)/i.test(question);
  if (!cfg || fastIntent) {
    // Use local heuristics either when no LLM config or when the intent is clear
    return await smartHeuristicAnalysis(question);
  }

  // For non-OpenAI vendors, use heuristic analysis with enhanced location detection
  if (cfg.vendor !== 'openai') {
    try { console.debug('[agent] using heuristic analysis for', cfg.vendor); } catch {}
    return await smartHeuristicAnalysis(question);
  }

  const messages: any[] = [
    { role: 'system', content: `${systemPrompt}

**Enhanced Analysis & Split Tools Available:**
- **calculator**: Perform any arithmetic (add, sub, mul, div, sum, avg, round, percentOf, percentChange, formatCurrency). You MUST use this for any math.
- **analyze_location_spend**: For location-based queries (NYC, New York, etc.) using strong keywords (avoid plain 'ny')
- **analyze_trip_spend**: For travel/trip expense analysis - detects flights, hotels, transportation, etc.
- **analyze_trip_spend_for_location**: For location-verified trip analysis using strong keywords and meta.city
- **monthly_spend_trend**: For income vs spending trends over time
- **category_deep_dive**: For detailed category analysis with patterns and trends
- **search_transactions**: For general transaction searches with date ranges
- **spend_by_category**: For category-based spending breakdowns
- **total_spend**: For total spending calculations

Splitwise-like tools (shared expenses):
- **split_record_expense_smart**: Given an intent (participants, optional image base64, subset vs all rules), extract items and record an itemized expense into an existing or new group.
- **split_preview**: Preview how an amount would be split among a group for a split type and options.
- **split_balances**: Get per-member balances for a group.
- **split_simplify**: Suggest minimal payments to settle up.

**Smart Query Detection:**
- Location queries (NYC, New York, etc.) → Use analyze_location_spend
- Trip/travel questions → Use analyze_trip_spend
- Trip + location (e.g., "NY trip") → Prefer analyze_trip_spend_for_location with a date range
- Monthly/yearly trends → Use monthly_spend_trend
- Category-specific analysis → Use category_deep_dive
- General spending questions → Use appropriate tool based on context

For receipt photos and split instructions (e.g., "split sushi with me + YJ only; rest with all three"), call split_record_expense_smart with the image (base64) and participant directives. If an appropriate group does not exist, ask or create a new one when the intent allows.

Respond with structured Markdown tables and clear summaries. Never perform arithmetic yourself; always call tools (calculator or data aggregations) when producing numbers.` },
    { role: 'user', content: question }
  ];

  // Loop up to a few turns until content is produced
  let mathEnforcementWarnings = 0;
  for (let i = 0; i < 6; i++) {
    try { console.debug('[agent] turn', i, 'sending to model'); } catch {}
    try {
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
          try {
            const name = call.function?.name as string;
            const args = (() => { try { return JSON.parse(call.function?.arguments || '{}'); } catch { return {}; } })();
            try { console.debug('[agent] executing', name, args); } catch {}

            const result = await execTool(name, args);
            messages.push({ role: 'assistant', tool_calls: [call] });
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
          } catch (toolError: any) {
            // Log tool error but continue with other tools
            try { console.error('[agent] tool execution error:', toolError); } catch {}
            messages.push({ role: 'assistant', tool_calls: [call] });
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: toolError.message || 'Tool execution failed' }) });
          }
        }
        continue; // ask model again with tool results
      }

      const content = msg?.content?.trim();
      if (content) {
        // Enforcement: if numeric-looking answer returned without ANY tool usage, re-prompt to use tools
        const hasAnyToolResults = messages.some((m: any) => m?.role === 'tool');
        const numericInContent = /[$]?\d[\d,]*(?:\.\d+)?%?/.test(content);
        const mathyQuestion = /(how\s+much|total|sum|add|plus|minus|difference|average|avg|percent|increase|decrease|net|spend|spent|cost|price|delta)/i.test(question);
        if (!hasAnyToolResults && numericInContent && mathyQuestion && mathEnforcementWarnings < 2) {
          mathEnforcementWarnings++;
          messages.push({ role: 'system', content: 'You MUST use tools for any numeric results. Do not compute in your head. Call calculator and/or data tools, then summarize using those outputs.' });
          continue; // ask model again
        }
        return content;
      }

    } catch (fetchError: any) {
      // If it's a rate limit or temporary error, wait and retry
      if (fetchError.message.includes('429') && i < 3) {
        try { console.warn('[agent] rate limited, waiting before retry'); } catch {}
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
        continue;
      }
      // For other errors, break and use fallback
      try { console.error('[agent] API error:', fetchError); } catch {}
      break;
    }
  }

  // Enhanced fallback: try smart heuristic analysis first, then basic heuristic
  try { console.warn('[agent] falling back to heuristic analysis'); } catch {}
  try {
    return await smartHeuristicAnalysis(question);
  } catch (heuristicError) {
    try { console.error('[agent] heuristic analysis failed:', heuristicError); } catch {}
    return heuristicSpend(question);
  }
}



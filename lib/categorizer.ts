export type CategorizerMeta = {
  payment_method?: string;
  city?: string;
  is_subscription?: boolean;
  canonical_merchant?: string;
  category_confidence?: number; // 0..1
  source?: 'heuristic' | 'rule' | 'llm';
  user_overridden?: boolean;
};

export type CategorizerInput = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant?: string;
  category?: string | null;
  existingMeta?: string | null;
};

export type CategorizerOutput = {
  category?: string;
  meta: CategorizerMeta;
};

function toUpperAscii(input: string): string {
  return (input || '').normalize('NFKD').toUpperCase();
}

function canonicalizeMerchant(description: string): string {
  // Remove numbers, order IDs, extra whitespace and common tokens
  const upper = toUpperAscii(description);
  const cleaned = upper
    .replace(/\d{2,}/g, ' ') // numbers
    .replace(/[#_*\-]{2,}/g, ' ') // decorations
    .replace(/\s{2,}/g, ' ') // dup spaces
    .trim();
  return cleaned;
}

function detectPaymentMethod(source: string): string | undefined {
  const s = toUpperAscii(source);
  if (/(ZELLE)/.test(s)) return 'Zelle';
  if (/(VENMO)/.test(s)) return 'Venmo';
  if (/(PAYPAL|PP\s*\*)/.test(s)) return 'PayPal';
  if (/(APPLE\s*PAY)/.test(s)) return 'Apple Pay';
  if (/(GOOGLE\s*PAY|GPAY)/.test(s)) return 'Google Pay';
  if (/(ACH|ELECTRONIC PAYMENT)/.test(s)) return 'ACH';
  if (/(DEBIT\s*CARD|POS)/.test(s)) return 'Debit Card';
  if (/(CREDIT\s*CARD)/.test(s)) return 'Credit Card';
  return undefined;
}

const CITY_MAP: Array<[RegExp, string]> = [
  [/\b(NY|NYC|NEW\s*YORK|BROOKLYN|QUEENS|MANHATTAN|BRONX|STATEN\s*ISLAND)\b/, 'NY'],
  [/\b(SF|SFO|SAN\s*FRANCISCO)\b/, 'SF'],
  [/\b(LA|LOS\s*ANGELES)\b/, 'LA'],
  [/\b(SEA|SEATTLE)\b/, 'SEA'],
  [/\b(AUS|AUSTIN)\b/, 'AUS'],
  [/\b(BOS|BOSTON)\b/, 'BOS'],
  [/\b(MUMBAI|BOM)\b/, 'Mumbai'],
];

function detectCity(source: string): string | undefined {
  const s = toUpperAscii(source);
  for (const [re, city] of CITY_MAP) {
    if (re.test(s)) return city;
  }
  return undefined;
}

// Curated category regexes
const CATEGORY_PATTERNS: Array<{ re: RegExp; category: string; confidence: number }> = [
  // Travel / Transport
  // Important: Uber Eats is Food, not Travel
  { re: /(UBER\s*EATS|EATS\s*HELP\s*UBER\.COM)/i, category: 'Food', confidence: 0.98 },
  { re: /(UBER|LYFT|VIA|TAXI|CAB)/i, category: 'Travel', confidence: 0.95 },
  { re: /(MTA|BART|MUNI|CALTRAIN|SUBWAY|METRO)/i, category: 'Travel', confidence: 0.9 },
  { re: /(DELTA|UNITED|AMERICAN AIR|SOUTHWEST|JETBLUE|ALASKA|AIRLINES)/i, category: 'Travel', confidence: 0.95 },
  { re: /(HOTEL|MOTEL|MARRIOTT|HILTON|HYATT|AIRBNB)/i, category: 'Travel', confidence: 0.9 },
  { re: /(HERTZ|AVIS|ENTERPRISE|BUDGET|TURO)/i, category: 'Travel', confidence: 0.9 },
  { re: /(EZ\s*PASS|FASTRAK|TOLL)/i, category: 'Transport', confidence: 0.9 },
  { re: /(SHELL|CHEVRON|MOBIL|BP|EXXON|GAS|FUEL)/i, category: 'Transport', confidence: 0.85 },

  // Food / Coffee / Dining
  { re: /(STARBUCKS|BLUE\s*BOTTLE|PEET\'?S?)/i, category: 'Coffee', confidence: 0.95 },
  { re: /(CHIPOTLE|SHAKE\s*SHACK|MCDONALD|BURGER|TACO|PIZZA|BBQ|RESTAURANT|DINER|CAFE)/i, category: 'Food', confidence: 0.85 },

  // Groceries
  { re: /(TRADER\s*JOE|WHOLE\s*FOODS|COSTCO|SAFEWAY|KROGER|ALDI|WALMART\s*GROC|SMART\s*AND\s*FINAL)/i, category: 'Groceries', confidence: 0.95 },

  // Subscriptions
  { re: /(SPOTIFY|NETFLIX|HULU|DISNEY|YOUTUBE\s*PREMIUM|APPLE\s*ONE|ICLOUD|GOOGLE\s*ONE|AMAZON\s*PRIME|DROPBOX|NOTION|FIGMA|BOLD\s*VOICE)/i, category: 'Subscriptions', confidence: 0.98 },

  // Utilities
  { re: /(PG&E|PGE|CONED|XFINITY|COMCAST|AT&T|VERIZON|SPECTRUM|T[- ]?MOBILE)/i, category: 'Utilities', confidence: 0.9 },

  // Entertainment
  { re: /(AMC|CINEMA|THEATRE|IMAX|MOVIE)/i, category: 'Entertainment', confidence: 0.85 },

  // Cash / Banking
  { re: /(ATM\s*WITHDRAWAL|CASH\s*WITHDRAWAL)/i, category: 'Cash Withdrawal', confidence: 0.95 },
  { re: /(INTEREST\s*PAYMENT|INTEREST\s*PAID)/i, category: 'Income', confidence: 0.9 },
  { re: /(PAYROLL|SALARY|DIRECT\s*DEPOSIT)/i, category: 'Income', confidence: 0.95 },
  { re: /(RENT|LANDLORD|PROPERTY\s*MANAGE)/i, category: 'Rent', confidence: 0.9 },

  // P2P transfers / Friends & Family / Roommate
  { re: /(ZELLE|VENMO).*\b(NIDHI|VAISHNAVI|RAHUL)\b/i, category: 'Friends & Family', confidence: 0.98 },
  { re: /(ZELLE|VENMO).*\b(YJ|Y\s*J)\b/i, category: 'Roommate', confidence: 0.98 },
  { re: /(ZELLE\s*PAYMENT\s*(TO|FROM)|VENMO|PAYPAL\s*PERSONAL)/i, category: 'Friends & Family', confidence: 0.92 },
];

function detectSubscription(input: CategorizerInput, canonical: string): boolean {
  // Heuristic: known subscription merchants OR small positive/negative repeated charges will be handled later by analytics
  return /(SPOTIFY|NETFLIX|HULU|DISNEY|YOUTUBE\s*PREMIUM|APPLE\s*ONE|ICLOUD|GOOGLE\s*ONE|AMAZON\s*PRIME|DROPBOX|NOTION|FIGMA|BOLD\s*VOICE)/i.test(
    canonical
  );
}

function matchCategory(canonical: string): { category?: string; confidence: number } {
  for (const { re, category, confidence } of CATEGORY_PATTERNS) {
    if (re.test(canonical)) return { category, confidence };
  }
  return { category: undefined, confidence: 0 };
}

export function categorizeInput(input: CategorizerInput): CategorizerOutput {
  const source = `${input.merchant || ''} ${input.description || ''}`.trim();
  const canonical = canonicalizeMerchant(source);
  const payment_method = detectPaymentMethod(source);
  const city = detectCity(source);
  const is_subscription = detectSubscription(input, canonical);
  const { category, confidence } = matchCategory(canonical);

  // Merge with any existing meta
  let existing: CategorizerMeta | undefined;
  try {
    if (input.existingMeta) existing = JSON.parse(input.existingMeta) as CategorizerMeta;
  } catch {
    existing = undefined;
  }

  const meta: CategorizerMeta = {
    ...existing,
    payment_method: existing?.payment_method || payment_method,
    city: existing?.city || city,
    is_subscription: existing?.is_subscription ?? is_subscription,
    canonical_merchant: existing?.canonical_merchant || canonical,
    category_confidence: Math.max(existing?.category_confidence || 0, confidence || 0),
    source: existing?.source || 'heuristic',
    user_overridden: existing?.user_overridden || false,
  };

  // If the input already has a category, do not override it; just carry meta forward
  const resultCategory = input.category && input.category.trim() !== '' ? undefined : category;

  return {
    category: resultCategory,
    meta,
  };
}

export function toStableMetaJson(meta: CategorizerMeta): string {
  // Keep a stable key order for reliable LIKE filtering on specific keys
  const ordered: CategorizerMeta = {
    canonical_merchant: meta.canonical_merchant,
    payment_method: meta.payment_method,
    city: meta.city,
    is_subscription: meta.is_subscription,
    category_confidence: meta.category_confidence,
    user_overridden: meta.user_overridden,
    source: meta.source,
  };
  return JSON.stringify(ordered);
}



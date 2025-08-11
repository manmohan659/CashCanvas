// NOTE: Avoid top-level import of 'sql.js' to prevent SSR bundling issues.

// Minimal DB interface used by the app context
export interface Database {
  exec: (sql: string) => Promise<any[]>;
  upsert: (table: string, data: any) => Promise<any>;
}

let sqlJsDb: any | null = null;
let initPromise: Promise<any> | null = null;
let ftsAvailable = false;
import { categorizeInput, toStableMetaJson } from '../categorizer';

const LOCAL_STORAGE_KEY = 'cashcanvas_sqlite_db_v1';

function encodeToBase64(buffer: Uint8Array): string {
  if (typeof window === 'undefined') {
    // Node
    // @ts-ignore
    return Buffer.from(buffer).toString('base64');
  }
  let binary = '';
  const bytes = buffer;
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function decodeFromBase64(base64: string): Uint8Array {
  if (typeof window === 'undefined') {
    // Node
    // @ts-ignore
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function loadFromLocalStorage(): Uint8Array | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const base64 = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!base64) return null;
    return decodeFromBase64(base64);
  } catch {
    return null;
  }
}

function saveToLocalStorage(db: any) {
  try {
    if (typeof localStorage === 'undefined') return;
    const data = db.export();
    const base64 = encodeToBase64(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, base64);
  } catch {
    // ignore persistence errors
  }
}

let persistTimeout: any = null;
function schedulePersist() {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    if (sqlJsDb) saveToLocalStorage(sqlJsDb);
  }, 500);
}

async function getSqlJsDb(): Promise<any> {
  if (sqlJsDb) return sqlJsDb;
  if (!initPromise) {
    initPromise = (async () => {
      const sqljs = await import('sql.js');
      const SQL = await sqljs.default({
        // Prefer local asset in browser for reliability; filesystem path in Node
        locateFile: (file: string) =>
          typeof window === 'undefined'
            ? `${process.cwd()}/node_modules/sql.js/dist/${file}`
            : `/sql-wasm.wasm`,
      });
      const existing = loadFromLocalStorage();
      const db = existing ? new SQL.Database(existing) : new SQL.Database();
      sqlJsDb = db;
      await createSchemaIfNeeded();
      // Seed demo data on first run if DB is empty (browser only)
      try { await seedDemoDataIfEmpty(); } catch {}
      return db;
    })();
  }
  return initPromise;
}

async function createSchemaIfNeeded() {
  if (!sqlJsDb) return;
  // Base tables
  sqlJsDb.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      email TEXT,
      phone TEXT,
      avatar_url TEXT,
      supabase_user_id TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT,
      amount REAL,
      category TEXT,
      description TEXT,
      merchant TEXT
    );
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      balance REAL,
      currency TEXT
    );
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      file_name TEXT,
      file_hash TEXT,
      import_source TEXT,
      import_batch TEXT,
      parsed_count INTEGER,
      suspicious_count INTEGER,
      debits_total REAL,
      credits_total REAL,
      net_total REAL,
      period_start TEXT,
      period_end TEXT,
      created_at TEXT,
      warnings TEXT
    );
  `);

  // Conditional migrations: add user_id columns if missing
  await ensureColumnExists('transactions', "user_id TEXT");
  await ensureColumnExists('transactions', "meta TEXT");
  await ensureColumnExists('transactions', "import_source TEXT");
  await ensureColumnExists('transactions', "import_batch TEXT");
  await ensureColumnExists('rules', "user_id TEXT");
  await ensureColumnExists('accounts', "user_id TEXT");

  // Helpful indexes
  sqlJsDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_tx_user_category ON transactions(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_imports_user_hash ON imports(user_id, file_hash);
    CREATE INDEX IF NOT EXISTS idx_imports_batch ON imports(import_batch);
  `);

  // Optional full-text search index (FTS5). If not supported, we silently skip.
  try {
    sqlJsDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS tx_fts USING fts5(
        description, merchant, category,
        content='transactions', content_rowid='rowid'
      );
    `);
    // Keep FTS index in sync via triggers
    sqlJsDb.exec(`
      CREATE TRIGGER IF NOT EXISTS tx_ai AFTER INSERT ON transactions BEGIN
        INSERT INTO tx_fts(rowid, description, merchant, category)
        VALUES (new.rowid, new.description, new.merchant, new.category);
      END;
      CREATE TRIGGER IF NOT EXISTS tx_ad AFTER DELETE ON transactions BEGIN
        INSERT INTO tx_fts(tx_fts, rowid, description, merchant, category)
        VALUES ('delete', old.rowid, old.description, old.merchant, old.category);
      END;
      CREATE TRIGGER IF NOT EXISTS tx_au AFTER UPDATE ON transactions BEGIN
        INSERT INTO tx_fts(tx_fts, rowid, description, merchant, category)
        VALUES ('delete', old.rowid, old.description, old.merchant, old.category);
        INSERT INTO tx_fts(rowid, description, merchant, category)
        VALUES (new.rowid, new.description, new.merchant, new.category);
      END;
    `);
    // Initial (re)build in case table already has rows
    sqlJsDb.exec(`INSERT INTO tx_fts(tx_fts) VALUES ('rebuild');`);
    ftsAvailable = true;
  } catch {
    ftsAvailable = false;
  }

  // Seed default user and current user setting; backfill user_id on existing rows
  await ensureDefaultUserAndBackfill();
}

async function ensureColumnExists(table: string, columnDef: string): Promise<void> {
  const [columnName] = columnDef.split(/\s+/);
  const rows = sqlJsDb!.exec(`PRAGMA table_info(${table})`);
  const existing = mapRows(rows).some((r) => r.name === columnName);
  if (!existing) {
    sqlJsDb!.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

async function ensureDefaultUserAndBackfill(): Promise<void> {
  // Create default user if not exists
  sqlJsDb!.exec(`
    INSERT OR IGNORE INTO users (id, display_name, created_at)
    VALUES ('local_default', 'Local User 1', datetime('now'));
  `);
  // Ensure current user setting exists
  sqlJsDb!.exec(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES ('current_user_id', 'local_default');
  `);
  // Backfill user_id on existing rows
  sqlJsDb!.exec(`
    UPDATE transactions SET user_id='local_default' WHERE user_id IS NULL;
    UPDATE rules        SET user_id='local_default' WHERE user_id IS NULL;
    UPDATE accounts     SET user_id='local_default' WHERE user_id IS NULL;
  `);
}

function mapRows(results: any[]): any[] {
  if (!results || results.length === 0) return [];
  const res = results[0];
  const cols = res.columns;
  return res.values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    row.forEach((val: any, idx: number) => {
      obj[cols[idx]] = val;
    });
    return obj;
  });
}

export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const db = await getSqlJsDb();
  const stmt = db.prepare(sql);
  stmt.bind(params as unknown as any);
  const rows: any[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push(row);
  }
  stmt.free();
  return rows;
}

/**
 * Modular search utility. Uses FTS5 if available, otherwise falls back to LIKE.
 * Returns rows ordered by date desc (and FTS rank when applicable).
 */
export async function searchTransactions(
  userId: string,
  searchText: string,
  limit: number,
  offset: number
): Promise<any[]> {
  const s = (searchText || '').trim();
  if (!s) {
    return query(
      `SELECT id, date, description, merchant, amount, category
       FROM transactions
       WHERE user_id = ?
       ORDER BY date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  }

  if (ftsAvailable) {
    // Use FTS to search text columns; join back to transactions for other fields
    return query(
      `SELECT t.id, t.date, t.description, t.merchant, t.amount, t.category
       FROM tx_fts f
       JOIN transactions t ON t.rowid = f.rowid
       WHERE t.user_id = ? AND f MATCH ?
       ORDER BY t.date DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [userId, s, limit, offset]
    );
  }

  const like = `%${s.toLowerCase()}%`;
  return query(
    `SELECT id, date, description, merchant, amount, category
     FROM transactions
     WHERE user_id = ? AND (
       lower(coalesce(description,'')) LIKE ? OR
       lower(coalesce(merchant,'')) LIKE ? OR
       lower(coalesce(category,'')) LIKE ?
     )
     ORDER BY date DESC, id DESC
     LIMIT ? OFFSET ?`,
    [userId, like, like, like, limit, offset]
  );
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  const db = await getSqlJsDb();
  const stmt = db.prepare(sql);
  stmt.bind(params as unknown as any);
  while (stmt.step()) {
    // iterate to execute
  }
  stmt.free();
  schedulePersist();
}

async function getPrimaryKeyColumn(table: string): Promise<string> {
  await getSqlJsDb();
  const info = sqlJsDb!.exec(`PRAGMA table_info(${table})`);
  const rows = mapRows(info);
  const pkRow = rows.find((r) => Number(r.pk) === 1);
  return pkRow?.name || 'id';
}

export async function upsertRow(table: string, row: Record<string, any>): Promise<void> {
  const db = await getSqlJsDb();
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(',');
  const pk = await getPrimaryKeyColumn(table);
  const updates = columns
    .filter((c) => c !== pk)
    .map((c) => `${c}=excluded.${c}`)
    .join(',');
  const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`;
  const stmt = db.prepare(sql);
  stmt.bind(columns.map((c) => row[c]) as unknown as any);
  while (stmt.step()) {}
  stmt.free();
  schedulePersist();
}

export async function bulkUpsert(table: string, rows: Record<string, any>[]): Promise<void> {
  const db = await getSqlJsDb();
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      await upsertRow(table, row);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    schedulePersist();
  }
}

export function sha256Hex(input: string): string {
  // Simple deterministic hash (FNV-1a 32-bit) as a lightweight stand-in in browser
  // Not cryptographically secure but adequate for duplicate detection on same device
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `h_${(hash >>> 0).toString(16)}`;
}

export async function recordImportSummary(summary: {
  id?: string;
  user_id: string;
  file_name: string;
  file_hash: string;
  import_source: string;
  import_batch: string;
  parsed_count: number;
  suspicious_count: number;
  debits_total: number;
  credits_total: number;
  net_total: number;
  period_start?: string | null;
  period_end?: string | null;
  warnings?: string[];
}): Promise<string> {
  const id = summary.id || `imp_${Math.random().toString(16).slice(2, 10)}`;
  await upsertRow('imports', {
    id,
    user_id: summary.user_id,
    file_name: summary.file_name,
    file_hash: summary.file_hash,
    import_source: summary.import_source,
    import_batch: summary.import_batch,
    parsed_count: summary.parsed_count,
    suspicious_count: summary.suspicious_count,
    debits_total: summary.debits_total,
    credits_total: summary.credits_total,
    net_total: summary.net_total,
    period_start: summary.period_start || null,
    period_end: summary.period_end || null,
    created_at: new Date().toISOString(),
    warnings: (summary.warnings && summary.warnings.length > 0) ? JSON.stringify(summary.warnings) : null,
  });
  return id;
}

export async function findExistingImportByHash(userId: string, fileHash: string): Promise<any | null> {
  const rows = await query(
    'SELECT id, import_batch, file_name, created_at FROM imports WHERE user_id = ? AND file_hash = ? ORDER BY created_at DESC LIMIT 1',
    [userId, fileHash]
  );
  return rows && rows[0] ? rows[0] : null;
}

export async function getRules(forUserId?: string): Promise<Array<{ id: string; pattern: string; category: string }>> {
  const userId = forUserId || (await getCurrentUserId());
  return query('SELECT id, pattern, category FROM rules WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

export async function insertRule(rule: { id: string; pattern: string; category: string; created_at?: string }): Promise<void> {
  const userId = await getCurrentUserId();
  const payload = {
    ...rule,
    user_id: userId,
    created_at: rule.created_at || new Date().toISOString(),
  };
  await upsertRow('rules', payload);
}

export async function applyRulesToTransactions(): Promise<number> {
  const userId = await getCurrentUserId();
  const rules = await getRules(userId);
  if (rules.length === 0) return 0;
  const uncategorized = await query(
    'SELECT id, description, merchant FROM transactions WHERE (category IS NULL OR category = "") AND user_id = ?',
    [userId]
  );
  let updated = 0;
  for (const tx of uncategorized) {
    const source = `${tx.merchant || ''} ${tx.description || ''}`.trim();
    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(source)) {
          await run('UPDATE transactions SET category = ? WHERE id = ? AND user_id = ?', [rule.category, tx.id, userId]);
          updated++;
          break;
        }
      } catch {
        // bad regex, skip
      }
    }
  }
  return updated;
}

export function generateTransactionId(date: string, description: string, amount: number): string {
  const input = `${date}|${description}|${amount.toFixed(2)}`;
  // Simple FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  // produce hex string id
  return `tx_${(hash >>> 0).toString(16)}`;
}

/**
 * Applies heuristic categorization and annotates meta for transactions that are
 * uncategorized or missing meta. Does not overwrite an existing category.
 * Returns number of rows updated.
 */
export async function autoCategorizeAndAnnotate(): Promise<number> {
  const userId = await getCurrentUserId();
  const rows = await query(
    `SELECT id, date, amount, description, merchant, category, meta
     FROM transactions
     WHERE user_id = ? AND ((category IS NULL OR category = '') OR (meta IS NULL OR meta = ''))`,
    [userId]
  );
  if (!rows || rows.length === 0) return 0;
  let updated = 0;
  for (const r of rows as Array<{ id: string; date: string; amount: number; description: string; merchant?: string; category?: string; meta?: string }>) {
    const result = categorizeInput({
      id: r.id,
      date: r.date,
      amount: Number(r.amount || 0),
      description: r.description || '',
      merchant: r.merchant || '',
      category: r.category || '',
      existingMeta: r.meta || null,
    });
    const metaJson = toStableMetaJson(result.meta);
    // Only update if meta is different or a new category is suggested
    const newCategory = result.category || null;
    try {
      if (newCategory != null) {
        await run(
          'UPDATE transactions SET category = CASE WHEN (category IS NULL OR category = "") THEN ? ELSE category END, meta = ? WHERE id = ? AND user_id = ?',
          [newCategory, metaJson, r.id, userId]
        );
      } else {
        await run('UPDATE transactions SET meta = ? WHERE id = ? AND user_id = ?', [metaJson, r.id, userId]);
      }
      updated++;
    } catch {
      // ignore single-row failures
    }
  }
  return updated;
}

/**
 * Normalizes sign conventions for PDF-imported transactions so that:
 *  - Expenses (charges/purchases) are negative amounts
 *  - Payments/Credits/Refunds are positive amounts
 * Heuristic uses common keyword patterns in the description.
 * Returns number of rows updated.
 */
export async function normalizePdfSigns(): Promise<number> {
  const userId = await getCurrentUserId();
  const rows = await query(
    `SELECT id, amount, description
     FROM transactions
     WHERE user_id = ? AND coalesce(import_source,'') = 'pdf'`,
    [userId]
  );
  if (!rows || rows.length === 0) return 0;
  const creditRegex = /(payment|payment\s+thank\s+you|auto\s?-?pay|autopay|refund|reversal|credit|return|cash\s?back|adjustment)/i;
  let updated = 0;
  for (const r of rows as Array<{ id: string; amount: number; description?: string }>) {
    const desc = (r.description || '').trim();
    const isCredit = creditRegex.test(desc);
    const normalized = isCredit ? Math.abs(Number(r.amount || 0)) : -Math.abs(Number(r.amount || 0));
    if (Number(r.amount) !== normalized) {
      await run('UPDATE transactions SET amount = ? WHERE id = ? AND user_id = ?', [normalized, r.id, userId]);
      updated++;
    }
  }
  return updated;
}

/**
 * Removes duplicate transactions that differ only by sign due to earlier PDF imports.
 * Groups by (date, description, abs(amount)) and retains a single row per group,
 * preferring the negative (expense) entry when present.
 * Returns number of rows deleted.
 */
export async function dedupeTransactionsByDateDescAmount(): Promise<number> {
  const userId = await getCurrentUserId();
  const rows = await query(
    `SELECT id, date, description, amount
     FROM transactions
     WHERE user_id = ?
     ORDER BY date, description`,
    [userId]
  );
  if (!rows || rows.length === 0) return 0;
  type Row = { id: string; date: string; description?: string; amount: number };
  const groups = new Map<string, Row[]>();
  for (const r of rows as Row[]) {
    const key = `${r.date}|${(r.description || '').trim().toLowerCase()}|${Math.abs(Number(r.amount || 0)).toFixed(2)}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  let deleted = 0;
  // Iterate groups without relying on Map iterator destructuring to avoid downlevel issues
  for (const key of Array.from(groups.keys())) {
    const list = groups.get(key) as Row[] | undefined;
    if (!list || list.length <= 1) continue;
    // Choose keeper: prefer negative amount; otherwise keep the first
    const candidate = list.find((item: Row) => Number(item.amount) < 0) || list[0];
    const keep: Row = candidate as Row;
    for (const r of list) {
      if (r.id === keep.id) continue;
      await run('DELETE FROM transactions WHERE user_id = ? AND id = ?', [userId, r.id]);
      deleted++;
    }
  }
  return deleted;
}

export function generateTransactionIdForUser(userId: string, date: string, description: string, amount: number): string {
  const input = `${userId}|${date}|${description}|${amount.toFixed(2)}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `tx_${(hash >>> 0).toString(16)}`;
}

async function getSetting(key: string): Promise<string | null> {
  const rows = await query('SELECT value FROM settings WHERE key = ? LIMIT 1', [key]);
  if (rows.length === 0) return null;
  const row: any = rows[0];
  return row.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await upsertRow('settings', { key, value });
}

export async function getCurrentUserId(): Promise<string> {
  await getSqlJsDb();
  const v = await getSetting('current_user_id');
  if (v) return v;
  // Fallback to default
  await ensureDefaultUserAndBackfill();
  return 'local_default';
}

export async function setCurrentUserId(userId: string): Promise<void> {
  await setSetting('current_user_id', userId);
}

export async function listUsers(): Promise<Array<{ id: string; display_name: string; email?: string }>> {
  return query('SELECT id, display_name, email FROM users ORDER BY created_at ASC') as any;
}

export async function createUser(displayName: string): Promise<string> {
  const users = await listUsers();
  if (users.length >= 10) {
    throw new Error('Maximum of 10 users per device reached');
  }
  const id = `usr_${Math.random().toString(16).slice(2, 10)}`;
  await upsertRow('users', { id, display_name: displayName, created_at: new Date().toISOString() });
  await setCurrentUserId(id);
  return id;
}

export async function deleteUser(userId: string): Promise<void> {
  const current = await getCurrentUserId();
  // Delete user-scoped data
  await run('DELETE FROM transactions WHERE user_id = ?', [userId]);
  await run('DELETE FROM rules WHERE user_id = ?', [userId]);
  await run('DELETE FROM accounts WHERE user_id = ?', [userId]);
  await run('DELETE FROM users WHERE id = ?', [userId]);
  if (current === userId) {
    const users = await listUsers();
    const fallback = users[0]?.id || 'local_default';
    await setCurrentUserId(fallback);
  }
}

async function seedDemoDataIfEmpty() {
  if (typeof window === 'undefined') return; // only seed in browser
  try {
    const countRows = await query('SELECT COUNT(*) as c FROM transactions');
    const c = Number((countRows[0] && (countRows[0] as any).c) || 0);
    const seededFlag = (() => { try { return localStorage.getItem('cashcanvas_seeded'); } catch { return null; } })();
    if (c > 0 || seededFlag) return;

    const today = new Date();
    const y = today.getFullYear();
    const month = (m: number) => `${y}-${String(m).padStart(2, '0')}`;
    const d = (m: number, day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const tx = [
      { date: d(1, 1), description: 'Salary January', amount: 3500, category: 'Income', merchant: 'Employer Inc.' },
      { date: d(1, 3), description: 'Rent January', amount: -1200, category: 'Rent', merchant: 'Landlord' },
      { date: d(1, 5), description: 'Groceries - WholeFoods', amount: -180.45, category: 'Groceries', merchant: 'WholeFoods' },
      { date: d(1, 8), description: 'Uber Rides', amount: -32.10, category: 'Transport', merchant: 'Uber' },
      { date: d(1, 12), description: 'Coffee - Blue Bottle', amount: -8.5, category: 'Coffee', merchant: 'Blue Bottle' },

      { date: d(2, 1), description: 'Salary February', amount: 3500, category: 'Income', merchant: 'Employer Inc.' },
      { date: d(2, 3), description: 'Rent February', amount: -1200, category: 'Rent', merchant: 'Landlord' },
      { date: d(2, 6), description: 'Groceries - Trader Joes', amount: -150.2, category: 'Groceries', merchant: 'Trader Joes' },
      { date: d(2, 10), description: 'Cinema tickets', amount: -28.0, category: 'Entertainment', merchant: 'AMC' },
      { date: d(2, 14), description: 'Dining Out', amount: -65.75, category: 'Food', merchant: 'Local Bistro' },

      { date: d(3, 1), description: 'Salary March', amount: 3500, category: 'Income', merchant: 'Employer Inc.' },
      { date: d(3, 3), description: 'Rent March', amount: -1200, category: 'Rent', merchant: 'Landlord' },
      { date: d(3, 6), description: 'Groceries - Costco', amount: -220.0, category: 'Groceries', merchant: 'Costco' },
      { date: d(3, 9), description: 'Spotify', amount: -9.99, category: 'Subscriptions', merchant: 'Spotify' },
      { date: d(3, 12), description: 'Fuel', amount: -45.33, category: 'Transport', merchant: 'Shell' },
    ];

    const userId = await getCurrentUserId();
    const rows = tx.map(t => ({
      id: generateTransactionIdForUser(userId, t.date, t.description, t.amount),
      user_id: userId,
      ...t,
    }));

    await bulkUpsert('transactions', rows);
    await upsertRow('accounts', { id: 'acc_checking', user_id: userId, name: 'Checking', type: 'checking', balance: 1500, currency: 'USD' });
    await insertRule({ id: 'rule_coffee', pattern: 'COFFEE|BLUE BOTTLE', category: 'Coffee' });
    await insertRule({ id: 'rule_groceries', pattern: 'GROCERI|TRADER|WHOLEFOODS|COSTCO', category: 'Groceries' });
    await applyRulesToTransactions();
    try { localStorage.setItem('cashcanvas_seeded', '1'); } catch {}
  } catch {
    // ignore
  }
}

// Compatibility exports for existing code
let compatDb: Database | null = null;
export const loadDatabase = async (): Promise<Database> => {
  await getSqlJsDb();
  if (!compatDb) {
    compatDb = {
      exec: async (sql: string) => {
        const db = await getSqlJsDb();
        return db.exec(sql);
      },
      upsert: async (table: string, data: any) => upsertRow(table, data),
    };
  }
  return compatDb;
};

export const initDatabase = loadDatabase;

// Legacy named export for convenience (points to compat wrapper)
export const db: Database = {
  exec: async (sql: string) => {
    const db = await getSqlJsDb();
    return db.exec(sql);
  },
  upsert: async (table: string, data: any) => upsertRow(table, data),
};

// Legacy compatibility function for tests or older callers:
// Supports both signatures:
//   upsert('table', row)
//   upsert(db, 'table', row)
export async function upsert(dbOrTable: any, maybeTable?: any, maybeRow?: any): Promise<void> {
  if (typeof dbOrTable === 'string') {
    return upsertRow(dbOrTable, maybeTable);
  }
  return upsertRow(maybeTable, maybeRow);
}
const initSqlJs = require('sql.js');
const fs = require('fs/promises');
const path = require('path');

export type Database = any;

export async function loadDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  const db = new SQL.Database();
  db.run(schema);
  return db;
}

export type Row = Record<string, unknown>;

export function upsert(db: Database, table: string, row: Row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(',');
  const query = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  // Use the values directly without type assertion
  db.run(query, Object.values(row));
}
export function query(db: Database, sql: string, params: any[] = []): Row[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: Row[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

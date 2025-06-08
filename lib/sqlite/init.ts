import type { SQLQuery } from 'sql.js';
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
  db.run(query, Object.values(row) as SQLQuery[]);
}

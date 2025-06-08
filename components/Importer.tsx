import { ChangeEvent } from 'react';
import Papa from 'papaparse';
import { loadDatabase, upsert } from '../lib/sqlite/init';

export default function Importer() {
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { data } = Papa.parse<Record<string, string>>(text, { header: true });
    const db = await loadDatabase();
    for (const row of data) {
      if (!row) continue;
      upsert(db, 'transactions', {
        id: row.id,
        account_id: row.account_id,
        txn_date: row.txn_date,
        amount: parseFloat(row.amount),
        merchant: row.merchant,
        description: row.description,
        category: row.category,
        imported_via: 'CSV',
        created_at: new Date().toISOString(),
      });
    }
    alert('Imported ' + data.length + ' rows');
  }

  return <input type="file" accept=".csv" onChange={onFile} />;
}

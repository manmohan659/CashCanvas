import Papa from 'papaparse';
import { parse as parseOfxJs } from 'ofx-js';
import { generateTransactionId } from './sqlite/init';

export interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  category?: string;
}

function normalizeAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, '').trim();
  // Handle accounting negative in parentheses
  if (/^\(.*\)$/.test(cleaned)) {
    return -parseFloat(cleaned.slice(1, -1));
  }
  return parseFloat(cleaned);
}

function normalizeDate(raw: string): string {
  // Try common formats and convert to YYYY-MM-DD
  const s = raw.trim();
  // Already ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY
  const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [_, m, d, y] = mmddyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYYMMDD (OFX)
  const yyyymmdd = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (yyyymmdd) {
    const [_, y, m, d] = yyyymmdd;
    return `${y}-${m}-${d}`;
  }
  return s;
}

export async function parseCsv(csvContent: string): Promise<ParsedTransaction[]> {
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const data: any[] = parsed.data as any[];
  // Try to infer columns
  const lower = (s: string) => s?.toLowerCase?.() || '';
  const dateKey = Object.keys(data[0] || {}).find((k) => /date/.test(lower(k))) || 'date';
  const amountKey = Object.keys(data[0] || {}).find((k) => /amount|amt|value/.test(lower(k))) || 'amount';
  const descKey = Object.keys(data[0] || {}).find((k) => /description|memo|name|details|narration|merchant/.test(lower(k))) || 'description';

  const rows: ParsedTransaction[] = [];
  for (const row of data) {
    const date = normalizeDate(String(row[dateKey] || ''));
    const amount = normalizeAmount(String(row[amountKey] || '0'));
    const description: string = String(row[descKey] || '').trim();
    if (!date || !description || Number.isNaN(amount)) continue;
    rows.push({
      id: generateTransactionId(date, description, amount),
      date,
      amount,
      description,
      merchant: description,
    });
  }
  return rows;
}

export async function parseOfx(ofxContent: string): Promise<ParsedTransaction[]> {
  try {
    const ofx = await parseOfxJs(ofxContent);
    const stmts = ofx?.Bank?.stmttrn || ofx?.CreditCard?.stmttrn || [];
    const rows: ParsedTransaction[] = [];
    for (const t of stmts) {
      const date = normalizeDate(String(t.dtposted || t.date || ''));
      const amount = normalizeAmount(String(t.trnamt || t.amount || '0'));
      const description: string = String(t.memo || t.name || t.fitid || '').trim();
      if (!date || !description || Number.isNaN(amount)) continue;
      rows.push({
        id: generateTransactionId(date, description, amount),
        date,
        amount,
        description,
        merchant: description,
      });
    }
    return rows;
  } catch {
    // Fallback regex extraction
    const transactions: ParsedTransaction[] = [];
    const matches = ofxContent.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) || [];
    for (const match of matches) {
      const date = normalizeDate(((match.match(/<DTPOSTED>(.*?)<\//) || [])[1] || '').trim());
      const amount = normalizeAmount(((match.match(/<TRNAMT>(.*?)<\//) || [])[1] || '0').trim());
      const description = (((match.match(/<MEMO>(.*?)<\//) || [])[1] || '').trim());
      if (!date || !description || Number.isNaN(amount)) continue;
      transactions.push({
        id: generateTransactionId(date, description, amount),
        date,
        description,
        amount,
        merchant: description,
      });
    }
    return transactions;
  }
}
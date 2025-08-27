import type { ParsedTransaction } from '../parsers';
import { generateTransactionId } from '../sqlite/init';

// pdf.js as ESM
// Note: we set workerSrc to the public file we copied: /pdf.worker.min.mjs
// @ts-ignore - pdfjsLib ESM typing is incomplete for build
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

// Configure worker (browser only)
try {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
} catch { /* noop */ }

function normalizeAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, '').trim();
  if (/^\(.*\)$/.test(cleaned)) {
    return -parseFloat(cleaned.slice(1, -1));
  }
  return parseFloat(cleaned);
}

function normalizeDate(raw: string, defaultYear?: number): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD or MM/DD/YY or MM/DD/YYYY
  const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (mmddyyyy) {
    const [_, m, d, y] = mmddyyyy as unknown as [string, string, string, string?];
    const yyyy = y
      ? (y.length === 2 ? `20${y}` : y)
      : String(defaultYear || new Date().getFullYear());
    return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const yyyymmdd = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (yyyymmdd) {
    const [__, y, m, d] = yyyymmdd;
    return `${y}-${m}-${d}`;
  }
  return s;
}

type TextItem = { str: string; transform: number[] };

function groupItemsIntoRows(items: TextItem[]): Array<{ y: number; cells: Array<{ x: number; str: string }> }> {
  // Bucket by Y with small tolerance
  const buckets = new Map<number, Array<{ x: number; str: string }>>();
  const tol = 2; // px-ish, pdf units
  for (const it of items) {
    if (!it?.str) continue;
    const t = it.transform || [];
    const x = Number(t[4] || 0);
    const y = Number(t[5] || 0);
    const key = Math.round(y / tol) * tol;
    const list = buckets.get(key) || [];
    list.push({ x, str: it.str });
    buckets.set(key, list);
  }
  const rows: Array<{ y: number; cells: Array<{ x: number; str: string }> }> = [];
  buckets.forEach((cells, y) => {
    cells.sort((a, b) => a.x - b.x);
    rows.push({ y, cells });
  });
  // Sort from top to bottom (pdf y increases upward; but grouping heuristic may vary)
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

function isHeaderRow(text: string): boolean {
  const s = text.toLowerCase();
  return (
    s.includes('date') &&
    (s.includes('description') || s.includes('details')) &&
    (s.includes('amount') || s.includes('debit') || s.includes('credit') || s.includes('balance'))
  );
}

function extractStatementTotalsFromText(text: string): {
  totalPaymentsCredits?: number;
  totalPurchases?: number;
  newBalance?: number;
  previousBalance?: number;
} {
  const t = text.replace(/\s+/g, ' ').toLowerCase();
  const result: {
    totalPaymentsCredits?: number;
    totalPurchases?: number;
    newBalance?: number;
    previousBalance?: number;
  } = {};
  const numberPattern = /[\-\(\u2212]?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?/;
  const extractFirstNumber = (s: string): number | undefined => {
    const m = s.match(numberPattern);
    return m ? normalizeAmount(m[0].replace(/\$/g, '')) : undefined;
  };
  const tryLabel = (label: string, key: keyof typeof result) => {
    const idx = t.indexOf(label.toLowerCase());
    if (idx >= 0) {
      const slice = text.slice(Math.max(0, idx - 50), idx + 120);
      const val = extractFirstNumber(slice);
      if (typeof val === 'number' && !Number.isNaN(val)) (result as any)[key] = Math.abs(val);
    }
  };
  tryLabel('Total payments and credits', 'totalPaymentsCredits');
  tryLabel('Total credits and payments', 'totalPaymentsCredits');
  tryLabel('Total purchases', 'totalPurchases');
  tryLabel('New balance', 'newBalance');
  tryLabel('Previous balance', 'previousBalance');
  return result;
}

function extractTransactionFromRow(
  cells: Array<{ x: number; str: string }>,
  opts: { defaultYear?: number }
): ParsedTransaction | null {
  const joined = cells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return null;
  if (isHeaderRow(joined)) return null;

  // Find date token near the left side
  const dateIdx = cells.findIndex(c => /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(c.str));
  if (dateIdx < 0) return null;
  const dateRaw = (cells[dateIdx].str.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/) || [])[0] || '';
  const date = normalizeDate(dateRaw, opts.defaultYear);
  if (!date) return null;

  // Collect numeric tokens (potential amounts)
  const numberTokens: Array<{ idx: number; value: string }> = [];
  for (let i = 0; i < cells.length; i++) {
    const s = cells[i].str;
    const m = s.match(/[\-\u2212(]?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?/g);
    if (m) {
      for (const tok of m) numberTokens.push({ idx: i, value: tok });
    }
  }
  if (numberTokens.length === 0) return null;

  // Choose amount token.
  // Heuristic: if there are 2+ numbers, many statements place Balance as the furthest right.
  // Use the second-last when there are >=2; otherwise use the last.
  let amountTok = numberTokens[numberTokens.length - 1];
  if (numberTokens.length >= 2) amountTok = numberTokens[numberTokens.length - 2];
  const amount = normalizeAmount(amountTok.value.replace(/\$/g, ''));
  if (Number.isNaN(amount)) return null;

  // Description: tokens between date and amount token
  const descCells = cells.slice(dateIdx + 1, amountTok.idx);
  const description = descCells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();
  if (!description) return null;

  const id = generateTransactionId(date, description, amount);
  const tx: ParsedTransaction = {
    id,
    date,
    description,
    amount,
    merchant: description,
  };
  return tx;
}

export async function parsePdf(arrayBuffer: ArrayBuffer): Promise<ParsedTransaction[]> {
  // Load PDF from bytes
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const rows: ParsedTransaction[] = [];
  const maxPages = pdf.numPages;
  // Attempt to detect a year from the document text once
  let yearHint: number | undefined;
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Extract text items
    const text = await page.getTextContent({ normalizeWhitespace: true });
    // Map items to simplified structure
    const items: TextItem[] = (text.items as any[]).map((it: any) => ({ str: String(it.str || ''), transform: it.transform as number[] }));
    if (yearHint == null) {
      const joined = items.map(i => i.str).join(' ');
      const m = joined.match(/\b(20\d{2})\b/);
      if (m) yearHint = Number(m[1]);
    }
    const grouped = groupItemsIntoRows(items);
    for (const row of grouped) {
      const tx = extractTransactionFromRow(row.cells, { defaultYear: yearHint });
      if (tx) rows.push(tx);
    }
  }
  // De-duplicate by id
  const seen = new Set<string>();
  const unique = rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return unique;
}

export async function parsePdfFile(file: File): Promise<ParsedTransaction[]> {
  const buf = await file.arrayBuffer();
  return parsePdf(buf);
}

export async function parsePdfWithDiagnostics(arrayBuffer: ArrayBuffer): Promise<{
  transactions: ParsedTransaction[];
  suspiciousRows: Array<{ page: number; rowText: string; reason: string }>;
  yearHint?: number;
  statementTotals?: {
    totalPaymentsCredits?: number;
    totalPurchases?: number;
    newBalance?: number;
    previousBalance?: number;
  };
}> {
  // Load PDF from bytes (reuse logic but keep diagnostics)
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const rows: ParsedTransaction[] = [];
  const suspiciousRows: Array<{ page: number; rowText: string; reason: string }> = [];
  const maxPages = pdf.numPages;
  let yearHint: number | undefined;
  let totals: {
    totalPaymentsCredits?: number;
    totalPurchases?: number;
    newBalance?: number;
    previousBalance?: number;
  } = {};
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const text = await page.getTextContent({ normalizeWhitespace: true });
    const items: TextItem[] = (text.items as any[]).map((it: any) => ({ str: String(it.str || ''), transform: it.transform as number[] }));
    if (yearHint == null) {
      const joined = items.map(i => i.str).join(' ');
      const m = joined.match(/\b(20\d{2})\b/);
      if (m) yearHint = Number(m[1]);
    }
    try {
      const joined = items.map(i => i.str).join(' ');
      const pageTotals = extractStatementTotalsFromText(joined);
      totals = { ...totals, ...Object.fromEntries(Object.entries(pageTotals).filter(([, v]) => v != null)) } as any;
    } catch { /* ignore */ }
    const grouped = groupItemsIntoRows(items);
    for (const row of grouped) {
      const tx = extractTransactionFromRow(row.cells, { defaultYear: yearHint });
      if (tx) {
        rows.push(tx);
      } else {
        const textLine = row.cells.map(c => c.str).join(' ').trim();
        if (textLine && !isHeaderRow(textLine) && /\d/.test(textLine)) {
          suspiciousRows.push({ page: pageNum, rowText: textLine, reason: 'Unparsed row' });
        }
      }
    }
  }
  const seen = new Set<string>();
  const unique = rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return { transactions: unique, suspiciousRows, yearHint, statementTotals: totals };
}

export async function parsePdfFileWithDiagnostics(file: File) {
  const buf = await file.arrayBuffer();
  return parsePdfWithDiagnostics(buf);
}



import { useCallback, useRef, useState } from 'react';
import React from 'react';
import { parseCsv, parseOfx, ParsedTransaction } from '../lib/parsers';
import { parsePdfFileWithDiagnostics } from '../lib/pdf/parsePdf';
import { bulkUpsert, applyRulesToTransactions, getCurrentUserId, generateTransactionIdForUser, autoCategorizeAndAnnotate, sha256Hex, recordImportSummary, findExistingImportByHash } from '../lib/sqlite/init';
interface ImporterProps {
  onImportComplete: () => void;
}

export default function Importer({ onImportComplete }: ImporterProps) {
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const parseAndSave = useCallback(async (file: File) => {
    setImporting(true);
    setMessage(null);
    try {
      let rows: ParsedTransaction[] = [];
      let pdfSuspiciousRows: Array<{ page: number; rowText: string; reason: string }> | null = null;
      let pdfStatementTotals: { totalPaymentsCredits?: number; totalPurchases?: number; newBalance?: number; previousBalance?: number } | null = null;
      let importSource: 'csv' | 'ofx' | 'pdf' = 'csv';
      const importBatch = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const lower = file.name.toLowerCase();
      const fileText = await file.text();
      const fileHash = sha256Hex(`${file.name}\n${file.size}\n${file.lastModified}\n${fileText.slice(0, 50000)}`);
      const userId = await getCurrentUserId();
      const existing = await findExistingImportByHash(userId, fileHash);
      if (existing) {
        setMessage(`This file appears to have been imported already on ${new Date(existing.created_at).toLocaleString()} (batch ${existing.import_batch}). Skipping to prevent duplicates.`);
        setImporting(false);
        setDragging(false);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      if (lower.endsWith('.csv')) {
        rows = await parseCsv(fileText);
        importSource = 'csv';
      } else if (lower.endsWith('.ofx')) {
        rows = await parseOfx(fileText);
        importSource = 'ofx';
      } else if (lower.endsWith('.pdf')) {
        const { transactions, suspiciousRows, statementTotals } = await parsePdfFileWithDiagnostics(file);
        rows = transactions;
        importSource = 'pdf';
        if (rows.length === 0) throw new Error('No transactions found in PDF. Ensure it is a text-based statement.');
        // Ensure sign convention for PDF rows before saving
        const creditRegex = /(payment|payment\s+thank\s+you|auto\s?-?pay|autopay|refund|reversal|credit|return|cash\s?back|adjustment)/i;
        rows = rows.map(r => {
          const isCredit = creditRegex.test(r.description || '');
          const normalizedAmount = isCredit ? Math.abs(r.amount) : -Math.abs(r.amount);
          return { ...r, amount: normalizedAmount };
        });
        // Attach a brief warning if many suspicious rows
        pdfSuspiciousRows = suspiciousRows || [];
        pdfStatementTotals = statementTotals || null;
        if (pdfSuspiciousRows && pdfSuspiciousRows.length > 0) {
          console.warn('Suspicious PDF rows (unparsed):', pdfSuspiciousRows.slice(0, 10));
        }
      } else {
        throw new Error('Unsupported file type. Use .csv, .ofx or .pdf');
      }

      const scopedRows = rows.map(r => ({
        ...r,
        id: generateTransactionIdForUser(userId, r.date, r.description, r.amount),
        user_id: userId,
        import_source: importSource,
        import_batch: importBatch,
      }));
      await bulkUpsert('transactions', scopedRows);
      await applyRulesToTransactions();
      await autoCategorizeAndAnnotate();
      // Compute reconciliation totals and persist an import summary
      const debitsTotal = scopedRows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
      const creditsTotal = scopedRows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
      const netTotal = creditsTotal - debitsTotal;
      const dates = scopedRows.map(r => r.date).filter(Boolean).sort();
      const periodStart = dates[0] || null;
      const periodEnd = dates[dates.length - 1] || null;
      await recordImportSummary({
        user_id: userId,
        file_name: file.name,
        file_hash: fileHash,
        import_source: importSource,
        import_batch: importBatch,
        parsed_count: scopedRows.length,
        suspicious_count: lower.endsWith('.pdf') ? (pdfSuspiciousRows?.length || 0) : 0,
        debits_total: Number(debitsTotal.toFixed(2)),
        credits_total: Number(creditsTotal.toFixed(2)),
        net_total: Number(netTotal.toFixed(2)),
        period_start: periodStart,
        period_end: periodEnd,
        warnings: lower.endsWith('.pdf') && (pdfSuspiciousRows?.length || 0) > 0
          ? [
              `Unparsed rows detected: ${pdfSuspiciousRows?.length || 0}. Totals may be incomplete.`,
              pdfStatementTotals?.totalPurchases != null ? `Statement total purchases: ${pdfStatementTotals.totalPurchases.toFixed(2)}` : '',
              pdfStatementTotals?.totalPaymentsCredits != null ? `Statement total payments/credits: ${pdfStatementTotals.totalPaymentsCredits.toFixed(2)}` : '',
            ].filter(Boolean) as string[]
          : undefined,
      });
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-data-changed')); } catch {}
      setMessage(`Imported ${rows.length} transactions. Net ${netTotal >= 0 ? '+' : ''}${netTotal.toFixed(2)} across ${periodStart || ''} → ${periodEnd || ''}`);
      onImportComplete();
    } catch (e: any) {
      console.error('Import failed:', e);
      setMessage(e?.message || 'Import failed');
    } finally {
      setImporting(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [onImportComplete]);

  const onInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await parseAndSave(f);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await parseAndSave(f);
  };

  return (
    <div>
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        aria-label="Upload CSV or OFX"
      >
        <div className="dropzone-inner">
          <div className="drop-icon">⬆️</div>
          <div>
            <div className="drop-title">Drag & drop a CSV or OFX</div>
            <div className="drop-sub">or click to choose a file</div>
          </div>
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".csv,.ofx,.pdf" onChange={onInput} hidden />
      {importing && <p className="muted" style={{ marginTop: 8 }}>Importing…</p>}
      {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Card from '../../../components/ui/Card';
import TransactionsTable from '../../../components/transactions/TransactionsTable';
import { getCurrentUserId, query, run } from '../../../lib/sqlite/init';

interface TxRow { id: string; date: string; description: string; merchant?: string; amount: number; category?: string }

export default function DayDetailPage() {
  const router = useRouter();
  const { date } = router.query as { date?: string };
  const [rows, setRows] = useState<TxRow[]>([]);

  const load = async () => {
    if (!date) return;
    try {
      const userId = await getCurrentUserId();
      const res = await query(
        `SELECT id, date, description, merchant, amount, category
           FROM transactions
           WHERE user_id = ? AND date = ?
           ORDER BY amount ASC`,
        [userId, date]
      );
      setRows(res as any);
    } catch (e) {
      console.error('Failed to load day details', e);
    }
  };

  useEffect(() => {
    if (!date) return;
    void load();
  }, [date]);

  // refresh when any data changes globally (e.g., category edited elsewhere)
  useEffect(() => {
    const handler = () => void load();
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-data-changed', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-data-changed', handler); };
  }, [date]);

  const totals = useMemo(() => {
    const income = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const spend = rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    return { income, expenses: Math.abs(spend), net: income + spend };
  }, [rows]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'space-between',
        }}
      >
        <button
          className="btn ghost"
          aria-label="Go back"
          onClick={() => router.back()}
          style={{ paddingInline: 10 }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, textAlign: 'center', flex: 1 }}>
          Spending on {date}
        </h2>
        {/* spacer to balance the centered title visually */}
        <span style={{ width: 32 }} />
      </div>
      <section className="grid cols-3" style={{ gap: 16 }}>
        <Card title="Income"><div style={{ fontSize: 20, fontWeight: 700 }}>${totals.income.toFixed(2)}</div></Card>
        <Card title="Expenses"><div style={{ fontSize: 20, fontWeight: 700 }}>${totals.expenses.toFixed(2)}</div></Card>
        <Card title="Net"><div style={{ fontSize: 20, fontWeight: 700 }}>${totals.net.toFixed(2)}</div></Card>
      </section>
      <Card title="Transactions">
        {/* Reuse table but scoped view: small inline table so we show only rows for the day */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Description</th>
                <th style={th}>Merchant</th>
                <th style={th}>Category</th>
                <th style={thRight}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.description}</td>
                  <td style={tdMuted}>{r.merchant}</td>
                  <td style={td}>
                    <CategoryCell row={r} onSaved={load} />
                  </td>
                  <td style={tdRight}>{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--muted)' };
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '12px', borderBottom: '1px solid var(--border)' };
const tdRight: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const tdMuted: React.CSSProperties = { ...td, color: 'var(--muted)' };

function formatCurrency(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}$${abs.toFixed(2)}`;
}

// Inline editable category cell
function CategoryCell({ row, onSaved }: { row: TxRow; onSaved: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(row.category || '');

  useEffect(() => { setValue(row.category || ''); }, [row.id, row.category]);

  const save = async () => {
    try {
      const userId = await getCurrentUserId();
      await run('UPDATE transactions SET category = ? WHERE id = ? AND user_id = ?', [value, row.id, userId]);
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-data-changed')); } catch {}
      setIsEditing(false);
      onSaved();
    } catch (e) {
      console.error('Failed to save category', e);
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 160 }} />
        <button className="btn primary" onClick={save}>Save</button>
        <button className="btn ghost" onClick={() => setIsEditing(false)}>Cancel</button>
      </div>
    );
  }

  return (
    <button className="chip clickable" onClick={() => setIsEditing(true)}>
      <span className="chip-dot" />
      {row.category || 'Uncategorized'}
    </button>
  );
}



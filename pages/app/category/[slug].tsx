import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Card from '../../../components/ui/Card';
import PieSpend from '../../../components/charts/PieSpend';
import { getCurrentUserId, query, run } from '../../../lib/sqlite/init';

type TxRow = { id: string; date: string; description: string; merchant?: string; amount: number; category?: string; meta?: string };

export default function CategoryDetailPage() {
  const router = useRouter();
  const slug = String(router.query.slug || '');
  const [rows, setRows] = useState<TxRow[]>([]);
  const [city, setCity] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const title = decodeURIComponent(slug);

  const load = async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const user = await getCurrentUserId();
      // Filter by category and optional city stored in meta JSON
      const params: any[] = [user, title];
      let sql = `SELECT id, date, description, merchant, amount, category, meta
                   FROM transactions
                   WHERE user_id = ? AND category = ?`;
      if (city) {
        sql += ` AND meta LIKE ?`;
        params.push(`%\"city\":\"${city}%`);
      }
      sql += ` ORDER BY date DESC, id DESC`;
      const res = await query(sql, params);
      setRows(res as any);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [slug, title, city]);

  // Refresh when data changes elsewhere
  useEffect(() => {
    const handler = () => void load();
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-data-changed', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-data-changed', handler); };
  }, [slug, title, city]);

  const total = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0), 0), [rows]);

  // Food in NY curated: group by restaurant/merchant when category is Food and city=NY
  const isFood = title.toLowerCase() === 'food' || title.toLowerCase() === 'coffee';
  const restaurantGroups = useMemo(() => {
    if (!isFood) return [] as Array<{ merchant: string; total: number; count: number }>;
    const agg = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      if (r.amount >= 0) continue;
      let c = '';
      try { c = r.meta ? (JSON.parse(r.meta).city || '') : ''; } catch {}
      if (city && c !== city) continue;
      const key = (r.merchant || r.description || 'Unknown').trim();
      const cur = agg.get(key) || { total: 0, count: 0 };
      cur.total += Math.abs(r.amount);
      cur.count += 1;
      agg.set(key, cur);
    }
    return Array.from(agg.entries()).map(([merchant, v]) => ({ merchant, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);
  }, [rows, city, isFood]);

  // Subscription tiles: when category is Subscriptions, show monthly totals by merchant
  const subscriptionTiles = useMemo(() => {
    if (title.toLowerCase() !== 'subscriptions') return [] as Array<{ merchant: string; monthly: number; count: number }>;
    const byMonthMerch = new Map<string, number>();
    for (const r of rows) {
      if (r.amount >= 0) continue;
      const ym = (r.date || '').slice(0, 7);
      const merch = (r.merchant || r.description || 'Unknown').trim();
      const key = `${ym}|${merch}`;
      byMonthMerch.set(key, (byMonthMerch.get(key) || 0) + Math.abs(r.amount));
    }
    // Average per month per merchant
    const byMerch = new Map<string, { sum: number; months: Set<string>; count: number }>();
    byMonthMerch.forEach((val, key) => {
      const [ym, merchant] = key.split('|');
      const rec = byMerch.get(merchant) || { sum: 0, months: new Set<string>(), count: 0 };
      rec.sum += val;
      rec.months.add(ym);
      rec.count += 1;
      byMerch.set(merchant, rec);
    });
    return Array.from(byMerch.entries()).map(([merchant, v]) => ({
      merchant,
      monthly: v.sum / Math.max(1, v.months.size),
      count: v.count,
    })).sort((a, b) => b.monthly - a.monthly);
  }, [rows, title]);

  const [miniPieData, setMiniPieData] = useState<Array<{ category: string; total: number }>>([]);
  useEffect(() => {
    (async () => {
      const user = await getCurrentUserId();
      const rows = await query(
        "SELECT COALESCE(NULLIF(TRIM(category), ''), 'Unknown') as category, SUM(amount) as total FROM transactions WHERE amount < 0 AND user_id = ? GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Unknown')",
        [user]
      );
      const processed = (rows as any[]).map((r) => ({ category: r.category || 'Unknown', total: Math.abs(Number(r.total) || 0) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
      setMiniPieData(processed);
    })();
  }, [slug]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      try {
        const m = r.meta ? JSON.parse(r.meta) : {};
        if (m.city) set.add(String(m.city));
      } catch {}
    }
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn ghost" onClick={() => router.push('/app')}>← Back</button>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ marginLeft: 'auto', width: 220 }}>
          <PieSpend data={miniPieData} onSliceClick={(c) => router.push(`/app/category/${encodeURIComponent(c)}`)} />
        </div>
      </div>

      <Card title={`${title} Overview`} right={<span className="muted">{rows.length} transactions</span>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="muted" style={{ display: 'block', fontSize: 12 }}>City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Total</div>
            <div style={{ fontWeight: 700 }}>${total.toFixed(2)}</div>
          </div>
        </div>
      </Card>

      {isFood && (
        <Card title={city ? `Food in ${city} — Top Restaurants` : 'Food — Top Restaurants'}>
          {restaurantGroups.length === 0 ? (
            <div className="muted">No data</div>
          ) : (
            <div className="tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {restaurantGroups.map((g) => (
                <div key={g.merchant} className="tile" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{g.merchant}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{g.count} purchases</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>${g.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {title.toLowerCase() === 'subscriptions' && (
        <Card title="Subscriptions — Monthly Averages">
          {subscriptionTiles.length === 0 ? (
            <div className="muted">No subscription-like charges detected</div>
          ) : (
            <div className="tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {subscriptionTiles.map((g) => (
                <div key={g.merchant} className="tile" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{g.merchant}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Avg / month</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>${g.monthly.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title={`Transactions in ${title}`}>
        {loading ? (
          <div className="muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="muted">No transactions</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Description</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Merchant</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Category</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Payment</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>City</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  let payment = '';
                  let c = '';
                  try {
                    const m = r.meta ? JSON.parse(r.meta) : {};
                    payment = m.payment_method || '';
                    c = m.city || '';
                  } catch {}
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: 8 }}>{r.date}</td>
                      <td style={{ padding: 8 }}>{r.description}</td>
                      <td style={{ padding: 8, color: 'var(--muted)' }}>{r.merchant}</td>
                      <td style={{ padding: 8 }}><CategoryCell row={r} onSaved={load} /></td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{r.amount < 0 ? `-$${Math.abs(r.amount).toFixed(2)}` : `$${r.amount.toFixed(2)}`}</td>
                      <td style={{ padding: 8 }}>{payment}</td>
                      <td style={{ padding: 8 }}>{c}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Inline editable category cell for this page as well
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



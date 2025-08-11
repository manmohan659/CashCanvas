import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { query, run, getCurrentUserId, searchTransactions } from '../../lib/sqlite/init';

interface TxRow {
  id: string;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  category?: string;
}

export default function TransactionsTable() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiMode, setAiMode] = useState(false);

  const AICompose = dynamic(() => import('../ai/AICompose'), { ssr: false });
  const LLMSettingsModal = dynamic(() => import('../ai/LLMSettingsModal'), { ssr: false });

  const load = async () => {
    const userId = await getCurrentUserId();
    const offset = (page - 1) * pageSize;
    const res = await searchTransactions(userId, search, pageSize, offset);
    setRows(res as any);
  };

  useEffect(() => { load().catch(() => {}); }, [page, pageSize, search]);

  // Reload when user changes
  useEffect(() => {
    const handler = () => { setPage(1); load().catch(() => {}); };
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-user-changed', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-user-changed', handler); };
  }, []);

  // Reload when data changes (e.g., after imports or rule application)
  useEffect(() => {
    const handler = () => { setPage(1); load().catch(() => {}); };
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-data-changed', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-data-changed', handler); };
  }, []);

  // Load category options (top used) for autocomplete
  useEffect(() => {
    const loadCats = async () => {
      try {
        const userId = await getCurrentUserId();
        const rows = await query(
          `SELECT category, COUNT(*) as c
           FROM transactions
           WHERE user_id = ? AND category IS NOT NULL AND TRIM(category) != ''
           GROUP BY category
           ORDER BY c DESC, lower(category) ASC
           LIMIT 100`,
          [userId]
        );
        const cats = (rows as Array<{ category: string }>).map((r) => r.category).filter(Boolean);
        setCategoryOptions(cats);
      } catch {}
    };
    loadCats();
    const onData = () => loadCats();
    if (typeof window !== 'undefined') window.addEventListener('cashcanvas-data-changed', onData);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('cashcanvas-data-changed', onData); };
  }, []);

  // Determine page size based on viewport
  useEffect(() => {
    const calculate = () => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const size = isMobile ? 8 : 15;
      setPageSize(size);
    };
    calculate();
    if (typeof window !== 'undefined') window.addEventListener('resize', calculate);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('resize', calculate); };
  }, []);

  // Reset to first page when page size or search changes
  useEffect(() => { setPage(1); }, [pageSize]);
  useEffect(() => { setPage(1); }, [search]);

  // Rows are fetched from DB already filtered by search term

  // LLM config presence decides if toggle should glow
  useEffect(() => {
    import('../../lib/agent/llm').then(({ hasLLM }) => {
      try { setLlmEnabled(hasLLM()); } catch { setLlmEnabled(false); }
    });
  }, []);

  const startEdit = (row: TxRow) => {
    setEditingId(row.id);
    setEditingCategory(row.category || '');
    setShowSuggestions(true);
    setHighlightIndex(-1);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const userId = await getCurrentUserId();
    await run('UPDATE transactions SET category = ? WHERE id = ? AND user_id = ?', [editingCategory, editingId, userId]);
    // Notify rest of app so charts/kpis refresh
    try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-data-changed')); } catch {}
    setEditingId(null);
    setEditingCategory('');
    await load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          placeholder={aiMode ? 'Chat search… ask a question' : 'Search description, merchant, or category'}
          className={aiMode ? 'chat-glow' : ''}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={async (e) => {
            if (aiMode && e.key === 'Enter') {
              e.preventDefault();
              if (typeof window !== 'undefined') window.location.hash = '#ai';
            }
          }}
          style={{ flex: 1 }}
        />
        <button
          className={`chip clickable ${aiMode ? 'llm-on' : ''}`}
          title={llmEnabled ? 'LLM chat: on' : 'Add API key to enable LLM'}
          onClick={() => setAiMode((v) => !v)}
        >
          <span className="chip-dot" />
          {aiMode ? 'Chat Search' : 'LLM'}
        </button>
        <button className="btn ghost" onClick={() => setShowSettings(true)}>LLM Settings</button>
      </div>
      {!aiMode ? (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Description</th>
              <th style={th}>Merchant</th>
              <th style={th}>Category</th>
              <th style={thRight}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.date}</td>
                <td style={td}>{r.description}</td>
                <td style={tdMuted}>{r.merchant}</td>
                <td style={td}>
                  {editingId === r.id ? (
                    <div style={{ display: 'flex', gap: 8, position: 'relative', alignItems: 'flex-start' }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          value={editingCategory}
                          onChange={(e) => { setEditingCategory(e.target.value); setShowSuggestions(true); setHighlightIndex(-1); }}
                          onFocus={() => setShowSuggestions(true)}
                          onKeyDown={(e) => {
                            const filtered = (categoryOptions || []).filter((c) =>
                              (editingCategory || '').trim() === ''
                                ? true
                                : c.toLowerCase().includes(editingCategory.toLowerCase())
                            ).slice(0, 8);
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightIndex((i) => Math.max(i - 1, 0));
                            } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < filtered.length) {
                              e.preventDefault();
                              setEditingCategory(filtered[highlightIndex]);
                              setShowSuggestions(false);
                            } else if (e.key === 'Escape') {
                              setShowSuggestions(false);
                            }
                          }}
                          style={{ width: 200 }}
                        />
                        {showSuggestions && (
                          <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', zIndex: 20 }}>
                            {(() => {
                              const filtered = (categoryOptions || [])
                                .filter((c) => (editingCategory || '').trim() === '' ? true : c.toLowerCase().includes(editingCategory.toLowerCase()))
                                .slice(0, 8);
                              if (filtered.length === 0) return <div style={{ padding: 8 }} className="muted">No matches</div>;
                              return (
                                <ul style={{ listStyle: 'none', margin: 0, padding: 6 }}>
                                  {filtered.map((c, idx) => (
                                    <li key={c}>
                                      <button
                                        onMouseDown={(e) => { e.preventDefault(); setEditingCategory(c); setShowSuggestions(false); }}
                                        onMouseEnter={() => setHighlightIndex(idx)}
                                        className="btn ghost"
                                        style={{
                                          display: 'block', width: '100%', textAlign: 'left',
                                          borderRadius: 8, padding: '8px 10px',
                                          borderColor: idx === highlightIndex ? 'var(--brand)' : 'var(--border)'
                                        }}
                                      >{c}</button>
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <button className="btn primary" onClick={saveEdit}>Save</button>
                      <button className="btn ghost" onClick={() => { setEditingId(null); setShowSuggestions(false); }}>Cancel</button>
                    </div>
                  ) : (
                    <button className="chip clickable" onClick={() => startEdit(r)}>
                      <span className="chip-dot" />
                      {r.category || 'Uncategorized'}
                    </button>
                  )}
                </td>
                <td style={tdRight}>{formatCurrency(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <AICompose initialQuery={search} openSettings={() => setShowSettings(true)} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <button
          className="btn ghost"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </button>
        <span className="muted">Page {page}</span>
        <button
          className="btn ghost"
          onClick={() => setPage((p) => p + 1)}
          disabled={rows.length < pageSize}
        >
          Next
        </button>
      </div>
      {showSettings && (
        <LLMSettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => import('../../lib/agent/llm').then(({ hasLLM }) => setLlmEnabled(hasLLM()))}
        />
      )}
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



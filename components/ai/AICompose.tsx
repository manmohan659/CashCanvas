import React, { useEffect, useMemo, useState } from 'react';
import { chatLLM, systemPrompt, hasLLM, type ChatMessage } from '../../lib/agent/llm';
import { runFinanceAgent } from '../../lib/agent/agent';
import { AgentTools } from '../../lib/agent/schema';
import PieSpend from '../charts/PieSpend';
import BarMonthly from '../charts/BarMonthly';
import dynamic from 'next/dynamic';

const ReactMarkdown: any = dynamic(() => import('react-markdown').then(m => m.default as any), { ssr: false });

interface Props {
  initialQuery?: string;
  openSettings?: () => void;
}

type CanvasBlock =
  | { kind: 'text'; content: string }
  | { kind: 'pie'; data: Array<{ category: string; total: number }>; title?: string }
  | { kind: 'bar'; data: Array<{ month: string; income: number; spend: number; net?: number }>; title?: string };

export default function AICompose({ initialQuery = '', openSettings }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'system', content: systemPrompt }]);
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [uncatCount, setUncatCount] = useState<number>(0);

  useEffect(() => { if (initialQuery) setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => { AgentTools.uncategorizedCount().then(setUncatCount).catch(() => setUncatCount(0)); }, []);

  const canChat = hasLLM();

  const append = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  const run = async () => {
    if (!query.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: query.trim() };
    try { console.debug('[AICompose] run agent with query', query); } catch {}
    append(userMsg);
    setBusy(true);

    // Very light intent routing: detect common chart requests locally
    const q = query.toLowerCase();
    try {
      if (q.includes('pie') || q.includes('category') || q.includes('spent by')) {
        const data = await AgentTools.spendByCategory({});
        setBlocks((b) => [...b, { kind: 'pie', data, title: 'Spending by Category' }]);
      } else if (q.includes('month') || q.includes('trend') || q.includes('vs')) {
        const data = await AgentTools.monthlyNet();
        setBlocks((b) => [...b, { kind: 'bar', data, title: 'Income vs Spend by Month' }]);
      } else if (canChat) {
        // Use function-calling agent to fetch from DB and compute
        const md = await runFinanceAgent(query);
        append({ role: 'assistant', content: md });
      }

    } catch (err: any) {
      append({ role: 'assistant', content: `Sorry, something went wrong: ${err?.message || err}` });
    } finally {
      setBusy(false);
    }
  };

  // Auto-run whenever a new initialQuery arrives
  useEffect(() => {
    if (initialQuery && initialQuery !== messages[messages.length - 1]?.content) {
      setQuery(initialQuery);
      // fire and forget
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div className="ai-two-pane">
      <div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="auto-cat">
            <div className="left">
              <h4 className="title">Auto-categorization</h4>
              <p className="sub">Apply rules first, then heuristics. Creates new categories only if needed.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="metric-pill"><span className="metric-dot" /> Uncategorized: {uncatCount}</span>
              <button className="btn primary" onClick={async () => {
                  setBusy(true);
                  try {
                    const res: any = await AgentTools.autoCategorize();
                    const left = await AgentTools.uncategorizedCount();
                    setUncatCount(left);
                    const total = (res.updatedByRules || 0) + (res.updatedByHeuristics || 0) + (res.updatedByLLM || 0);
                    const llmPart = res.updatedByLLM ? `, ${res.updatedByLLM} via LLM` : '';
                    setBlocks((b) => [{ kind: 'text', content: `Categorized ${total} transactions (${res.updatedByRules} via rules, ${res.updatedByHeuristics} via heuristics${llmPart}). Remaining uncategorized: ${left}.` }, ...b]);
                  } catch (e: any) {
                    setBlocks((b) => [{ kind: 'text', content: `Auto-categorization failed: ${e?.message || e}` }, ...b]);
                  } finally {
                    setBusy(false);
                  }
                }}>Run</button>
            </div>
          </div>
          {blocks.map((b, i) => (
            <div className="card" key={i}>
              <div className="card-body">
                {b.kind === 'text' && <p style={{ margin: 0 }}>{b.content}</p>}
                {b.kind === 'pie' && (
                  <div>
                    <h4 style={{ marginTop: 0 }}>{b.title || 'Pie'}</h4>
                    <PieSpend data={b.data} />
                  </div>
                )}
                {b.kind === 'bar' && (
                  <div>
                    <h4 style={{ marginTop: 0 }}>{b.title || 'Bar'}</h4>
                    <BarMonthly data={b.data} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ maxHeight: 520, overflow: 'auto' }}>
        <div className="card-body">
          <div style={{ display: 'grid', gap: 10 }}>
            {messages.filter(m => m.role !== 'system').map((m, i) => (
              <div key={i} style={{
                background: m.role === 'user' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)',
                border: '1px solid var(--border)', borderRadius: 12, padding: 10
              }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{m.role}</div>
                {m.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div>{m.content}</div>
                )}
              </div>
            ))}
          </div>
          {!canChat && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="muted" style={{ margin: 0 }}>Add an API key in LLM Settings to enable chat responses.</p>
              <button className="btn secondary" onClick={openSettings}>LLM Settings</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



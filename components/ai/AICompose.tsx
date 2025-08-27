import React, { useEffect, useMemo, useState } from 'react';
import { chatLLM, systemPrompt, hasLLM, type ChatMessage } from '../../lib/agent/llm';
import { runFinanceAgent } from '../../lib/agent/agent';
import { AgentTools } from '../../lib/agent/schema';
import PieSpend from '../charts/PieSpend';
import BarMonthly from '../charts/BarMonthly';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  // When initialQuery changes, just prefill the input; do not auto-send
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div className="ai-two-pane" style={{ gridTemplateColumns: blocks.length > 0 ? '0.9fr 1.1fr' : '1fr' }}>
      <div>
        <div style={{ display: 'grid', gap: 12 }}>
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
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 520 }}>
        <div className="card-body" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="muted">Chat</div>
            <button
              className="btn ghost"
              title={`Auto-categorize • Uncategorized: ${uncatCount}`}
              onClick={async () => {
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
              }}
            >Auto-categorize</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {messages.filter(m => m.role !== 'system').map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                <div className="chat-meta">
                  <span className="avatar" />
                  <span>{m.role === 'user' ? 'You' : 'Assistant'}</span>
                </div>
                {m.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div>{m.content}</div>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat-bubble assistant">
                <div className="chat-meta"><span className="avatar" /><span>Assistant</span></div>
                <div className="typing" />
              </div>
            )}
          </div>
          {!canChat && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="muted" style={{ margin: 0 }}>Add an API key in LLM Settings to enable chat responses.</p>
              <button className="btn secondary" onClick={openSettings}>LLM Settings</button>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8 }}>
          <input
            placeholder={busy ? 'Working…' : 'Ask anything… Press Enter to send'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) { e.preventDefault(); run(); } }}
            style={{ flex: 1 }}
            disabled={busy}
          />
          <button className="btn primary" disabled={busy || !query.trim()} onClick={() => run()}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}



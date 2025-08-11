// Local-first LLM adaptor with key stored in localStorage.
// This is a thin wrapper; actual vendor calls happen client-side only when a key exists.

import type { AgentToolName } from './schema';

export type LLMVendor = 'openai' | 'openrouter' | 'anthropic' | 'gemini';

export interface LLMConfig {
  vendor: LLMVendor;
  apiKey: string;
  model: string;
}

const LOCAL_KEY = 'cashcanvas_llm_config_v1';

export function loadLLMConfig(): LLMConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveLLMConfig(cfg: LLMConfig | null): void {
  if (typeof window === 'undefined') return;
  if (!cfg) {
    localStorage.removeItem(LOCAL_KEY);
    return;
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg));
}

export function hasLLM(): boolean {
  const cfg = loadLLMConfig();
  return !!(cfg && cfg.apiKey && cfg.model && cfg.vendor);
}

export const systemPrompt = `You are SharpLedger, a world-class personal accountant with dry wit and helpful sarcasm.
- Always return output as structured Markdown suitable for UI rendering.
- Use short headings (###), bullet lists, and concise tables when helpful.
- When you need more info, ask with a short bullet checklist, not a paragraph.
- Be concise, numerical, and correct. If you need math, call the Calculator tool.
- Never modify data. Never drop/alter tables. You have read-only tools for analysis.
- Prefer charts/KPIs when user asks for comparisons, trends, or breakdowns.
- If you need to compute, call tools instead of guessing.
`;

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export async function chatLLM(messages: ChatMessage[]): Promise<string> {
  const cfg = loadLLMConfig();
  if (!cfg) throw new Error('LLM not configured');

  // NOTE: simple fetch to vendor endpoints. We avoid server proxy to keep local-first behavior.
  if (cfg.vendor === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: cfg.model, messages })
    });
    if (!resp.ok) {
      let detail = 'unknown error';
      try { const j = await resp.json(); detail = j?.error?.message || JSON.stringify(j); } catch { detail = await resp.text(); }
      throw new Error(`OpenAI ${resp.status}: ${detail}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (cfg.vendor === 'gemini') {
    // Map OpenAI-style messages to Gemini contents
    const system = messages.find(m => m.role === 'system')?.content;
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const body: any = { contents };
    if (system) {
      body.systemInstruction = { role: 'system', parts: [{ text: system }] };
    }

    const apiKey = cfg.apiKey; // preserve type narrowing for inner closures
    const requestGeminiModel = async (modelName: string): Promise<any> => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      // Lightweight retry for transient rate limits
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (resp.ok) {
          return resp.json();
        }
        // Parse error details once
        let detail = 'unknown error';
        try { const j = await resp.json(); detail = j?.error?.message || JSON.stringify(j); } catch { try { detail = await resp.text(); } catch { /* ignore */ } }
        if (resp.status === 429 && attempt < maxAttempts) {
          // Exponential backoff: 800ms, 1600ms
          const backoffMs = 800 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        throw new Error(`Gemini ${resp.status}: ${detail}`);
      }
      throw new Error('Gemini 429: Rate limited after retries');
    };

    let data: any;
    try {
      data = await requestGeminiModel(cfg.model);
    } catch (e: any) {
      const message = String(e?.message || e || '');
      // Fallback to a cheaper model when hitting quota/rate limits on Pro
      const shouldFallback = message.includes('429') && /2\.5.*pro/i.test(cfg.model);
      if (shouldFallback) {
        try {
          data = await requestGeminiModel('gemini-1.5-flash');
        } catch {
          throw e; // bubble original error if fallback also fails
        }
      } else {
        throw e;
      }
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p?.text).filter(Boolean).join('\n');
    return text || '';
  }

  // Extend with other vendors as needed
  throw new Error('Unsupported vendor');
}

export interface ToolInvocation {
  name: AgentToolName;
  args: Record<string, unknown>;
}

export async function testLLMConfig(): Promise<{ ok: boolean; message?: string }> {
  const cfg = loadLLMConfig();
  if (!cfg) return { ok: false, message: 'No configuration' };
  if (cfg.vendor === 'openai') {
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${cfg.apiKey}` }
      });
      if (!resp.ok) {
        let detail = 'unknown error';
        try { const j = await resp.json(); detail = j?.error?.message || JSON.stringify(j); } catch { detail = await resp.text(); }
        return { ok: false, message: `OpenAI ${resp.status}: ${detail}` };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e) };
    }
  }
  if (cfg.vendor === 'gemini') {
    try {
      // Prefer checking the specific model to surface bad model names
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}?key=${encodeURIComponent(cfg.apiKey)}`);
      if (!resp.ok) {
        let detail = 'unknown error';
        try { const j = await resp.json(); detail = j?.error?.message || JSON.stringify(j); } catch { detail = await resp.text(); }
        return { ok: false, message: `Gemini ${resp.status}: ${detail}` };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e) };
    }
  }
  return { ok: false, message: 'Unsupported vendor' };
}



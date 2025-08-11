import React, { useEffect, useState } from 'react';
import { loadLLMConfig, saveLLMConfig, testLLMConfig, chatLLM, systemPrompt, type LLMConfig } from '../../lib/agent/llm';

interface Props { onClose: () => void; onSaved: () => void }

export default function LLMSettingsModal({ onClose, onSaved }: Props) {
  const [vendor, setVendor] = useState<LLMConfig['vendor']>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cfg = loadLLMConfig();
    if (cfg) { setVendor(cfg.vendor); setApiKey(cfg.apiKey); setModel(cfg.model); }
  }, []);

  const validate = (): string | null => {
    if (!apiKey || apiKey.length < 10) return 'Enter a valid API key';
    if (!model) return 'Model is required';
    return null;
  };

  const save = () => {
    const v = validate();
    if (v) { setError(v); return; }
    saveLLMConfig({ vendor, apiKey, model });
    onSaved();
    onClose();
  };

  const clear = () => {
    saveLLMConfig(null);
    onSaved();
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3 style={{ marginTop: 0 }}>LLM Settings</h3>
        <p className="muted" style={{ marginTop: 0 }}>Keys are stored locally in your browser. Nothing is sent to our servers.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>Vendor</label>
          <select value={vendor} onChange={(e) => setVendor(e.target.value as any)}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini (Google)</option>
          </select>
          <label>API Key</label>
          <input
            type="password"
            placeholder={vendor === 'openai' ? 'sk-...' : 'AIza...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <label>Model</label>
          <input
            placeholder={vendor === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-pro'}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          {error && <div style={{ color: '#ff8fb0' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost" onClick={async () => {
                const v = validate();
                if (v) { setError(v); return; }
                // Save and run a minimal chat to validate end-to-end
                saveLLMConfig({ vendor, apiKey, model });
                try {
                  // Quick capability check first to surface auth errors fast
                  const pre = await testLLMConfig();
                  if (!pre.ok) { setError(pre.message || 'Validation failed'); return; }
                  const reply = await chatLLM([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'hi' },
                  ]);
                  setError(reply ? 'Approved ✓' : 'Approved');
                  onSaved();
                } catch (e: any) {
                  setError(e?.message || 'Validation failed');
                }
              }}>Validate</button>
              <button className="btn ghost" onClick={clear}>Remove</button>
              <button className="btn primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



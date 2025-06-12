import { useState } from 'react';
import React from 'react';
interface TagModalProps {
  onSave: (rule: any) => void;
  onClose: () => void;
}

export default function TagModal({ onSave, onClose }: TagModalProps) {
  const [rule, setRule] = useState({ pattern: '', category: '' });
  
  const handleSave = () => {
    if (rule.pattern && rule.category) {
      onSave(rule);
    }
  };
  
  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', minWidth: '300px' }}>
        <h3>Add Category Rule</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label>Pattern:</label>
          <input
            type="text"
            value={rule.pattern}
            onChange={(e) => setRule({ ...rule, pattern: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Category:</label>
          <input
            type="text"
            value={rule.category}
            onChange={(e) => setRule({ ...rule, category: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleSave} style={{ padding: '0.5rem 1rem' }}>
            Save
          </button>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

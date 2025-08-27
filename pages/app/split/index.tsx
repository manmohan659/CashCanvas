import React, { useEffect, useState } from 'react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { listGroups, createGroup } from '../../../lib/split/logic';
import { listUsers } from '../../../lib/sqlite/init';

export default function SplitHome() {
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [newGroupName, setNewGroupName] = useState('');
  useEffect(() => {
    (async () => {
      try { const gs = await listGroups(); setGroups(gs as any); } catch {}
    })();
  }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h2 style={{ margin: 0 }}>Shared Expenses</h2>
      <Card title="Groups" right={
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Group name"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8 }}
          />
          <Button disabled={!newGroupName.trim()} title={!newGroupName.trim() ? 'Enter a group name' : ''} onClick={async () => {
            const name = newGroupName.trim();
            if (!name) return;
            try {
              // Start with current user only; members can be added in detail page
              const id = await createGroup(name, []);
              setNewGroupName('');
              const gs = await listGroups();
              setGroups(gs as any);
              window.location.href = `/app/split/${id}`;
            } catch (e) { alert('Failed to create group'); }
          }}>New Group</Button>
        </div>
      }>
        {groups.length === 0 ? (
          <p className="muted">No groups yet. Use the agent or UI to create one and add an expense.</p>
        ) : (
          <ul>
            {groups.map(g => (
              <li key={g.id}><a href={`/app/split/${g.id}`}>{g.name}</a></li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Quick Add" right={<span className="muted">Agent-friendly</span>}>
        <p className="muted">Try: &quot;Add dinner from this photo, split sushi with Me + YJ only, rest with all of us in Friends NYC&quot;</p>
      </Card>
    </div>
  );
}



import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { getGroup, getGroupMembers, groupBalances, listGroupExpenses, listGroupPayments, addMember, recordExpense, recordPayment, saveAttachmentBase64 } from '../../../lib/split/logic';

export default function GroupDetail() {
  const router = useRouter();
  const groupId = String(router.query.groupId || '');
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<Array<{ member_id: string; friend_id: string; display_name: string }>>([]);
  const [balances, setBalances] = useState<any>({ balances: [], edges: [] });
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Add member UI state
  const [newFriendName, setNewFriendName] = useState('');

  // Add expense UI state
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [splitType, setSplitType] = useState<'equal'|'exact'|'percent'|'shares'|'itemized'>('equal');
  const [splitJson, setSplitJson] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState('1');
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      setLoading(true);
      try {
        const [g, m, b, ex, pa] = await Promise.all([
          getGroup(groupId),
          getGroupMembers(groupId),
          groupBalances(groupId),
          listGroupExpenses(groupId),
          listGroupPayments(groupId),
        ]);
        setGroup(g);
        setMembers(m);
        setBalances(b);
        setExpenses(ex);
        setPayments(pa);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  const onAddMember = async () => {
    const name = newFriendName.trim();
    if (!name) return;
    try {
      const { createFriend } = await import('../../../lib/split/logic');
      const fid = await createFriend(name);
      await addMember(groupId, fid);
      setNewFriendName('');
      const m = await getGroupMembers(groupId);
      setMembers(m);
    } catch { alert('Failed to add member'); }
  };

  const onAddExpense = async () => {
    const amt = Number(amount);
    if (!desc || !Number.isFinite(amt) || amt <= 0) { alert('Enter description and positive amount'); return; }
    try {
      const payerMemberId = payer || (members[0]?.member_id || '');
      const options = (() => {
        const base = splitJson ? JSON.parse(splitJson) : {};
        if (currency && (group?.default_currency || 'USD') && currency !== (group?.default_currency || 'USD')) {
          base.fx = { currency, fx_rate: Number(fxRate || '1') };
        }
        return base;
      })();
      const id = await recordExpense({
        group_id: groupId,
        payer_member_id: payerMemberId,
        description: desc,
        amount: amt,
        currency: currency || group?.default_currency || 'USD',
        split_type: splitType,
        split_options: options,
      });
      if (attachment) {
        const b64 = await fileToBase64(attachment);
        await saveAttachmentBase64(id, attachment.type || 'image/png', b64, attachment.size);
        setAttachment(null);
      }
      const [b, ex] = await Promise.all([groupBalances(groupId), listGroupExpenses(groupId)]);
      setBalances(b); setExpenses(ex); setDesc(''); setAmount(''); setSplitJson('');
    } catch (e) { alert('Failed to add expense'); }
  };

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const onSettle = async () => {
    try {
      const simp = balances.edges as Array<{ from: string; to: string; amount: number }>;
      if (!simp || simp.length === 0) { alert('Nothing to settle'); return; }
      for (const e of simp) {
        await recordPayment({ group_id: groupId, from_member_id: e.from, to_member_id: e.to, amount: e.amount, currency: group?.default_currency || 'USD' });
      }
      const [b, pa] = await Promise.all([groupBalances(groupId), listGroupPayments(groupId)]);
      setBalances(b); setPayments(pa);
    } catch { alert('Failed to settle'); }
  };

  if (loading) return <Card title="Loading"><p className="muted">Fetching group…</p></Card>;
  if (!group) return <Card title="Not found"><p className="muted">Group does not exist.</p></Card>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h2 style={{ margin: 0 }}>{group.name}</h2>

      <Card title="Members" right={
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Add member by name" value={newFriendName} onChange={e => setNewFriendName(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8 }} />
          <Button onClick={onAddMember}>Add</Button>
        </div>
      }>
        <ul>
          {members.map(m => (<li key={m.member_id}>{m.display_name}</li>))}
        </ul>
      </Card>

      <Card title="Balances" right={<Button onClick={onSettle}>Settle Up (Simplify)</Button>}>
        <div className="grid" style={{ gap: 8 }}>
          {balances.balances.map((b: any) => (
            <div key={b.member_id} className="muted">{b.display_name}: {b.net.toFixed(2)}</div>
          ))}
        </div>
      </Card>

      <Card title="Add Expense">
        <div className="grid" style={{ gap: 8 }}>
          <input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8 }} />
          <input placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Currency (e.g., USD)" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} style={{ padding: '8px 10px', borderRadius: 8 }} />
            <input placeholder="FX rate to group currency" value={fxRate} onChange={e => setFxRate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8 }} />
          </div>
          <select value={payer} onChange={e => setPayer(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8 }}>
            <option value="">Payer (default first)</option>
            {members.map(m => <option key={m.member_id} value={m.member_id}>{m.display_name}</option>)}
          </select>
          <select value={splitType} onChange={e => setSplitType(e.target.value as any)} style={{ padding: '8px 10px', borderRadius: 8 }}>
            <option value="equal">Equal</option>
            <option value="exact">Exact</option>
            <option value="percent">Percent</option>
            <option value="shares">Shares</option>
            <option value="itemized">Itemized (use options JSON)</option>
          </select>
          <textarea placeholder='Split options JSON (e.g., {"amounts":[10,5,...]} or {"items":[{"amount":12,"member_ids":["m1","m2"]}]})' value={splitJson} onChange={e => setSplitJson(e.target.value)} rows={4} style={{ padding: 8, borderRadius: 8 }} />
          <input type="file" accept="image/*,application/pdf" onChange={e => setAttachment(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
          <Button onClick={onAddExpense}>Add Expense</Button>
        </div>
      </Card>

      <Card title="Recent Activity">
        <h4>Expenses</h4>
        <ul>
          {expenses.map(e => (
            <li key={e.id}>{e.date} — {e.description} — {e.amount.toFixed(2)} {e.currency}</li>
          ))}
        </ul>
        <h4>Payments</h4>
        <ul>
          {payments.map(p => (
            <li key={p.id}>{p.date} — {p.amount.toFixed(2)} {p.currency}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}



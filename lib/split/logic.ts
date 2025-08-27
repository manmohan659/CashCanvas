import { query, run, upsertRow, getCurrentUserId } from '../sqlite/init';
import { BalanceSummary, Expense, ExpenseSplit, Group, GroupMember, OCRItem, Payment, SimplifyEdge, SplitType } from './types';

function nowIso(): string { return new Date().toISOString(); }
function todayIso(): string { return new Date().toISOString().slice(0,10); }

function fnv32(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

export function genId(prefix: string, parts: string[]): string {
  return `${prefix}_${fnv32(parts.join('|'))}`;
}

export async function listFriends(): Promise<Array<{ id: string; display_name: string }>> {
  const userId = await getCurrentUserId();
  const rows = await query('SELECT id, display_name FROM friends WHERE user_id = ? ORDER BY lower(display_name)', [userId]);
  return rows as any[];
}

export async function createFriend(display_name: string, email?: string | null, phone?: string | null): Promise<string> {
  const userId = await getCurrentUserId();
  const id = genId('fr', [userId, display_name, email || '', phone || '']);
  await upsertRow('friends', { id, user_id: userId, display_name, email: email || null, phone: phone || null, created_at: nowIso() });
  return id;
}

export async function ensureSelfFriendId(): Promise<string> {
  const userId = await getCurrentUserId();
  const rows = await query('SELECT display_name FROM users WHERE id = ? LIMIT 1', [userId]);
  const display = (rows && rows[0] && (rows[0] as any).display_name) ? String((rows[0] as any).display_name) : 'Me';
  const f = await query('SELECT id FROM friends WHERE user_id = ? AND lower(display_name) = lower(?) LIMIT 1', [userId, display]);
  if (f && f[0]) return (f[0] as any).id;
  return await createFriend(display);
}

export async function listGroups(): Promise<Group[]> {
  const userId = await getCurrentUserId();
  const rows = await query('SELECT id, user_id, name, default_currency, meta, created_at FROM split_groups WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows as any[];
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const userId = await getCurrentUserId();
  const rows = await query('SELECT id, user_id, name, default_currency, meta, created_at FROM split_groups WHERE user_id = ? AND id = ? LIMIT 1', [userId, groupId]);
  return (rows && rows[0]) ? (rows[0] as any) : null;
}

export async function createGroup(name: string, memberFriendIds: string[], defaultCurrency: string = 'USD'): Promise<string> {
  const userId = await getCurrentUserId();
  const id = genId('grp', [userId, name, defaultCurrency]);
  await upsertRow('split_groups', { id, user_id: userId, name, default_currency: defaultCurrency, meta: null, created_at: nowIso() });
  // Add members
  const members = (memberFriendIds && memberFriendIds.length > 0) ? memberFriendIds : [await ensureSelfFriendId()];
  for (const friend_id of members) {
    const gmId = genId('gm', [id, friend_id]);
    await upsertRow('split_group_members', { id: gmId, user_id: userId, group_id: id, friend_id, role: 'member', joined_at: nowIso() });
  }
  return id;
}

export async function addMember(groupId: string, friendId: string): Promise<string> {
  const userId = await getCurrentUserId();
  const id = genId('gm', [groupId, friendId]);
  await upsertRow('split_group_members', { id, user_id: userId, group_id: groupId, friend_id: friendId, role: 'member', joined_at: nowIso() });
  return id;
}

export async function getGroupMembers(groupId: string): Promise<Array<{ member_id: string; friend_id: string; display_name: string }>> {
  const userId = await getCurrentUserId();
  const rows = await query(
    `SELECT m.id as member_id, m.friend_id, f.display_name
     FROM split_group_members m
     JOIN friends f ON f.id = m.friend_id
     WHERE m.user_id = ? AND m.group_id = ?
     ORDER BY lower(f.display_name)`,
    [userId, groupId]
  );
  return rows as any[];
}

export async function listGroupExpenses(groupId: string): Promise<Array<{ id: string; date: string; description: string; amount: number; currency: string; payer_member_id: string; split_type: string }>> {
  const userId = await getCurrentUserId();
  const rows = await query(
    `SELECT id, date, description, amount, currency, payer_member_id, split_type
     FROM split_expenses
     WHERE user_id = ? AND group_id = ?
     ORDER BY date DESC, created_at DESC`,
    [userId, groupId]
  );
  return rows as any[];
}

export async function listGroupPayments(groupId: string): Promise<Array<{ id: string; date: string; from_member_id: string; to_member_id: string; amount: number; currency: string }>> {
  const userId = await getCurrentUserId();
  const rows = await query(
    `SELECT id, date, from_member_id, to_member_id, amount, currency
     FROM split_payments
     WHERE user_id = ? AND group_id = ?
     ORDER BY date DESC, created_at DESC`,
    [userId, groupId]
  );
  return rows as any[];
}

export async function saveAttachmentBase64(expenseId: string, mime: string, base64: string, size: number): Promise<string> {
  const userId = await getCurrentUserId();
  const id = genId('att', [userId, expenseId, String(size), mime]);
  await upsertRow('split_attachments', {
    id,
    user_id: userId,
    expense_id: expenseId,
    mime,
    size,
    data_base64: base64,
    created_at: nowIso(),
  });
  return id;
}

export async function listAttachments(expenseId: string): Promise<Array<{ id: string; mime: string; size: number; data_base64: string }>> {
  const userId = await getCurrentUserId();
  const rows = await query('SELECT id, mime, size, data_base64 FROM split_attachments WHERE user_id = ? AND expense_id = ? ORDER BY created_at DESC', [userId, expenseId]);
  return rows as any[];
}

export function computeSplits(splitType: SplitType, total: number, memberIds: string[], options: any): Array<{ member_id: string; amount: number }>{
  const n = memberIds.length;
  const round2 = (x: number) => Math.round(x * 100) / 100;
  if (n === 0) return [];
  if (splitType === 'equal') {
    const base = round2(total / n);
    let remaining = round2(total - base * n);
    return memberIds.map((id, idx) => {
      const extra = remaining !== 0 && idx < Math.abs(Math.round(remaining * 100)) % n ? Math.sign(remaining) * 0.01 : 0;
      return { member_id: id, amount: round2(base + extra) };
    });
  }
  if (splitType === 'exact') {
    const amounts: number[] = options?.amounts || [];
    if (amounts.length !== n) throw new Error('Exact split requires amounts per member');
    const sum = amounts.reduce((s: number, a: number) => s + a, 0);
    if (Math.abs(sum - total) > 0.01) throw new Error('Exact split amounts must sum to total');
    return memberIds.map((id, i) => ({ member_id: id, amount: round2(amounts[i]) }));
  }
  if (splitType === 'percent') {
    const percents: number[] = options?.percents || [];
    if (percents.length !== n) throw new Error('Percent split requires percents per member');
    const sum = percents.reduce((s: number, p: number) => s + p, 0);
    if (Math.abs(sum - 100) > 0.01) throw new Error('Percent split must sum to 100');
    return memberIds.map((id, i) => ({ member_id: id, amount: round2((percents[i] / 100) * total) }));
  }
  if (splitType === 'shares') {
    const shares: number[] = options?.shares || [];
    if (shares.length !== n) throw new Error('Shares split requires weights per member');
    const sum = shares.reduce((s: number, w: number) => s + w, 0) || 1;
    return memberIds.map((id, i) => ({ member_id: id, amount: round2((shares[i] / sum) * total) }));
  }
  if (splitType === 'itemized') {
    // options.items: Array<{ amount: number; member_ids?: string[] }>
    const items: Array<{ amount: number; member_ids?: string[] }> = options?.items || [];
    const totals = new Map<string, number>();
    for (const id of memberIds) totals.set(id, 0);
    for (const it of items) {
      const targets = (it.member_ids && it.member_ids.length > 0) ? it.member_ids : memberIds;
      const share = round2(it.amount / targets.length);
      for (const t of targets) totals.set(t, round2((totals.get(t) || 0) + share));
    }
    return memberIds.map(id => ({ member_id: id, amount: round2(totals.get(id) || 0) }));
  }
  if (splitType === 'time') {
    // options.days: number[] stays per member
    const days: number[] = options?.days || [];
    if (days.length !== n) throw new Error('Time split requires days per member');
    const sum = days.reduce((s: number, d: number) => s + d, 0) || 1;
    return memberIds.map((id, i) => ({ member_id: id, amount: round2((days[i] / sum) * total) }));
  }
  throw new Error('Unsupported split type');
}

export async function recordExpense(params: {
  group_id: string;
  payer_member_id: string;
  description: string;
  date?: string;
  amount: number;
  currency?: string;
  category?: string | null;
  notes?: string | null;
  split_type: SplitType;
  split_options: any;
}): Promise<string> {
  const userId = await getCurrentUserId();
  const date = params.date || todayIso();
  const currency = params.currency || 'USD';
  const id = genId('exp', [userId, params.group_id, date, params.description, String(params.amount)]);
  const created_at = nowIso();
  const split_meta = JSON.stringify(params.split_options || {});
  await upsertRow('split_expenses', {
    id,
    user_id: userId,
    group_id: params.group_id,
    payer_member_id: params.payer_member_id,
    description: params.description,
    date,
    amount: params.amount,
    currency,
    fx_rate: null,
    category: params.category || null,
    notes: params.notes || null,
    split_type: params.split_type,
    split_meta,
    created_at,
  });
  // Compute splits and insert
  const members = await getGroupMembers(params.group_id);
  const memberIds = members.map(m => m.member_id);
  const splits = computeSplits(params.split_type, params.amount, memberIds, params.split_options);
  for (const s of splits) {
    const sid = genId('spl', [id, s.member_id]);
    await upsertRow('split_expense_splits', {
      id: sid,
      user_id: userId,
      expense_id: id,
      member_id: s.member_id,
      amount_owed: s.amount,
      weight: params.split_type === 'shares' ? (params.split_options?.shares?.[memberIds.indexOf(s.member_id)] || null) : null,
      percent: params.split_type === 'percent' ? (params.split_options?.percents?.[memberIds.indexOf(s.member_id)] || null) : null,
      itemized_meta: params.split_type === 'itemized' ? JSON.stringify(params.split_options?.items || []) : null,
    });
  }
  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-data-changed')); } catch {}
  return id;
}

export async function recordPayment(p: {
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  currency?: string;
  date?: string;
  method?: string | null;
  note?: string | null;
}): Promise<string> {
  const userId = await getCurrentUserId();
  const id = genId('pay', [userId, p.group_id, p.from_member_id, p.to_member_id, String(p.amount), p.date || todayIso()]);
  await upsertRow('split_payments', {
    id,
    user_id: userId,
    group_id: p.group_id,
    from_member_id: p.from_member_id,
    to_member_id: p.to_member_id,
    amount: p.amount,
    currency: p.currency || 'USD',
    fx_rate: null,
    method: p.method || null,
    date: p.date || todayIso(),
    note: p.note || null,
    created_at: nowIso(),
  });
  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cashcanvas-data-changed')); } catch {}
  return id;
}

export async function groupBalances(groupId: string): Promise<{ balances: BalanceSummary[]; edges: Array<{ from: string; to: string; amount: number }> }> {
  const userId = await getCurrentUserId();
  // Compute owed per member from expenses, converted to group currency via fx_rate (default 1)
  const owedRows = await query(
    `SELECT s.member_id, SUM(s.amount_owed * COALESCE(e.fx_rate, 1)) AS owed
     FROM split_expense_splits s
     JOIN split_expenses e ON e.id = s.expense_id
     WHERE s.user_id = ? AND e.group_id = ?
     GROUP BY s.member_id`,
    [userId, groupId]
  );
  const owed = new Map<string, number>();
  for (const r of owedRows as any[]) owed.set(r.member_id, Number(r.owed || 0));

  // Compute paid shares (payer receives credit), convert by fx_rate
  const paidRows = await query(
    `SELECT e.payer_member_id AS member_id, SUM(e.amount * COALESCE(e.fx_rate, 1)) AS paid
     FROM split_expenses e
     WHERE e.user_id = ? AND e.group_id = ?
     GROUP BY e.payer_member_id`,
    [userId, groupId]
  );
  const paid = new Map<string, number>();
  for (const r of paidRows as any[]) paid.set(r.member_id, Number(r.paid || 0));

  // Payments reduce debts (from -> to). Convert by fx_rate
  const payRows = await query(
    `SELECT from_member_id, to_member_id, SUM(amount * COALESCE(fx_rate, 1)) AS amt
     FROM split_payments
     WHERE user_id = ? AND group_id = ?
     GROUP BY from_member_id, to_member_id`,
    [userId, groupId]
  );

  const memberInfo = await getGroupMembers(groupId);
  const members = new Map<string, { friend_id: string; display_name: string }>();
  for (const m of memberInfo) members.set(m.member_id, { friend_id: m.friend_id, display_name: m.display_name });

  const net = new Map<string, number>();
  for (const m of memberInfo) net.set(m.member_id, 0);
  for (const m of memberInfo) {
    const o = Number(owed.get(m.member_id) || 0);
    const p = Number(paid.get(m.member_id) || 0);
    net.set(m.member_id, (net.get(m.member_id) || 0) + (p - o));
  }
  for (const r of payRows as any[]) {
    // from paid -> reduces what from owes; increases to's net
    net.set(r.from_member_id, (net.get(r.from_member_id) || 0) - Number(r.amt || 0));
    net.set(r.to_member_id, (net.get(r.to_member_id) || 0) + Number(r.amt || 0));
  }

  const balances: BalanceSummary[] = Array.from(net.entries()).map(([member_id, amount]) => {
    const info = members.get(member_id)!;
    return { member_id, friend_id: info.friend_id, display_name: info.display_name, net: Math.round(amount * 100) / 100 };
  });

  // Construct debtor/creditor edges
  const debtors = balances.filter(b => b.net < -0.009).map(b => ({ id: b.member_id, amt: -b.net }));
  const creditors = balances.filter(b => b.net > 0.009).map(b => ({ id: b.member_id, amt: b.net }));
  const edges: Array<{ from: string; to: string; amount: number }> = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.amt, c.amt);
    if (pay > 0.009) edges.push({ from: d.id, to: c.id, amount: Math.round(pay * 100) / 100 });
    d.amt = Math.round((d.amt - pay) * 100) / 100;
    c.amt = Math.round((c.amt - pay) * 100) / 100;
    if (d.amt <= 0.009) i++;
    if (c.amt <= 0.009) j++;
  }

  return { balances, edges };
}

export async function simplifyDebts(groupId: string): Promise<SimplifyEdge[]> {
  const { edges } = await groupBalances(groupId);
  return edges.map(e => ({ from_member_id: e.from, to_member_id: e.to, amount: e.amount }));
}



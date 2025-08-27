import { createFriend, createGroup, addMember, getGroupMembers, listFriends, listGroups, recordExpense, groupBalances } from './logic';
import { extractItemsFromImageBase64 } from './ocr';
import type { SmartExpenseIntent } from './types';
import { query, getCurrentUserId } from '../sqlite/init';
import { hasLLM, chatLLM } from '../agent/llm';

async function resolveFriendIds(namesOrIds: string[]): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!namesOrIds || namesOrIds.length === 0) return [];
  const all = await query('SELECT id, display_name FROM friends WHERE user_id = ?', [userId]) as Array<{ id: string; display_name: string }>;
  const mapByName = new Map(all.map(f => [f.display_name.toLowerCase(), f.id]));
  const set = new Set<string>();
  for (const v of namesOrIds) {
    const s = String(v || '').trim();
    if (!s) continue;
    const byId = all.find(f => f.id === s);
    if (byId) { set.add(byId.id); continue; }
    const byName = mapByName.get(s.toLowerCase());
    if (byName) { set.add(byName); continue; }
  }
  return Array.from(set);
}

async function ensureGroup(groupHint: string | undefined, memberFriendIds: string[], allowCreate: boolean): Promise<string> {
  const groups = await listGroups();
  if (groupHint) {
    const byId = groups.find(g => g.id === groupHint);
    const byName = groups.find(g => g.name.toLowerCase() === groupHint.toLowerCase());
    const g = byId || byName;
    if (g) {
      // Ensure all provided friends are members
      const members = await getGroupMembers(g.id);
      const existingFriendIds = new Set(members.map(m => m.friend_id));
      for (const fid of memberFriendIds) {
        if (!existingFriendIds.has(fid)) await addMember(g.id, fid);
      }
      return g.id;
    }
  }
  if (!allowCreate) throw new Error('Group not found and creation not allowed');
  return await createGroup(groupHint || 'New Group', memberFriendIds);
}

export async function recordExpenseSmart(intent: SmartExpenseIntent): Promise<{ expense_id: string; group_id: string }> {
  // Extract items if image present
  let items = intent.items || [];
  if ((!items || items.length === 0) && intent.items_image_base64) {
    try { items = await extractItemsFromImageBase64(intent.items_image_base64); } catch {}
  }
  // Optionally auto-create friends if not found
  async function resolveOrCreate(namesOrIds: string[]): Promise<string[]> {
    const found = await resolveFriendIds(namesOrIds);
    if ((found.length === namesOrIds.length) || !intent.auto_create_friends) return found;
    const all = await query('SELECT id, display_name FROM friends WHERE user_id = ?', [await getCurrentUserId()]) as Array<{ id: string; display_name: string }>;
    const byName = new Set(all.map(f => f.display_name.toLowerCase()));
    const created: string[] = [];
    for (const v of namesOrIds) {
      const name = String(v || '').trim();
      if (!name) continue;
      const exists = all.find(f => f.id === name) || byName.has(name.toLowerCase());
      if (!exists) {
        const id = await createFriend(name);
        created.push(id);
      }
    }
    const again = await resolveFriendIds(namesOrIds);
    return again;
  }

  const allParticipants = await resolveOrCreate(intent.participants_all || []);
  const subsetParticipants = await resolveOrCreate(intent.participants_subset || []);
  const payerIds = await resolveOrCreate(intent.payer ? [intent.payer] : []);
  const payerFriendId = payerIds[0] || allParticipants[0];

  if (!payerFriendId) throw new Error('No payer specified or resolvable');
  const memberFriendIds = Array.from(new Set([payerFriendId, ...allParticipants]));
  const groupId = await ensureGroup(intent.group_hint, memberFriendIds, !!intent.create_group_if_missing);
  const members = await getGroupMembers(groupId);
  const memberByFriend = new Map(members.map(m => [m.friend_id, m.member_id] as const));
  const payerMemberId = memberByFriend.get(payerFriendId)!;

  // Build itemized split options: lines targeted to subset or all
  const restWith = await resolveFriendIds(intent.split_rest_with || []);
  const restTargets = restWith.length > 0 ? restWith : memberFriendIds;
  // Resolve per-item participants
  const itemsMapped = await (async () => {
    // If items already include participants, resolve those to friend ids; default remaining to restTargets
    if (items && items.length > 0 && items.some((it: any) => Array.isArray((it as any).participants))) {
      const mapped = await Promise.all(items.map(async (it: any) => {
        const member_ids = Array.isArray(it.participants) && it.participants.length > 0
          ? await resolveFriendIds(it.participants)
          : (subsetParticipants.length > 0 ? restTargets : memberFriendIds);
        return { amount: it.amount, member_ids };
      }));
      return mapped;
    }
    // If subset specified but not annotated per-item, try LLM classification to pick subset items vs rest
    if ((subsetParticipants.length > 0) && hasLLM() && items && items.length > 0) {
      try {
        const system = 'You assign receipt line items to either SUBSET or ALL. Output JSON array with { index, group } where group is "subset" or "all".';
        const payload = {
          instructions: 'User wants some items only with subset; others with all. Choose which items make sense to put into subset based on names (e.g., alcoholic drinks might be subset). Keep groups reasonable if uncertain.',
          participants_all: memberFriendIds,
          participants_subset: subsetParticipants,
          items: items.map((it, idx) => ({ index: idx, name: it.name, amount: it.amount }))
        };
        const resp = await chatLLM([
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) }
        ]);
        let mapping: Array<{ index: number; group: string }> = [];
        try { mapping = JSON.parse(resp); } catch {}
        if (Array.isArray(mapping) && mapping.length === items.length) {
          return items.map((it: any, idx: number) => ({
            amount: it.amount,
            member_ids: (mapping[idx]?.group === 'subset') ? subsetParticipants : memberFriendIds
          }));
        }
      } catch {}
    }
    // Fallbacks
    return items.map((it: any) => ({ amount: it.amount, member_ids: subsetParticipants.length > 0 ? subsetParticipants : memberFriendIds }));
  })();

  // If user specified only some items for subset, we assume remaining amount (if provided) is restWith
  // But since we only have per-item amounts, itemized already encodes it.
  const splitOptions = { items: itemsMapped.map(i => ({ amount: i.amount, member_ids: i.member_ids.map((fid: string) => memberByFriend.get(fid)!) })) };
  const total = itemsMapped.reduce((s, i) => s + i.amount, 0);

  const expense_id = await recordExpense({
    group_id: groupId,
    payer_member_id: payerMemberId,
    description: intent.description || 'Shared expense',
    date: intent.date,
    amount: total,
    currency: intent.currency || 'USD',
    category: null,
    notes: intent.notes || null,
    split_type: 'itemized',
    split_options: splitOptions,
  });
  return { expense_id, group_id: groupId };
}



export type CurrencyCode = string; // e.g., 'USD'

export type SplitType = 'equal' | 'exact' | 'percent' | 'shares' | 'itemized' | 'time';

export interface Friend {
  id: string;
  user_id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

export interface Group {
  id: string;
  user_id: string;
  name: string;
  default_currency: CurrencyCode;
  meta?: string | null;
  created_at?: string;
}

export interface GroupMember {
  id: string;
  user_id: string;
  group_id: string;
  friend_id: string;
  role?: 'member' | 'admin';
  joined_at?: string;
}

export interface Expense {
  id: string;
  user_id: string;
  group_id: string;
  payer_member_id: string;
  description: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: CurrencyCode;
  fx_rate?: number | null;
  category?: string | null;
  notes?: string | null;
  split_type: SplitType;
  split_meta?: string | null;
  created_at?: string;
}

export interface ExpenseSplit {
  id: string;
  user_id: string;
  expense_id: string;
  member_id: string;
  amount_owed: number; // in expense currency (or base after fx)
  weight?: number | null;
  percent?: number | null;
  itemized_meta?: string | null;
}

export interface Payment {
  id: string;
  user_id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  currency: CurrencyCode;
  fx_rate?: number | null;
  method?: string | null;
  date: string; // YYYY-MM-DD
  note?: string | null;
  created_at?: string;
}

export interface BalanceSummary {
  member_id: string;
  friend_id: string;
  display_name: string;
  net: number; // positive = others owe them; negative = they owe others
}

export interface SimplifyEdge {
  from_member_id: string;
  to_member_id: string;
  amount: number;
}

export interface OCRItem {
  name: string;
  amount: number;
  quantity?: number;
  categoryHint?: string;
}

export interface SmartExpenseIntent {
  group_hint?: string; // existing group name or id
  create_group_if_missing?: boolean;
  auto_create_friends?: boolean;
  participants_all?: string[]; // friend display names or ids
  participants_subset?: string[]; // subset for selected items
  payer?: string; // friend display name or id
  date?: string; // YYYY-MM-DD
  currency?: CurrencyCode;
  description?: string;
  notes?: string;
  items_image_base64?: string; // data URL or base64
  items?: Array<{ name: string; amount: number; participants?: string[] }>;
  split_rest_with?: string[]; // friend names/ids for remainder
}



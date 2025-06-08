import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Placeholder: would fetch transactions from Chase
  const demoTxn = {
    id: 'demo-txn',
    user_id: 'demo',
    account_id: 'demo-account',
    txn_date: new Date().toISOString().slice(0, 10),
    amount: -20.5,
    merchant: 'Demo Store',
    description: 'Test',
    category: null,
    imported_via: 'Chase',
  };
  await supabase.from('transactions').upsert(demoTxn);
  res.status(200).json({ success: true });
}

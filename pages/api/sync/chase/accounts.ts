import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Placeholder: would call Chase API here
  const demoAccount = {
    id: 'demo-account',
    user_id: 'demo',
    institution: 'Chase',
    provider_id: '123',
    name: 'Checking',
    type: 'CHECKING',
    currency: 'USD',
    balance: 0,
  };
  await supabase.from('accounts').upsert(demoAccount);
  res.status(200).json({ success: true });
}

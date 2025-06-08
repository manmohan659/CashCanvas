import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const rows = req.body;
  const { error } = await supabase.from('transactions').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ success: true });
}

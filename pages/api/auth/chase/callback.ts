import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthCode } from '../../../../lib/oauth';
import { supabase } from '../../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = getAuthCode(req);
  if (!code) return res.status(400).send('No code');
  // In real implementation we would exchange the code server-side.
  await supabase.from('chase_tokens').upsert({ user_id: 'demo', access_token: code });
  res.status(200).send('ok');
}

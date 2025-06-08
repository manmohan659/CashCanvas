// TODO: Implement Chase transactions sync
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // TODO: Get consentToken and accountId(s) for the user
  // TODO: Fetch transactions from Chase API for each account
  // TODO: Write returned transactions into Supabase
  res.status(200).json({ message: 'Chase transactions sync placeholder' });
}

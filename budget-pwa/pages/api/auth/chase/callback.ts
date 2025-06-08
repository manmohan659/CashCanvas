// TODO: Implement Chase OAuth callback handler
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;
  // TODO: Exchange authorization code for consent token
  // TODO: Store access_token (consentToken) in Supabase
  res.status(200).json({ message: 'Chase OAuth callback placeholder', code });
}

// TODO: Implement Chase accounts sync
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // TODO: Get consentToken for the user
  // TODO: Fetch accounts list from Chase API
  // TODO: Persist each accountId + metadata into Supabase
  res.status(200).json({ message: 'Chase accounts sync placeholder' });
}

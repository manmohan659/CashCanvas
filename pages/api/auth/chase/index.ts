import type { NextApiRequest, NextApiResponse } from 'next';
import { buildChaseAuthUrl } from '../../../../lib/oauth';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientId = process.env.CHASE_CLIENT_ID as string;
  const redirect = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/chase/callback`;
  const url = buildChaseAuthUrl(clientId, redirect);
  res.redirect(url);
}

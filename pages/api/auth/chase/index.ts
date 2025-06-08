// TODO: Implement redirection to Chase OAuth authorization URL
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // TODO: Construct the Chase OAuth URL with client_id, redirect_uri, scope, etc.
  const chaseAuthUrl = `https://api.chase.com/aggregator-oauth/authorize?response_type=code&client_id=${process.env.CHASE_CLIENT_ID}&redirect_uri=${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/chase/callback&scope=ais:consents:AccountAggregation`;
  res.redirect(302, chaseAuthUrl);
}

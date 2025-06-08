// TODO: Implement redirect to Chase OAuth
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // TODO: Construct Chase OAuth URL and redirect
  const chaseOAuthUrl = `https://api.chase.com/aggregator-oauth/authorize?response_type=code&client_id=${process.env.CHASE_CLIENT_ID}&redirect_uri=YOUR_CALLBACK_URL&scope=ais:consents:AccountAggregation`;
  res.redirect(302, chaseOAuthUrl);
}

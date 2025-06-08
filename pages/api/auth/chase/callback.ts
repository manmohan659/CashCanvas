// TODO: Implement Chase OAuth callback logic: exchange auth code for tokens
import type { NextApiRequest, NextApiResponse } from 'next';
// import { supabase } from '@/lib/supabase'; // Assuming supabase client is set up

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('Chase OAuth Error:', error, error_description);
    // TODO: Redirect to an error page or show an error message
    return res.status(400).json({ error: error_description || 'OAuth failed' });
  }

  if (code) {
    // TODO: Exchange authorization code for access token and refresh token
    // This involves a server-to-server POST request to Chase's token endpoint
    // const tokenResponse = await fetch('https://api.chase.com/aggregator-oauth/token', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //   body: new URLSearchParams({
    //     grant_type: 'authorization_code',
    //     code: code as string,
    //     redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/chase/callback`,
    //     client_id: process.env.CHASE_CLIENT_ID!,
    //     client_secret: process.env.CHASE_CLIENT_SECRET!,
    //   }),
    // });
    // const tokens = await tokenResponse.json();

    // TODO: Securely store tokens (e.g., in Supabase, associated with the user)
    // const { data: user, error: userError } = await supabase.auth.getUser(); // Get current user
    // if (userError || !user) { /* handle error */ }
    // await supabase.from('chase_tokens').upsert({ user_id: user.id, access_token: tokens.access_token, ... });

    // TODO: Redirect user to the app page (e.g., /app)
    res.redirect(302, '/app?status=chase_connected');
  } else {
    res.status(400).json({ error: 'No authorization code provided' });
  }
}

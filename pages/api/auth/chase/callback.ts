import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[api/auth/chase/callback] OAuth callback received');
  
  const { code, error } = req.query;
  
  if (error) {
    console.error('[api/auth/chase/callback] OAuth error:', error);
    return res.redirect('/app?status=chase_error');
  }
  
  if (!code) {
    console.error('[api/auth/chase/callback] No authorization code provided');
    return res.redirect('/app?status=chase_error');
  }
  
  try {
    console.log('[api/auth/chase/callback] Exchanging code for tokens');
    
    const tokenResponse = await fetch('https://api.chase.com/aggregator-oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: process.env.CHASE_CLIENT_ID!,
        client_secret: process.env.CHASE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/chase/callback`,
      }),
    });
    
    if (!tokenResponse.ok) {
      console.error('[api/auth/chase/callback] Token exchange failed:', tokenResponse.status);
      return res.redirect('/app?status=chase_error');
    }
    
    const tokens = await tokenResponse.json();
    console.log('[api/auth/chase/callback] Tokens received successfully');
    
    // Store tokens in Supabase
    const { error: dbError } = await supabase
      .from('chase_tokens')
      .upsert({
        user_id: 'current_user', // TODO: Get actual user ID from session
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      });
    
    if (dbError) {
      console.error('[api/auth/chase/callback] Failed to store tokens:', dbError);
      return res.redirect('/app?status=chase_error');
    }
    
    console.log('[api/auth/chase/callback] Tokens stored successfully');
    res.redirect('/app?status=chase_connected');
    
  } catch (error) {
    console.error('[api/auth/chase/callback] Callback processing failed:', error);
    res.redirect('/app?status=chase_error');
  }
}

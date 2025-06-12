import { NextApiRequest, NextApiResponse } from 'next';
import React from 'react';
import { buildChaseAuthUrl } from '../../../../lib/oauth';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[api/auth/chase] OAuth initiation requested');
  
  try {
    const authUrl = buildChaseAuthUrl(process.env.CHASE_CLIENT_ID!, process.env.CHASE_REDIRECT_URI!);
    console.log('[api/auth/chase] Redirecting to Chase OAuth:', authUrl);
    
    res.redirect(302, authUrl);
  } catch (error) {
    console.error('[api/auth/chase] OAuth initiation failed:', error);
    res.status(500).json({ error: 'OAuth setup failed' });
  }
}

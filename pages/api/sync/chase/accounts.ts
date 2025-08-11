import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[api/sync/chase/accounts] Accounts sync requested');
  
  try {
    const supa = createServerSupabaseClient({ req, res });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    // Get user's access token
    const { data: tokenData, error: tokenError } = await supa
      .from('chase_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .single();
    
    if (tokenError || !tokenData) {
      console.error('[api/sync/chase/accounts] No valid token found:', tokenError);
      return res.status(401).json({ error: 'No valid Chase token' });
    }
    
    console.log('[api/sync/chase/accounts] Fetching accounts from Chase API');
    
    const accountsResponse = await fetch('https://api.chase.com/aggregation-fdx/accounts', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json',
      },
    });
    
    if (!accountsResponse.ok) {
      console.error('[api/sync/chase/accounts] Chase API error:', accountsResponse.status);
      return res.status(accountsResponse.status).json({ error: 'Chase API error' });
    }
    
    const accountsData = await accountsResponse.json();
    console.log('[api/sync/chase/accounts] Received accounts:', accountsData.accounts?.length || 0);
    
    // Upsert accounts to Supabase
    let imported = 0;
    if (accountsData.accounts) {
      for (const account of accountsData.accounts) {
        const { error } = await supa
          .from('accounts')
          .upsert({
            id: account.accountId,
            user_id: user.id,
            name: account.accountName,
            type: account.accountType,
            balance: account.balance,
            currency: account.currency || 'USD',
          });
        
        if (!error) imported++;
      }
    }
    
    console.log('[api/sync/chase/accounts] Sync completed, imported:', imported);
    res.status(200).json({ imported });
    
  } catch (error) {
    console.error('[api/sync/chase/accounts] Sync failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Sync failed', details: message });
  }
}

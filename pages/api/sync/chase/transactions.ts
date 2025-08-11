import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[api/sync/chase/transactions] Transactions sync requested');
  
  try {
    const supa = createServerSupabaseClient({ req, res });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    // Get user's accounts and token
    const { data: tokenData } = await supa
      .from('chase_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .single();
    
    if (!tokenData) {
      console.error('[api/sync/chase/transactions] No valid token found');
      return res.status(401).json({ error: 'No valid Chase token' });
    }
    
    const { data: accounts } = await supa
      .from('accounts')
      .select('id')
      .eq('user_id', user.id);
    
    if (!accounts?.length) {
      console.log('[api/sync/chase/transactions] No accounts found, running accounts sync first');
      return res.status(400).json({ error: 'No accounts found. Run accounts sync first.' });
    }
    
    let totalImported = 0;
    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
    
    for (const account of accounts) {
      console.log('[api/sync/chase/transactions] Fetching transactions for account:', account.id);
      
      try {
        const transactionsResponse = await fetch(
          `https://api.chase.com/aggregation-fdx/accounts/${account.id}/transactions?fromDate=${fromDate}`,
          {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Accept': 'application/json',
            },
          }
        );
        
        if (transactionsResponse.status === 429) {
          console.warn('[api/sync/chase/transactions] Rate limited, backing off...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        if (!transactionsResponse.ok) {
          console.error('[api/sync/chase/transactions] API error for account:', account.id, transactionsResponse.status);
          continue;
        }
        
        const transactionsData = await transactionsResponse.json();
        
        if (transactionsData.transactions) {
          for (const transaction of transactionsData.transactions) {
            const { error } = await supa
              .from('transactions')
              .upsert({
                id: transaction.transactionId,
                user_id: user.id,
                account_id: account.id,
                date: transaction.postedTimestamp?.split('T')[0] || transaction.transactionTimestamp?.split('T')[0],
                amount: transaction.amount,
                description: transaction.description,
                merchant: transaction.merchant?.name || transaction.description,
                category: transaction.category,
              }, { onConflict: 'id' });
            
            if (!error) totalImported++;
          }
        }
        
        console.log('[api/sync/chase/transactions] Account sync completed:', account.id);
        
      } catch (accountError) {
        console.error('[api/sync/chase/transactions] Error syncing account:', account.id, accountError);
      }
    }
    
    console.log('[api/sync/chase/transactions] Sync completed, total imported:', totalImported);
    res.status(200).json({ imported: totalImported });
    
  } catch (error) {
    console.error('[api/sync/chase/transactions] Sync failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Sync failed', details: message });
  }
}

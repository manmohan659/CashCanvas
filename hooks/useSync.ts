import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** Syncs local SQLite data to Supabase */
export const useSync = () => {
  const [syncing, setSyncing] = useState(false);
  
  const sync = useCallback(async (rows: any[]) => {
    setSyncing(true);
    try {
      await supabase.from('transactions').upsert(rows);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }, []);
  
  return { sync, syncing };
};

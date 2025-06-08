import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** Syncs local SQLite data to Supabase */
export function useSync() {
  const sync = useCallback(async (rows: any[]) => {
    await supabase.from('transactions').upsert(rows);
  }, []);

  return { sync };
}

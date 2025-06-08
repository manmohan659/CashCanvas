import { createClient } from '@supabase/supabase-js';

// Supabase URL and anon/service keys come from environment variables.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase environment variables are not set');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

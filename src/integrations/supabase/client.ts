import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Supabase project: ivkvluezuiojovpotlyb (Tokyo, Pro tier).
// URL + anon key are hard-coded here because Vercel's dashboard env vars
// were stale from a previous (abandoned) project and silently shipped the
// wrong URL to production. Anon key is designed to be public — RLS on
// every table is what protects the data, not key secrecy.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ivkvluezuiojovpotlyb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2a3ZsdWV6dWlvam92cG90bHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzkyOTIsImV4cCI6MjA5NDk1NTI5Mn0.Z6uPWnL3C1YIT_uo5z-Lu94KqjXsc2-McCtVPbhqQaU';

// Sanity check: if the deployment somehow still pulled stale env vars
// pointing at the abandoned project, override with the correct project.
const CORRECT_REF = 'ivkvluezuiojovpotlyb';
const ABANDONED_REFS = ['yblyccthpqduyajgynsq', 'twqagwleffjggoemzfqs', 'xatwapycgoljbwzkhxtv'];
const url =
  ABANDONED_REFS.some((ref) => SUPABASE_URL.includes(ref))
    ? `https://${CORRECT_REF}.supabase.co`
    : SUPABASE_URL;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(url, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
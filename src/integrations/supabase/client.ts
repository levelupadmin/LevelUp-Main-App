import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { resolveSupabaseClientConfig } from './clientConfig';

const clientConfig = resolveSupabaseClientConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

// Direct Edge Function callers import these values instead of reading
// import.meta.env independently, so they cannot silently send an undefined key.
export const supabaseUrl = clientConfig.url;
export const supabasePublishableKey = clientConfig.publishableKey;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

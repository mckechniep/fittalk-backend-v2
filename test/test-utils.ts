import { createClient } from '@supabase/supabase-js';

/**
 * Utility to generate test JWT tokens using Supabase
 * Only use in development/test environment
 */
export async function getTestJWT(email: string, password: string): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase credentials not configured');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session?.access_token || '';
}
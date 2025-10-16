import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Validate required fields
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required in .env');
  }
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is required in .env');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in .env');
  }

  // Extract project ref from URL: https://xxxxx.supabase.co -> xxxxx
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error('Invalid SUPABASE_URL format. Expected: https://xxxxx.supabase.co');
  }

  return {
    url: supabaseUrl,
    anonKey,
    serviceRoleKey,
    projectRef,
    jwksUri: `${supabaseUrl}/auth/v1/jwks`,
    jwtAlgorithm: 'RS256',
  };
});
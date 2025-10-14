import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required');
  }

  // Extract project ref from URL: https://xxxxx.supabase.co -> xxxxx
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error('Invalid SUPABASE_URL format');
  }

  return {
    url: supabaseUrl,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    projectRef,
    jwksUri: `${supabaseUrl}/auth/v1/jwks`,
    jwtAlgorithm: process.env.JWT_ALGORITHM || 'RS256',
  };
});
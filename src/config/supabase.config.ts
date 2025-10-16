// src/config/supabase.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required in .env');
  }
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is required in .env');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in .env');
  }
  if (!jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET is required in .env');
  }
  
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error('Invalid SUPABASE_URL format. Expected: https://xxxxx.supabase.co');
  }
  
  return {
    url: supabaseUrl,
    anonKey,
    serviceRoleKey,
    jwtSecret,
    projectRef,
    jwtAlgorithm: 'HS256',
  };
});
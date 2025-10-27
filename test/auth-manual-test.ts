// test/auth-manual-test.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  console.log('🔐 Testing Supabase Auth...\n');

  // Test user credentials
  const testEmail = 'test@fittalk.com';
  const testPassword = 'TestPassword123!';

  try {
    // Try to sign up (will fail if user exists, that's ok)
    console.log('1️⃣ Attempting to create test user...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email: testEmail,
        password: testPassword,
      },
    );

    if (signUpError && !signUpError.message.includes('already registered')) {
      throw signUpError;
    }

    if (signUpData.user) {
      console.log('✅ User created:', signUpData.user.id);
    } else {
      console.log('ℹ️  User already exists, proceeding with sign in...');
    }

    // Sign in to get JWT
    console.log('\n2️⃣ Signing in to get JWT token...');
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

    if (signInError) throw signInError;

    const accessToken = signInData.session?.access_token;
    console.log('✅ JWT Token obtained');
    console.log(
      'Token (first 50 chars):',
      accessToken?.substring(0, 50) + '...',
    );
    console.log('\n📋 Copy this token for curl tests:\n');
    console.log(accessToken);
    console.log('\n');

    return accessToken;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

testAuth();

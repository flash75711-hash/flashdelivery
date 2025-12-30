/**
 * Script to create default Admin user
 * إنشاء مستخدم Admin افتراضي
 * 
 * Usage:
 * node scripts/create-admin.js
 * 
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  console.error('Required:');
  console.error('  - EXPO_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAdmin() {
  console.log('🚀 Starting admin user creation...\n');

  const phone = '+201200006637';
  const pin = '000000';
  const adminRole = 'admin';

  try {
    // Hash PIN
    console.log('🔐 Hashing PIN...');
    const pinHash = await bcrypt.hash(pin, 10);
    console.log('✅ PIN hashed successfully\n');

    // Check if admin user already exists
    console.log('🔍 Checking for existing admin user...');
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, phone, role')
      .eq('phone', phone)
      .single();

    if (existingProfile) {
      console.log('⚠️  Admin user already exists, updating...');
      
      // Update existing profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          pin_hash: pinHash,
          role: adminRole,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
        })
        .eq('id', existingProfile.id);

      if (updateError) {
        console.error('❌ Error updating profile:', updateError);
        throw updateError;
      }

      console.log('✅ Admin user updated successfully!');
      console.log('\n📋 Admin Credentials:');
      console.log('   Phone:', phone);
      console.log('   PIN:', pin);
      console.log('   Role:', adminRole);
      console.log('   User ID:', existingProfile.id);
      return;
    }

    // Create new user in auth.users
    console.log('👤 Creating user in auth.users...');
    const tempEmail = `admin-${Date.now()}@flash-delivery.local`;
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      phone: phone,
      email: tempEmail,
      password: pinHash,
      email_confirm: true,
      phone_confirm: true,
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError);
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user in auth.users');
    }

    console.log('✅ User created in auth.users:', authData.user.id);

    // Create profile
    console.log('📝 Creating profile...');
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        phone: phone,
        pin_hash: pinHash,
        role: adminRole,
        status: 'active',
        failed_attempts: 0,
        locked_until: null,
        full_name: 'Admin User',
        email: tempEmail,
      });

    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
      // Try to delete the auth user
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
        console.log('🧹 Cleaned up auth user');
      } catch (deleteError) {
        console.error('⚠️  Error deleting auth user:', deleteError);
      }
      throw profileError;
    }

    console.log('✅ Profile created successfully!');
    console.log('\n🎉 Admin user created successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log('   Phone:', phone);
    console.log('   PIN:', pin);
    console.log('   Role:', adminRole);
    console.log('   User ID:', authData.user.id);
    console.log('\n✅ You can now login with these credentials!');

  } catch (error) {
    console.error('\n❌ Error creating admin user:', error);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure you have SUPABASE_SERVICE_ROLE_KEY set');
    console.error('   2. Make sure the migration SQL has been executed');
    console.error('   3. Check Supabase dashboard for any errors');
    process.exit(1);
  }
}

// Run the script
createAdmin()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });


/**
 * Edge Function: Create Default Admin User
 * إنشاء مستخدم Admin افتراضي
 * 
 * Usage:
 * POST /functions/v1/create-admin
 * Headers: { "Authorization": "Bearer <service_role_key>" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Admin user data
    const adminPhone = '+201200006637';
    const adminPin = '000000';
    const adminRole = 'admin';

    // Hash PIN
    const saltRounds = 10;
    const pinHash = await bcrypt.hash(adminPin, saltRounds);

    // Check if admin user already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('phone', adminPhone)
      .single();

    if (existingProfile) {
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
        throw updateError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Admin user updated successfully',
          userId: existingProfile.id,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Create new user in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      phone: adminPhone,
      email: `admin-${Date.now()}@flash-delivery.local`, // Temporary email
      password: pinHash, // Using PIN hash as password
      email_confirm: true,
      phone_confirm: true,
    });

    if (authError) {
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user in auth.users');
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        phone: adminPhone,
        pin_hash: pinHash,
        role: adminRole,
        status: 'active',
        failed_attempts: 0,
        locked_until: null,
        full_name: 'Admin User',
      });

    if (profileError) {
      // If profile creation fails, delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin user created successfully',
        userId: authData.user.id,
        phone: adminPhone,
        pin: adminPin, // Only for initial setup
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create admin user',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


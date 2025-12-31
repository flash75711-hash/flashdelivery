/**
 * Edge Function: Register User with PIN
 * تسجيل مستخدم جديد باستخدام رقم الموبايل و PIN
 * 
 * Usage:
 * POST /functions/v1/register-user
 * Body: { "phone": "+201234567890", "pin": "123456", "role": "customer" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegisterRequest {
  phone: string;
  pin: string;
  role: 'customer' | 'driver' | 'vendor';
}

/**
 * تنسيق رقم الموبايل
 */
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    return '+20' + cleaned.substring(1);
  }
  
  if (!cleaned.startsWith('20')) {
    return '+20' + cleaned;
  }
  
  return '+' + cleaned;
}

/**
 * التحقق من صحة رقم الموبايل
 */
function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * التحقق من صحة PIN
 */
function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

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

    // Parse request body
    const body: RegisterRequest = await req.json();
    const { phone, pin, role } = body;

    // Validate input
    if (!phone || !pin || !role) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'الرجاء إدخال جميع البيانات المطلوبة',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!['customer', 'driver', 'vendor'].includes(role)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'نوع الحساب غير صحيح',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const formattedPhone = formatPhone(phone);

    if (!isValidPhone(formattedPhone)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'رقم الموبايل غير صحيح',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!isValidPin(pin)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'رمز PIN يجب أن يكون 6 أرقام',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if phone already exists in profiles
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id, phone, pin_hash')
      .eq('phone', formattedPhone)
      .maybeSingle();

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error('Error checking existing profile:', profileCheckError);
      throw profileCheckError;
    }

    if (existingProfile) {
      if (existingProfile.pin_hash) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'رقم الموبايل مسجل بالفعل',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409,
          }
        );
      }
      // Profile exists without PIN, update it
      const pinHash = await bcrypt.hash(pin, 10);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          pin_hash: pinHash,
          role: role,
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
          message: 'تم تحديث الحساب بنجاح',
          user: {
            id: existingProfile.id,
            phone: formattedPhone,
            role: role,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Create temporary email
    const tempEmail = `${formattedPhone.replace(/\D/g, '')}@flash-delivery.local`;

    // Check if user exists in auth.users by phone or email
    let existingUser = null;
    try {
      const { data: existingUsers, error: listUsersError } = await supabase.auth.admin.listUsers();
      if (listUsersError) {
        console.warn('Error listing users, will try to create new user:', listUsersError);
      } else {
        existingUser = existingUsers?.users?.find(
          (u) => u.phone === formattedPhone || u.email === tempEmail
        );
      }
    } catch (listUsersError: any) {
      console.warn('Exception listing users, will try to create new user:', listUsersError);
    }

    let userId: string | null = null;

    if (existingUser) {
      // User exists in auth.users, use existing ID
      userId = existingUser.id;

      // Update password in auth.users
      const { error: updatePasswordError } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: pinHash,
          phone: formattedPhone,
        }
      );

      if (updatePasswordError) {
        console.warn('Failed to update password:', updatePasswordError);
        // Continue anyway, we'll create/update profile
      }
    } else {
      // Create new user in auth.users
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        phone: formattedPhone,
        email: tempEmail,
        password: pinHash,
        email_confirm: true,
        phone_confirm: true,
      });

      if (authError) {
        // If user already exists, try to find them
        if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
          console.warn('User already exists in auth.users, attempting to find them:', authError);
          
          // Try to find user by phone
          try {
            const { data: foundUsers, error: listError } = await supabase.auth.admin.listUsers();
            if (!listError && foundUsers?.users) {
              const foundUser = foundUsers.users.find(
                (u) => u.phone === formattedPhone || u.email === tempEmail
              );
              if (foundUser) {
                userId = foundUser.id;
                console.log('Found existing user in auth.users:', userId);
              } else {
                throw new Error('User exists but could not be found');
              }
            } else {
              throw authError;
            }
          } catch (findError: any) {
            console.error('Error finding existing user:', findError);
            throw authError;
          }
        } else {
          throw authError;
        }
      } else if (!authData?.user) {
        throw new Error('Failed to create user in auth.users');
      } else {
        userId = authData.user.id;
      }
    }

    // Ensure userId is set before proceeding
    if (!userId) {
      throw new Error('Failed to obtain user ID');
    }

    // Check if profile exists for this user ID
    const { data: existingProfileById, error: profileByIdError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileByIdError && profileByIdError.code !== 'PGRST116') {
      console.error('Error checking profile by ID:', profileByIdError);
      throw profileByIdError;
    }

    if (existingProfileById) {
      // Profile exists, update it
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          phone: formattedPhone,
          pin_hash: pinHash,
          role: role,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
          email: tempEmail,
        })
        .eq('id', userId);

      if (profileUpdateError) {
        throw profileUpdateError;
      }
    } else {
      // Create new profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          phone: formattedPhone,
          pin_hash: pinHash,
          role: role,
          status: 'active',
          failed_attempts: 0,
          locked_until: null,
          email: tempEmail,
        });

      if (profileError) {
        // If profile creation fails and we created a new user, delete it
        if (!existingUser) {
          await supabase.auth.admin.deleteUser(userId);
        }
        throw profileError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم إنشاء الحساب بنجاح',
        user: {
          id: userId,
          phone: formattedPhone,
          role: role,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error registering user:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء التسجيل',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


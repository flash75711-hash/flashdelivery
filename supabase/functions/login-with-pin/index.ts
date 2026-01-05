/**
 * Edge Function: Login with PIN
 * تسجيل الدخول باستخدام رقم الموبايل و PIN
 * 
 * Usage:
 * POST /functions/v1/login-with-pin
 * Body: { "phone": "+201234567890", "pin": "123456" }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface LoginRequest {
  phone: string;
  pin: string;
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // التحقق من الطريقة
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          } 
        }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase configuration missing' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          } 
        }
      );
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse request body
    const body: LoginRequest = await req.json();
    const { phone, pin } = body;

    if (!phone || !pin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'الرجاء إدخال رقم الموبايل ورمز PIN',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const formattedPhone = formatPhone(phone);

    // التحقق من صحة المدخلات
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

    // البحث عن المستخدم في profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone, pin_hash, role, full_name, email, failed_attempts, locked_until')
      .eq('phone', formattedPhone)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'رقم الموبايل غير مسجل',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // التحقق من حالة القفل
    if (profile.locked_until) {
      const lockTime = new Date(profile.locked_until);
      if (lockTime > new Date()) {
        const minutesLeft = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
        return new Response(
          JSON.stringify({
            success: false,
            error: `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${minutesLeft} دقيقة`,
            lockedUntil: lockTime.toISOString(),
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          }
        );
      } else {
        // فك القفل تلقائياً إذا انتهى الوقت
        await supabase
          .from('profiles')
          .update({ locked_until: null, failed_attempts: 0 })
          .eq('id', profile.id);
      }
    }

    // التحقق من PIN
    if (!profile.pin_hash) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'الحساب غير مفعّل. يرجى التسجيل أولاً',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const pinValid = await bcrypt.compare(pin, profile.pin_hash);

    if (!pinValid) {
      // زيادة failed_attempts
      const newAttempts = (profile.failed_attempts || 0) + 1;
      const lockDuration = 30 * 60 * 1000; // 30 دقيقة بالميلي ثانية
      const shouldLock = newAttempts >= 5;
      
      await supabase
        .from('profiles')
        .update({
          failed_attempts: newAttempts,
          locked_until: shouldLock ? new Date(Date.now() + lockDuration).toISOString() : null,
        })
        .eq('id', profile.id);
      
      const remainingAttempts = 5 - newAttempts;
      
      if (shouldLock) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'تم قفل الحساب مؤقتاً بعد 5 محاولات فاشلة. حاول مرة أخرى بعد 30 دقيقة',
            lockedUntil: new Date(Date.now() + lockDuration).toISOString(),
            remainingAttempts: 0,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `رمز PIN غير صحيح. محاولات متبقية: ${remainingAttempts}`,
          remainingAttempts,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // نجح تسجيل الدخول - إعادة تعيين failed_attempts
    await supabase
      .from('profiles')
      .update({ failed_attempts: 0, locked_until: null })
      .eq('id', profile.id);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: profile.id,
          phone: profile.phone || formattedPhone,
          role: profile.role,
          full_name: profile.full_name,
          email: profile.email || undefined,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in login-with-pin:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء تسجيل الدخول',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


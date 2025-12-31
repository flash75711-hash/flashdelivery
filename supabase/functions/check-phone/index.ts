/**
 * Edge Function: Check Phone Existence
 * التحقق من وجود رقم الموبايل في قاعدة البيانات
 * 
 * Usage:
 * POST /functions/v1/check-phone
 * Body: { "phone": "+201234567890" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckPhoneRequest {
  phone: string;
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
    const body: CheckPhoneRequest = await req.json();
    const { phone } = body;

    if (!phone) {
      return new Response(
        JSON.stringify({
          success: false,
          exists: false,
          error: 'الرجاء إدخال رقم الموبايل',
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
          exists: false,
          error: 'رقم الموبايل غير صحيح',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if phone exists in profiles
    const { data: existingProfile, error } = await supabase
      .from('profiles')
      .select('id, phone, pin_hash')
      .eq('phone', formattedPhone)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (this is normal)
      throw error;
    }

    const exists = !!existingProfile && !!existingProfile.pin_hash;

    return new Response(
      JSON.stringify({
        success: true,
        exists: exists,
        phone: formattedPhone,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error checking phone:', error);
    return new Response(
      JSON.stringify({
        success: false,
        exists: false,
        error: error.message || 'حدث خطأ أثناء التحقق من الرقم',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


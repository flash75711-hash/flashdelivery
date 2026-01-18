/**
 * Edge Function: Get Settlement Payment Info
 * جلب معلومات الدفع للإدارة (لعرضها للسائق)
 * 
 * Usage:
 * POST /functions/v1/get-settlement-payment-info
 * Body: {} (لا يحتاج parameters)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // جلب إعدادات معلومات الدفع
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'settlement_bank_name',
        'settlement_account_number',
        'settlement_account_name',
        'settlement_phone',
        'settlement_notes',
      ]);

    if (settingsError) {
      console.error('Error fetching payment info settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch payment info' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // تحويل الإعدادات إلى object مع تنظيف القيم
    const paymentInfo: Record<string, string> = {};
    settings?.forEach(setting => {
      const value = setting.setting_value || '';
      // تنظيف القيم - إزالة النقطة فقط أو القيم الفارغة
      const cleanedValue = typeof value === 'string' ? value.trim() : String(value).trim();
      paymentInfo[setting.setting_key] = (cleanedValue === '.' || cleanedValue === '') ? '' : value;
    });

    // تنظيف القيم النهائية
    const cleanValue = (val: string | undefined): string => {
      if (!val || typeof val !== 'string') return '';
      const trimmed = val.trim();
      return (trimmed === '.' || trimmed === '') ? '' : val;
    };

    return new Response(
      JSON.stringify({
        success: true,
        paymentInfo: {
          bankName: cleanValue(paymentInfo['settlement_bank_name']),
          accountNumber: cleanValue(paymentInfo['settlement_account_number']),
          accountName: cleanValue(paymentInfo['settlement_account_name']),
          phone: cleanValue(paymentInfo['settlement_phone']),
          notes: cleanValue(paymentInfo['settlement_notes']),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in get-settlement-payment-info function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

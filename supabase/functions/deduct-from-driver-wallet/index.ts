import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeductFromDriverWalletRequest {
  driverId: string;
  amount: number; // المبلغ المطلوب خصمه (الباقي + العمولة)
  orderId: string;
  change: number; // باقي العميل
  commission: number; // العمولة
  description?: string;
}

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

    const body: DeductFromDriverWalletRequest = await req.json();
    const { driverId, amount, orderId, change, commission, description } = body;

    if (!driverId || amount === undefined || amount <= 0 || !orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Driver ID, positive amount, and order ID are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // التحقق من وجود السائق
    const { data: driver, error: driverError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      return new Response(
        JSON.stringify({ success: false, error: 'Driver not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (driver.role !== 'driver') {
      return new Response(
        JSON.stringify({ success: false, error: 'User is not a driver' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[deduct-from-driver-wallet] Deducting from driver wallet:', {
      driverId,
      amount,
      change,
      commission,
      orderId,
      description,
    });

    // إضافة deduction في جدول wallets (الباقي + العمولة)
    const { data: walletEntry, error: walletError } = await supabase
      .from('wallets')
      .insert({
        driver_id: driverId,
        customer_id: null,
        order_id: orderId,
        amount: amount, // المبلغ المخصوم (الباقي + العمولة)
        commission: commission, // حفظ قيمة العمولة للتفاصيل
        type: 'deduction',
        commission_paid: false, // لم يتم توريدها بعد
        description: description || `باقي العميل (${change.toFixed(2)} جنيه) + عمولة (${commission.toFixed(2)} جنيه) من طلب #${orderId.substring(0, 8)}`,
      })
      .select()
      .single();

    if (walletError) {
      console.error('[deduct-from-driver-wallet] Error deducting from driver wallet:', walletError);
      console.error('[deduct-from-driver-wallet] Error details:', {
        message: walletError.message,
        details: walletError.details,
        hint: walletError.hint,
        code: walletError.code,
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: walletError.message || 'Failed to deduct from wallet',
          details: walletError.details,
          hint: walletError.hint,
          code: walletError.code,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('[deduct-from-driver-wallet] Successfully deducted from driver wallet:', walletEntry);

    return new Response(
      JSON.stringify({ 
        success: true, 
        walletEntry,
        amount: amount,
        change: change,
        commission: commission,
        message: `تم خصم ${amount.toFixed(2)} جنيه من محفظة السائق (باقي: ${change.toFixed(2)} جنيه + عمولة: ${commission.toFixed(2)} جنيه)`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[deduct-from-driver-wallet] Error in function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

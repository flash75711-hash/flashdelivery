import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddToDriverWalletRequest {
  driverId: string;
  amount: number; // المبلغ الكلي (للتوافق مع الكود القديم)
  orderId: string;
  description?: string;
  deliveryFee?: number; // حساب المشوار (اختياري - إذا لم يُرسل، نستخدم amount)
  itemsFee?: number; // حساب العناصر (اختياري)
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

    const body: AddToDriverWalletRequest = await req.json();
    const { driverId, amount, orderId, description, deliveryFee, itemsFee } = body;

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

    // جلب نسبة العمولة من الإعدادات
    const { data: commissionSetting, error: commissionError } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'commission_rate')
      .single();

    const commissionRate = commissionSetting ? parseFloat(commissionSetting.setting_value) : 10; // افتراضي 10%
    
    // حساب العمولة من حساب المشوار فقط (deliveryFee) وليس من الحساب الكلي
    // إذا لم يُرسل deliveryFee، نستخدم amount للتوافق مع الكود القديم
    const actualDeliveryFee = deliveryFee !== undefined ? deliveryFee : amount;
    const actualItemsFee = itemsFee !== undefined ? itemsFee : 0;
    
    // العمولة تُحسب من حساب المشوار فقط
    const commission = (actualDeliveryFee * commissionRate) / 100;
    
    // المبلغ الذي يحصل عليه السائق = (حساب المشوار - العمولة) + حساب العناصر
    const driverAmount = (actualDeliveryFee - commission) + actualItemsFee;
    
    console.log(`[add-to-driver-wallet] Commission calculation:`, {
      totalAmount: amount,
      deliveryFee: actualDeliveryFee,
      itemsFee: actualItemsFee,
      commissionRate: `${commissionRate}%`,
      commission: commission,
      driverAmount: driverAmount,
      note: 'العمولة تُحسب من حساب المشوار فقط',
    });

    // إضافة المبلغ لمحفظة السائق
    const { data: walletEntry, error: walletError } = await supabase
      .from('wallets')
      .insert({
        driver_id: driverId,
        customer_id: null,
        order_id: orderId,
        amount: driverAmount, // المبلغ بعد خصم العمولة
        commission: commission, // العمولة
        type: 'earning',
        commission_paid: false, // لم يتم دفع العمولة بعد
        description: description || `تحصيل من طلب #${orderId.substring(0, 8)}`,
      })
      .select()
      .single();

    if (walletError) {
      console.error('Error adding to driver wallet:', walletError);
      return new Response(
        JSON.stringify({ success: false, error: walletError.message || 'Failed to add to wallet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        walletEntry,
        driverAmount: driverAmount,
        commission: commission,
        commissionRate: commissionRate,
        message: `تم إضافة ${driverAmount.toFixed(2)} جنيه إلى محفظة السائق (عمولة: ${commission.toFixed(2)} جنيه)`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in add-to-driver-wallet function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


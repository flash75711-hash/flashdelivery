import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SettleCommissionsRequest {
  settlementDate?: string; // تاريخ التوريد (اختياري، إذا لم يتم تحديده يستخدم اليوم)
  force?: boolean; // فرض التوريد حتى لو لم يكن يوم التوريد
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

    const body: SettleCommissionsRequest = await req.json().catch(() => ({}));
    const { settlementDate, force = false } = body;

    // جلب إعدادات التوريد
    const { data: settlementDaySetting, error: dayError } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'settlement_day')
      .single();

    const settlementDay = settlementDaySetting ? parseInt(settlementDaySetting.setting_value) : 1;
    const today = new Date();
    const currentDay = today.getDate();

    // التحقق من أن اليوم هو يوم التوريد (ما لم يكن force = true)
    if (!force && currentDay !== settlementDay) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `اليوم ليس يوم التوريد. يوم التوريد هو ${settlementDay} من كل شهر`,
          currentDay,
          settlementDay,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // استخدام التاريخ المحدد أو تاريخ اليوم
    const finalSettlementDate = settlementDate || today.toISOString().split('T')[0];

    // جلب جميع السجلات التي لم يتم دفع عمولتها
    const { data: unpaidCommissions, error: fetchError } = await supabase
      .from('wallets')
      .select('id, driver_id, commission, order_id, created_at')
      .eq('type', 'earning')
      .eq('commission_paid', false)
      .not('driver_id', 'is', null)
      .gt('commission', 0);

    if (fetchError) {
      console.error('Error fetching unpaid commissions:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message || 'Failed to fetch unpaid commissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!unpaidCommissions || unpaidCommissions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'لا توجد عمولات غير مدفوعة',
          settledCount: 0,
          totalCommission: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // حساب إجمالي العمولة
    const totalCommission = unpaidCommissions.reduce((sum, item) => sum + (item.commission || 0), 0);

    // تحديث جميع السجلات لتحديد أنها تم دفع عمولتها
    const { data: updatedRecords, error: updateError } = await supabase
      .from('wallets')
      .update({
        commission_paid: true,
        settlement_date: finalSettlementDate,
      })
      .eq('type', 'earning')
      .eq('commission_paid', false)
      .not('driver_id', 'is', null)
      .gt('commission', 0)
      .select('id');

    if (updateError) {
      console.error('Error updating commission status:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message || 'Failed to update commission status' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // تحديث تاريخ آخر توريد
    await supabase
      .from('app_settings')
      .update({ setting_value: finalSettlementDate })
      .eq('setting_key', 'last_settlement_date');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `تم توريد العمولات بنجاح`,
        settledCount: updatedRecords?.length || 0,
        totalCommission: totalCommission,
        settlementDate: finalSettlementDate,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in settle-commissions function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


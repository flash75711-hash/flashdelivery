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

    // جلب إعدادات التوريد (يوم الأسبوع)
    const { data: settlementDayOfWeekSetting, error: dayError } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'settlement_day_of_week')
      .maybeSingle();

    const settlementDayOfWeek = settlementDayOfWeekSetting ? parseInt(settlementDayOfWeekSetting.setting_value) : 0; // 0 = الأحد افتراضياً
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = الأحد، 1 = الاثنين، ... 6 = السبت

    // التحقق من أن اليوم هو يوم التوريد (ما لم يكن force = true)
    if (!force && currentDayOfWeek !== settlementDayOfWeek) {
      const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `اليوم ليس يوم التوريد. يوم التوريد هو ${days[settlementDayOfWeek] || 'الأحد'} من كل أسبوع`,
          currentDayOfWeek,
          settlementDayOfWeek,
          currentDayName: days[currentDayOfWeek] || 'غير معروف',
          settlementDayName: days[settlementDayOfWeek] || 'الأحد',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // استخدام التاريخ المحدد أو تاريخ اليوم
    const finalSettlementDate = settlementDate || today.toISOString().split('T')[0];

    // جلب إجمالي العمولة من معاملات earning
    const { data: unpaidCommissions, error: commissionsError } = await supabase
      .from('wallets')
      .select('id, driver_id, commission, order_id, created_at')
      .eq('type', 'earning')
      .eq('commission_paid', false)
      .not('driver_id', 'is', null)
      .gt('commission', 0);

    if (commissionsError) {
      console.error('Error fetching unpaid commissions:', commissionsError);
      return new Response(
        JSON.stringify({ success: false, error: commissionsError.message || 'Failed to fetch unpaid commissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // جلب إجمالي باقي العملاء من معاملات deduction
    const { data: unpaidDeductions, error: deductionsError } = await supabase
      .from('wallets')
      .select('id, driver_id, amount, commission, order_id, created_at')
      .eq('type', 'deduction')
      .eq('commission_paid', false)
      .not('driver_id', 'is', null)
      .gt('amount', 0);

    if (deductionsError) {
      console.error('Error fetching unpaid deductions:', deductionsError);
      return new Response(
        JSON.stringify({ success: false, error: deductionsError.message || 'Failed to fetch unpaid deductions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if ((!unpaidCommissions || unpaidCommissions.length === 0) && (!unpaidDeductions || unpaidDeductions.length === 0)) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'لا توجد مستحقات غير مدفوعة',
          settledCount: 0,
          totalCommission: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // حساب إجمالي المستحقات
    const totalCommission = unpaidCommissions?.reduce((sum, item) => sum + (item.commission || 0), 0) || 0;
    const totalCustomerChange = unpaidDeductions?.reduce((sum, item) => {
      const customerChange = (item.amount || 0) - (item.commission || 0);
      return sum + customerChange;
    }, 0) || 0;
    const totalSettlement = totalCommission + totalCustomerChange;

    // تحديث معاملات earning
    const { data: updatedEarnings, error: earningsUpdateError } = await supabase
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

    if (earningsUpdateError) {
      console.error('Error updating earnings:', earningsUpdateError);
      return new Response(
        JSON.stringify({ success: false, error: earningsUpdateError.message || 'Failed to update earnings' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // تحديث معاملات deduction
    const { data: updatedDeductions, error: deductionsUpdateError } = await supabase
      .from('wallets')
      .update({
        commission_paid: true,
        settlement_date: finalSettlementDate,
      })
      .eq('type', 'deduction')
      .eq('commission_paid', false)
      .not('driver_id', 'is', null)
      .gt('amount', 0)
      .select('id');

    if (deductionsUpdateError) {
      console.error('Error updating deductions:', deductionsUpdateError);
      return new Response(
        JSON.stringify({ success: false, error: deductionsUpdateError.message || 'Failed to update deductions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const updatedRecords = [...(updatedEarnings || []), ...(updatedDeductions || [])];

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
        message: `تم توريد المستحقات بنجاح`,
        settledCount: updatedRecords?.length || 0,
        totalSettlement: totalSettlement,
        totalCommission: totalCommission,
        totalCustomerChange: totalCustomerChange,
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


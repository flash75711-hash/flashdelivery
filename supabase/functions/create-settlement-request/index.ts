/**
 * Edge Function: Create Settlement Request
 * إنشاء طلب توريد من السائق
 * 
 * Usage:
 * POST /functions/v1/create-settlement-request
 * Body: {
 *   "driverId": "uuid",
 *   "receiptImageUrl": "string" // رابط صورة الوصل من imgbb
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateSettlementRequest {
  driverId: string;
  receiptImageUrl: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[create-settlement-request] Missing Supabase configuration');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let body: CreateSettlementRequest;
    try {
      body = await req.json();
      console.log('[create-settlement-request] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[create-settlement-request] Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    const { driverId, receiptImageUrl } = body;

    if (!driverId || !receiptImageUrl) {
      console.error('[create-settlement-request] Missing required fields:', { driverId: !!driverId, receiptImageUrl: !!receiptImageUrl });
      return new Response(
        JSON.stringify({ success: false, error: 'Driver ID and receipt image URL are required' }),
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

    // التحقق من وجود طلب توريد قيد المراجعة
    const { data: existingRequest, error: checkError } = await supabase
      .from('settlement_requests')
      .select('id, status')
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing requests:', checkError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check existing requests' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (existingRequest) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'يوجد طلب توريد قيد المراجعة بالفعل. يرجى انتظار مراجعة الطلب السابق.',
          existingRequestId: existingRequest.id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // حساب إجمالي العمولة من معاملات earning
    const { data: unpaidCommissions, error: commissionsError } = await supabase
      .from('wallets')
      .select('commission')
      .eq('driver_id', driverId)
      .eq('type', 'earning')
      .eq('commission_paid', false)
      .gt('commission', 0);

    if (commissionsError) {
      console.error('[create-settlement-request] Error fetching unpaid commissions:', commissionsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch unpaid commissions', details: commissionsError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[create-settlement-request] Found ${unpaidCommissions?.length || 0} unpaid commission transactions`);

    // حساب إجمالي باقي العملاء من معاملات deduction (amount - commission)
    const { data: unpaidDeductions, error: deductionsError } = await supabase
      .from('wallets')
      .select('amount, commission')
      .eq('driver_id', driverId)
      .eq('type', 'deduction')
      .eq('commission_paid', false)
      .gt('amount', 0);

    if (deductionsError) {
      console.error('[create-settlement-request] Error fetching unpaid deductions:', deductionsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch unpaid deductions', details: deductionsError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[create-settlement-request] Found ${unpaidDeductions?.length || 0} unpaid deduction transactions`);

    // إجمالي العمولة
    const totalCommission = unpaidCommissions?.reduce((sum, item) => {
      const commission = parseFloat(String(item.commission || 0)) || 0;
      if (isNaN(commission)) {
        console.warn('[create-settlement-request] Invalid commission value:', item.commission);
        return sum;
      }
      return sum + commission;
    }, 0) || 0;
    
    // إجمالي باقي العملاء (amount - commission)
    const totalCustomerChange = unpaidDeductions?.reduce((sum, item) => {
      const amount = parseFloat(String(item.amount || 0)) || 0;
      const commission = parseFloat(String(item.commission || 0)) || 0;
      if (isNaN(amount) || isNaN(commission)) {
        console.warn('[create-settlement-request] Invalid amount/commission values:', { amount: item.amount, commission: item.commission });
        return sum;
      }
      const customerChange = amount - commission;
      return sum + (customerChange > 0 ? customerChange : 0);
    }, 0) || 0;
    
    // إجمالي المستحقات = إجمالي العمولة + إجمالي باقي العملاء
    const totalSettlement = totalCommission + totalCustomerChange;

    console.log(`[create-settlement-request] Calculation: totalCommission=${totalCommission}, totalCustomerChange=${totalCustomerChange}, totalSettlement=${totalSettlement}`);
    console.log(`[create-settlement-request] unpaidCommissions count: ${unpaidCommissions?.length || 0}, unpaidDeductions count: ${unpaidDeductions?.length || 0}`);

    if (isNaN(totalSettlement) || totalSettlement <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'لا توجد مستحقات للتوريد',
          totalSettlement: totalSettlement || 0,
          totalCommission,
          totalCustomerChange,
          unpaidCommissionsCount: unpaidCommissions?.length || 0,
          unpaidDeductionsCount: unpaidDeductions?.length || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // إنشاء طلب التوريد
    const { data: settlementRequest, error: insertError } = await supabase
      .from('settlement_requests')
      .insert({
        driver_id: driverId,
        total_commission: totalSettlement,
        receipt_image_url: receiptImageUrl,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[create-settlement-request] Error creating settlement request:', insertError);
      console.error('[create-settlement-request] Insert error details:', JSON.stringify(insertError, null, 2));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: insertError.message || 'Failed to create settlement request',
          details: insertError.details || insertError.hint || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[create-settlement-request] Settlement request created: ${settlementRequest.id} for driver ${driverId}, total settlement: ${totalSettlement} (commission: ${totalCommission}, customer change: ${totalCustomerChange})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم إنشاء طلب التوريد بنجاح. سيتم مراجعته من قبل الإدارة.',
        settlementRequest,
        totalSettlement,
        totalCommission,
        totalCustomerChange,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in create-settlement-request function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

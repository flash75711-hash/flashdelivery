/**
 * Edge Function: Review Settlement Request
 * مراجعة طلب توريد من الإدارة (قبول/رفض)
 * 
 * Usage:
 * POST /functions/v1/review-settlement-request
 * Body: {
 *   "requestId": "uuid",
 *   "action": "approved" | "rejected",
 *   "rejectionReason"?: "string" // مطلوب فقط عند الرفض
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewSettlementRequest {
  requestId: string;
  action: 'approved' | 'rejected';
  rejectionReason?: string;
  adminId: string;
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

    const body: ReviewSettlementRequest = await req.json();
    const { requestId, action, rejectionReason, adminId } = body;

    if (!requestId || !action || !adminId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Request ID, action, and admin ID are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (action !== 'approved' && action !== 'rejected') {
      return new Response(
        JSON.stringify({ success: false, error: 'Action must be "approved" or "rejected"' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (action === 'rejected' && !rejectionReason) {
      return new Response(
        JSON.stringify({ success: false, error: 'Rejection reason is required when rejecting' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // التحقق من أن المستخدم هو admin
    const { data: admin, error: adminError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !admin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (admin.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'User is not an admin' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // جلب طلب التوريد
    const { data: settlementRequest, error: requestError } = await supabase
      .from('settlement_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !settlementRequest) {
      return new Response(
        JSON.stringify({ success: false, error: 'Settlement request not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (settlementRequest.status !== 'pending') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Settlement request is already ${settlementRequest.status}`,
          currentStatus: settlementRequest.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // تحديث حالة الطلب
    const updateData: any = {
      status: action,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    };

    if (action === 'rejected' && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data: updatedRequest, error: updateError } = await supabase
      .from('settlement_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating settlement request:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message || 'Failed to update settlement request' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // إذا تم الموافقة، تحديث commission_paid في wallets (earning و deduction)
    if (action === 'approved') {
      const settlementDate = new Date().toISOString().split('T')[0];
      
      // تحديث معاملات earning
      const { error: earningsUpdateError } = await supabase
        .from('wallets')
        .update({
          commission_paid: true,
          settlement_date: settlementDate,
        })
        .eq('driver_id', settlementRequest.driver_id)
        .eq('type', 'earning')
        .eq('commission_paid', false)
        .gt('commission', 0);

      if (earningsUpdateError) {
        console.error('Error updating earnings:', earningsUpdateError);
      }

      // تحديث معاملات deduction
      const { error: deductionsUpdateError } = await supabase
        .from('wallets')
        .update({
          commission_paid: true,
          settlement_date: settlementDate,
        })
        .eq('driver_id', settlementRequest.driver_id)
        .eq('type', 'deduction')
        .eq('commission_paid', false)
        .gt('amount', 0);

      if (deductionsUpdateError) {
        console.error('Error updating deductions:', deductionsUpdateError);
        // لا نرجع خطأ هنا، لأن الطلب تم قبوله بالفعل
        // لكن نسجل الخطأ في logs
      } else {
        console.log(`[review-settlement-request] Updated commission_paid for driver ${settlementRequest.driver_id}`);
      }
    }

    console.log(`[review-settlement-request] Settlement request ${requestId} ${action} by admin ${adminId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: action === 'approved' 
          ? 'تم قبول طلب التوريد وتحديث حالة العمولات'
          : 'تم رفض طلب التوريد',
        settlementRequest: updatedRequest,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in review-settlement-request function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

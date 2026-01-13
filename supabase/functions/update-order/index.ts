/**
 * Edge Function: Update Order
 * تحديث طلب في قاعدة البيانات
 * 
 * Usage:
 * POST /functions/v1/update-order
 * Body: { 
 *   "orderId": "uuid",
 *   "status": "accepted" | "pickedUp" | "inTransit" | "completed" | "cancelled",
 *   "driverId": "uuid" | null,
 *   "negotiationStatus": "pending" | "driver_proposed" | "customer_proposed" | "accepted" | "rejected" | null,
 *   "negotiatedPrice": number | null,
 *   "driverProposedPrice": number | null,
 *   "customerProposedPrice": number | null,
 *   "searchStatus": "searching" | "expanded" | "stopped" | "found" | null,
 *   "searchStartedAt": string | null,
 *   "searchExpandedAt": string | null
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateOrderRequest {
  orderId: string;
  status?: string;
  driverId?: string | null;
  negotiationStatus?: string | null;
  negotiatedPrice?: number | null;
  driverProposedPrice?: number | null;
  customerProposedPrice?: number | null;
  searchStatus?: string | null;
  searchStartedAt?: string | null;
  searchExpandedAt?: string | null;
  completedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  is_prepaid?: boolean;
  prepaid_amount?: number | null;
}

Deno.serve(async (req) => {
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
    const body: UpdateOrderRequest = await req.json();
    const {
      orderId,
      status,
      driverId,
      negotiationStatus,
      negotiatedPrice,
      driverProposedPrice,
      customerProposedPrice,
      searchStatus,
      searchStartedAt,
      searchExpandedAt,
      completedAt,
      cancelledBy,
      cancelledAt,
      is_prepaid,
      prepaid_amount,
    } = body;

    // Validate input
    if (!orderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if order exists
    const { data: existingOrder, error: checkError } = await supabase
      .from('orders')
      .select('id, customer_id, driver_id, status')
      .eq('id', orderId)
      .single();
    
    // تحديد ما إذا كان هذا قبول طلب جديد (status = 'accepted' و driverId موجود)
    const isAcceptingOrder = status === 'accepted' && driverId && existingOrder?.status === 'pending' && !existingOrder?.driver_id;

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking order:', checkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'فشل التحقق من الطلب',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!existingOrder) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'الطلب غير موجود',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (driverId !== undefined) updateData.driver_id = driverId;
    if (negotiationStatus !== undefined) updateData.negotiation_status = negotiationStatus;
    if (negotiatedPrice !== undefined) updateData.negotiated_price = negotiatedPrice;
    if (driverProposedPrice !== undefined) updateData.driver_proposed_price = driverProposedPrice;
    if (customerProposedPrice !== undefined) updateData.customer_proposed_price = customerProposedPrice;
    if (searchStatus !== undefined) updateData.search_status = searchStatus;
    if (searchStartedAt !== undefined) updateData.search_started_at = searchStartedAt;
    if (searchExpandedAt !== undefined) updateData.search_expanded_at = searchExpandedAt;
    if (completedAt !== undefined) updateData.completed_at = completedAt;
    if (cancelledBy !== undefined) updateData.cancelled_by = cancelledBy;
    if (cancelledAt !== undefined) updateData.cancelled_at = cancelledAt;
    if (is_prepaid !== undefined) updateData.is_prepaid = is_prepaid;
    if (prepaid_amount !== undefined) updateData.prepaid_amount = prepaid_amount;
    
    // عند قبول الطلب، تحديث search_status إلى 'found' لإيقاف البحث
    if (isAcceptingOrder) {
      updateData.search_status = 'found';
      console.log('[update-order] تحديث search_status إلى "found" عند قبول الطلب');
    }

    // Update order
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    // إرسال إشعار للعميل فوراً عند قبول الطلب (قبل معالجة الأخطاء)
    if (isAcceptingOrder && existingOrder?.customer_id) {
      try {
        console.log('[update-order] إرسال إشعار للعميل عند قبول الطلب...', {
          customer_id: existingOrder.customer_id,
          order_id: orderId,
        });
        
        // إرسال الإشعار للعميل
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: existingOrder.customer_id,
            title: 'تم قبول طلبك',
            message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
            type: 'success',
            order_id: orderId,
            is_read: false,
          });
        
        if (notifError) {
          console.error('[update-order] خطأ في إرسال الإشعار للعميل:', notifError);
          // لا نوقف العملية إذا فشل الإشعار
        } else {
          console.log('[update-order] تم إرسال إشعار للعميل بنجاح');
        }
      } catch (notifErr) {
        console.error('[update-order] خطأ في إرسال الإشعار (catch):', notifErr);
        // لا نوقف العملية إذا فشل الإشعار
      }
    }

    if (updateError) {
      console.error('Error updating order:', updateError);
      
      // إذا كان الخطأ بسبب عمود غير موجود (42703)، نحاول التحديث بدون الحقول غير الموجودة
      if (updateError.code === '42703' || updateError.message?.includes('column') || updateError.message?.includes('does not exist')) {
        console.warn('Column does not exist, trying update without problematic fields...');
        
        // إزالة الحقول التي قد لا تكون موجودة
        const safeUpdateData: any = {};
        if (status !== undefined) safeUpdateData.status = status;
        if (driverId !== undefined) safeUpdateData.driver_id = driverId;
        if (negotiationStatus !== undefined) safeUpdateData.negotiation_status = negotiationStatus;
        if (negotiatedPrice !== undefined) safeUpdateData.negotiated_price = negotiatedPrice;
        if (driverProposedPrice !== undefined) safeUpdateData.driver_proposed_price = driverProposedPrice;
        if (customerProposedPrice !== undefined) safeUpdateData.customer_proposed_price = customerProposedPrice;
        if (searchStatus !== undefined) safeUpdateData.search_status = searchStatus;
        if (searchStartedAt !== undefined) safeUpdateData.search_started_at = searchStartedAt;
        if (searchExpandedAt !== undefined) safeUpdateData.search_expanded_at = searchExpandedAt;
        if (completedAt !== undefined) safeUpdateData.completed_at = completedAt;
        if (cancelledBy !== undefined) safeUpdateData.cancelled_by = cancelledBy;
        if (cancelledAt !== undefined) safeUpdateData.cancelled_at = cancelledAt;
        // لا نضيف is_prepaid و prepaid_amount هنا لأنها قد لا تكون موجودة
        
        const { data: retryUpdatedOrder, error: retryError } = await supabase
          .from('orders')
          .update(safeUpdateData)
          .eq('id', orderId)
          .select()
          .single();
        
        if (retryError) {
          console.error('Error updating order (retry):', retryError);
          return new Response(
            JSON.stringify({
              success: false,
              error: retryError.message || 'فشل تحديث الطلب',
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            }
          );
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            message: 'تم تحديث الطلب بنجاح (بعض الحقول تم تجاهلها)',
            order: retryUpdatedOrder,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: updateError.message || 'فشل تحديث الطلب',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم تحديث الطلب بنجاح',
        order: updatedOrder,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error updating order:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء تحديث الطلب',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


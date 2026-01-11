/**
 * Edge Function: Stop Order Search
 * إيقاف البحث عن السائقين للطلب
 * 
 * Usage:
 * POST /functions/v1/stop-order-search
 * Body: { 
 *   "order_id": "uuid"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StopOrderSearchRequest {
  order_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS
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

    const body: StopOrderSearchRequest = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحقق من حالة الطلب الحالية
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, driver_id, search_status, customer_id')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      console.error('Order not found or error:', orderError);
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // إذا تم قبول الطلب أو تم إلغاؤه، لا نحتاج لإيقاف البحث
    if (order.status === 'accepted' || order.status === 'cancelled' || order.driver_id) {
      console.log('Order already accepted or cancelled, search already stopped');
      return new Response(
        JSON.stringify({ success: true, message: 'Order already accepted or cancelled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // إذا كانت الحالة stopped بالفعل، لا نعيد الإيقاف
    if (order.search_status === 'stopped') {
      console.log('Search already stopped');
      return new Response(
        JSON.stringify({ success: true, message: 'Search already stopped' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // تحديث حالة البحث إلى stopped
    const { error: updateError } = await supabase
      .from('orders')
      .update({ search_status: 'stopped' })
      .eq('id', order_id);

    if (updateError) {
      console.error('Error updating search status:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update search status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Search stopped for order ${order_id}`);

    // إرسال إشعار للعميل بأن البحث انتهى ولم يتم العثور على سائق
    try {
      // إنشاء In-App Notification
      await supabase.rpc('insert_notification_for_driver', {
        p_user_id: order.customer_id,
        p_title: 'انتهى البحث عن سائق',
        p_message: 'لم يتم العثور على سائق متاح في النطاق المحدد. يمكنك إعادة البحث أو إلغاء الطلب.',
        p_type: 'warning',
        p_order_id: order_id,
      });

      // إرسال Push Notification
      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'X-Internal-Call': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: order.customer_id,
            title: 'انتهى البحث عن سائق',
            message: 'لم يتم العثور على سائق متاح في النطاق المحدد. يمكنك إعادة البحث أو إلغاء الطلب.',
            data: { order_id: order_id },
          }),
        });
        const pushResult = await pushResponse.json();
        if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
          console.log(`✅ Push notification sent to customer ${order.customer_id}`);
        }
      } catch (pushErr) {
        console.error(`Error sending push notification to customer:`, pushErr);
      }
    } catch (notifErr) {
      console.error('Error notifying customer:', notifErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم إيقاف البحث بنجاح',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in stop-order-search function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

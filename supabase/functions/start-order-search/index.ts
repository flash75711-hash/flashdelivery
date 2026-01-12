/**
 * Edge Function: Start Order Search
 * بدء البحث التلقائي عن السائقين للطلب
 * 
 * Usage:
 * POST /functions/v1/start-order-search
 * Body: { 
 *   "order_id": "uuid",
 *   "search_point": { "lat": number, "lon": number }
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StartOrderSearchRequest {
  order_id: string;
  search_point: {
    lat: number;
    lon: number;
  };
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[start-order-search] ========== Function called ==========');
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    console.log('[start-order-search] Environment variables loaded');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body: StartOrderSearchRequest = await req.json();
    const { order_id, search_point } = body;

    console.log('[start-order-search] Request received:', {
      order_id,
      search_point: search_point ? { lat: search_point.lat, lon: search_point.lon } : null,
    });

    if (!order_id || !search_point || !search_point.lat || !search_point.lon) {
      console.error('[start-order-search] ❌ Missing required fields');
      return new Response(
        JSON.stringify({ success: false, error: 'order_id and search_point (lat, lon) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // جلب إعدادات البحث
    const { data: settings, error: settingsError } = await supabase
      .from('order_search_settings')
      .select('setting_key, setting_value');

    if (settingsError) {
      console.error('Error loading search settings:', settingsError);
    }

    const initialRadius = parseFloat(
      settings?.find(s => s.setting_key === 'initial_search_radius_km')?.setting_value || '5'
    );
    const expandedRadius = parseFloat(
      settings?.find(s => s.setting_key === 'expanded_search_radius_km')?.setting_value || '10'
    );
    const initialDuration = parseFloat(
      settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || '30'
    );
    const expandedDuration = parseFloat(
      settings?.find(s => s.setting_key === 'expanded_search_duration_seconds')?.setting_value || '30'
    );

    // تحديث حالة الطلب (مع الحفاظ على timestamp الأصلي إن وجد)
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('search_started_at')
      .eq('id', order_id)
      .single();

    const updateData: any = {
      search_status: 'searching',
    };

    // إذا لم يكن هناك timestamp موجود، نضيفه الآن
    // إذا كان موجوداً بالفعل، نحافظ عليه لضمان دقة العداد
    let searchStartedAt: Date;
    if (!existingOrder?.search_started_at) {
      searchStartedAt = new Date();
      updateData.search_started_at = searchStartedAt.toISOString();
      console.log(`[start-order-search] Setting search_started_at for order ${order_id}`);
    } else {
      searchStartedAt = new Date(existingOrder.search_started_at);
      console.log(`[start-order-search] Preserving existing search_started_at for order ${order_id}: ${existingOrder.search_started_at}`);
    }

    // تحديد search_expires_at بناءً على search_started_at + initialDuration
    const searchExpiresAt = new Date(searchStartedAt);
    searchExpiresAt.setSeconds(searchExpiresAt.getSeconds() + initialDuration);
    updateData.search_expires_at = searchExpiresAt.toISOString();
    console.log(`[start-order-search] Setting search_expires_at for order ${order_id}: ${searchExpiresAt.toISOString()} (${initialDuration}s from start)`);

    await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id);

    // البحث الأولي: العثور على السائقين في النطاق الأولي
    console.log(`[start-order-search] Searching for drivers in radius ${initialRadius} km from point (${search_point.lat}, ${search_point.lon})`);
    const { data: initialDrivers, error: initialError } = await supabase.rpc(
      'find_drivers_in_radius',
      {
        p_latitude: search_point.lat,
        p_longitude: search_point.lon,
        p_radius_km: initialRadius,
      }
    );

    if (initialError) {
      console.error('[start-order-search] ❌ Error finding drivers in initial radius:', initialError);
    } else {
      console.log(`[start-order-search] ✅ Found ${initialDrivers?.length || 0} drivers in initial radius (${initialRadius} km)`);
    }

    // إرسال إشعارات للسائقين في النطاق الأولي
    console.log(`[start-order-search] Found ${initialDrivers?.length || 0} drivers in initial radius (${initialRadius} km)`);
    if (initialDrivers && initialDrivers.length > 0) {
      for (const driver of initialDrivers) {
        try {
          console.log(`[start-order-search] Notifying driver ${driver.driver_id}...`);
          await supabase.rpc('insert_notification_for_driver', {
            p_user_id: driver.driver_id,
            p_title: 'طلب جديد متاح',
            p_message: `طلب جديد متاح في نطاق ${initialRadius} كم`,
            p_type: 'info',
            p_order_id: order_id,
          });
          console.log(`[start-order-search] ✅ In-app notification created for driver ${driver.driver_id}`);

          // إرسال Push Notification
          try {
            console.log(`[start-order-search] Sending push notification to driver ${driver.driver_id}...`);
            const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'X-Internal-Call': 'true',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                user_id: driver.driver_id,
                title: 'طلب جديد متاح',
                message: `طلب جديد متاح في نطاق ${initialRadius} كم`,
                data: { order_id: order_id },
              }),
            });
            const pushResult = await pushResponse.json();
            if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
              console.log(`✅ [start-order-search] Push notification sent to driver ${driver.driver_id}`);
            } else {
              console.warn(`⚠️ [start-order-search] Push notification not sent to driver ${driver.driver_id}:`, pushResult);
            }
          } catch (pushErr) {
            console.error(`❌ [start-order-search] Error sending push notification to driver ${driver.driver_id}:`, pushErr);
          }
        } catch (notifErr) {
          console.error(`Error notifying driver ${driver.driver_id}:`, notifErr);
        }
      }
    }

    // بدء البحث الموسع بعد انتهاء المدة الأولية
    setTimeout(async () => {
      // التحقق من أن الطلب لم يُقبل بعد
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('status, driver_id, search_status')
        .eq('id', order_id)
        .single();

      if (orderError || !order) {
        console.log('Order not found or error:', orderError);
        return;
      }

      // إذا تم قبول الطلب أو تم إلغاؤه، لا نوسع البحث
      if (order.status === 'accepted' || order.status === 'cancelled' || order.driver_id) {
        console.log('Order already accepted or cancelled, stopping search');
        await supabase
          .from('orders')
          .update({ search_status: 'stopped' })
          .eq('id', order_id);
        return;
      }

      // تحديث حالة البحث إلى expanded
      const expandedAt = new Date();
      const expandedExpiresAt = new Date(expandedAt);
      expandedExpiresAt.setSeconds(expandedExpiresAt.getSeconds() + expandedDuration);
      
      await supabase
        .from('orders')
        .update({
          search_status: 'expanded',
          search_expanded_at: expandedAt.toISOString(),
          search_expires_at: expandedExpiresAt.toISOString(),
        })
        .eq('id', order_id);
      
      console.log(`[start-order-search] Expanded search for order ${order_id} - expires at: ${expandedExpiresAt.toISOString()} (${expandedDuration}s from expanded start)`);

      // البحث الموسع: العثور على السائقين في النطاق الموسع (0-10 كيلو)
      const { data: expandedDrivers, error: expandedError } = await supabase.rpc(
        'find_drivers_in_radius',
        {
          p_latitude: search_point.lat,
          p_longitude: search_point.lon,
          p_radius_km: expandedRadius,
        }
      );

      if (expandedError) {
        console.error('Error finding drivers in expanded radius:', expandedError);
      }

      // إرسال إشعارات لجميع السائقين في النطاق الموسع (0-10 كيلو)
      // وليس فقط السائقين الجدد، لأن النطاق الموسع يبدأ من 0
      console.log(`[start-order-search] Found ${expandedDrivers?.length || 0} drivers in expanded radius (${expandedRadius} km)`);
      if (expandedDrivers && expandedDrivers.length > 0) {
        for (const driver of expandedDrivers) {
          try {
            console.log(`[start-order-search] Notifying driver ${driver.driver_id} (expanded radius)...`);
            await supabase.rpc('insert_notification_for_driver', {
              p_user_id: driver.driver_id,
              p_title: 'طلب جديد متاح',
              p_message: `طلب جديد متاح في نطاق ${expandedRadius} كم`,
              p_type: 'info',
              p_order_id: order_id,
            });
            console.log(`[start-order-search] ✅ In-app notification created for driver ${driver.driver_id} (expanded)`);

            // إرسال Push Notification
            try {
              console.log(`[start-order-search] Sending push notification to driver ${driver.driver_id} (expanded radius)...`);
              const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'X-Internal-Call': 'true',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  user_id: driver.driver_id,
                  title: 'طلب جديد متاح',
                  message: `طلب جديد متاح في نطاق ${expandedRadius} كم`,
                  data: { order_id: order_id },
                }),
              });
              const pushResult = await pushResponse.json();
              if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
                console.log(`✅ [start-order-search] Push notification sent to driver ${driver.driver_id} (expanded)`);
              } else {
                console.warn(`⚠️ [start-order-search] Push notification not sent to driver ${driver.driver_id} (expanded):`, pushResult);
              }
            } catch (pushErr) {
              console.error(`❌ [start-order-search] Error sending push notification to driver ${driver.driver_id} (expanded):`, pushErr);
            }
          } catch (notifErr) {
            console.error(`[start-order-search] Error notifying driver ${driver.driver_id} (expanded):`, notifErr);
          }
        }
      }

      // إيقاف البحث بعد انتهاء المدة الموسعة
      setTimeout(async () => {
        // التحقق مرة أخرى من أن الطلب لم يُقبل
        const { data: finalOrder, error: finalOrderError } = await supabase
          .from('orders')
          .select('status, driver_id, search_status, customer_id')
          .eq('id', order_id)
          .single();

        if (!finalOrderError && finalOrder) {
          if (finalOrder.status !== 'accepted' && finalOrder.status !== 'cancelled' && !finalOrder.driver_id) {
            // تحديث حالة البحث إلى stopped
            await supabase
              .from('orders')
              .update({ search_status: 'stopped' })
              .eq('id', order_id);
            
            console.log(`✅ Search stopped for order ${order_id}`);

            // إرسال إشعار للعميل بأن البحث انتهى ولم يتم العثور على سائق
            try {
              // إنشاء In-App Notification مباشرة (باستخدام Service Role Key)
              await supabase
                .from('notifications')
                .insert({
                  user_id: finalOrder.customer_id,
                  title: 'انتهى البحث عن سائق',
                  message: 'لم يتم العثور على سائق في النطاق المحدد. يمكنك إعادة البحث أو إلغاء الطلب.',
                  type: 'warning',
                  order_id: order_id,
                  is_read: false,
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
                    user_id: finalOrder.customer_id,
                    title: 'انتهى البحث عن سائق',
                    message: 'لم يتم العثور على سائق في النطاق المحدد. يمكنك إعادة البحث أو إلغاء الطلب.',
                    data: { order_id: order_id },
                  }),
                });
                const pushResult = await pushResponse.json();
                if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
                  console.log(`✅ Push notification sent to customer ${finalOrder.customer_id}`);
                }
              } catch (pushErr) {
                console.error(`Error sending push notification to customer:`, pushErr);
              }
            } catch (notifErr) {
              console.error('Error notifying customer:', notifErr);
            }
          }
        }
      }, expandedDuration * 1000);
    }, initialDuration * 1000);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم بدء البحث عن السائقين',
        initial_radius: initialRadius,
        expanded_radius: expandedRadius,
        initial_duration: initialDuration,
        expanded_duration: expandedDuration,
        initial_drivers_count: initialDrivers?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in start-order-search function:', error);
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

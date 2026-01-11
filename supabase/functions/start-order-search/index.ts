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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body: StartOrderSearchRequest = await req.json();
    const { order_id, search_point } = body;

    if (!order_id || !search_point || !search_point.lat || !search_point.lon) {
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
    if (!existingOrder?.search_started_at) {
      updateData.search_started_at = new Date().toISOString();
      console.log(`[start-order-search] Setting search_started_at for order ${order_id}`);
    } else {
      console.log(`[start-order-search] Preserving existing search_started_at for order ${order_id}: ${existingOrder.search_started_at}`);
    }

    await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id);

    // البحث الأولي: العثور على السائقين في النطاق الأولي
    const { data: initialDrivers, error: initialError } = await supabase.rpc(
      'find_drivers_in_radius',
      {
        p_latitude: search_point.lat,
        p_longitude: search_point.lon,
        p_radius_km: initialRadius,
      }
    );

    if (initialError) {
      console.error('Error finding drivers in initial radius:', initialError);
    }

    // إرسال إشعارات للسائقين في النطاق الأولي
    if (initialDrivers && initialDrivers.length > 0) {
      for (const driver of initialDrivers) {
        try {
          await supabase.rpc('insert_notification_for_driver', {
            p_user_id: driver.driver_id,
            p_title: 'طلب جديد متاح',
            p_message: `طلب جديد متاح في نطاق ${initialRadius} كم`,
            p_type: 'info',
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
                user_id: driver.driver_id,
                title: 'طلب جديد متاح',
                message: `طلب جديد متاح في نطاق ${initialRadius} كم`,
                data: { order_id: order_id },
              }),
            });
            const pushResult = await pushResponse.json();
            if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
              console.log(`✅ Push notification sent to driver ${driver.driver_id}`);
            }
          } catch (pushErr) {
            console.error(`Error sending push notification to driver ${driver.driver_id}:`, pushErr);
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
      await supabase
        .from('orders')
        .update({
          search_status: 'expanded',
          search_expanded_at: new Date().toISOString(),
        })
        .eq('id', order_id);

      // البحث الموسع: العثور على السائقين في النطاق الموسع
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

      // إرسال إشعارات للسائقين الجدد فقط (الذين لم يتلقوا إشعاراً في النطاق الأولي)
      if (expandedDrivers && expandedDrivers.length > 0) {
        const initialDriverIds = (initialDrivers || []).map(d => d.driver_id);
        const newDrivers = expandedDrivers.filter(
          d => !initialDriverIds.includes(d.driver_id)
        );

        for (const driver of newDrivers) {
          try {
            await supabase.rpc('insert_notification_for_driver', {
              p_user_id: driver.driver_id,
              p_title: 'طلب جديد متاح',
              p_message: `طلب جديد متاح في نطاق ${expandedRadius} كم`,
              p_type: 'info',
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
                  user_id: driver.driver_id,
                  title: 'طلب جديد متاح',
                  message: `طلب جديد متاح في نطاق ${expandedRadius} كم`,
                  data: { order_id: order_id },
                }),
              });
              const pushResult = await pushResponse.json();
              if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
                console.log(`✅ Push notification sent to driver ${driver.driver_id}`);
              }
            } catch (pushErr) {
              console.error(`Error sending push notification to driver ${driver.driver_id}:`, pushErr);
            }
          } catch (notifErr) {
            console.error(`Error notifying driver ${driver.driver_id}:`, notifErr);
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
              // إنشاء In-App Notification
              await supabase.rpc('insert_notification_for_driver', {
                p_user_id: finalOrder.customer_id,
                p_title: 'انتهى البحث عن سائق',
                p_message: 'لم يتم العثور على سائق في النطاق المحدد. يمكنك إعادة البحث أو إلغاء الطلب.',
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

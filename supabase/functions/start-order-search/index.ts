/**
 * Edge Function: Start Order Search
 * بدء البحث التلقائي عن السائقين للطلب
 * 
 * النظام الجديد: البحث مباشرة على 10 كم لمدة 60 ثانية
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

// دالة لحساب المسافة بين نقطتين (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

    // جلب إعدادات البحث (استخدام القيم الافتراضية: 10 كم لمدة 60 ثانية)
    const { data: settings, error: settingsError } = await supabase
      .from('order_search_settings')
      .select('setting_key, setting_value');

    if (settingsError) {
      console.error('Error loading search settings:', settingsError);
    }

    // القيم الافتراضية: 10 كم لمدة 60 ثانية
    const searchRadius = parseFloat(
      settings?.find(s => s.setting_key === 'search_radius_km')?.setting_value || 
      settings?.find(s => s.setting_key === 'initial_search_radius_km')?.setting_value || 
      '10'
    );
    const searchDuration = parseFloat(
      settings?.find(s => s.setting_key === 'search_duration_seconds')?.setting_value || 
      settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || 
      '60'
    );

    console.log(`[start-order-search] 🔍 Search configuration: ${searchRadius} km radius, ${searchDuration} seconds duration`);

    // جلب أول مكان من order_items (أول مكان سيذهب إليه السائق)
    let firstPlaceLocation: { lat: number; lon: number } | null = null;
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('latitude, longitude, item_index')
      .eq('order_id', order_id)
      .order('item_index', { ascending: true })
      .limit(1);

    if (orderItems && orderItems.length > 0 && orderItems[0].latitude && orderItems[0].longitude) {
      firstPlaceLocation = {
        lat: orderItems[0].latitude,
        lon: orderItems[0].longitude,
      };
      console.log(`[start-order-search] 📍 First place location found: (${firstPlaceLocation.lat}, ${firstPlaceLocation.lon})`);
    } else {
      // إذا لم يكن هناك order_items، نستخدم search_point
      firstPlaceLocation = {
        lat: search_point.lat,
        lon: search_point.lon,
      };
      console.log(`[start-order-search] 📍 Using search_point as first place: (${firstPlaceLocation.lat}, ${firstPlaceLocation.lon})`);
    }

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
    let searchStartedAt: Date;
    if (!existingOrder?.search_started_at) {
      searchStartedAt = new Date();
      updateData.search_started_at = searchStartedAt.toISOString();
      console.log(`[start-order-search] Setting search_started_at for order ${order_id}`);
    } else {
      searchStartedAt = new Date(existingOrder.search_started_at);
      console.log(`[start-order-search] Preserving existing search_started_at for order ${order_id}: ${existingOrder.search_started_at}`);
    }

    // تحديد search_expires_at بناءً على search_started_at + searchDuration
    const searchExpiresAt = new Date(searchStartedAt);
    searchExpiresAt.setSeconds(searchExpiresAt.getSeconds() + searchDuration);
    updateData.search_expires_at = searchExpiresAt.toISOString();
    console.log(`[start-order-search] Setting search_expires_at for order ${order_id}: ${searchExpiresAt.toISOString()} (${searchDuration}s from start)`);

    await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id);

    // البحث عن السائقين في النطاق 0-10 كيلو
    console.log(`[start-order-search] 🔍 Starting search in radius 0-${searchRadius} km from point (${search_point.lat}, ${search_point.lon})`);
    console.log(`[start-order-search] ⏱️ Search duration: ${searchDuration} seconds`);
    
    const { data: drivers, error: driversError } = await supabase.rpc(
      'find_drivers_in_radius',
      {
        p_latitude: search_point.lat,
        p_longitude: search_point.lon,
        p_radius_km: searchRadius,
      }
    );

    if (driversError) {
      console.error('[start-order-search] ❌ Error finding drivers:', driversError);
    } else {
      // التحقق من أن جميع السائقين في النطاق المحدد
      const validDrivers = drivers?.filter(driver => {
        if (driver.distance_km && driver.distance_km > searchRadius) {
          console.warn(`[start-order-search] ⚠️ Driver ${driver.driver_id} is ${driver.distance_km.toFixed(2)} km away (exceeds ${searchRadius} km limit)`);
          return false;
        }
        return true;
      }) || [];
      
      console.log(`[start-order-search] ✅ Found ${drivers?.length || 0} drivers, ${validDrivers.length} within ${searchRadius} km radius`);
      
      // حساب المسافة من موقع كل سائق إلى أول مكان سيذهب إليه
      const driversWithDistance = validDrivers.map(driver => {
        let distanceToFirstPlace = driver.distance_km; // المسافة الافتراضية (من موقع السائق إلى نقطة البحث)
        
        // إذا كان لدينا موقع أول مكان، نحسب المسافة الفعلية
        if (firstPlaceLocation && driver.latitude && driver.longitude) {
          distanceToFirstPlace = calculateDistance(
            driver.latitude,
            driver.longitude,
            firstPlaceLocation.lat,
            firstPlaceLocation.lon
          );
        }
        
        return {
          ...driver,
          distance_to_first_place_km: distanceToFirstPlace,
        };
      });
      
      // إرسال Push Notifications للسائقين
      console.log(`[start-order-search] 📤 Sending push notifications to ${driversWithDistance.length} drivers in radius 0-${searchRadius} km`);
      let pushSentCount = 0;
      
      if (driversWithDistance && driversWithDistance.length > 0) {
        for (const driver of driversWithDistance) {
          try {
            const distanceText = driver.distance_to_first_place_km 
              ? `${driver.distance_to_first_place_km.toFixed(1)} كم`
              : 'غير محدد';
            
            console.log(`[start-order-search] Notifying driver ${driver.driver_id} (distance to first place: ${distanceText})...`);
            
            // إنشاء In-App Notification
            await supabase.rpc('insert_notification_for_driver', {
              p_user_id: driver.driver_id,
              p_title: 'طلب جديد متاح',
              p_message: `طلب جديد متاح - المسافة: ${distanceText}`,
              p_type: 'info',
              p_order_id: order_id,
            });
            console.log(`[start-order-search] ✅ In-app notification created for driver ${driver.driver_id}`);

            // إرسال Push Notification
            try {
              console.log(`[start-order-search] 📤 Attempting to send push notification to driver ${driver.driver_id}...`);
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
                  message: `طلب جديد متاح - المسافة: ${distanceText}`,
                  data: { 
                    order_id: order_id,
                    distance_to_first_place_km: driver.distance_to_first_place_km,
                  },
                }),
              });
              
              const pushResult = await pushResponse.json();
              console.log(`[start-order-search] Push notification response for driver ${driver.driver_id}:`, {
                status: pushResponse.status,
                ok: pushResponse.ok,
                sent: pushResult.sent,
                result: pushResult,
              });
              
              if (pushResponse.ok && pushResult.sent && pushResult.sent > 0) {
                pushSentCount++;
                console.log(`✅ [start-order-search] Push notification sent successfully to driver ${driver.driver_id}`);
              } else {
                console.warn(`⚠️ [start-order-search] Push notification not sent to driver ${driver.driver_id}:`, pushResult);
              }
            } catch (pushErr) {
              console.error(`❌ [start-order-search] Error sending push notification to driver ${driver.driver_id}:`, pushErr);
            }
          } catch (notifErr) {
            console.error(`[start-order-search] Error notifying driver ${driver.driver_id}:`, notifErr);
          }
        }
      }
      
      console.log(`[start-order-search] 📊 Summary: ${driversWithDistance.length} drivers notified, ${pushSentCount} push notifications sent`);
    }

    // إيقاف البحث بعد انتهاء المدة (60 ثانية)
    console.log(`[start-order-search] ⏰ Scheduling search stop for order ${order_id} after ${searchDuration} seconds (${searchDuration * 1000}ms)`);
    setTimeout(async () => {
      // التحقق من أن الطلب لم يُقبل
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('status, driver_id, search_status, customer_id')
        .eq('id', order_id)
        .single();

      if (orderError || !order) {
        console.log(`[start-order-search] ❌ Order not found or error:`, orderError);
        return;
      }

      // إذا تم قبول الطلب أو تم إلغاؤه، لا نوقف البحث
      if (order.status === 'accepted' || order.status === 'cancelled' || order.driver_id) {
        console.log(`[start-order-search] ⚠️ Order ${order_id} already accepted/cancelled, skipping search stop`);
        return;
      }

      // تحديث حالة البحث إلى stopped
      await supabase
        .from('orders')
        .update({ search_status: 'stopped' })
        .eq('id', order_id);
      
      console.log(`[start-order-search] ✅ Search stopped for order ${order_id}`);

      // إرسال إشعار للعميل بأن البحث انتهى ولم يتم العثور على سائق
      try {
        // إنشاء In-App Notification مباشرة
        await supabase
          .from('notifications')
          .insert({
            user_id: order.customer_id,
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
              user_id: order.customer_id,
              title: 'انتهى البحث عن سائق',
              message: 'لم يتم العثور على سائق في النطاق المحدد. يمكنك إعادة البحث أو إلغاء الطلب.',
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
    }, searchDuration * 1000);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم بدء البحث عن السائقين',
        search_radius: searchRadius,
        search_duration: searchDuration,
        drivers_count: drivers?.length || 0,
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

/**
 * Edge Function: Expand Order Search
 * توسيع البحث عن السائقين للطلب
 * 
 * Usage:
 * POST /functions/v1/expand-order-search
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

interface ExpandOrderSearchRequest {
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

    const body: ExpandOrderSearchRequest = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحقق من المستخدم (إذا كان هناك token)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        // إنشاء عميل Supabase مع anon key للتحقق من token المستخدم
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        if (anonKey) {
          const userSupabase = createClient(supabaseUrl, anonKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
            global: {
              headers: {
                Authorization: authHeader,
              },
            },
          });
          
          const { data: { user }, error: userError } = await userSupabase.auth.getUser(token);
          if (!userError && user) {
            userId = user.id;
            console.log(`[expand-order-search] Verified user: ${userId}`);
          }
        }
      } catch (authErr) {
        console.log('Could not verify user token (may use service role):', authErr);
      }
    }

    // التحقق من حالة الطلب الحالية
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, driver_id, search_status, pickup_address, delivery_address, order_type, items, customer_id')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      console.error('Order not found or error:', orderError);
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحقق من أن المستخدم يملك الطلب (إذا كان هناك token)
    if (userId && order.customer_id !== userId) {
      console.log(`User ${userId} does not own order ${order_id} (owner: ${order.customer_id})`);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // إذا تم قبول الطلب أو تم إلغاؤه، لا نوسع البحث
    if (order.status === 'accepted' || order.status === 'cancelled' || order.driver_id) {
      console.log('Order already accepted or cancelled, cannot expand search');
      return new Response(
        JSON.stringify({ success: false, error: 'Order already accepted or cancelled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // إذا كانت الحالة expanded بالفعل، لا نوسع مرة أخرى
    if (order.search_status === 'expanded') {
      console.log('Search already expanded');
      return new Response(
        JSON.stringify({ success: true, message: 'Search already expanded' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    const expandedDuration = parseFloat(
      settings?.find(s => s.setting_key === 'expanded_search_duration_seconds')?.setting_value || '30'
    );

    // تحديد نقطة البحث
    let searchPoint: { lat: number; lon: number } | null = null;

    // دالة مساعدة للـ geocoding
    const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
      if (!address || address.trim() === '') {
        return null;
      }
      
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=ar`;
        const geocodeResponse = await fetch(nominatimUrl, {
          headers: {
            'User-Agent': 'FlashDelivery/1.0',
          },
        });
        
        if (geocodeResponse.ok) {
          const geocodeData = await geocodeResponse.json();
          if (geocodeData && geocodeData.length > 0) {
            return {
              lat: parseFloat(geocodeData[0].lat),
              lon: parseFloat(geocodeData[0].lon),
            };
          }
        }
      } catch (geocodeErr) {
        console.error(`Error geocoding address "${address}":`, geocodeErr);
      }
      return null;
    };

    if (order.order_type === 'outside') {
      // طلب من بره: البحث من أبعد نقطة في items
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        // محاولة استخدام أول عنصر في items (أبعد نقطة)
        const farthestItemAddress = order.items[0]?.address;
        if (farthestItemAddress) {
          searchPoint = await geocodeAddress(farthestItemAddress);
        }
        
        // إذا فشل، نجرب pickup_address
        if (!searchPoint && order.pickup_address) {
          searchPoint = await geocodeAddress(order.pickup_address);
        }
      } else if (order.pickup_address) {
        // إذا لم يكن هناك items، نستخدم pickup_address
        searchPoint = await geocodeAddress(order.pickup_address);
      }
    } else if (order.order_type === 'package') {
      // توصيل طرد: البحث من نقطة الانطلاق (pickupAddress)
      if (order.pickup_address) {
        searchPoint = await geocodeAddress(order.pickup_address);
      }
    }
    
    // إذا فشل كل شيء، نجرب delivery_address كحل أخير
    if (!searchPoint && order.delivery_address) {
      console.log('⚠️ Using delivery_address as fallback for search point');
      searchPoint = await geocodeAddress(order.delivery_address);
    }

    if (!searchPoint) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not determine search point' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // تحديث حالة البحث إلى expanded
    const expandedAt = new Date();
    const expandedExpiresAt = new Date(expandedAt);
    expandedExpiresAt.setSeconds(expandedExpiresAt.getSeconds() + expandedDuration);
    
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        search_status: 'expanded',
        search_expanded_at: expandedAt.toISOString(),
        search_expires_at: expandedExpiresAt.toISOString(),
      })
      .eq('id', order_id);
    
    console.log(`[expand-order-search] Setting search_expires_at for order ${order_id}: ${expandedExpiresAt.toISOString()} (${expandedDuration}s from expanded start)`);

    if (updateError) {
      console.error('Error updating search status:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update search status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Search expanded for order ${order_id}`);

    // البحث الموسع: العثور على السائقين في النطاق الموسع
    const { data: expandedDrivers, error: expandedError } = await supabase.rpc(
      'find_drivers_in_radius',
      {
        p_latitude: searchPoint.lat,
        p_longitude: searchPoint.lon,
        p_radius_km: expandedRadius,
      }
    );

    if (expandedError) {
      console.error('Error finding drivers in expanded radius:', expandedError);
    }

    // جلب السائقين الذين تم إرسال إشعارات لهم في النطاق الأولي
    let initialDriverIds: string[] = [];
    try {
      const { data: notifications } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('order_id', order_id)
        .eq('type', 'info');

      if (notifications) {
        initialDriverIds = notifications.map(n => n.user_id).filter((id): id is string => !!id);
      }
    } catch (notifErr) {
      console.error('Error fetching initial notifications:', notifErr);
    }

    // إرسال إشعارات للسائقين الجدد فقط (الذين لم يتلقوا إشعاراً في النطاق الأولي)
    let notifiedCount = 0;
    if (expandedDrivers && expandedDrivers.length > 0) {
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
              notifiedCount++;
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

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم توسيع البحث بنجاح',
        expanded_radius: expandedRadius,
        drivers_found: expandedDrivers?.length || 0,
        new_drivers_notified: notifiedCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in expand-order-search function:', error);
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

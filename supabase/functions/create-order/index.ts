/**
 * Edge Function: Create Order
 * إنشاء طلب جديد في قاعدة البيانات
 * 
 * Usage:
 * POST /functions/v1/create-order
 * Body: { 
 *   "customerId": "uuid",
 *   "vendorId": "uuid" | null,
 *   "driverId": "uuid" | null,
 *   "items": any,
 *   "status": "pending",
 *   "pickupAddress": string,
 *   "deliveryAddress": string,
 *   "totalFee": number,
 *   "images": string[] | null,
 *   "orderType": "package" | "outside",
 *   "packageDescription": string | null
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateOrderRequest {
  customerId: string;
  vendorId?: string | null;
  driverId?: string | null;
  items?: any;
  status?: string;
  pickupAddress: string;
  deliveryAddress: string;
  totalFee: number;
  images?: string[] | null;
  orderType: 'package' | 'outside';
  packageDescription?: string | null;
  createdByRole?: 'customer' | 'driver' | 'admin'; // من أنشأ الطلب
  expiresAt?: string; // تاريخ انتهاء الصلاحية (ISO string)
}

serve(async (req) => {
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
    const body: CreateOrderRequest = await req.json();
    const {
      customerId,
      vendorId,
      driverId,
      items,
      status = 'pending',
      pickupAddress,
      deliveryAddress,
      totalFee,
      images,
      orderType,
      packageDescription,
      createdByRole = 'customer',
      expiresAt,
    } = body;

    // Validate input
    if (!customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Customer ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!pickupAddress || !deliveryAddress) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Pickup and delivery addresses are required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (totalFee === undefined || totalFee === null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Total fee is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!orderType) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order type is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if customer exists
    const { data: customerProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', customerId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking customer profile:', checkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'فشل التحقق من بيانات العميل',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!customerProfile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'العميل غير موجود',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // جلب وقت استجابة السائق من الإعدادات
    const { data: settings } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'driver_response_timeout')
      .maybeSingle();

    const timeoutSeconds = settings?.setting_value 
      ? parseInt(settings.setting_value) 
      : 300; // 5 دقائق افتراضياً (300 ثانية)

    const driverResponseDeadline = new Date(
      Date.now() + timeoutSeconds * 1000
    ).toISOString();

    // Build order data
    const now = new Date().toISOString();
    const orderData: any = {
      customer_id: customerId,
      vendor_id: vendorId || null,
      driver_id: driverId || null,
      status: status,
      pickup_address: pickupAddress,
      delivery_address: deliveryAddress,
      total_fee: totalFee,
      order_type: orderType,
      created_by_role: createdByRole,
      // إضافة الحقول المطلوبة للعداد التنازلي
      driver_response_deadline: driverResponseDeadline,
      search_status: 'searching', // بدء البحث تلقائياً
      search_started_at: now, // تعيين timestamp لضمان دقة العداد التنازلي
      search_expanded_at: null, // سيتم تعيينه عند توسيع البحث
    };

    // Add optional fields
    if (items !== undefined) {
      orderData.items = items;
    }
    if (images !== undefined && images !== null && images.length > 0) {
      orderData.images = images;
    }
    if (packageDescription !== undefined && packageDescription !== null) {
      orderData.package_description = packageDescription;
    }
    
    // Set expires_at (30 minutes from now by default, or use provided value)
    if (expiresAt) {
      orderData.expires_at = expiresAt;
    } else {
      // سيتم تعيينه تلقائياً بواسطة trigger، لكن يمكننا تعيينه هنا أيضاً
      const expiresDate = new Date();
      expiresDate.setMinutes(expiresDate.getMinutes() + 30);
      orderData.expires_at = expiresDate.toISOString();
    }

    // Insert order
    const { data: newOrder, error: insertError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting order:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: insertError.message || 'فشل إنشاء الطلب',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // بدء البحث التلقائي عن السائقين
    try {
      console.log(`[create-order] 🔍 Determining search point for order type: ${orderType}`);
      // تحديد نقطة البحث حسب نوع الطلب
      let searchPoint: { lat: number; lon: number } | null = null;
      
      if (orderType === 'outside') {
        // طلب من بره: البحث من أبعد نقطة في items
        // سيتم إرسال push للسائقين القريبين من 0-5 كيلو من أبعد مكان لمدة 30 ثانية
        // ثم من 0-10 كيلو لمدة 30 ثانية
        console.log(`[create-order] Order type is 'outside', checking items...`);
        if (items && Array.isArray(items) && items.length > 0) {
          // البحث عن أبعد نقطة (أول نقطة في items هي أبعد نقطة عادة)
          // لأن items مرتبة من الأبعد للأقرب
          const farthestItemAddress = items[0]?.address || pickupAddress;
          console.log(`[create-order] 📍 Using farthest item address for search point: ${farthestItemAddress}`);
          
          // استخدام Nominatim للـ forward geocoding (من العنوان إلى إحداثيات)
          try {
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(farthestItemAddress)}&limit=1&accept-language=ar`;
            console.log(`[create-order] Geocoding address: ${nominatimUrl}`);
            const geocodeResponse = await fetch(nominatimUrl, {
              headers: {
                'User-Agent': 'FlashDelivery/1.0',
              },
            });
            
            if (geocodeResponse.ok) {
              const geocodeData = await geocodeResponse.json();
              if (geocodeData && geocodeData.length > 0) {
                searchPoint = {
                  lat: parseFloat(geocodeData[0].lat),
                  lon: parseFloat(geocodeData[0].lon),
                };
                console.log(`[create-order] ✅ Using farthest point for search: ${farthestItemAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
              } else {
                console.warn(`[create-order] ⚠️ No geocoding results for address: ${farthestItemAddress}`);
              }
            } else {
              console.error(`[create-order] ❌ Geocoding failed with status: ${geocodeResponse.status}`);
            }
          } catch (geocodeErr) {
            console.error('[create-order] ❌ Error geocoding address for search:', geocodeErr);
          }
        } else {
          console.warn(`[create-order] ⚠️ No items found for 'outside' order type`);
        }
      } else if (orderType === 'package') {
        // توصيل طرد: البحث من نقطة الانطلاق (pickupAddress)
        // سيتم إرسال push لأقرب السائقين لنقطة البداية/الانطلاق
        // من 0-5 كيلو لمدة 30 ثانية، ثم من 0-10 كيلو لمدة 30 ثانية
        console.log(`[create-order] Order type is 'package', using pickup address for search point: ${pickupAddress}`);
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickupAddress)}&limit=1&accept-language=ar`;
          console.log(`[create-order] Geocoding pickup address: ${nominatimUrl}`);
          const geocodeResponse = await fetch(nominatimUrl, {
            headers: {
              'User-Agent': 'FlashDelivery/1.0',
            },
          });
          
          if (geocodeResponse.ok) {
            const geocodeData = await geocodeResponse.json();
            if (geocodeData && geocodeData.length > 0) {
              searchPoint = {
                lat: parseFloat(geocodeData[0].lat),
                lon: parseFloat(geocodeData[0].lon),
              };
              console.log(`[create-order] ✅ Using pickup address for search: ${pickupAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
            } else {
              console.warn(`[create-order] ⚠️ No geocoding results for pickup address: ${pickupAddress}`);
            }
          } else {
            console.error(`[create-order] ❌ Geocoding failed with status: ${geocodeResponse.status}`);
          }
        } catch (geocodeErr) {
          console.error('[create-order] ❌ Error geocoding pickup address for search:', geocodeErr);
        }
      } else {
        console.warn(`[create-order] ⚠️ Unknown order type: ${orderType}`);
      }

      // إذا تم تحديد نقطة البحث، ابدأ البحث التلقائي
      if (searchPoint) {
        try {
          console.log(`[create-order] Starting search for order ${newOrder.id} from point (${searchPoint.lat}, ${searchPoint.lon})`);
          const searchResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/start-order-search`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              order_id: newOrder.id,
              search_point: searchPoint,
            }),
          });

          const searchResult = await searchResponse.json();
          if (searchResponse.ok && searchResult.success) {
            console.log(`✅ [create-order] Started automatic search for order ${newOrder.id} from point (${searchPoint.lat}, ${searchPoint.lon})`);
            console.log(`[create-order] Search result:`, searchResult);
          } else {
            console.error('[create-order] ❌ Error starting order search:', searchResult.error);
          }
        } catch (searchErr) {
          console.error('[create-order] ❌ Exception starting order search:', searchErr);
        }
      } else {
        console.log('[create-order] ⚠️ Could not determine search point, skipping automatic search');
      }
    } catch (searchError) {
      // لا نوقف العملية إذا فشل البحث
      console.error('Error starting order search:', searchError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم إنشاء الطلب بنجاح',
        order: newOrder,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error creating order:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء إنشاء الطلب',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


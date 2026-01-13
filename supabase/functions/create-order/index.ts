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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  recipientPhone?: string | null; // رقم المستلم
  createdByRole?: 'customer' | 'driver' | 'admin'; // من أنشأ الطلب
  expiresAt?: string; // تاريخ انتهاء الصلاحية (ISO string)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200,
    });
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
      recipientPhone,
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
    
    // جلب إعدادات البحث لحساب search_expires_at
    let searchExpiresAt: string | null = null;
    if (status === 'pending') {
      const { data: settings } = await supabase
        .from('order_search_settings')
        .select('setting_key, setting_value');
      
      const searchDuration = parseFloat(
        settings?.find(s => s.setting_key === 'search_duration_seconds')?.setting_value || 
        settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || 
        '60'
      );
      
      // حساب search_expires_at = search_started_at + searchDuration
      const expiresDate = new Date(now);
      expiresDate.setSeconds(expiresDate.getSeconds() + searchDuration);
      searchExpiresAt = expiresDate.toISOString();
      
      console.log(`[create-order] Setting search_expires_at: ${searchExpiresAt} (${searchDuration}s from start)`);
    }
    
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
      search_status: status === 'pending' ? 'searching' : null, // بدء البحث تلقائياً للطلبات المعلقة
      search_started_at: status === 'pending' ? now : null, // تعيين timestamp لضمان دقة العداد التنازلي
      search_expires_at: searchExpiresAt, // تعيين search_expires_at للعداد الموحد
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
    if (recipientPhone !== undefined && recipientPhone !== null) {
      orderData.recipient_phone = recipientPhone;
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

    // إنشاء order_items تلقائياً لطلبات package في الوضع البسيط
    // إذا لم يكن هناك items أو كان items فارغاً
    if (orderType === 'package' && (!items || !Array.isArray(items) || items.length === 0)) {
      console.log('[create-order] Creating order_items for simple package order...');
      try {
        const orderItemsToCreate = [
          {
            order_id: newOrder.id,
            item_index: 0,
            address: pickupAddress,
            description: packageDescription || null,
            latitude: null,
            longitude: null,
            is_picked_up: false,
          },
          {
            order_id: newOrder.id,
            item_index: 1,
            address: deliveryAddress,
            description: null,
            latitude: null,
            longitude: null,
            is_picked_up: false,
          },
        ];

        const { data: insertedItems, error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItemsToCreate)
          .select();

        if (itemsError) {
          console.error('[create-order] Error creating order_items:', itemsError);
          // لا نوقف العملية إذا فشل إنشاء order_items
        } else {
          console.log('[create-order] ✅ Created order_items for simple package order:', insertedItems?.length || 0);
        }
      } catch (itemsException) {
        console.error('[create-order] Exception creating order_items:', itemsException);
        // لا نوقف العملية إذا فشل إنشاء order_items
      }
    }

    // بدء البحث التلقائي عن السائقين
    try {
      console.log(`[create-order] 🔍 Determining search point for order type: ${orderType}`);
      // تحديد نقطة البحث حسب نوع الطلب
      let searchPoint: { lat: number; lon: number } | null = null;
      
      if (orderType === 'outside') {
        // طلب من بره: البحث من أبعد نقطة في items (وليس delivery_address)
        // سيتم إرسال push للسائقين القريبين من 0-5 كيلو من أبعد مكان لمدة 30 ثانية
        // ثم من 0-10 كيلو لمدة 30 ثانية
        console.log(`[create-order] Order type is 'outside', checking items...`);
        if (items && Array.isArray(items) && items.length > 0) {
          // البحث عن أبعد نقطة (أول نقطة في items هي أبعد نقطة عادة)
          // لأن items مرتبة من الأبعد للأقرب
          const farthestItemAddress = items[0]?.address;
          if (farthestItemAddress) {
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
            console.warn(`[create-order] ⚠️ No address found in first item`);
          }
          
          // إذا فشل، نجرب pickup_address كبديل
          if (!searchPoint && pickupAddress) {
            console.log(`[create-order] ⚠️ Falling back to pickup_address: ${pickupAddress}`);
            try {
              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickupAddress)}&limit=1&accept-language=ar`;
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
                  console.log(`[create-order] ✅ Using pickup_address as fallback: ${pickupAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
                } else {
                  console.warn(`[create-order] ⚠️ No geocoding results for pickup_address: ${pickupAddress}`);
                }
              } else {
                console.error(`[create-order] ❌ Geocoding pickup_address failed with status: ${geocodeResponse.status}`);
              }
            } catch (geocodeErr) {
              console.error('[create-order] ❌ Error geocoding pickup_address:', geocodeErr);
            }
          }
          
          // إذا فشل كل شيء، نجرب delivery_address كـ fallback أخير
          if (!searchPoint && deliveryAddress) {
            console.log(`[create-order] ⚠️ Last resort: trying delivery_address: ${deliveryAddress}`);
            try {
              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(deliveryAddress)}&limit=1&accept-language=ar`;
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
                  console.log(`[create-order] ✅ Using delivery_address as last resort: ${deliveryAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
                } else {
                  console.warn(`[create-order] ⚠️ No geocoding results for delivery_address: ${deliveryAddress}`);
                }
              } else {
                console.error(`[create-order] ❌ Geocoding delivery_address failed with status: ${geocodeResponse.status}`);
              }
            } catch (geocodeErr) {
              console.error('[create-order] ❌ Error geocoding delivery_address:', geocodeErr);
            }
          }
        } else {
          // إذا لم يكن هناك items، نستخدم pickup_address
          console.warn(`[create-order] ⚠️ No items found for 'outside' order type, using pickup_address`);
          if (pickupAddress) {
            try {
              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickupAddress)}&limit=1&accept-language=ar`;
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
                  console.log(`[create-order] ✅ Using pickup_address: ${pickupAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
                } else {
                  console.warn(`[create-order] ⚠️ No geocoding results for pickup_address: ${pickupAddress}`);
                }
              } else {
                console.error(`[create-order] ❌ Geocoding pickup_address failed with status: ${geocodeResponse.status}`);
              }
            } catch (geocodeErr) {
              console.error('[create-order] ❌ Error geocoding pickup_address:', geocodeErr);
            }
          }
          
          // إذا فشل pickup_address، نجرب delivery_address
          if (!searchPoint && deliveryAddress) {
            console.log(`[create-order] ⚠️ Falling back to delivery_address: ${deliveryAddress}`);
            try {
              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(deliveryAddress)}&limit=1&accept-language=ar`;
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
                  console.log(`[create-order] ✅ Using delivery_address as fallback: ${deliveryAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
                } else {
                  console.warn(`[create-order] ⚠️ No geocoding results for delivery_address: ${deliveryAddress}`);
                }
              } else {
                console.error(`[create-order] ❌ Geocoding delivery_address failed with status: ${geocodeResponse.status}`);
              }
            } catch (geocodeErr) {
              console.error('[create-order] ❌ Error geocoding delivery_address:', geocodeErr);
            }
          }
        }
      } else if (orderType === 'package') {
        // توصيل طرد: البحث من نقطة الانطلاق (pickupAddress) فقط
        // لا نستخدم delivery_address أبداً
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
        
        // إذا لم يكن هناك pickup_address، نحاول استخدام items[0].address
        if (!searchPoint && items && Array.isArray(items) && items.length > 0) {
          const firstItemAddress = items[0]?.address;
          if (firstItemAddress) {
            console.log(`[create-order] ⚠️ Falling back to first item address for package order: ${firstItemAddress}`);
            try {
              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(firstItemAddress)}&limit=1&accept-language=ar`;
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
                  console.log(`[create-order] ✅ Using first item address as fallback: ${firstItemAddress} -> (${searchPoint.lat}, ${searchPoint.lon})`);
                }
              }
            } catch (geocodeErr) {
              console.error('[create-order] ❌ Error geocoding first item address:', geocodeErr);
            }
          }
        }
      } else {
        console.warn(`[create-order] ⚠️ Unknown order type: ${orderType}`);
      }

      // إذا تم تحديد نقطة البحث، ابدأ البحث التلقائي
      if (searchPoint) {
        try {
          console.log(`[create-order] 🚀 Starting search for order ${newOrder.id} from point (${searchPoint.lat}, ${searchPoint.lon})`);
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
            console.error('[create-order] Full search response:', searchResult);
          }
        } catch (searchErr) {
          console.error('[create-order] ❌ Exception starting order search:', searchErr);
          console.error('[create-order] Exception details:', JSON.stringify(searchErr, null, 2));
        }
      } else {
        console.error(`[create-order] ❌❌❌ CRITICAL: Could not determine search point for order ${newOrder.id} (type: ${orderType})`);
        console.error(`[create-order] Order details:`, {
          order_id: newOrder.id,
          order_type: orderType,
          has_items: !!(items && Array.isArray(items) && items.length > 0),
          items_count: items && Array.isArray(items) ? items.length : 0,
          first_item_address: items && Array.isArray(items) && items.length > 0 ? items[0]?.address : null,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
        });
        console.error('[create-order] ⚠️ Skipping automatic search - NO PUSH NOTIFICATIONS WILL BE SENT!');
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


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

    // Build order data
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


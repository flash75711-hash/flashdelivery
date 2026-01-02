/**
 * Edge Function: Get Order By ID For Customer
 * جلب طلب للعميل (تجاوز RLS)
 * 
 * Usage:
 * POST /functions/v1/get-order-by-id-for-customer
 * Body: { 
 *   "orderId": "uuid",
 *   "customerId": "uuid"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetOrderRequest {
  orderId: string;
  customerId: string;
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
    const body: GetOrderRequest = await req.json();
    const { orderId, customerId } = body;

    // Validate input
    if (!orderId || !customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order ID and Customer ID are required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Fetch order with service role (bypasses RLS)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        driver_id,
        status,
        order_type,
        items,
        pickup_address,
        delivery_address,
        total_fee,
        created_at,
        expires_at,
        created_by_role,
        package_description
      `)
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.error('Error fetching order:', orderError);
      return new Response(
        JSON.stringify({
          success: false,
          error: orderError.message || 'فشل جلب الطلب',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: orderError.code === 'PGRST116' ? 404 : 500,
        }
      );
    }

    if (!order) {
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

    // Verify that the customer is authorized to view this order
    if (order.customer_id !== customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'غير مصرح لك بمشاهدة هذا الطلب',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    // Fetch driver profile if driver_id exists
    let driver = null;
    if (order.driver_id) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', order.driver_id)
        .maybeSingle();

      if (!profileError && profile) {
        driver = profile;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        order: {
          ...order,
          driver,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error getting order:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء جلب الطلب',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


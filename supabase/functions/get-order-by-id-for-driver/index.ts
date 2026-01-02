/**
 * Edge Function: Get Order By ID For Driver
 * جلب طلب للسائق (تجاوز RLS)
 * 
 * Usage:
 * POST /functions/v1/get-order-by-id-for-driver
 * Body: { 
 *   "orderId": "uuid",
 *   "driverId": "uuid"
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
  driverId: string;
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
    const { orderId, driverId } = body;

    // Validate input
    if (!orderId || !driverId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order ID and Driver ID are required',
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

    // Verify that the driver is authorized to view this order
    // Allow if:
    // 1. driver_id matches the requesting driver
    // 2. status is 'pending' and driver_id is null
    const isDriverOwner = order.driver_id === driverId;
    const isPendingWithoutDriver = order.status === 'pending' && !order.driver_id;
    const isPendingWithDriver = order.status === 'pending' && order.driver_id === driverId;

    if (!isDriverOwner && !isPendingWithoutDriver && !isPendingWithDriver) {
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

    // Fetch customer profile if customer_id exists
    let customer = null;
    if (order.customer_id) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', order.customer_id)
        .maybeSingle();

      if (!profileError && profile) {
        customer = profile;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        order: {
          ...order,
          customer,
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


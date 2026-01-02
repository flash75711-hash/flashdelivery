/**
 * Edge Function: Get Order Items
 * جلب order_items للطلب (تجاوز RLS)
 * 
 * Usage:
 * POST /functions/v1/get-order-items
 * Body: { 
 *   "orderId": "uuid",
 *   "userId": "uuid",
 *   "userRole": "driver" | "customer"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetOrderItemsRequest {
  orderId: string;
  userId: string;
  userRole: 'driver' | 'customer';
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
    const body: GetOrderItemsRequest = await req.json();
    const { orderId, userId, userRole } = body;

    // Validate input
    if (!orderId || !userId || !userRole) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order ID, User ID, and User Role are required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // First, verify the user has access to this order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, customer_id, driver_id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
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

    // Verify authorization
    if (userRole === 'customer' && order.customer_id !== userId) {
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

    if (userRole === 'driver' && order.driver_id !== userId) {
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

    // Fetch order_items with service role (bypasses RLS)
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('item_index', { ascending: true });

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return new Response(
        JSON.stringify({
          success: false,
          error: itemsError.message || 'فشل جلب الطلبات',
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
        orderItems: orderItems || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error getting order items:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء جلب الطلبات',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


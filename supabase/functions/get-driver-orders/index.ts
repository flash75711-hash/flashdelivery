/**
 * Edge Function: Get Driver Orders
 * جلب طلبات السائق (تجاوز RLS)
 * 
 * Usage:
 * POST /functions/v1/get-driver-orders
 * Body: { 
 *   "driverId": "uuid"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetDriverOrdersRequest {
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
    const body: GetDriverOrdersRequest = await req.json();
    const { driverId } = body;

    // Validate input
    if (!driverId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Driver ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Fetch orders with service role (bypasses RLS)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        order_type,
        items,
        pickup_address,
        delivery_address,
        total_fee,
        created_at,
        expires_at,
        customer_id,
        driver_id,
        created_by_role
      `)
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return new Response(
        JSON.stringify({
          success: false,
          error: ordersError.message || 'فشل جلب الطلبات',
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
        orders: orders || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error getting driver orders:', error);
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


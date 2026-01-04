import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetDriverHistoryRequest {
  driverId: string;
}

Deno.serve(async (req) => {
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

    const body: GetDriverHistoryRequest = await req.json();
    const { driverId } = body;

    if (!driverId) {
      return new Response(
        JSON.stringify({ success: false, error: 'driverId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // جلب الرحلات المكتملة والملغاة
    const { data: trips, error: tripsError } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false });

    if (tripsError) {
      console.error('Error fetching driver trips:', tripsError);
      return new Response(
        JSON.stringify({ success: false, error: tripsError.message || 'Failed to fetch trips' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // جلب order_items لكل رحلة
    const tripIds = (trips || []).map(trip => trip.id);
    let orderItemsMap: Record<string, any[]> = {};

    if (tripIds.length > 0) {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', tripIds)
        .order('item_index', { ascending: true });

      if (!itemsError && orderItems) {
        orderItems.forEach(item => {
          if (!orderItemsMap[item.order_id]) {
            orderItemsMap[item.order_id] = [];
          }
          orderItemsMap[item.order_id].push(item);
        });
      }
    }

    // إضافة order_items لكل رحلة
    const tripsWithItems = (trips || []).map(trip => ({
      ...trip,
      order_items: orderItemsMap[trip.id] || [],
    }));

    return new Response(
      JSON.stringify({
        success: true,
        trips: tripsWithItems || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in get-driver-history function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetCustomerHistoryRequest {
  customerId: string;
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

    const body: GetCustomerHistoryRequest = await req.json();
    const { customerId } = body;

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'customerId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // جلب الطلبات المكتملة والملغاة
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching customer orders:', ordersError);
      return new Response(
        JSON.stringify({ success: false, error: ordersError.message || 'Failed to fetch orders' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // جلب order_items لكل طلب
    const orderIds = (orders || []).map(order => order.id);
    let orderItemsMap: Record<string, any[]> = {};

    if (orderIds.length > 0) {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds)
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

    // جلب معلومات السائقين إذا كانوا موجودين
    const driverIds = orders
      ?.filter(order => order.driver_id)
      .map(order => order.driver_id)
      .filter((id, index, self) => self.indexOf(id) === index) || [];

    let driversMap: Record<string, { full_name?: string; phone?: string }> = {};

    if (driverIds.length > 0) {
      const { data: driversData } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', driverIds);

      if (driversData) {
        driversData.forEach(driver => {
          driversMap[driver.id] = {
            full_name: driver.full_name,
            phone: driver.phone,
          };
        });
      }
    }

    // دمج البيانات
    const ordersWithDrivers = orders?.map(order => ({
      ...order,
      driver: order.driver_id ? driversMap[order.driver_id] : undefined,
      order_items: orderItemsMap[order.id] || [],
    })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        orders: ordersWithDrivers,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in get-customer-history function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


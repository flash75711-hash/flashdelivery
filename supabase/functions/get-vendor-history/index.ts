import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetVendorHistoryRequest {
  vendorId: string;
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

    const body: GetVendorHistoryRequest = await req.json();
    const { vendorId } = body;

    if (!vendorId) {
      return new Response(
        JSON.stringify({ success: false, error: 'vendorId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // جلب الطلبات المكتملة والملغاة
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('vendor_id', vendorId)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching vendor orders:', ordersError);
      return new Response(
        JSON.stringify({ success: false, error: ordersError.message || 'Failed to fetch orders' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // جلب معلومات العملاء والسائقين إذا كانوا موجودين
    const customerIds = orders
      ?.filter(order => order.customer_id)
      .map(order => order.customer_id)
      .filter((id, index, self) => self.indexOf(id) === index) || [];

    const driverIds = orders
      ?.filter(order => order.driver_id)
      .map(order => order.driver_id)
      .filter((id, index, self) => self.indexOf(id) === index) || [];

    let customersMap: Record<string, { full_name?: string; phone?: string }> = {};
    let driversMap: Record<string, { full_name?: string; phone?: string }> = {};

    if (customerIds.length > 0) {
      const { data: customersData } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', customerIds);

      if (customersData) {
        customersData.forEach(customer => {
          customersMap[customer.id] = {
            full_name: customer.full_name,
            phone: customer.phone,
          };
        });
      }
    }

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
    const ordersWithDetails = orders?.map(order => ({
      ...order,
      customer: order.customer_id ? customersMap[order.customer_id] : undefined,
      driver: order.driver_id ? driversMap[order.driver_id] : undefined,
    })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        orders: ordersWithDetails,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in get-vendor-history function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


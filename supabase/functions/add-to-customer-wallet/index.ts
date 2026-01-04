import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddToCustomerWalletRequest {
  customerId: string;
  amount: number;
  orderId?: string;
  description?: string;
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

    const body: AddToCustomerWalletRequest = await req.json();
    const { customerId, amount, orderId, description } = body;

    if (!customerId || amount === undefined || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Customer ID and positive amount are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // التحقق من وجود العميل
    const { data: customer, error: customerError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({ success: false, error: 'Customer not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (customer.role !== 'customer') {
      return new Response(
        JSON.stringify({ success: false, error: 'User is not a customer' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // إضافة المبلغ لمحفظة العميل
    // استخدام customer_id في جدول wallets
    const { data: walletEntry, error: walletError } = await supabase
      .from('wallets')
      .insert({
        customer_id: customerId,
        driver_id: null, // null للعملاء
        order_id: orderId || null,
        amount: amount,
        commission: 0,
        type: 'earning', // للعميل، الباقي يعتبر earning
        description: description || `باقي من طلب ${orderId ? `#${orderId.substring(0, 8)}` : ''}`,
      })
      .select()
      .single();

    if (walletError) {
      console.error('Error adding to customer wallet:', walletError);
      return new Response(
        JSON.stringify({ success: false, error: walletError.message || 'Failed to add to wallet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        walletEntry,
        message: `تم إضافة ${amount.toFixed(2)} جنيه إلى محفظة العميل`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in add-to-customer-wallet function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


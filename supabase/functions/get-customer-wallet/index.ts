import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetCustomerWalletRequest {
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

    const body: GetCustomerWalletRequest = await req.json();
    const { customerId } = body;

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'customerId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // جلب جميع المعاملات للعميل
    const { data: transactions, error: transactionsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (transactionsError) {
      console.error('Error fetching wallet transactions:', transactionsError);
      return new Response(
        JSON.stringify({ success: false, error: transactionsError.message || 'Failed to fetch wallet transactions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // حساب الإحصائيات
    const earnings = (transactions || []).filter(t => t.type === 'earning');
    const deductions = (transactions || []).filter(t => t.type === 'deduction');
    
    const totalEarnings = earnings.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const totalDeductions = deductions.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // الرصيد = الأرباح - الخصومات
    const balance = totalEarnings - totalDeductions;

    return new Response(
      JSON.stringify({
        success: true,
        balance,
        totalEarnings,
        totalDeductions,
        transactions: transactions || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in get-customer-wallet function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


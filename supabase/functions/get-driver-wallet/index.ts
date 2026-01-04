import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetDriverWalletRequest {
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

    const body: GetDriverWalletRequest = await req.json();
    const { driverId } = body;

    if (!driverId) {
      return new Response(
        JSON.stringify({ success: false, error: 'driverId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // جلب جميع المعاملات للسائق
    const { data: transactions, error: transactionsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('driver_id', driverId)
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
    const totalCommission = earnings.reduce((sum, item) => sum + parseFloat(item.commission || 0), 0);
    const totalDeductions = deductions.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // الرصيد = الأرباح - الخصومات
    const balance = totalEarnings - totalDeductions;

    return new Response(
      JSON.stringify({
        success: true,
        balance,
        totalEarnings,
        totalCommission,
        totalDeductions,
        transactions: transactions || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in get-driver-wallet function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});


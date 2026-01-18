/**
 * Edge Function: Get Settlement Requests
 * جلب جميع طلبات التوريد للإدارة
 * 
 * Usage:
 * POST /functions/v1/get-settlement-requests
 * Body: {
 *   "adminId": "uuid"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetSettlementRequestsRequest {
  adminId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[get-settlement-requests] Missing Supabase configuration');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let body: GetSettlementRequestsRequest;
    try {
      body = await req.json();
      console.log('[get-settlement-requests] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[get-settlement-requests] Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { adminId } = body;

    if (!adminId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // التحقق من أن المستخدم هو admin
    const { data: admin, error: adminError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', adminId)
      .single();

    if (adminError || !admin) {
      console.error('[get-settlement-requests] Error fetching admin:', adminError);
      return new Response(
        JSON.stringify({ success: false, error: 'Admin not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (admin.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'User is not an admin' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // جلب جميع طلبات التوريد
    const { data: requestsData, error: requestsError } = await supabase
      .from('settlement_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (requestsError) {
      console.error('[get-settlement-requests] Error fetching settlement requests:', requestsError);
      return new Response(
        JSON.stringify({ success: false, error: requestsError.message || 'Failed to fetch settlement requests' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[get-settlement-requests] Found ${requestsData?.length || 0} settlement requests`);

    if (!requestsData || requestsData.length === 0) {
      return new Response(
        JSON.stringify({ success: true, requests: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // جلب معلومات السائقين من profiles
    const driverIds = [...new Set(requestsData.map(r => r.driver_id))];
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', driverIds);

    if (profilesError) {
      console.error('[get-settlement-requests] Error fetching driver profiles:', profilesError);
      // نستمر حتى لو فشل جلب معلومات السائقين
    }

    // دمج البيانات
    const profilesMap = new Map(
      (profilesData || []).map(p => [p.id, p])
    );

    const formattedRequests = requestsData.map((item: any) => ({
      ...item,
      driver: profilesMap.get(item.driver_id) || null,
      requested_at: item.requested_at || item.created_at,
    }));

    console.log(`[get-settlement-requests] Returning ${formattedRequests.length} formatted requests`);

    return new Response(
      JSON.stringify({
        success: true,
        requests: formattedRequests,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[get-settlement-requests] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

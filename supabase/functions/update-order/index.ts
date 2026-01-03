/**
 * Edge Function: Update Order
 * تحديث طلب في قاعدة البيانات
 * 
 * Usage:
 * POST /functions/v1/update-order
 * Body: { 
 *   "orderId": "uuid",
 *   "status": "accepted" | "pickedUp" | "inTransit" | "completed" | "cancelled",
 *   "driverId": "uuid" | null,
 *   "negotiationStatus": "pending" | "driver_proposed" | "customer_proposed" | "accepted" | "rejected" | null,
 *   "negotiatedPrice": number | null,
 *   "driverProposedPrice": number | null,
 *   "customerProposedPrice": number | null,
 *   "searchStatus": "searching" | "expanded" | "stopped" | "found" | null,
 *   "searchStartedAt": string | null,
 *   "searchExpandedAt": string | null
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateOrderRequest {
  orderId: string;
  status?: string;
  driverId?: string | null;
  negotiationStatus?: string | null;
  negotiatedPrice?: number | null;
  driverProposedPrice?: number | null;
  customerProposedPrice?: number | null;
  searchStatus?: string | null;
  searchStartedAt?: string | null;
  searchExpandedAt?: string | null;
  completedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
}

serve(async (req) => {
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
    const body: UpdateOrderRequest = await req.json();
    const {
      orderId,
      status,
      driverId,
      negotiationStatus,
      negotiatedPrice,
      driverProposedPrice,
      customerProposedPrice,
      searchStatus,
      searchStartedAt,
      searchExpandedAt,
      completedAt,
      cancelledBy,
      cancelledAt,
    } = body;

    // Validate input
    if (!orderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if order exists
    const { data: existingOrder, error: checkError } = await supabase
      .from('orders')
      .select('id, customer_id, driver_id, status')
      .eq('id', orderId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking order:', checkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'فشل التحقق من الطلب',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!existingOrder) {
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

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (driverId !== undefined) updateData.driver_id = driverId;
    if (negotiationStatus !== undefined) updateData.negotiation_status = negotiationStatus;
    if (negotiatedPrice !== undefined) updateData.negotiated_price = negotiatedPrice;
    if (driverProposedPrice !== undefined) updateData.driver_proposed_price = driverProposedPrice;
    if (customerProposedPrice !== undefined) updateData.customer_proposed_price = customerProposedPrice;
    if (searchStatus !== undefined) updateData.search_status = searchStatus;
    if (searchStartedAt !== undefined) updateData.search_started_at = searchStartedAt;
    if (searchExpandedAt !== undefined) updateData.search_expanded_at = searchExpandedAt;
    if (completedAt !== undefined) updateData.completed_at = completedAt;
    if (cancelledBy !== undefined) updateData.cancelled_by = cancelledBy;
    if (cancelledAt !== undefined) updateData.cancelled_at = cancelledAt;

    // Update order
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating order:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: updateError.message || 'فشل تحديث الطلب',
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
        message: 'تم تحديث الطلب بنجاح',
        order: updatedOrder,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error updating order:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء تحديث الطلب',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


/**
 * Edge Function: Update Order Item
 * تحديث order_item (تجاوز RLS)
 * 
 * Usage:
 * POST /functions/v1/update-order-item
 * Body: { 
 *   "itemId": "uuid",
 *   "orderId": "uuid",
 *   "driverId": "uuid",
 *   "is_picked_up": boolean,
 *   "picked_up_at": string (ISO date, optional)
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateOrderItemRequest {
  itemId: string;
  orderId: string;
  driverId: string;
  is_picked_up: boolean;
  picked_up_at?: string | null;
  item_fee?: number | null;
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
    const body: UpdateOrderItemRequest = await req.json();
    const { itemId, orderId, driverId, is_picked_up, picked_up_at, item_fee } = body;

    // Validate input
    if (!itemId || !orderId || !driverId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'itemId, orderId, and driverId are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // First, verify the order exists and the driver is assigned to it
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, driver_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'الطلب غير موجود',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify the driver is assigned to this order
    if (order.driver_id !== driverId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'غير مصرح لك بتحديث هذا الطلب',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify the item belongs to this order
    const { data: item, error: itemCheckError } = await supabase
      .from('order_items')
      .select('id, order_id')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single();

    if (itemCheckError || !item) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'العنصر غير موجود أو لا ينتمي لهذا الطلب',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update the order item (bypassing RLS with service role)
    const updateData: any = {
      is_picked_up: is_picked_up,
    };

    if (picked_up_at) {
      updateData.picked_up_at = picked_up_at;
    } else if (is_picked_up) {
      updateData.picked_up_at = new Date().toISOString();
    }

    // إضافة المبلغ إذا تم إدخاله
    if (item_fee !== undefined && item_fee !== null) {
      updateData.item_fee = item_fee;
    }

    const { data: updatedItem, error: updateError } = await supabase
      .from('order_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating order item:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: updateError.message || 'فشل تحديث العنصر',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        item: updatedItem,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in update-order-item function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});


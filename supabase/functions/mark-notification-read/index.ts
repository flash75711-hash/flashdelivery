/**
 * Edge Function: Mark Notification as Read
 * تحديث حالة الإشعار كمقروء (تجاوز RLS)
 * 
 * Usage:
 * POST /functions/v1/mark-notification-read
 * Body: { 
 *   "notification_id": "uuid",
 *   "user_id": "uuid"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarkNotificationReadRequest {
  notification_id: string;
  user_id: string;
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
    const body: MarkNotificationReadRequest = await req.json();
    const { notification_id, user_id } = body;

    // Validate input
    if (!notification_id || !user_id) {
      return new Response(
        JSON.stringify({
          error: 'notification_id and user_id are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify that the notification belongs to the user
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id')
      .eq('id', notification_id)
      .single();

    if (fetchError || !notification) {
      return new Response(
        JSON.stringify({
          error: 'Notification not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (notification.user_id !== user_id) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized: Notification does not belong to this user',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update notification as read (bypassing RLS with service role)
    const { data: updatedNotification, error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification_id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating notification:', updateError);
      return new Response(
        JSON.stringify({
          error: updateError.message,
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
        notification: updatedNotification,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in mark-notification-read function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});


import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface PushNotificationPayload {
  to: string;
  sound: string;
  title: string;
  body: string;
  data?: any;
  badge?: number;
}

Deno.serve(async (req: Request) => {
  try {
    // التحقق من JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // التحقق من المستخدم
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { user_id, title, message, data } = await req.json();

    if (!user_id || !title || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, title, message' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // جلب device tokens للمستخدم
    const { data: deviceTokens, error: tokensError } = await supabaseClient
      .from('device_tokens')
      .select('device_token, platform')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (tokensError) {
      console.error('Error fetching device tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch device tokens' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No device tokens found for user', sent: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // إرسال إشعارات Push لكل device token
    const pushPromises = deviceTokens.map(async (device) => {
      const payload: PushNotificationPayload = {
        to: device.device_token,
        sound: 'default',
        title: title,
        body: message,
        data: data || {},
        badge: 1,
      };

      try {
        const response = await fetch(EXPO_PUSH_API_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        return { success: true, token: device.device_token, result };
      } catch (error) {
        console.error(`Error sending push to ${device.device_token}:`, error);
        return { success: false, token: device.device_token, error };
      }
    });

    const results = await Promise.all(pushPromises);
    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        message: `Sent ${successCount} push notifications`,
        sent: successCount,
        total: deviceTokens.length,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-push-notification function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

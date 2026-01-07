import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// FCM HTTP v1 API endpoint
const FCM_API_URL = (projectId: string) => `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

interface FCMPayload {
  message: {
    token: string;
    notification: {
      title: string;
      body: string;
    };
    data?: Record<string, string>;
    android?: {
      priority: 'high' | 'normal';
      notification?: {
        sound?: string;
        channel_id?: string;
      };
    };
    apns?: {
      payload?: {
        aps?: {
          badge?: number;
          sound?: string;
        };
      };
    };
  };
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * إنشاء JWT token للـ Service Account
 */
async function createJWT(serviceAccount: ServiceAccount): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: serviceAccount.token_uri,
    exp: now + 3600, // expires in 1 hour
    iat: now,
  };

  // Encode header and claim
  const encodedHeader = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const encodedClaim = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(claim))
  );
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  // Prepare private key - remove PEM headers and whitespace
  const privateKeyPEM = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .trim();

  // Convert PEM to ArrayBuffer
  const binaryDer = Uint8Array.from(atob(privateKeyPEM), (c) => c.charCodeAt(0));

  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * الحصول على Access Token من Google OAuth
 */
async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const jwt = await createJWT(serviceAccount);

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
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

    // استخدام Service Role Key للوصول إلى profiles بدون RLS
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // جلب FCM token من profiles table
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('fcm_token')
      .eq('id', user_id)
      .single();

    if (profileError) {
      console.error('Error fetching FCM token:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch FCM token' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!profile || !profile.fcm_token) {
      console.log('No FCM token found for user:', user_id);
      return new Response(
        JSON.stringify({ message: 'No FCM token found for user', sent: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // الحصول على Service Account JSON من متغيرات البيئة
    const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    
    if (!serviceAccountJson) {
      console.error('FCM_SERVICE_ACCOUNT_JSON not found in environment variables');
      return new Response(
        JSON.stringify({ 
          error: 'FCM Service Account not configured',
          message: 'Please set FCM_SERVICE_ACCOUNT_JSON in Supabase Edge Function secrets'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let serviceAccount: ServiceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (error) {
      console.error('Error parsing Service Account JSON:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid Service Account JSON',
          message: 'FCM_SERVICE_ACCOUNT_JSON must be valid JSON'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // الحصول على Access Token
    const accessToken = await getAccessToken(serviceAccount);

    // تحويل data object إلى string format (FCM HTTP v1 API requires string values)
    const dataPayload: Record<string, string> = {};
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        dataPayload[key] = String(value);
      }
    }

    // إرسال Push Notification عبر FCM HTTP v1 API
    const payload: FCMPayload = {
      message: {
        token: profile.fcm_token,
        notification: {
          title: title,
          body: message,
        },
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channel_id: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: 'default',
            },
          },
        },
      },
    };

    try {
      const response = await fetch(FCM_API_URL(serviceAccount.project_id), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      
      // FCM HTTP v1 API returns success with "name" field containing message ID
      if (result.name) {
        console.log('FCM notification sent successfully:', result.name);
        return new Response(
          JSON.stringify({
            message: 'Push notification sent successfully',
            sent: 1,
            total: 1,
            message_id: result.name,
            result,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        console.error('Error sending push notification:', result);
        return new Response(
          JSON.stringify({
            message: 'Failed to send push notification',
            sent: 0,
            total: 1,
            error: result,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error: any) {
      console.error('Error sending push notification:', error);
      return new Response(
        JSON.stringify({
          message: 'Exception sending push notification',
          sent: 0,
          total: 1,
          error: error.message || 'Unknown error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in send-push-notification function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

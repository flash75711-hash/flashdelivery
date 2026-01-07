/**
 * Edge Function: Update FCM Token
 * تحديث FCM token للمستخدم في جدول profiles
 * 
 * Usage:
 * POST /functions/v1/update-fcm-token
 * Body: { 
 *   "user_id": "uuid",
 *   "fcm_token": "string"
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateFCMTokenRequest {
  user_id: string;
  fcm_token: string;
}

Deno.serve(async (req) => {
  // Log immediately when function is invoked
  const timestamp = new Date().toISOString();
  console.log('🔵 [Edge Function] ========== update-fcm-token called ==========');
  console.log('🔵 [Edge Function] Timestamp:', timestamp);
  console.log('🔵 [Edge Function] Method:', req.method);
  console.log('🔵 [Edge Function] URL:', req.url);
  console.log('🔵 [Edge Function] Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    console.log('🔵 [Edge Function] CORS preflight request, returning OK');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔵 [Edge Function] Step 1: Getting environment variables...');
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ [Edge Function] Supabase configuration missing');
      console.error('   - SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
      console.error('   - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Missing');
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    console.log('✅ [Edge Function] Environment variables loaded');

    console.log('🔵 [Edge Function] Step 2: Creating Supabase client...');
    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('✅ [Edge Function] Supabase client created');

    console.log('🔵 [Edge Function] Step 3: Parsing request body...');
    // Parse request body
    const body: UpdateFCMTokenRequest = await req.json();
    console.log('📥 [Edge Function] Request body received:');
    console.log('   - user_id:', body.user_id);
    console.log('   - fcm_token (first 30 chars):', body.fcm_token ? body.fcm_token.substring(0, 30) + '...' : 'null');
    console.log('   - fcm_token length:', body.fcm_token ? body.fcm_token.length : 0);
    
    const { user_id, fcm_token } = body;

    if (!user_id || !fcm_token) {
      console.error('❌ [Edge Function] Missing required fields:');
      console.error('   - user_id:', user_id ? 'Provided' : 'Missing');
      console.error('   - fcm_token:', fcm_token ? 'Provided' : 'Missing');
      return new Response(
        JSON.stringify({ success: false, error: 'user_id and fcm_token are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('🔵 [Edge Function] Step 4: Validating user_id format...');
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user_id)) {
      console.error('❌ [Edge Function] Invalid user_id format:', user_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid user_id format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    console.log('✅ [Edge Function] user_id format is valid');

    console.log('🔵 [Edge Function] Step 5: Updating FCM token in profiles table...');
    console.log('   - Table: profiles');
    console.log('   - Where: id =', user_id);
    console.log('   - Update: fcm_token =', fcm_token.substring(0, 30) + '...');
    
    // Update FCM token in profiles table
    const { data, error } = await supabase
      .from('profiles')
      .update({ fcm_token: fcm_token })
      .eq('id', user_id)
      .select('id, fcm_token')
      .single();

    if (error) {
      console.error('❌ [Edge Function] Database error updating FCM token:');
      console.error('   - Error code:', error.code);
      console.error('   - Error message:', error.message);
      console.error('   - Error details:', error.details);
      console.error('   - Error hint:', error.hint);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message || 'Failed to update FCM token' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!data) {
      console.error('❌ [Edge Function] User profile not found in database');
      console.error('   - Searched for user_id:', user_id);
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ [Edge Function] ========== SUCCESS ==========');
    console.log('✅ [Edge Function] FCM token updated successfully in profiles table!');
    console.log('✅ [Edge Function] Updated record:');
    console.log('   - user_id:', data.id);
    console.log('   - fcm_token (first 30 chars):', data.fcm_token ? data.fcm_token.substring(0, 30) + '...' : 'null');
    console.log('✅ [Edge Function] ========== End ==========');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'FCM token updated successfully',
        data: {
          user_id: data.id,
          fcm_token: data.fcm_token,
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('❌ [Edge Function] ========== EXCEPTION ==========');
    console.error('❌ [Edge Function] Error in update-fcm-token function:');
    console.error('   - Error type:', error?.constructor?.name || 'Unknown');
    console.error('   - Error message:', error?.message || 'No message');
    console.error('   - Error stack:', error?.stack || 'No stack');
    console.error('❌ [Edge Function] ========== End ==========');
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

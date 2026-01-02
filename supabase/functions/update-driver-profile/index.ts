/**
 * Edge Function: Update Driver Profile
 * تحديث بيانات السائق (الاسم، رقم التليفون، الصور)
 * 
 * Usage:
 * POST /functions/v1/update-driver-profile
 * Body: { 
 *   "userId": "uuid",
 *   "full_name": "string",
 *   "phone": "+201234567890",
 *   "id_card_image_url": "https://...",
 *   "selfie_image_url": "https://..."
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateDriverProfileRequest {
  userId: string;
  full_name?: string;
  phone?: string;
  id_card_image_url?: string;
  selfie_image_url?: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  registration_complete?: boolean;
  status?: 'active' | 'inactive' | 'suspended';
  is_online?: boolean;
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
    const body: UpdateDriverProfileRequest = await req.json();
    const { userId, full_name, phone, id_card_image_url, selfie_image_url, approval_status, registration_complete, status, is_online } = body;

    // Validate input
    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking profile:', checkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'فشل التحقق من الملف الشخصي',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!existingProfile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'المستخدم غير موجود',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Build update object (only include provided fields)
    const updateData: any = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone !== undefined) updateData.phone = phone;
    if (id_card_image_url !== undefined) updateData.id_card_image_url = id_card_image_url;
    if (selfie_image_url !== undefined) updateData.selfie_image_url = selfie_image_url;
    if (approval_status !== undefined) updateData.approval_status = approval_status;
    if (registration_complete !== undefined) updateData.registration_complete = registration_complete;
    if (status !== undefined) updateData.status = status;
    if (is_online !== undefined) updateData.is_online = is_online;

    console.log('[update-driver-profile] Updating profile:', { userId, updateData });

    // Update profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id, full_name, phone, id_card_image_url, selfie_image_url, approval_status, registration_complete, status, is_online')
      .single();

    if (updateError) {
      console.error('[update-driver-profile] Error updating profile:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: updateError.message || 'فشل تحديث الملف الشخصي',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('[update-driver-profile] Profile updated successfully:', updatedProfile);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم تحديث البيانات بنجاح',
        profile: updatedProfile,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('[update-driver-profile] Error updating driver profile:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء تحديث البيانات',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


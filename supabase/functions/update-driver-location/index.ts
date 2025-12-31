/**
 * Edge Function: Update Driver Location
 * تحديث موقع السائق في قاعدة البيانات
 * 
 * Usage:
 * POST /functions/v1/update-driver-location
 * Body: { 
 *   "driverId": "uuid",
 *   "latitude": number,
 *   "longitude": number,
 *   "orderId": "uuid" | null
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateDriverLocationRequest {
  driverId: string;
  latitude: number;
  longitude: number;
  orderId?: string | null;
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
    const body: UpdateDriverLocationRequest = await req.json();
    const { driverId, latitude, longitude, orderId } = body;

    // Validate input
    if (!driverId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Driver ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (latitude === undefined || longitude === undefined) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Latitude and longitude are required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if driver exists
    const { data: driverProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', driverId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking driver profile:', checkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'فشل التحقق من بيانات السائق',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!driverProfile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'السائق غير موجود',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    if (driverProfile.role !== 'driver') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'المستخدم ليس سائق',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if location record exists (for the same order_id or null)
    const { data: existingLocation, error: findError } = await supabase
      .from('driver_locations')
      .select('id')
      .eq('driver_id', driverId)
      .eq('order_id', orderId || null)
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      console.error('Error finding existing location:', findError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'فشل البحث عن الموقع السابق',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    let locationData;
    if (existingLocation) {
      // Update existing location
      const { data: updatedLocation, error: updateError } = await supabase
        .from('driver_locations')
        .update({
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLocation.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating location:', updateError);
        return new Response(
          JSON.stringify({
            success: false,
            error: updateError.message || 'فشل تحديث الموقع',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      locationData = updatedLocation;
    } else {
      // Insert new location
      const { data: newLocation, error: insertError } = await supabase
        .from('driver_locations')
        .insert({
          driver_id: driverId,
          order_id: orderId || null,
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting location:', insertError);
        return new Response(
          JSON.stringify({
            success: false,
            error: insertError.message || 'فشل إضافة الموقع',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      locationData = newLocation;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'تم تحديث الموقع بنجاح',
        location: locationData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error updating driver location:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'حدث خطأ أثناء تحديث الموقع',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


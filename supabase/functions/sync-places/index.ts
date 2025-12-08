import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // التحقق من الطريقة
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          } 
        }
      );
    }

    const { cityName, placeType } = await req.json();

    if (!cityName || !placeType) {
      return new Response(
        JSON.stringify({ error: 'cityName and placeType are required' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          } 
        }
      );
    }

    // إنشاء Supabase client باستخدام service role (لتجاوز RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          } 
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // التحقق من أن المدينة تم تحديثها مؤخراً (في آخر دقيقة) لتجنب الاستدعاءات المتزامنة
    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);
    
    const { data: recentPlaces } = await supabase
      .from('places')
      .select('last_api_update')
      .eq('city', cityName)
      .eq('type', placeType)
      .not('last_api_update', 'is', null)
      .gte('last_api_update', oneMinuteAgo.toISOString())
      .limit(1);

    // إذا تم التحديث في آخر دقيقة، نعيد الأماكن الموجودة فقط
    if (recentPlaces && recentPlaces.length > 0) {
      console.log(`City ${cityName} (${placeType}) was recently synced, returning existing places`);
      
      const { data: existingPlaces } = await supabase
        .from('places')
        .select('*')
        .eq('city', cityName)
        .eq('type', placeType)
        .order('is_manual', { ascending: false }); // يدوية أولاً

      return new Response(
        JSON.stringify({
          success: true,
          placesCount: existingPlaces?.length || 0,
          places: existingPlaces || [],
          cached: true,
        }),
        {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
          status: 200,
        }
      );
    }

    // مصطلحات البحث حسب النوع
    const searchTerms: { [key: string]: string[] } = {
      mall: ['مول', 'mall', 'shopping center'],
      market: ['سوق', 'market', 'سوبر ماركت'],
      area: ['منطقة', 'حي', 'neighborhood'],
    };

    const terms = searchTerms[placeType] || [];
    const allPlaces: any[] = [];
    const seenIds = new Set<string>();

    // البحث عن كل مصطلح في Nominatim API
    for (const term of terms) {
      try {
        const query = `${term} ${cityName} مصر`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=15&accept-language=ar`;

        // تأخير لتجنب rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'FlashDelivery/1.0',
          },
        });

        if (!response.ok) {
          console.warn(`Nominatim API error for ${term}: ${response.status}`);
          continue;
        }

        const data = await response.json();

        if (data && Array.isArray(data)) {
          data.forEach((item: any) => {
            const placeId = item.place_id?.toString() || item.osm_id?.toString();
            if (placeId && !seenIds.has(placeId)) {
              // التحقق من صحة الإحداثيات
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              
              if (isNaN(lat) || isNaN(lon) || !isFinite(lat) || !isFinite(lon)) {
                console.warn(`Skipping place with invalid coordinates: ${item.name || 'unknown'}`);
                return;
              }

              seenIds.add(placeId);

              // معالجة اسم المكان
              let placeName = 'مكان غير معروف';
              if (item.display_name) {
                try {
                  const displayParts = item.display_name.split(',');
                  placeName = displayParts[0]?.trim() || item.name || 'مكان غير معروف';
                } catch (e) {
                  placeName = item.name || 'مكان غير معروف';
                }
              } else if (item.name) {
                placeName = item.name;
              }

              // التأكد من أن الاسم ليس فارغاً
              if (!placeName || placeName.trim() === '') {
                placeName = 'مكان غير معروف';
              }

              allPlaces.push({
                name: placeName,
                address: item.display_name || '',
                type: placeType,
                latitude: lat,
                longitude: lon,
                city: cityName,
                is_manual: false,
                last_api_update: new Date().toISOString(),
              });
            }
          });
        }
      } catch (error) {
        console.error(`Error searching for ${term}:`, error);
      }
    }

    // حفظ/تحديث الأماكن في قاعدة البيانات
    if (allPlaces.length > 0) {
      try {
        console.log(`Attempting to upsert ${allPlaces.length} places for ${cityName}, type: ${placeType}`);
        
        // التحقق من صحة البيانات قبل الإرسال
        const validPlaces = allPlaces.filter(place => {
          if (!place.name || place.name.trim() === '') {
            console.warn('Skipping place with empty name');
            return false;
          }
          if (!place.type) {
            console.warn('Skipping place with empty type');
            return false;
          }
          if (isNaN(place.latitude) || isNaN(place.longitude)) {
            console.warn(`Skipping place with invalid coordinates: ${place.name}`);
            return false;
          }
          return true;
        });

        if (validPlaces.length === 0) {
          console.warn('No valid places to upsert');
          return new Response(
            JSON.stringify({
              success: true,
              placesCount: 0,
              places: [],
              message: 'No valid places found',
            }),
            {
              headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
              status: 200,
            }
          );
        }

        // إزالة التكرارات بناءً على name و type (لتجنب خطأ ON CONFLICT)
        const uniquePlacesMap = new Map<string, any>();
        validPlaces.forEach(place => {
          const key = `${place.name.toLowerCase().trim()}_${place.type}`;
          if (!uniquePlacesMap.has(key)) {
            uniquePlacesMap.set(key, place);
          } else {
            // إذا كان المكان موجوداً، نأخذ الأحدث (أو الأفضل)
            const existing = uniquePlacesMap.get(key);
            // نفضل المكان الذي له address أطول (معلومات أكثر)
            if (place.address && place.address.length > (existing.address?.length || 0)) {
              uniquePlacesMap.set(key, place);
            }
          }
        });

        const uniquePlaces = Array.from(uniquePlacesMap.values());
        console.log(`Filtered ${validPlaces.length} places to ${uniquePlaces.length} unique places`);

        const { data: upsertedData, error: upsertError } = await supabase
          .from('places')
          .upsert(uniquePlaces, {
            onConflict: 'name,type',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error('Error upserting places:', JSON.stringify(upsertError, null, 2));
          return new Response(
            JSON.stringify({ 
              error: 'Failed to save places', 
              details: upsertError.message,
              code: upsertError.code,
              hint: upsertError.hint,
            }),
            { 
              status: 500, 
              headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders,
              } 
            }
          );
        }

        console.log(`Successfully synced ${uniquePlaces.length} places for ${cityName}, type: ${placeType}`);
        
        return new Response(
          JSON.stringify({
            success: true,
            placesCount: uniquePlaces.length,
            places: uniquePlaces,
          }),
          {
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
            status: 200,
          }
        );
      } catch (error: any) {
        console.error('Error saving places:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to save places', 
            details: error.message,
            stack: error.stack,
          }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders,
            } 
          }
        );
      }
    }

    // إذا لم توجد أماكن للبحث عنها
    return new Response(
      JSON.stringify({
        success: true,
        placesCount: 0,
        places: [],
        message: 'No places found',
      }),
      {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in sync-places function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
        status: 500,
      }
    );
  }
});



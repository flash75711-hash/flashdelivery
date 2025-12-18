import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ImgBB API Keys for Load Balancing - من .env (5 APIs)
const IMGBB_API_KEYS = [
  'fe750f112c2b32bd4b6fa88e77390aea',
  'cfbb69eef89f4ad826855a221bcde9ee',
  '011427321f6a286e9633459778e7c420',
  '12a9bfd94d80aa86be5d2d79d87b479c',
  'c7538a6df45e079ee4faddaf2434735a',
];

// Round-robin counter for load balancing
let currentKeyIndex = 0;

// Get next API key using round-robin
function getNextApiKey(): string {
  const key = IMGBB_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % IMGBB_API_KEYS.length;
  return key;
}

Deno.serve(async (req) => {
  // Handle CORS preflight - يجب أن يكون أول شيء
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  // إضافة CORS headers لجميع الردود
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

    // التحقق من JWT (اختياري - للسماح بالوصول بدون JWT أيضاً)
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');
    
    // إذا كان هناك JWT، نتحقق منه
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || apikeyHeader || '';
        
        if (supabaseUrl && supabaseAnonKey) {
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          });
          
          const token = authHeader.replace('Bearer ', '');
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          
          if (authError) {
            console.warn('JWT verification failed, but continuing anyway:', authError.message);
            // نستمر حتى لو فشل JWT verification
          } else if (user) {
            console.log('JWT verified for user:', user.id);
          }
        }
      } catch (jwtError) {
        console.warn('JWT verification error, but continuing anyway:', jwtError);
        // نستمر حتى لو فشل JWT verification
      }
    }

    // قراءة البيانات - محاولة JSON أولاً (Supabase Client يرسل JSON)، ثم FormData
    let imageFile: File | Blob | string | null = null;
    let formatParam = 'webp';
    
    const contentType = req.headers.get('content-type') || '';
    console.log('📥 Content-Type:', contentType, 'Method:', req.method);
    
    // إنشاء clone من Request قبل قراءة body (للاستخدام كـ fallback)
    const clonedReq = req.clone();
    
    // محاولة قراءة JSON أولاً (Supabase functions.invoke() يرسل JSON)
    // إذا كان Content-Type يشير بوضوح إلى FormData، نقرأه مباشرة
    if (contentType.includes('multipart/form-data')) {
      // FormData واضح
      try {
        const formData = await req.formData();
        imageFile = formData.get('image') as File | Blob | string | null;
        formatParam = (formData.get('format') as string | null) || 'webp';
        console.log('✅ Parsed as FormData, format:', formatParam);
      } catch (formError: any) {
        console.error('❌ FormData parsing error:', formError);
        return new Response(
          JSON.stringify({ error: 'Invalid FormData', details: formError.message }),
          { 
            status: 400, 
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders,
            } 
          }
        );
      }
    } else {
      // محاولة JSON (افتراضي - لأن Supabase Client يرسل JSON)
      try {
        const jsonData = await req.json();
        imageFile = jsonData.image as string | null;
        formatParam = jsonData.format || 'webp';
        console.log('✅ Parsed as JSON, format:', formatParam, 'hasImage:', !!imageFile, 'imageLength:', imageFile ? (typeof imageFile === 'string' ? imageFile.length : 'not-string') : 'null');
      } catch (jsonError: any) {
        console.error('❌ JSON parsing failed:', jsonError.message);
        // إذا فشل JSON، قد يكون FormData - نحاول FormData باستخدام clone
        try {
          const formData = await clonedReq.formData();
          imageFile = formData.get('image') as File | Blob | string | null;
          formatParam = (formData.get('format') as string | null) || 'webp';
          console.log('✅ Parsed as FormData (fallback), format:', formatParam);
        } catch (formError: any) {
          console.error('❌ FormData parsing also failed:', formError.message);
          return new Response(
            JSON.stringify({ 
              error: 'Unable to parse request body',
              details: 'Expected JSON: {image: base64, format: "webp"} or FormData with image field',
              hint: 'Supabase functions.invoke() sends JSON. Make sure to send: {image: "base64string", format: "webp"}',
              contentType: contentType,
              jsonError: jsonError.message,
              formError: formError.message
            }),
            { 
              status: 400, 
              headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders,
              } 
            }
          );
        }
      }
    }

    if (!imageFile) {
      return new Response(
        JSON.stringify({ error: 'No image file provided' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders,
          } 
        }
      );
    }

    // التحقق من التنسيق المدعوم
    const targetFormat = formatParam === 'avif' ? 'avif' : 'webp';

    let base64: string;
    let imageBuffer: Uint8Array;
    let mimeType = 'image/jpeg'; // افتراضي

    // Handle different input types
    if (typeof imageFile === 'string') {
      // If it's already a base64 string (from React Native)
      base64 = imageFile.includes(',') ? imageFile.split(',')[1] : imageFile;
      // تحويل base64 إلى Uint8Array
      const binaryString = atob(base64);
      imageBuffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        imageBuffer[i] = binaryString.charCodeAt(i);
      }
    } else if (imageFile instanceof File || imageFile instanceof Blob) {
      // Convert File/Blob to base64
      const arrayBuffer = await imageFile.arrayBuffer();
      imageBuffer = new Uint8Array(arrayBuffer);
      mimeType = imageFile instanceof File ? imageFile.type : 'image/jpeg';
      base64 = btoa(String.fromCharCode(...imageBuffer));
    } else {
      // Try to read as blob
      try {
        const blob = imageFile as Blob;
        const arrayBuffer = await blob.arrayBuffer();
        imageBuffer = new Uint8Array(arrayBuffer);
        base64 = btoa(String.fromCharCode(...imageBuffer));
      } catch (error) {
        return new Response(
          JSON.stringify({ error: 'Invalid image file format' }),
          { 
            status: 400, 
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders,
            } 
          }
        );
      }
    }

    // تحويل الصورة إلى WebP أو AVIF قبل الرفع إلى ImgBB
    // الصورة قد تكون تم تحويلها بالفعل في React Native إلى WebP
    // إذا لم تكن WebP/AVIF، نحاول تحويلها هنا (إذا كان Sharp متاحاً)
    let convertedBase64 = base64;
    let convertedMimeType = mimeType;
    
    // التحقق من نوع الصورة الحالي
    const isAlreadyWebP = mimeType === 'image/webp' || mimeType.includes('webp');
    const isAlreadyAVIF = mimeType === 'image/avif' || mimeType.includes('avif');
    
    // إذا كانت الصورة بالفعل في التنسيق المطلوب، لا نحتاج للتحويل
    if ((targetFormat === 'webp' && isAlreadyWebP) || (targetFormat === 'avif' && isAlreadyAVIF)) {
      console.log(`Image is already in ${targetFormat} format, skipping conversion`);
    } else {
      // محاولة تحويل الصورة إلى التنسيق المطلوب
      try {
        // استخدام Sharp لتحويل الصورة (إذا كان متاحاً في Deno Edge Functions)
        // ملاحظة: Sharp قد لا يعمل في Deno Edge Functions بسبب Node-API requirements
        // لذلك سنستخدم الصورة كما هي إذا فشل التحويل
        console.log(`Attempting to convert image to ${targetFormat} format...`);
        
        // محاولة استيراد Sharp
        const sharpModule = await import('https://deno.land/x/sharp@v0.32.0/mod.ts').catch(() => null);
        
        if (sharpModule && sharpModule.default) {
          const sharp = sharpModule.default;
          
          // تحويل imageBuffer إلى الصورة المطلوبة
          const convertedBuffer = targetFormat === 'avif'
            ? await sharp(imageBuffer).avif({ quality: 80 }).toBuffer()
            : await sharp(imageBuffer).webp({ quality: 80 }).toBuffer();
          
          // تحويل Buffer إلى base64
          convertedBase64 = btoa(String.fromCharCode(...new Uint8Array(convertedBuffer)));
          convertedMimeType = targetFormat === 'avif' ? 'image/avif' : 'image/webp';
          
          console.log(`✅ Image converted to ${targetFormat} successfully`);
        } else {
          // إذا لم يكن Sharp متاحاً، نستخدم الصورة كما هي
          // (الصورة قد تكون تم تحويلها بالفعل في React Native)
          console.warn('Sharp not available, using original image format (may already be converted)');
        }
      } catch (convertError) {
        console.warn('Image conversion failed, using original format:', convertError);
        // نستمر مع الصورة الأصلية (قد تكون تم تحويلها بالفعل في React Native)
      }
    }

    // Load balancing: استخدام round-robin لاختيار API key
    let lastError: Error | null = null;
    let attempts = 0;
    const maxAttempts = IMGBB_API_KEYS.length;

    // Try uploading with different keys if one fails (Load Balancing)
    while (attempts < maxAttempts) {
      try {
        const currentKey = getNextApiKey();
        console.log(`[Load Balancing] Attempt ${attempts + 1}/${maxAttempts} - Using API key ${currentKey.substring(0, 8)}...`);
        
        const currentFormData = new FormData();
        currentFormData.append('key', currentKey);
        currentFormData.append('image', convertedBase64);

        const imgbbResponse = await fetch('https://api.imgbb.com/1/upload', {
          method: 'POST',
          body: currentFormData,
        });

        if (!imgbbResponse.ok) {
          const errorText = await imgbbResponse.text();
          console.warn(`[Load Balancing] ImgBB API error (key ${attempts + 1}): ${imgbbResponse.status} - ${errorText}`);
          attempts++;
          lastError = new Error(`ImgBB API error: ${imgbbResponse.status}`);
          continue;
        }

        const imgbbData = await imgbbResponse.json();

        if (imgbbData.success && imgbbData.data) {
          console.log(`[Load Balancing] ✅ Upload successful with API key ${attempts + 1}, format: ${targetFormat}`);
          return new Response(
            JSON.stringify({
              success: true,
              url: imgbbData.data.url,
              display_url: imgbbData.data.display_url,
              delete_url: imgbbData.data.delete_url,
              format: targetFormat,
              size: imgbbData.data.size,
            }),
            {
              headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
              status: 200,
            }
          );
        } else {
          lastError = new Error(imgbbData.error?.message || 'Upload failed');
          attempts++;
        }
      } catch (error: any) {
        console.error(`[Load Balancing] Error uploading to ImgBB (attempt ${attempts + 1}):`, error);
        lastError = error;
        attempts++;
      }
    }

    // All attempts failed
    return new Response(
      JSON.stringify({ 
        error: 'Failed to upload image after multiple attempts',
        details: lastError?.message || 'Unknown error',
        attempts: maxAttempts,
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders,
        } 
      }
    );
  } catch (error: any) {
    console.error('Error in upload-image function:', error);
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

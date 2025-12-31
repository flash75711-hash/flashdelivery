/**
 * ImgBB API - رفع الصور مع Load Balancing عبر Edge Function
 * https://api.imgbb.com/
 * Web-only implementation using Web APIs
 */

import { supabase } from './supabase';
import { blobURLToBase64 } from './webUtils';

/**
 * تحويل أي مصدر صورة إلى base64
 */
async function imageToBase64(imageUri: string | File): Promise<string> {
  // إذا كان File object
  if (imageUri instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // إزالة data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageUri);
    });
  }

  // إذا كان data URL
  if (imageUri.startsWith('data:')) {
    const commaIndex = imageUri.indexOf(',');
    return imageUri.substring(commaIndex + 1);
  }

  // إذا كان blob URL
  if (imageUri.startsWith('blob:')) {
    return await blobURLToBase64(imageUri);
  }

  // إذا كان URL عادي، نحاول fetch
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return await blobURLToBase64(URL.createObjectURL(blob));
  } catch (error) {
    throw new Error('فشل تحويل الصورة إلى base64');
  }
}

/**
 * رفع صورة إلى ImgBB عبر Edge Function مع تحويل إلى WebP أو AVIF
 * @param imageUri - رابط الصورة المحلية أو File object
 * @param format - تنسيق الصورة المطلوب ('webp' أو 'avif') - افتراضي 'webp'
 * @returns رابط الصورة المرفوعة
 */
export async function uploadImageToImgBB(
  imageUri: string | File, 
  format: 'webp' | 'avif' = 'webp'
): Promise<string> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL is not defined');
    }

    // الحصول على session
    let session = null;
    try {
      const sessionResult = await supabase.auth.getSession();
      session = sessionResult.data?.session;
    } catch (sessionError) {
      console.warn('Error getting session, will use anon key:', sessionError);
    }

    // تحويل الصورة إلى base64
    console.log('🔄 [ImgBB] Converting image to base64...', {
      uriType: imageUri instanceof File ? 'File' : typeof imageUri,
      uriLength: imageUri instanceof File ? imageUri.size : (typeof imageUri === 'string' ? imageUri.length : 0),
    });
    const base64String = await imageToBase64(imageUri);
    console.log('✅ [ImgBB] Image converted to base64, length:', base64String.length);

    // محاولة استخدام Supabase Client أولاً (يتعامل مع CORS تلقائياً)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('upload-image', {
        body: {
          image: base64String,
          format: format,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      if (data && data.success && data.url) {
        console.log('✅ [ImgBB] Image uploaded successfully via Supabase Client:', {
          url: data.url.substring(0, 50) + '...',
          format: data.format || format,
        });
        return data.url;
      } else {
        throw new Error(data?.error || 'Upload failed');
      }
    } catch (invokeError: any) {
      // Fallback إلى fetch المباشر إذا فشل Supabase Client
      console.warn('Supabase functions.invoke failed, trying direct fetch:', invokeError);

      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseAnonKey) {
        throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not defined');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/upload-image`;
      const authToken = session?.access_token || supabaseAnonKey;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const uploadResponse = await fetch(functionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image: base64String,
          format: format,
        }),
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Edge Function upload error:', errorText);
        throw new Error(`Failed to upload image: ${uploadResponse.status}`);
      }

      const result = await uploadResponse.json();

      if (result.success && result.url) {
        console.log('✅ [ImgBB] Image uploaded successfully via direct fetch:', {
          url: result.url.substring(0, 50) + '...',
          format: result.format || format,
        });
        return result.url;
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    }
  } catch (error: any) {
    console.error('Error uploading to ImgBB:', error);
    throw new Error(error.message || 'فشل رفع الصورة');
  }
}

/**
 * رفع عدة صور إلى ImgBB
 * @param imageUris - مصفوفة روابط الصور المحلية أو File objects
 * @returns مصفوفة روابط الصور المرفوعة
 */
export async function uploadMultipleImagesToImgBB(
  imageUris: (string | File)[]
): Promise<string[]> {
  try {
    // رفع الصور بشكل متوازي
    const uploadPromises = imageUris.map(uri => uploadImageToImgBB(uri));
    const uploadedUrls = await Promise.all(uploadPromises);
    return uploadedUrls;
  } catch (error: any) {
    console.error('Error uploading multiple images:', error);
    throw error;
  }
}

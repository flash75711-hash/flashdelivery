/**
 * ImgBB API - رفع الصور مع Load Balancing عبر Edge Function
 * https://api.imgbb.com/
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

/**
 * رفع صورة إلى ImgBB عبر Edge Function مع تحويل إلى WebP أو AVIF
 * @param imageUri - رابط الصورة المحلية
 * @param format - تنسيق الصورة المطلوب ('webp' أو 'avif') - افتراضي 'webp'
 * @returns رابط الصورة المرفوعة
 */
export async function uploadImageToImgBB(imageUri: string, format: 'webp' | 'avif' = 'webp'): Promise<string> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL is not defined');
    }

    // رفع الصورة عبر Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/upload-image`;
    
    // الحصول على session مع retry
    let session = null;
    try {
      const sessionResult = await supabase.auth.getSession();
      session = sessionResult.data?.session;
    } catch (sessionError) {
      console.warn('Error getting session, will use anon key:', sessionError);
    }
    
    // إذا لم يكن هناك session، نحاول الحصول على user مباشرة
    if (!session) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // محاولة الحصول على session من user
          const sessionResult = await supabase.auth.getSession();
          session = sessionResult.data?.session;
        }
      } catch (userError) {
        console.warn('Error getting user, will use anon key:', userError);
      }
    }

    const formData = new FormData();
    
    // تحديد نوع الملف
    const fileExtension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
    const fileName = `image_${Date.now()}.${fileExtension}`;
    const mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
    
    // إضافة parameter format للتحويل إلى WebP أو AVIF
    formData.append('format', format);
    
    // معالجة مختلفة للويب والموبايل
    if (Platform.OS === 'web' && imageUri.startsWith('blob:')) {
      // على الويب: تحويل blob URL إلى base64 وإرسالها كـ JSON (لتجنب مشاكل CORS)
      try {
        // تحويل blob إلى base64
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const base64String = btoa(String.fromCharCode(...uint8Array));
        
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
            return result.url;
          } else {
            throw new Error(result.error || 'Upload failed');
          }
        }
      } catch (blobError: any) {
        console.error('Error converting blob to base64:', blobError);
        throw new Error('فشل تحويل الصورة للرفع');
      }
    } else {
      // على الموبايل: تحويل الصورة إلى base64 وإرسالها كـ JSON
      // هذا يحل مشكلة FormData مع uri في React Native
      try {
        // استخدام expo-file-system لقراءة الصورة وتحويلها إلى base64
        const base64String = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
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
      return result.url;
    } else {
      throw new Error(result.error || 'Upload failed');
          }
        }
      } catch (convertError: any) {
        console.error('Error converting image to base64:', convertError);
        // Fallback: محاولة استخدام FormData مع uri (قد لا يعمل)
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseAnonKey) {
          throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not defined');
        }

        const authToken = session?.access_token || supabaseAnonKey;
        const headers: Record<string, string> = {
          'apikey': supabaseAnonKey,
        };
        
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        formData.append('image', {
          uri: imageUri,
          type: mimeType,
          name: fileName,
        } as any);

        const uploadResponse = await fetch(functionUrl, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('Edge Function upload error (fallback):', errorText);
          throw new Error(`Failed to upload image: ${uploadResponse.status}`);
        }

        const result = await uploadResponse.json();

        if (result.success && result.url) {
          return result.url;
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      }
    }
  } catch (error: any) {
    console.error('Error uploading to ImgBB:', error);
    throw new Error(error.message || 'فشل رفع الصورة');
  }
}

/**
 * رفع عدة صور إلى ImgBB
 * @param imageUris - مصفوفة روابط الصور المحلية
 * @returns مصفوفة روابط الصور المرفوعة
 */
export async function uploadMultipleImagesToImgBB(imageUris: string[]): Promise<string[]> {
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


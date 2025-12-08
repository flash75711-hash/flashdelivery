/**
 * ImgBB API - رفع الصور مع Load Balancing عبر Edge Function
 * https://api.imgbb.com/
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * رفع صورة إلى ImgBB عبر Edge Function
 * @param imageUri - رابط الصورة المحلية
 * @returns رابط الصورة المرفوعة
 */
export async function uploadImageToImgBB(imageUri: string): Promise<string> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL is not defined');
    }

    // رفع الصورة عبر Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/upload-image`;
    const { data: { session } } = await supabase.auth.getSession();

    const formData = new FormData();
    
    // تحديد نوع الملف
    const fileExtension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
    const fileName = `image_${Date.now()}.${fileExtension}`;
    const mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
    
    // معالجة مختلفة للويب والموبايل
    if (Platform.OS === 'web' && imageUri.startsWith('blob:')) {
      // على الويب: تحويل blob URL إلى File object
      try {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: mimeType });
        formData.append('image', file);
      } catch (blobError: any) {
        console.error('Error converting blob to file:', blobError);
        throw new Error('فشل تحويل الصورة للرفع');
      }
    } else {
      // على الموبايل: استخدام FormData مع uri مباشرة
      // React Native يضغط الصور تلقائياً عند استخدام FormData
      formData.append('image', {
        uri: imageUri,
        type: mimeType,
        name: fileName,
      } as any);
    }

    const uploadResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || ''}`,
        // لا نضيف Content-Type - React Native/Web يضيفه تلقائياً مع boundary
      },
      body: formData,
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


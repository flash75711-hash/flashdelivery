/**
 * Catbox.moe API - رفع الصور
 * https://catbox.moe/docs/api
 */

const CATBOX_USERHASH = process.env.EXPO_PUBLIC_CATBOX_USERHASH || '15ba6cb45a67a6b5a87de54c6';
const CATBOX_UPLOAD_URL = 'https://catbox.moe/user/api.php';

/**
 * رفع صورة إلى Catbox
 * @param imageUri - رابط الصورة المحلية
 * @param fileName - اسم الملف (اختياري)
 * @returns رابط الصورة المرفوعة
 */
export async function uploadImageToCatbox(
  imageUri: string,
  fileName?: string
): Promise<string> {
  try {
    // تحويل الصورة إلى blob/base64
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    // إنشاء FormData
    const formData = new FormData();
    
    // إضافة userhash و reqtype
    formData.append('userhash', CATBOX_USERHASH);
    formData.append('reqtype', 'fileupload');
    
    // إضافة الملف
    const fileExtension = imageUri.split('.').pop() || 'jpg';
    const finalFileName = fileName || `image_${Date.now()}.${fileExtension}`;
    
    // في React Native، يجب استخدام blob مباشرة
    formData.append('fileToUpload', {
      uri: imageUri,
      type: `image/${fileExtension}`,
      name: finalFileName,
    } as any);

    // رفع الصورة
    const uploadResponse = await fetch(CATBOX_UPLOAD_URL, {
      method: 'POST',
      body: formData,
      // لا نضيف Content-Type header - React Native يضيفه تلقائياً مع boundary
    });

    if (!uploadResponse.ok) {
      throw new Error(`فشل رفع الصورة: ${uploadResponse.statusText}`);
    }

    const result = await uploadResponse.text();
    
    // Catbox يرجع رابط الصورة مباشرة إذا نجح
    if (result.startsWith('http')) {
      return result.trim();
    }

    // إذا كان هناك خطأ
    if (result.includes('error') || result.includes('Error')) {
      throw new Error(result);
    }

    throw new Error(`فشل رفع الصورة: ${result}`);
  } catch (error: any) {
    console.error('Error uploading to Catbox:', error);
    throw new Error(error.message || 'فشل رفع الصورة');
  }
}


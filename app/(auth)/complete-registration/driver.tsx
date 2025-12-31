import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { uploadImageToImgBB } from '@/lib/imgbb';
import { Ionicons } from '@expo/vector-icons';
import { pickImage } from '@/lib/webUtils';
import { notifyAllAdmins } from '@/lib/notifications';
import { showSimpleAlert } from '@/lib/alert';
import { useAuth } from '@/contexts/AuthContext';

export default function CompleteDriverRegistration() {
  const { phone: phoneParam, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(phoneParam || '');
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [hasExistingData, setHasExistingData] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    idCard: { uploading: boolean; uploaded: boolean; error?: string };
    selfie: { uploading: boolean; uploaded: boolean; error?: string };
  }>({
    idCard: { uploading: false, uploaded: false },
    selfie: { uploading: false, uploaded: false },
  });

  // تحميل البيانات الموجودة عند فتح الصفحة
  useEffect(() => {
    const loadExistingProfile = async () => {
      try {
        if (!user) {
          setLoadingProfile(false);
          return;
        }

        // جلب بيانات السائق من قاعدة البيانات
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name, phone, id_card_image_url, selfie_image_url')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
        } else if (profile) {
          // تحديد إذا كانت هناك بيانات موجودة
          const hasData = !!(profile.full_name || profile.phone || profile.id_card_image_url || profile.selfie_image_url);
          setHasExistingData(hasData);
          
          // تحميل البيانات الموجودة
          if (profile.full_name) {
            setFullName(profile.full_name);
          }
          if (profile.phone) {
            setPhone(profile.phone);
          }
          if (profile.id_card_image_url) {
            setIdCardImage(profile.id_card_image_url);
            // تحديث حالة الرفع للصورة المرفوعة مسبقاً
            setUploadProgress(prev => ({
              ...prev,
              idCard: { uploading: false, uploaded: true },
            }));
          }
          if (profile.selfie_image_url) {
            setSelfieImage(profile.selfie_image_url);
            // تحديث حالة الرفع للصورة المرفوعة مسبقاً
            setUploadProgress(prev => ({
              ...prev,
              selfie: { uploading: false, uploaded: true },
            }));
          }
        }

        // إذا لم يكن هناك phone في profile، جرب من phoneParam أو user
        if (!profile?.phone && !phoneParam && user?.phone) {
          setPhone(user.phone);
        }
      } catch (error) {
        console.error('Error loading existing profile:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadExistingProfile();
  }, [phoneParam, user]);

  const handlePickImage = async (type: 'idCard' | 'selfie') => {
    try {
      const images = await pickImage({
        multiple: false,
        accept: 'image/*',
        maxSize: 10 * 1024 * 1024, // 10MB
      });

      if (images.length === 0) {
        return;
      }

      const image = images[0];
      
      // على الويب، نستخدم blob URL مباشرة
      // يمكن إضافة resize/compress لاحقاً إذا لزم الأمر
      if (type === 'idCard') {
        setIdCardImage(image.uri);
      } else {
        setSelfieImage(image.uri);
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      showSimpleAlert('خطأ', error.message || 'فشل اختيار الصورة', 'error');
    }
  };

  const uploadImage = async (uri: string, type: 'idCard' | 'selfie'): Promise<string> => {
    if (!user) throw new Error('المستخدم غير موجود');

    console.log(`📤 [Image Upload] Starting upload for ${type}...`, {
      userId: user.id,
      uriLength: uri.length,
      isBlob: uri.startsWith('blob:'),
      isDataUrl: uri.startsWith('data:'),
    });

    // تحديث حالة الرفع
    setUploadProgress(prev => ({
      ...prev,
      [type]: { uploading: true, uploaded: false },
    }));

    try {
      // رفع الصورة إلى ImgBB مع تحويل إلى WebP (أو AVIF إذا كان متاحاً)
      // الصورة تم تحويلها بالفعل إلى WebP في pickImage
      const imageUrl = await uploadImageToImgBB(uri, 'webp');
      
      console.log(`✅ [Image Upload] ${type} uploaded successfully:`, {
        url: imageUrl.substring(0, 50) + '...',
        fullUrl: imageUrl,
      });
      
      // تحديث حالة النجاح
      setUploadProgress(prev => ({
        ...prev,
        [type]: { uploading: false, uploaded: true },
      }));
    
      return imageUrl;
    } catch (error: any) {
      console.error(`❌ [Image Upload] ${type} upload failed:`, error);
      // تحديث حالة الخطأ
      setUploadProgress(prev => ({
        ...prev,
        [type]: { uploading: false, uploaded: false, error: error.message },
      }));
      throw error;
    }
  };

  const handleComplete = async () => {
    if (!fullName || !phone) {
      await showSimpleAlert('خطأ', 'الرجاء إدخال الاسم الكامل ورقم التليفون', 'warning');
      return;
    }

    // التحقق من الصور - إذا كانت موجودة مسبقاً (URLs)، لا نحتاج لرفعها مرة أخرى
    const hasIdCard = idCardImage && (idCardImage.startsWith('http') || idCardImage.startsWith('https'));
    const hasSelfie = selfieImage && (selfieImage.startsWith('http') || selfieImage.startsWith('https'));

    if (!idCardImage || !selfieImage) {
      await showSimpleAlert('خطأ', 'الرجاء رفع صورة البطاقة وصورة السيلفي', 'warning');
      return;
    }

    setLoading(true);
    setUploading(true);
    try {
      if (!user) {
        throw new Error('المستخدم غير موجود');
      }

      // رفع الصور فقط إذا كانت جديدة (ليست URLs موجودة مسبقاً)
      let idCardUrl = idCardImage;
      let selfieUrl = selfieImage;

      // إذا كانت الصور URLs موجودة مسبقاً، لا نحتاج لرفعها
      const needsIdCardUpload = !idCardImage.startsWith('http') && !idCardImage.startsWith('https');
      const needsSelfieUpload = !selfieImage.startsWith('http') && !selfieImage.startsWith('https');

      if (needsIdCardUpload || needsSelfieUpload) {
        setUploading(true);
        console.log('📤 [Driver Registration] Starting image uploads...', {
          needsIdCardUpload,
          needsSelfieUpload,
        });
        
        const uploadPromises = [];
        if (needsIdCardUpload) {
          uploadPromises.push(
            uploadImage(idCardImage, 'idCard').then(url => {
              idCardUrl = url;
              console.log('✅ [Driver Registration] ID Card uploaded successfully:', url.substring(0, 50) + '...');
            })
          );
        }
        if (needsSelfieUpload) {
          uploadPromises.push(
            uploadImage(selfieImage, 'selfie').then(url => {
              selfieUrl = url;
              console.log('✅ [Driver Registration] Selfie uploaded successfully:', url.substring(0, 50) + '...');
            })
          );
        }

        await Promise.all(uploadPromises);
        setUploading(false);
        console.log('✅ [Driver Registration] All images uploaded successfully');

        // رسالة نجاح بعد رفع الصور (فقط إذا تم رفع صور جديدة)
        if (uploadPromises.length > 0) {
          await showSimpleAlert('✅ نجح الرفع', 'تم رفع الصور بنجاح! جاري حفظ البيانات...', 'success');
        }
      } else {
        console.log('ℹ️ [Driver Registration] Images already uploaded, using existing URLs');
      }

      // تحديث ملف المستخدم مع وضع حالة المراجعة
      console.log('💾 [Driver Registration] Starting database update...', {
        userId: user.id,
        fullName,
        phone,
        idCardUrl: idCardUrl.substring(0, 50) + '...',
        selfieUrl: selfieUrl.substring(0, 50) + '...',
      });

      // استخدام Edge Function لتحديث البيانات (لتجاوز RLS)
      console.log('🌐 [Driver Registration] Calling Edge Function update-driver-profile...', {
        userId: user.id,
        fullName,
        phone,
        hasIdCardUrl: !!idCardUrl,
        hasSelfieUrl: !!selfieUrl,
      });

      try {
        const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-driver-profile', {
          body: {
            userId: user.id,
            full_name: fullName,
            phone: phone,
            id_card_image_url: idCardUrl,
            selfie_image_url: selfieUrl,
            approval_status: 'pending',
            registration_complete: false,
          },
        });

        console.log('📥 [Driver Registration] Edge Function response received:', {
          hasData: !!edgeFunctionData,
          success: edgeFunctionData?.success,
          hasError: !!edgeFunctionError,
          errorMessage: edgeFunctionError?.message || edgeFunctionData?.error,
        });

        if (edgeFunctionError) {
          console.error('❌ [Driver Registration] Edge Function error:', edgeFunctionError);
          throw edgeFunctionError;
        }

        if (!edgeFunctionData || !edgeFunctionData.success) {
          console.error('❌ [Driver Registration] Edge Function returned error:', edgeFunctionData?.error);
          throw new Error(edgeFunctionData?.error || 'فشل تحديث البيانات');
        }

        console.log('✅ [Driver Registration] Database update successful via Edge Function:', {
          profile: edgeFunctionData.profile ? {
            id: edgeFunctionData.profile.id,
            full_name: edgeFunctionData.profile.full_name,
            phone: edgeFunctionData.profile.phone,
            hasIdCard: !!edgeFunctionData.profile.id_card_image_url,
            hasSelfie: !!edgeFunctionData.profile.selfie_image_url,
            approval_status: edgeFunctionData.profile.approval_status,
          } : null,
        });
      } catch (edgeError: any) {
        console.error('❌ [Driver Registration] Edge Function failed, trying direct update...', {
          error: edgeError.message || edgeError,
          errorType: edgeError.constructor?.name,
        });
        
        // Fallback: محاولة التحديث المباشر (قد يفشل بسبب RLS)
        const { data: updateData, error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: fullName,
            phone: phone,
            id_card_image_url: idCardUrl,
            selfie_image_url: selfieUrl,
            approval_status: 'pending',
            registration_complete: false,
          })
          .eq('id', user.id)
          .select();

        if (profileError) {
          console.error('❌ [Driver Registration] Direct update also failed:', profileError);
          throw new Error(profileError.message || 'فشل تحديث البيانات. يرجى المحاولة مرة أخرى');
        }

        // التحقق من أن التحديث نجح فعلياً
        if (!updateData || updateData.length === 0) {
          console.error('❌ [Driver Registration] Direct update returned 0 rows - RLS may be blocking');
          throw new Error('فشل تحديث البيانات بسبب قيود الأمان. يرجى المحاولة مرة أخرى أو الاتصال بالدعم');
        }

        console.log('✅ [Driver Registration] Database update successful via direct update:', {
          updatedRows: updateData.length,
          data: updateData[0] ? {
            id: updateData[0].id,
            full_name: updateData[0].full_name,
            phone: updateData[0].phone,
            hasIdCard: !!updateData[0].id_card_image_url,
            hasSelfie: !!updateData[0].selfie_image_url,
            approval_status: updateData[0].approval_status,
          } : null,
        });
      }

      // التحقق من أن البيانات تم حفظها بشكل صحيح
      console.log('🔍 [Driver Registration] Verifying saved data...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, id_card_image_url, selfie_image_url, approval_status')
        .eq('id', user.id)
        .single();

      if (verifyError) {
        console.error('❌ [Driver Registration] Verification failed:', verifyError);
      } else {
        console.log('✅ [Driver Registration] Data verification successful:', {
          id: verifyData.id,
          full_name: verifyData.full_name,
          phone: verifyData.phone,
          idCardUrl: verifyData.id_card_image_url ? verifyData.id_card_image_url.substring(0, 50) + '...' : 'null',
          selfieUrl: verifyData.selfie_image_url ? verifyData.selfie_image_url.substring(0, 50) + '...' : 'null',
          approval_status: verifyData.approval_status,
        });
      }

      // إرسال إشعار لجميع المديرين عن تسجيل سائق جديد
      console.log('📧 [Driver Registration] Sending notification to admins...');
      await notifyAllAdmins(
        'سائق جديد ينتظر المراجعة',
        `سائق جديد (${fullName || phone}) أكمل التسجيل وهو في انتظار المراجعة.`,
        'info'
      );

      // رسالة انتظار المراجعة
      await showSimpleAlert(
        '⏳ في انتظار المراجعة',
        'تم إرسال طلبك للمراجعة!\n\nسيقوم المدير بمراجعة بياناتك والمستندات المرفوعة.\nستتلقى إشعاراً عند الموافقة على طلبك.',
        'info'
      );
      console.log('✅ [Driver Registration] Registration completed successfully, navigating to dashboard');
      router.replace('/(tabs)/driver/dashboard');
    } catch (error: any) {
      setUploading(false);
      await showSimpleAlert('خطأ', error.message || 'فشل إكمال التسجيل', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loadingProfile) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Header مع زر الرجوع */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {hasExistingData ? 'تحديث البيانات' : 'إكمال التسجيل'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {hasExistingData ? 'تحديث بيانات السائق' : 'إكمال التسجيل - سائق'}
        </Text>
        <Text style={styles.subtitle}>
          {hasExistingData ? 'قم بتحديث بياناتك الشخصية' : 'أكمل بياناتك الشخصية'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="الاسم الكامل"
          value={fullName}
          onChangeText={setFullName}
          placeholderTextColor="#999"
          textAlign="right"
        />

        <TextInput
          style={styles.input}
          placeholder="رقم التليفون"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholderTextColor="#999"
          textAlign="right"
        />

        <View style={styles.imagesSection}>
          <Text style={styles.sectionTitle}>المستندات المطلوبة</Text>

          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>صورة البطاقة الشخصية *</Text>
            {idCardImage ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: idCardImage }} style={styles.image} />
                <TouchableOpacity
                  onPress={() => {
                    setIdCardImage(null);
                    setUploadProgress(prev => ({
                      ...prev,
                      idCard: { uploading: false, uploaded: false },
                    }));
                  }}
                  style={styles.removeImageButton}
                >
                  <Ionicons name="close-circle" size={24} color="#ff3b30" />
                </TouchableOpacity>
                {/* مؤشر حالة الرفع */}
                {uploadProgress.idCard.uploading && (
                  <View style={styles.uploadStatusOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.uploadStatusText}>جاري الرفع...</Text>
                  </View>
                )}
                {uploadProgress.idCard.uploaded && (
                  <View style={[styles.uploadStatusOverlay, styles.uploadSuccess]}>
                    <Ionicons name="checkmark-circle" size={32} color="#34C759" />
                    <Text style={styles.uploadStatusText}>تم الرفع بنجاح ✓</Text>
                  </View>
                )}
                {uploadProgress.idCard.error && (
                  <View style={[styles.uploadStatusOverlay, styles.uploadError]}>
                    <Ionicons name="alert-circle" size={32} color="#FF3B30" />
                    <Text style={styles.uploadStatusText}>فشل الرفع</Text>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => handlePickImage('idCard')}
                style={styles.imagePicker}
              >
                <Ionicons name="camera" size={40} color="#007AFF" />
                <Text style={styles.imagePickerText}>اضغط لرفع صورة البطاقة</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>صورة سيلفي *</Text>
            {selfieImage ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: selfieImage }} style={styles.image} />
                <TouchableOpacity
                  onPress={() => {
                    setSelfieImage(null);
                    setUploadProgress(prev => ({
                      ...prev,
                      selfie: { uploading: false, uploaded: false },
                    }));
                  }}
                  style={styles.removeImageButton}
                >
                  <Ionicons name="close-circle" size={24} color="#ff3b30" />
                </TouchableOpacity>
                {/* مؤشر حالة الرفع */}
                {uploadProgress.selfie.uploading && (
                  <View style={styles.uploadStatusOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.uploadStatusText}>جاري الرفع...</Text>
                  </View>
                )}
                {uploadProgress.selfie.uploaded && (
                  <View style={[styles.uploadStatusOverlay, styles.uploadSuccess]}>
                    <Ionicons name="checkmark-circle" size={32} color="#34C759" />
                    <Text style={styles.uploadStatusText}>تم الرفع بنجاح ✓</Text>
                  </View>
                )}
                {uploadProgress.selfie.error && (
                  <View style={[styles.uploadStatusOverlay, styles.uploadError]}>
                    <Ionicons name="alert-circle" size={32} color="#FF3B30" />
                    <Text style={styles.uploadStatusText}>فشل الرفع</Text>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => handlePickImage('selfie')}
                style={styles.imagePicker}
              >
                <Ionicons name="person" size={40} color="#007AFF" />
                <Text style={styles.imagePickerText}>اضغط لرفع صورة سيلفي</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.uploadingText}>جاري رفع الصور...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, (loading || uploading) && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={loading || uploading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {hasExistingData ? 'حفظ التغييرات' : 'إكمال التسجيل'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    padding: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  imagesSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  imageContainer: {
    marginBottom: 24,
  },
  imageLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  imagePicker: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    marginTop: 8,
    color: '#007AFF',
    fontSize: 14,
  },
  imagePreview: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    zIndex: 10,
  },
  uploadStatusOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadSuccess: {
    backgroundColor: 'rgba(52, 199, 89, 0.9)',
  },
  uploadError: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
  },
  uploadStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  uploadingText: {
    color: '#007AFF',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});


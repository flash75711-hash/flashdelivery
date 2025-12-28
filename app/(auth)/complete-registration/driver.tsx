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

export default function CompleteDriverRegistration() {
  const { phone: phoneParam, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const router = useRouter();
  
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
        const { data: { user } } = await supabase.auth.getUser();
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

        // إذا لم يكن هناك phone في profile، جرب من phoneParam أو auth.user
        if (!profile?.phone && !phoneParam) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser?.phone) {
            setPhone(authUser.phone);
          }
        }
      } catch (error) {
        console.error('Error loading existing profile:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadExistingProfile();
  }, [phoneParam]);

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('المستخدم غير موجود');

    // تحديث حالة الرفع
    setUploadProgress(prev => ({
      ...prev,
      [type]: { uploading: true, uploaded: false },
    }));

    try {
      // رفع الصورة إلى ImgBB مع تحويل إلى WebP (أو AVIF إذا كان متاحاً)
      // الصورة تم تحويلها بالفعل إلى WebP في pickImage
      const imageUrl = await uploadImageToImgBB(uri, 'webp');
      
      // تحديث حالة النجاح
      setUploadProgress(prev => ({
        ...prev,
        [type]: { uploading: false, uploaded: true },
      }));
    
    return imageUrl;
    } catch (error: any) {
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
      Alert.alert('خطأ', 'الرجاء إدخال الاسم الكامل ورقم التليفون');
      return;
    }

    // التحقق من الصور - إذا كانت موجودة مسبقاً (URLs)، لا نحتاج لرفعها مرة أخرى
    const hasIdCard = idCardImage && (idCardImage.startsWith('http') || idCardImage.startsWith('https'));
    const hasSelfie = selfieImage && (selfieImage.startsWith('http') || selfieImage.startsWith('https'));

    if (!idCardImage || !selfieImage) {
      Alert.alert('خطأ', 'الرجاء رفع صورة البطاقة وصورة السيلفي');
      return;
    }

    setLoading(true);
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
        
        const uploadPromises = [];
        if (needsIdCardUpload) {
          uploadPromises.push(uploadImage(idCardImage, 'idCard').then(url => { idCardUrl = url; }));
        }
        if (needsSelfieUpload) {
          uploadPromises.push(uploadImage(selfieImage, 'selfie').then(url => { selfieUrl = url; }));
        }

        await Promise.all(uploadPromises);
      setUploading(false);

        // رسالة نجاح بعد رفع الصور (فقط إذا تم رفع صور جديدة)
        if (uploadPromises.length > 0) {
          Alert.alert('✅ نجح الرفع', 'تم رفع الصور بنجاح! جاري حفظ البيانات...');
        }
      }

      // تحديث ملف المستخدم مع وضع حالة المراجعة
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          id_card_image_url: idCardUrl,
          selfie_image_url: selfieUrl,
          approval_status: 'pending', // في انتظار المراجعة
          registration_complete: false, // لن يتم تفعيله حتى الموافقة
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // إرسال إشعار لجميع المديرين عن تسجيل سائق جديد
      await notifyAllAdmins(
        'سائق جديد ينتظر المراجعة',
        `سائق جديد (${fullName || phone}) أكمل التسجيل وهو في انتظار المراجعة.`,
        'info'
      );

      // رسالة انتظار المراجعة
      Alert.alert(
        '⏳ في انتظار المراجعة',
        'تم إرسال طلبك للمراجعة!\n\nسيقوم المدير بمراجعة بياناتك والمستندات المرفوعة.\nستتلقى إشعاراً عند الموافقة على طلبك.',
        [
          { 
            text: 'حسناً', 
            onPress: () => router.replace('/(tabs)/driver/dashboard') 
          },
        ]
      );
    } catch (error: any) {
      setUploading(false);
      Alert.alert('خطأ', error.message || 'فشل إكمال التسجيل');
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


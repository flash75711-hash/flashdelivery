import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

export default function CompleteDriverRegistration() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickImage = async (type: 'idCard' | 'selfie') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('خطأ', 'نحتاج إلى إذن الوصول إلى الصور');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'idCard' ? [16, 9] : [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      if (type === 'idCard') {
        setIdCardImage(result.assets[0].uri);
      } else {
        setSelfieImage(result.assets[0].uri);
      }
    }
  };

  const uploadImage = async (uri: string, path: string): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('المستخدم غير موجود');

    const response = await fetch(uri);
    const blob = await response.blob();
    const fileExt = uri.split('.').pop();
    const fileName = `${user.id}/${path}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('driver-documents')
      .upload(fileName, blob, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('driver-documents')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const handleComplete = async () => {
    if (!fullName || !phone) {
      Alert.alert('خطأ', 'الرجاء إدخال الاسم الكامل ورقم التليفون');
      return;
    }

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

      // رفع الصور
      const [idCardUrl, selfieUrl] = await Promise.all([
        uploadImage(idCardImage, 'id-card'),
        uploadImage(selfieImage, 'selfie'),
      ]);

      setUploading(false);

      // تحديث ملف المستخدم
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          id_card_image_url: idCardUrl,
          selfie_image_url: selfieUrl,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      Alert.alert('نجح', 'تم إكمال التسجيل بنجاح', [
        { text: 'حسناً', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error: any) {
      setUploading(false);
      Alert.alert('خطأ', error.message || 'فشل إكمال التسجيل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>إكمال التسجيل - سائق</Text>
        <Text style={styles.subtitle}>أكمل بياناتك الشخصية</Text>

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
                  onPress={() => setIdCardImage(null)}
                  style={styles.removeImageButton}
                >
                  <Ionicons name="close-circle" size={24} color="#ff3b30" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => pickImage('idCard')}
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
                  onPress={() => setSelfieImage(null)}
                  style={styles.removeImageButton}
                >
                  <Ionicons name="close-circle" size={24} color="#ff3b30" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => pickImage('selfie')}
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
            <Text style={styles.buttonText}>إكمال التسجيل</Text>
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
  content: {
    padding: 20,
    paddingTop: 60,
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
});


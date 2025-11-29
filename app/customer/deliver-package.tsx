import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

export default function DeliverPackageScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!pickupAddress || !deliveryAddress) {
      Alert.alert('خطأ', 'الرجاء إدخال عنوان الاستلام والتسليم');
      return;
    }

    setLoading(true);
    try {
      // حساب الأجرة التقديرية (يمكن تحسينها لاحقاً)
      const estimatedFee = 50; // قيمة افتراضية

      const { data, error } = await supabase
        .from('orders')
        .insert({
          customer_id: user?.id,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          package_description: packageDescription,
          status: 'pending',
          total_fee: estimatedFee,
          order_type: 'package',
        })
        .select()
        .single();

      if (error) throw error;
      Alert.alert('نجح', 'تم إرسال الطلب بنجاح', [
        { text: 'حسناً', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('customer.deliverPackage')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.label}>{t('customer.pickupLocation')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="أدخل عنوان الاستلام"
            value={pickupAddress}
            onChangeText={setPickupAddress}
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('customer.deliveryLocation')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="أدخل عنوان التسليم"
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>وصف الطرد (اختياري)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="وصف الطرد..."
            value={packageDescription}
            onChangeText={setPackageDescription}
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
            textAlign="right"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('common.submit')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 16,
    color: '#1a1a1a',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});


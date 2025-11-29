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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface Address {
  id?: string;
  place_name: string;
  building_number: string;
  apartment_number: string;
  floor_number: string;
  is_default: boolean;
}

export default function CompleteCustomerRegistration() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([
    { place_name: '', building_number: '', apartment_number: '', floor_number: '', is_default: true }
  ]);
  const [loading, setLoading] = useState(false);

  const addAddress = () => {
    setAddresses([...addresses, {
      place_name: '',
      building_number: '',
      apartment_number: '',
      floor_number: '',
      is_default: false
    }]);
  };

  const removeAddress = (index: number) => {
    if (addresses.length > 1) {
      const newAddresses = addresses.filter((_, i) => i !== index);
      // إذا كان العنوان المحذوف هو الافتراضي، اجعل الأول افتراضياً
      if (addresses[index].is_default && newAddresses.length > 0) {
        newAddresses[0].is_default = true;
      }
      setAddresses(newAddresses);
    }
  };

  const setDefaultAddress = (index: number) => {
    const newAddresses = addresses.map((addr, i) => ({
      ...addr,
      is_default: i === index
    }));
    setAddresses(newAddresses);
  };

  const updateAddress = (index: number, field: keyof Address, value: string | boolean) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setAddresses(newAddresses);
  };

  const handleComplete = async () => {
    if (!fullName || !phone) {
      Alert.alert('خطأ', 'الرجاء إدخال الاسم الكامل ورقم التليفون');
      return;
    }

    if (addresses.some(addr => !addr.place_name)) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المكان العام لجميع العناوين');
      return;
    }

    setLoading(true);
    try {
      // الحصول على المستخدم الحالي
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('المستخدم غير موجود');
      }

      // تحديث ملف المستخدم
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // إضافة العناوين
      for (const address of addresses) {
        const { error: addressError } = await supabase
          .from('customer_addresses')
          .insert({
            customer_id: user.id,
            place_name: address.place_name,
            building_number: address.building_number || null,
            apartment_number: address.apartment_number || null,
            floor_number: address.floor_number || null,
            is_default: address.is_default,
          });

        if (addressError) throw addressError;
      }

      Alert.alert('نجح', 'تم إكمال التسجيل بنجاح', [
        { text: 'حسناً', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error: any) {
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
        <Text style={styles.title}>إكمال التسجيل - عميل</Text>
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

        <View style={styles.addressesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>العناوين</Text>
            <TouchableOpacity onPress={addAddress} style={styles.addButton}>
              <Ionicons name="add-circle" size={24} color="#007AFF" />
              <Text style={styles.addButtonText}>إضافة عنوان</Text>
            </TouchableOpacity>
          </View>

          {addresses.map((address, index) => (
            <View key={index} style={styles.addressCard}>
              <View style={styles.addressHeader}>
                <Text style={styles.addressNumber}>عنوان {index + 1}</Text>
                {addresses.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeAddress(index)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="trash" size={20} color="#ff3b30" />
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.input}
                placeholder="اسم المكان العام * (مثل: مول مصر، شارع النيل)"
                value={address.place_name}
                onChangeText={(text) => updateAddress(index, 'place_name', text)}
                placeholderTextColor="#999"
                textAlign="right"
              />

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="رقم العقار"
                  value={address.building_number}
                  onChangeText={(text) => updateAddress(index, 'building_number', text)}
                  keyboardType="numeric"
                  placeholderTextColor="#999"
                  textAlign="right"
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="رقم الشقة"
                  value={address.apartment_number}
                  onChangeText={(text) => updateAddress(index, 'apartment_number', text)}
                  keyboardType="numeric"
                  placeholderTextColor="#999"
                  textAlign="right"
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="الدور"
                value={address.floor_number}
                onChangeText={(text) => updateAddress(index, 'floor_number', text)}
                placeholderTextColor="#999"
                textAlign="right"
              />

              <TouchableOpacity
                onPress={() => setDefaultAddress(index)}
                style={[
                  styles.defaultButton,
                  address.is_default && styles.defaultButtonActive
                ]}
              >
                <Ionicons
                  name={address.is_default ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={address.is_default ? "#007AFF" : "#999"}
                />
                <Text style={[
                  styles.defaultButtonText,
                  address.is_default && styles.defaultButtonTextActive
                ]}>
                  العنوان الافتراضي
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={loading}
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
  addressesSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addressCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  removeButton: {
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfInput: {
    flex: 1,
    marginBottom: 0,
  },
  defaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  defaultButtonActive: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  defaultButtonText: {
    color: '#999',
    fontSize: 14,
  },
  defaultButtonTextActive: {
    color: '#007AFF',
    fontWeight: '600',
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


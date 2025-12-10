import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase, reverseGeocode } from '@/lib/supabase';
import { getLocationWithAddress } from '@/lib/locationUtils';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

interface Address {
  id?: string;
  place_name: string;
  building_number: string;
  apartment_number: string;
  floor_number: string;
  is_default: boolean;
}

export default function CompleteCustomerRegistration() {
  const router = useRouter();
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(''); // سيتم جلبها من المستخدم الحالي
  const [addresses, setAddresses] = useState<Address[]>([
    { place_name: '', building_number: '', apartment_number: '', floor_number: '', is_default: true }
  ]);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState<number | null>(null); // index of address being fetched
  const [loadingPhone, setLoadingPhone] = useState(true);

  // جلب رقم الهاتف من المستخدم الحالي
  useEffect(() => {
    const loadUserPhone = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          // أولاً: جرب من auth.user.phone
          if (authUser.phone) {
            setPhone(authUser.phone);
            setLoadingPhone(false);
            return;
          }
          
          // ثانياً: جرب من profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', authUser.id)
            .single();
          
          if (profile?.phone) {
            setPhone(profile.phone);
          }
        }
      } catch (error) {
        console.error('Error loading user phone:', error);
      } finally {
        setLoadingPhone(false);
      }
    };

    loadUserPhone();
  }, []);

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

  const getCurrentLocation = async (index: number) => {
    setGettingLocation(index);
    try {
      // استخدام الدالة المشتركة التي تستخدم WiFi والبحث في الدليل
      const locationData = await getLocationWithAddress(500);

      if (!locationData) {
        throw new Error('فشل جلب الموقع');
      }

      const { lat, lon, address } = locationData;
      
      // استخدام العنوان المسترجع (من الدليل أو reverse geocoding)
      const placeName = address;

      console.log('Generated place name:', placeName);

      // تحديث العنوان
      updateAddress(index, 'place_name', placeName);

      Alert.alert('نجح', 'تم جلب العنوان بنجاح');
    } catch (error: any) {
      console.error('Error getting location:', error);
      Alert.alert('خطأ', error.message || 'فشل جلب الموقع');
    } finally {
      setGettingLocation(null);
    }
  };

  const handleComplete = async () => {
    if (!fullName) {
      Alert.alert('خطأ', 'الرجاء إدخال الاسم الكامل');
      return;
    }

    if (!phone) {
      Alert.alert('خطأ', 'لم يتم العثور على رقم الهاتف. يرجى تسجيل الخروج والدخول مرة أخرى.');
      return;
    }

    if (addresses.some(addr => !addr.place_name)) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المكان العام لجميع العناوين');
      return;
    }

    setLoading(true);
    console.log('CompleteRegistration: Starting registration completion...');
    
    try {
      // الحصول على المستخدم الحالي
      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      if (getUserError) {
        console.error('CompleteRegistration: Error getting user:', getUserError);
        throw getUserError;
      }
      if (!user) {
        throw new Error('المستخدم غير موجود');
      }
      console.log('CompleteRegistration: User ID:', user.id);

      // تحديث ملف المستخدم
      console.log('CompleteRegistration: Updating profile...');
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
        })
        .eq('id', user.id);

      if (profileError) {
        console.error('CompleteRegistration: Error updating profile:', profileError);
        throw profileError;
      }
      console.log('CompleteRegistration: Profile updated successfully');

      // إضافة العناوين
      console.log('CompleteRegistration: Adding addresses...', addresses.length);
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        console.log(`CompleteRegistration: Inserting address ${i + 1}:`, address);
        
        const { data, error: addressError } = await supabase
          .from('customer_addresses')
          .insert({
            customer_id: user.id,
            place_name: address.place_name,
            building_number: address.building_number || null,
            apartment_number: address.apartment_number || null,
            floor_number: address.floor_number || null,
            is_default: address.is_default,
          })
          .select();

        if (addressError) {
          console.error(`CompleteRegistration: Error inserting address ${i + 1}:`, addressError);
          // إذا كان الخطأ بسبب عدم وجود الجدول، نعرض رسالة واضحة
          if (addressError.code === 'PGRST116' || addressError.message?.includes('relation') || addressError.message?.includes('does not exist')) {
            throw new Error('جدول العناوين غير موجود في قاعدة البيانات. يرجى إنشاء جدول customer_addresses أولاً.');
          }
          throw addressError;
        }
        console.log(`CompleteRegistration: Address ${i + 1} inserted successfully:`, data);
      }

      console.log('CompleteRegistration: Registration completed successfully');
      
      // توجيه مباشر إلى الصفحة الرئيسية (سيتم التوجيه تلقائياً حسب role)
      router.replace('/(tabs)');
      
      // عرض رسالة نجاح بعد التوجيه
      setTimeout(() => {
        Alert.alert('نجح', 'تم إكمال التسجيل بنجاح');
      }, 500);
    } catch (error: any) {
      console.error('CompleteRegistration: Error in handleComplete:', error);
      const errorMessage = error.message || error.code || 'فشل إكمال التسجيل';
      Alert.alert('خطأ', errorMessage);
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

        {loadingPhone ? (
          <View style={styles.phoneInfo}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.phoneInfoText}>جاري جلب رقم الهاتف...</Text>
          </View>
        ) : phone ? (
          <View style={styles.phoneInfo}>
            <Ionicons name="call" size={20} color="#007AFF" />
            <Text style={styles.phoneInfoText}>رقم الهاتف: {phone.replace('+20', '0')}</Text>
          </View>
        ) : null}

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

              <View style={styles.locationInputContainer}>
                <TextInput
                  style={[styles.input, styles.locationInput]}
                  placeholder="اسم المكان العام * (مثل: مول مصر، شارع النيل)"
                  value={address.place_name}
                  onChangeText={(text) => updateAddress(index, 'place_name', text)}
                  placeholderTextColor="#999"
                  textAlign="right"
                />
                <TouchableOpacity
                  style={[styles.locationButton, gettingLocation === index && styles.locationButtonLoading]}
                  onPress={() => getCurrentLocation(index)}
                  disabled={gettingLocation === index}
                >
                  {gettingLocation === index ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Ionicons name="location" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              </View>

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
  phoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  phoneInfoText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  locationInput: {
    flex: 1,
    marginBottom: 0,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  locationButtonLoading: {
    opacity: 0.6,
  },
});


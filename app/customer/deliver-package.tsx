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
import { supabase, reverseGeocode } from '@/lib/supabase';
import { getLocationWithAddress } from '@/lib/locationUtils';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';

interface DeliveryPoint {
  id: string;
  address: string;
  description?: string;
}

type DeliveryMode = 'simple' | 'multi';

export default function DeliverPackageScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('simple');
  
  // الوضع البسيط
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  
  // دالة لإنشاء ID فريد
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // الوضع المتعدد - استخدام lazy initialization
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>(() => {
    const id1 = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const id2 = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return [
      { id: id1, address: '', description: 'نقطة الانطلاق' },
      { id: id2, address: '', description: 'نقطة الوصول' },
    ];
  });
  
  const [packageDescription, setPackageDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState<string | null>(null); // 'pickup' | 'delivery' | pointId

  const addDeliveryPoint = () => {
    setDeliveryPoints([
      ...deliveryPoints,
      { id: generateId(), address: '', description: `نقطة توقف ${deliveryPoints.length}` },
    ]);
  };

  const removeDeliveryPoint = (id: string) => {
    if (deliveryPoints.length <= 2) {
      Alert.alert('تنبيه', 'يجب أن يكون هناك على الأقل نقطة انطلاق ونقطة وصول');
      return;
    }
    setDeliveryPoints(deliveryPoints.filter(point => point.id !== id));
  };

  const updateDeliveryPoint = (id: string, field: 'address' | 'description', value: string) => {
    setDeliveryPoints(
      deliveryPoints.map(point =>
        point.id === id ? { ...point, [field]: value } : point
      )
    );
  };

  // جلب الموقع التلقائي
  const getCurrentLocation = async (target: 'pickup' | 'delivery' | string) => {
    setGettingLocation(target);
    try {
      // استخدام الدالة المشتركة التي تستخدم WiFi والبحث في الدليل
      const locationData = await getLocationWithAddress(500);

      if (!locationData) {
        throw new Error('فشل جلب الموقع');
      }

      const { lat, lon, address } = locationData;
      
      // استخدام العنوان المسترجع (من الدليل أو reverse geocoding)
      const placeName = address;

      // تحديث العنوان حسب الهدف
      if (target === 'pickup') {
        setPickupAddress(placeName);
      } else if (target === 'delivery') {
        setDeliveryAddress(placeName);
      } else {
        // نقطة في الوضع المتعدد
        updateDeliveryPoint(target, 'address', placeName);
      }

      Alert.alert('نجح', 'تم جلب العنوان بنجاح');
    } catch (error: any) {
      console.error('Error getting location:', error);
      Alert.alert('خطأ', error.message || 'فشل جلب الموقع');
    } finally {
      setGettingLocation(null);
    }
  };

  // فتح الخريطة لاختيار الموقع
  const openMapForLocation = async (target: 'pickup' | 'delivery' | string) => {
    try {
      // محاولة فتح Google Maps في التطبيق أولاً
      const mapsUrl = 'https://www.google.com/maps';
      const canOpen = await Linking.canOpenURL(mapsUrl);
      
      if (canOpen) {
        await Linking.openURL(mapsUrl);
        Alert.alert(
          'اختيار الموقع',
          'بعد اختيار الموقع من الخريطة:\n1. اضغط على الموقع\n2. انسخ العنوان\n3. الصقه في الحقل',
          [{ text: 'حسناً' }]
        );
      } else {
        // إذا لم يكن Google Maps متاحاً، افتح في المتصفح
        const webUrl = 'https://www.google.com/maps';
        await Linking.openURL(webUrl);
        Alert.alert(
          'اختيار الموقع',
          'تم فتح الخريطة في المتصفح. بعد اختيار الموقع، انسخ العنوان والصقه في الحقل',
          [{ text: 'حسناً' }]
        );
      }
    } catch (error: any) {
      console.error('Error opening map:', error);
      Alert.alert('خطأ', 'فشل فتح الخريطة. يمكنك إدخال العنوان يدوياً');
    }
  };

  const handleSubmit = async () => {
    if (deliveryMode === 'simple') {
      if (!pickupAddress || !deliveryAddress) {
        Alert.alert('خطأ', 'الرجاء إدخال عنوان الاستلام والتسليم');
        return;
      }
    } else {
      // التحقق من أن جميع النقاط لها عناوين
      const emptyPoints = deliveryPoints.filter(point => !point.address.trim());
      if (emptyPoints.length > 0) {
        Alert.alert('خطأ', 'الرجاء إدخال عنوان لجميع النقاط');
        return;
      }
      if (deliveryPoints.length < 2) {
        Alert.alert('خطأ', 'يجب أن يكون هناك على الأقل نقطة انطلاق ونقطة وصول');
        return;
      }
    }

    setLoading(true);
    try {
      // حساب الأجرة التقديرية (يمكن تحسينها لاحقاً)
      // في الوضع المتعدد، نضيف 20 ج.م لكل نقطة إضافية
      const baseFee = 50;
      const additionalFee = deliveryMode === 'multi' ? (deliveryPoints.length - 2) * 20 : 0;
      const estimatedFee = baseFee + additionalFee;

      let orderData: any;
      
      if (deliveryMode === 'simple') {
        // الوضع البسيط: نقطة انطلاق + نقطة وصول
        orderData = {
          customer_id: user?.id,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          package_description: packageDescription,
          status: 'pending',
          total_fee: estimatedFee,
          order_type: 'package',
        };
      } else {
        // الوضع المتعدد: حفظ المسار كـ JSON
        const route = deliveryPoints.map(point => ({
          address: point.address,
          description: point.description,
        }));
        
        orderData = {
          customer_id: user?.id,
          pickup_address: deliveryPoints[0].address, // أول نقطة
          delivery_address: deliveryPoints[deliveryPoints.length - 1].address, // آخر نقطة
          package_description: packageDescription,
          status: 'pending',
          total_fee: estimatedFee,
          order_type: 'package',
          items: route, // حفظ المسار الكامل في items
        };
      }

      const { data, error } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single();

      if (error) throw error;
      
      // توجيه مباشر إلى قائمة الطلبات
      router.replace('/(tabs)/customer/orders');
      
      // عرض رسالة النجاح بعد التوجيه
      setTimeout(() => {
        Alert.alert('✅ نجح', 'تم إرسال الطلب بنجاح');
      }, 300);
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.replace('/(tabs)/customer/home')}
        >
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('customer.deliverPackage')}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* اختيار نوع التوصيل */}
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              deliveryMode === 'simple' && styles.modeButtonActive,
            ]}
            onPress={() => setDeliveryMode('simple')}
          >
            <Ionicons
              name="arrow-forward"
              size={20}
              color={deliveryMode === 'simple' ? '#fff' : '#666'}
            />
            <Text
              style={[
                styles.modeButtonText,
                deliveryMode === 'simple' && styles.modeButtonTextActive,
              ]}
            >
              توصيل بسيط
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              deliveryMode === 'multi' && styles.modeButtonActive,
            ]}
            onPress={() => setDeliveryMode('multi')}
          >
            <Ionicons
              name="git-merge"
              size={20}
              color={deliveryMode === 'multi' ? '#fff' : '#666'}
            />
            <Text
              style={[
                styles.modeButtonText,
                deliveryMode === 'multi' && styles.modeButtonTextActive,
              ]}
            >
              توصيل متعدد النقاط
            </Text>
          </TouchableOpacity>
        </View>

        {deliveryMode === 'simple' ? (
          <>
            <View style={styles.section}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t('customer.pickupLocation')}</Text>
                <View style={styles.locationButtons}>
                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={() => getCurrentLocation('pickup')}
                    disabled={gettingLocation === 'pickup'}
                  >
                    {gettingLocation === 'pickup' ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Ionicons name="locate" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={() => openMapForLocation('pickup')}
                  >
                    <Ionicons name="map" size={20} color="#34C759" />
                  </TouchableOpacity>
                </View>
              </View>
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
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t('customer.deliveryLocation')}</Text>
                <View style={styles.locationButtons}>
                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={() => getCurrentLocation('delivery')}
                    disabled={gettingLocation === 'delivery'}
                  >
                    {gettingLocation === 'delivery' ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Ionicons name="locate" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.locationButton}
                    onPress={() => openMapForLocation('delivery')}
                  >
                    <Ionicons name="map" size={20} color="#34C759" />
                  </TouchableOpacity>
                </View>
              </View>
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
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.pointsHeader}>
              <Text style={styles.label}>مسار التوصيل</Text>
              <TouchableOpacity
                style={styles.addPointButton}
                onPress={addDeliveryPoint}
              >
                <Ionicons name="add-circle" size={24} color="#007AFF" />
                <Text style={styles.addPointButtonText}>إضافة نقطة</Text>
              </TouchableOpacity>
            </View>
            
            {deliveryPoints.map((point, index) => (
              <View key={point.id} style={styles.pointCard}>
                <View style={styles.pointHeader}>
                  <View style={styles.pointNumber}>
                    <Text style={styles.pointNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.pointLabel}>
                    {index === 0
                      ? 'نقطة الانطلاق'
                      : index === deliveryPoints.length - 1
                      ? 'نقطة الوصول'
                      : `نقطة توقف ${index}`}
                  </Text>
                  {deliveryPoints.length > 2 && (
                    <TouchableOpacity
                      style={styles.removePointButton}
                      onPress={() => removeDeliveryPoint(point.id)}
                    >
                      <Ionicons name="trash" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.locationInputContainer}>
                  <TextInput
                    style={[styles.input, styles.textArea, styles.locationInput]}
                    placeholder={`أدخل عنوان ${index === 0 ? 'الانطلاق' : index === deliveryPoints.length - 1 ? 'الوصول' : 'التوقف'}`}
                    value={point.address}
                    onChangeText={(value) =>
                      updateDeliveryPoint(point.id, 'address', value)
                    }
                    multiline
                    numberOfLines={3}
                    placeholderTextColor="#999"
                    textAlign="right"
                  />
                  <View style={styles.locationButtons}>
                    <TouchableOpacity
                      style={styles.locationButton}
                      onPress={() => getCurrentLocation(point.id)}
                      disabled={gettingLocation === point.id}
                    >
                      {gettingLocation === point.id ? (
                        <ActivityIndicator size="small" color="#007AFF" />
                      ) : (
                        <Ionicons name="locate" size={20} color="#007AFF" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.locationButton}
                      onPress={() => openMapForLocation(point.id)}
                    >
                      <Ionicons name="map" size={20} color="#34C759" />
                    </TouchableOpacity>
                  </View>
                </View>
                {index < deliveryPoints.length - 1 && (
                  <View style={styles.arrowContainer}>
                    <Ionicons name="arrow-down" size={24} color="#007AFF" />
                    <Text style={styles.arrowText}>
                      ثم التوجه إلى النقطة التالية
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  locationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  locationInput: {
    flex: 1,
    marginBottom: 0,
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
  modeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  modeButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  pointsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addPointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e3f2fd',
  },
  addPointButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pointCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  pointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  pointNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointNumberText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pointLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  removePointButton: {
    padding: 4,
  },
  arrowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
  },
  arrowText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});


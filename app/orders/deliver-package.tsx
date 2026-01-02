import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { calculateDistance, getLocationWithAddress } from '@/lib/webLocationUtils';
import { geocodeAddress } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { openURL, getCurrentLocation } from '@/lib/webUtils';
import { createNotification, notifyAllActiveDrivers } from '@/lib/notifications';
import { calculateDeliveryPrice } from '@/lib/priceCalculation';
import { showSimpleAlert } from '@/lib/alert';

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
      showSimpleAlert('تنبيه', 'يجب أن يكون هناك على الأقل نقطة انطلاق ونقطة وصول', 'warning');
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

        showSimpleAlert('نجح', 'تم جلب العنوان بنجاح', 'success');
    } catch (error: any) {
      console.error('Error getting location:', error);
      showSimpleAlert('خطأ', error.message || 'فشل جلب الموقع', 'error');
    } finally {
      setGettingLocation(null);
    }
  };

  // فتح الخريطة لاختيار الموقع
  const openMapForLocation = async (target: 'pickup' | 'delivery' | string) => {
    try {
      // محاولة فتح Google Maps في التطبيق أولاً
      const mapsUrl = 'https://www.google.com/maps';
      const canOpen = true; // على الويب، يمكن فتح أي URL
      
      if (canOpen) {
        openURL(mapsUrl);
        showSimpleAlert(
          'اختيار الموقع',
          'بعد اختيار الموقع من الخريطة:\n1. اضغط على الموقع\n2. انسخ العنوان\n3. الصقه في الحقل',
          'info'
        );
      } else {
        // إذا لم يكن Google Maps متاحاً، افتح في المتصفح
        const webUrl = 'https://www.google.com/maps';
        openURL(webUrl);
        showSimpleAlert(
          'اختيار الموقع',
          'تم فتح الخريطة في المتصفح. بعد اختيار الموقع، انسخ العنوان والصقه في الحقل',
          'info'
        );
      }
    } catch (error: any) {
      console.error('Error opening map:', error);
      showSimpleAlert('خطأ', 'فشل فتح الخريطة. يمكنك إدخال العنوان يدوياً', 'error');
    }
  };

  const handleSubmit = async () => {
    if (deliveryMode === 'simple') {
      if (!pickupAddress || !deliveryAddress) {
        showSimpleAlert('خطأ', 'الرجاء إدخال عنوان الاستلام والتسليم', 'warning');
        return;
      }
    } else {
      // التحقق من أن جميع النقاط لها عناوين
      const emptyPoints = deliveryPoints.filter(point => !point.address.trim());
      if (emptyPoints.length > 0) {
        showSimpleAlert('خطأ', 'الرجاء إدخال عنوان لجميع النقاط', 'warning');
        return;
      }
      if (deliveryPoints.length < 2) {
        showSimpleAlert('خطأ', 'يجب أن يكون هناك على الأقل نقطة انطلاق ونقطة وصول', 'warning');
        return;
      }
    }

    setLoading(true);
    try {
      // حساب الأجرة بناءً على المسافة الفعلية (نفس النظام المستخدم في "طلب من خارج")
      // النظام: أول طلب في 3 كم = 25 ج.م، كل طلب زيادة = +5 ج.م، كل كم زيادة = +5 ج.م
      
      let estimatedFee = 25; // سعر افتراضي
      let totalDistance = 0;
      
      try {
        if (deliveryMode === 'simple') {
          // الوضع البسيط: حساب المسافة من نقطة الاستلام لنقطة التوصيل
          const pickupCoords = await geocodeAddress(pickupAddress);
          const deliveryCoords = await geocodeAddress(deliveryAddress);
          
          if (pickupCoords && deliveryCoords) {
            totalDistance = calculateDistance(
              pickupCoords.lat,
              pickupCoords.lon,
              deliveryCoords.lat,
              deliveryCoords.lon
            ) / 1000; // تحويل من متر إلى كيلومتر
            
            // حساب السعر: أول طلب في 3 كم = 25 ج.م، كل كم زيادة = +5 ج.م
            estimatedFee = calculateDeliveryPrice(1, totalDistance);
          } else {
            // إذا فشل الحصول على الإحداثيات، نستخدم سعر افتراضي
            estimatedFee = calculateDeliveryPrice(1, 3);
          }
        } else {
          // الوضع المتعدد: حساب المسافة الإجمالية من نقطة الانطلاق → النقطة التالية → ... → نقطة الوصول
          const locations: Array<{ lat: number; lon: number }> = [];
          
          for (const point of deliveryPoints) {
            const coords = await geocodeAddress(point.address);
            if (coords) {
              locations.push(coords);
            }
          }
          
          if (locations.length >= 2) {
            // حساب المسافة بين كل نقطتين متتاليتين
            for (let i = 0; i < locations.length - 1; i++) {
              const distance = calculateDistance(
                locations[i].lat,
                locations[i].lon,
                locations[i + 1].lat,
                locations[i + 1].lon
              ) / 1000; // تحويل من متر إلى كيلومتر
              totalDistance += distance;
            }
            
            // حساب السعر: أول طلب في 3 كم = 25 ج.م، كل كم زيادة = +5 ج.م
            // في الوضع المتعدد، نعتبر كل نقطة توقف = طلب إضافي
            const ordersCount = deliveryPoints.length - 1; // عدد النقاط - 1
            estimatedFee = calculateDeliveryPrice(ordersCount, totalDistance);
          } else {
            // إذا فشل الحصول على المواقع، نستخدم سعر افتراضي
            const ordersCount = deliveryPoints.length - 1;
            estimatedFee = calculateDeliveryPrice(ordersCount, 3 + (ordersCount - 1) * 2);
          }
        }
      } catch (locationError) {
        console.error('Error calculating distance for price:', locationError);
        // في حالة الخطأ، نستخدم سعر افتراضي
        if (deliveryMode === 'simple') {
          estimatedFee = calculateDeliveryPrice(1, 3);
        } else {
          const ordersCount = deliveryPoints.length - 1;
          estimatedFee = calculateDeliveryPrice(ordersCount, 3 + (ordersCount - 1) * 2);
        }
      }

      // استخدام Edge Function لإنشاء الطلب (لتجاوز RLS)
      let orderRequestData: any;
      
      if (deliveryMode === 'simple') {
        // الوضع البسيط: نقطة انطلاق + نقطة وصول
        orderRequestData = {
          customerId: user?.id,
          pickupAddress: pickupAddress,
          deliveryAddress: deliveryAddress,
          packageDescription: packageDescription,
          status: 'pending',
          totalFee: estimatedFee,
          orderType: 'package',
          createdByRole: user?.role || 'customer', // من أنشأ الطلب
        };
      } else {
        // الوضع المتعدد: حفظ المسار كـ JSON
        const route = deliveryPoints.map(point => ({
          address: point.address,
          description: point.description,
        }));
        
        orderRequestData = {
          customerId: user?.id,
          pickupAddress: deliveryPoints[0].address, // أول نقطة
          deliveryAddress: deliveryPoints[deliveryPoints.length - 1].address, // آخر نقطة
          packageDescription: packageDescription,
          status: 'pending',
          totalFee: estimatedFee,
          orderType: 'package',
          items: route, // حفظ المسار الكامل في items
          createdByRole: user?.role || 'customer', // من أنشأ الطلب
        };
      }

      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('create-order', {
        body: orderRequestData,
      });

      if (edgeFunctionError) {
        console.error('❌ Error creating order via Edge Function:', edgeFunctionError);
        throw edgeFunctionError;
      }

      if (!edgeFunctionData || !edgeFunctionData.success) {
        console.error('❌ Edge Function returned error:', edgeFunctionData?.error);
        throw new Error(edgeFunctionData?.error || 'فشل إنشاء الطلب');
      }

      console.log('✅ Order created successfully:', edgeFunctionData.order?.id);
      
      const message = 'تم إرسال طلبك بنجاح! سيظهر الطلب للسائقين قريباً.';

      // إيقاف loading قبل التوجيه
      setLoading(false);
      
      // التوجيه حسب دور المستخدم
      try {
      if (user?.role === 'driver') {
          router.replace('/(tabs)/driver/trips');
      } else if (user?.role === 'admin') {
        router.replace('/(tabs)/admin/my-orders');
      } else {
        router.replace('/(tabs)/customer/my-orders');
      }
      
      // عرض رسالة النجاح بعد التوجيه
      setTimeout(() => {
        showSimpleAlert('✅ نجح', message, 'success');
      }, 300);
      } catch (navError) {
        console.error('❌ Navigation error:', navError);
        showSimpleAlert('✅ نجح', message, 'success');
      }
    } catch (error: any) {
      console.error('❌ Error in handleSubmit:', error);
      setLoading(false);
      showSimpleAlert('خطأ', error.message || 'فشل إرسال الطلب', 'error');
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              // التوجيه حسب دور المستخدم
              if (user?.role === 'driver') {
                router.replace('/(tabs)/driver/dashboard');
              } else if (user?.role === 'admin') {
                router.replace('/(tabs)/admin/dashboard');
              } else {
                router.replace('/(tabs)/customer/home');
              }
            }
          }}
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
                <Text style={styles.label}>عنوان الاستلام</Text>
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
                <Text style={styles.label}>عنوان التوصيل</Text>
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
            <Text style={styles.submitButtonText}>إرسال الطلب</Text>
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


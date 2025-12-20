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
import { calculateDistance, getLocationWithAddress } from '@/lib/locationUtils';
import { geocodeAddress } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { createNotification, notifyAllActiveDrivers } from '@/lib/notifications';
import { calculateDeliveryPrice } from '@/lib/priceCalculation';

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
      
      // تحديد نقطة البحث عن السائقين
      let searchPoint: { lat: number; lon: number } | null = null;
      
      try {
        if (deliveryMode === 'simple') {
          // للوضع البسيط: البحث من نقطة الاستلام
          const pickupCoords = await geocodeAddress(pickupAddress);
          if (pickupCoords) {
            searchPoint = pickupCoords;
          }
        } else {
          // للوضع المتعدد: البحث من نقطة الانطلاق (أول نقطة)
          const startPointCoords = await geocodeAddress(deliveryPoints[0].address);
          if (startPointCoords) {
            searchPoint = startPointCoords;
          }
        }
      } catch (locationError) {
        console.error('Error getting search point location:', locationError);
        // إذا فشل الحصول على الموقع، نحاول استخدام موقع العميل الحالي
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({});
            searchPoint = { lat: location.coords.latitude, lon: location.coords.longitude };
          }
        } catch (err) {
          console.error('Error getting current location:', err);
        }
      }

      // بدء البحث التلقائي عن السائقين
      if (searchPoint && data) {
        try {
          // تحديث حالة البحث
          await supabase
            .from('orders')
            .update({
              search_status: 'searching',
              search_started_at: new Date().toISOString(),
            })
            .eq('id', data.id);

          // جلب الإعدادات
          const { data: settings } = await supabase
            .from('order_search_settings')
            .select('setting_key, setting_value');

          const initialRadius = parseFloat(
            settings?.find(s => s.setting_key === 'initial_search_radius_km')?.setting_value || '3'
          );
          const expandedRadius = parseFloat(
            settings?.find(s => s.setting_key === 'expanded_search_radius_km')?.setting_value || '6'
          );
          const initialDuration = parseFloat(
            settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || '10'
          );
          const expandedDuration = parseFloat(
            settings?.find(s => s.setting_key === 'expanded_search_duration_seconds')?.setting_value || '10'
          );

          // بدء البحث
          startOrderSearch(data.id, searchPoint, initialRadius, expandedRadius, initialDuration, expandedDuration);
        } catch (searchError) {
          console.error('Error starting search:', searchError);
        }
      }
      
      const message = searchPoint 
        ? 'تم إرسال طلبك بنجاح! جاري البحث عن سائق...'
        : 'تم إرسال طلبك بنجاح!';
      
      // توجيه مباشر إلى قائمة الطلبات
      router.replace('/(tabs)/customer/orders');
      
      // عرض رسالة النجاح بعد التوجيه
      setTimeout(() => {
        Alert.alert('✅ نجح', message);
      }, 300);
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'فشل إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  // دالة لبدء البحث التلقائي عن السائقين (نفس الكود من outside-order.tsx)
  const startOrderSearch = async (
    orderId: string,
    searchPoint: { lat: number; lon: number },
    initialRadius: number,
    expandedRadius: number,
    initialDuration: number,
    expandedDuration: number
  ) => {
    try {
      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const findDriversInRadius = async (radius: number) => {
        const { data: allDrivers } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'driver')
          .eq('status', 'active')
          .eq('approval_status', 'approved');

        if (!allDrivers || allDrivers.length === 0) return [];

        const driverIds = allDrivers.map(d => d.id);
        const { data: locationsData } = await supabase
          .from('driver_locations')
          .select('driver_id, latitude, longitude')
          .in('driver_id', driverIds)
          .order('updated_at', { ascending: false });

        if (!locationsData) return [];

        const latestLocations = new Map<string, { driver_id: string; latitude: number; longitude: number }>();
        locationsData.forEach(loc => {
          if (loc.latitude && loc.longitude && !latestLocations.has(loc.driver_id)) {
            latestLocations.set(loc.driver_id, {
              driver_id: loc.driver_id,
              latitude: loc.latitude,
              longitude: loc.longitude,
            });
          }
        });

        const driversInRadius: { driver_id: string; latitude: number; longitude: number }[] = [];
        latestLocations.forEach((driver) => {
          const distance = calculateDistance(
            searchPoint.lat,
            searchPoint.lon,
            driver.latitude,
            driver.longitude
          );
          if (distance <= radius) {
            driversInRadius.push(driver);
          }
        });

        return driversInRadius;
      };

      const notifyDrivers = async (drivers: { driver_id: string }[], radius: number) => {
        if (drivers.length === 0) return;

        const notifications = drivers.map(driver => ({
          user_id: driver.driver_id,
          title: 'طلب جديد متاح',
          message: `يوجد طلب جديد متاح في نطاق ${radius} كم. تحقق من قائمة الطلبات.`,
          type: 'info' as const,
        }));

        await supabase.from('notifications').insert(notifications);
      };

      const checkOrderAccepted = async () => {
        const { data } = await supabase
          .from('orders')
          .select('status, driver_id')
          .eq('id', orderId)
          .single();

        return data?.status === 'accepted' && data?.driver_id;
      };

      const initialDrivers = await findDriversInRadius(initialRadius);
      if (initialDrivers.length > 0) {
        await notifyDrivers(initialDrivers, initialRadius);
      }

      const initialStartTime = Date.now();
      const checkInterval = setInterval(async () => {
        const accepted = await checkOrderAccepted();
        if (accepted) {
          clearInterval(checkInterval);
          await supabase
            .from('orders')
            .update({ search_status: 'found' })
            .eq('id', orderId);
          return;
        }

        if (Date.now() - initialStartTime >= initialDuration * 1000) {
          clearInterval(checkInterval);
          
          await supabase
            .from('orders')
            .update({
              search_status: 'expanded',
              search_expanded_at: new Date().toISOString(),
            })
            .eq('id', orderId);

          const expandedDrivers = await findDriversInRadius(expandedRadius);
          const newDrivers = expandedDrivers.filter(
            ed => !initialDrivers.some(id => id.driver_id === ed.driver_id)
          );
          
          if (newDrivers.length > 0) {
            await notifyDrivers(newDrivers, expandedRadius);
          }

          const expandedStartTime = Date.now();
          const expandedCheckInterval = setInterval(async () => {
            const accepted = await checkOrderAccepted();
            if (accepted) {
              clearInterval(expandedCheckInterval);
              await supabase
                .from('orders')
                .update({ search_status: 'found' })
                .eq('id', orderId);
              return;
            }

            if (Date.now() - expandedStartTime >= expandedDuration * 1000) {
              clearInterval(expandedCheckInterval);
              await supabase
                .from('orders')
                .update({ search_status: 'stopped' })
                .eq('id', orderId);
            }
          }, 1000);
        }
      }, 1000);
    } catch (error) {
      console.error('Error in order search:', error);
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


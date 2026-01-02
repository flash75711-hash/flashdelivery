import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, geocodeAddress } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { showSimpleAlert } from '@/lib/alert';
// WebView is not supported on web, we'll use iframe instead

interface Order {
  id: string;
  customer_id: string;
  driver_id?: string | null;
  status: string;
  order_type?: string;
  items?: any;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  driver?: {
    full_name?: string;
    phone?: string;
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  item_index: number;
  address: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  is_picked_up: boolean;
  picked_up_at?: string | null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.7;
const BOTTOM_SHEET_MIN_HEIGHT = 100;

export default function TrackOrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const orderId = params.orderId as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [mapHtml, setMapHtml] = useState<string>('');
  
  // Bottom Sheet Animation
  const bottomSheetY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  
  useEffect(() => {
    if (orderId && user?.id) {
      loadOrder();
      loadOrderItems();
      
      // الاشتراك في تحديثات الطلب
      const subscription = supabase
        .channel(`order_${orderId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          () => {
            loadOrder();
            loadOrderItems();
          }
        )
        .subscribe();
      
      // الاشتراك في تحديثات order_items
      const itemsSubscription = supabase
        .channel(`order_items_${orderId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'order_items',
            filter: `order_id=eq.${orderId}`,
          },
          () => {
            loadOrderItems();
          }
        )
        .subscribe();
      
      // الاشتراك في تحديثات موقع السائق
      const locationSubscription = supabase
        .channel(`driver_location_${orderId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'driver_locations',
            filter: `order_id=eq.${orderId}`,
          },
          () => {
            loadDriverLocation();
          }
        )
        .subscribe();
      
      return () => {
        subscription.unsubscribe();
        itemsSubscription.unsubscribe();
        locationSubscription.unsubscribe();
      };
    }
  }, [orderId]);

  useEffect(() => {
    // تحديث الخريطة عند تغيير موقع السائق أو orderItems
    // إذا كان هناك orderItems، نحدث الخريطة حتى لو لم يكن driverLocation موجوداً بعد
    if (orderItems.length > 0 || driverLocation) {
      updateMap().catch((error) => {
        console.error('❌ [useEffect] Error updating map:', error);
      });
    }
  }, [driverLocation, orderItems]);

  // تحميل orderItems بعد تحميل order بنجاح
  useEffect(() => {
    if (order && orderId) {
      console.log('🔄 [TrackOrderScreen] Order loaded, loading order items...', {
        orderId: order.id,
        orderStatus: order.status,
        customerId: order.customer_id,
        currentUserId: user?.id,
      });
      // تأخير صغير للتأكد من أن order تم تحديثه في state
      setTimeout(() => {
        loadOrderItems();
      }, 300);
    }
  }, [order?.id, orderId]);

  const loadOrder = async (retryCount = 0) => {
    if (!orderId || !user?.id) {
      showSimpleAlert('خطأ', 'معرف الطلب غير موجود', 'error');
      setLoading(false);
      return;
    }

    const MAX_RETRIES = 5;
    const RETRY_DELAY = 1500;

    try {
      console.log(`🔍 [loadOrder] Loading order for customer (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, {
        orderId,
        customerId: user.id,
      });

      // محاولة الاستعلام المباشر أولاً
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_id, driver_id, status, order_type, items, pickup_address, delivery_address, total_fee, created_at, expires_at, created_by_role, package_description')
        .eq('id', orderId)
        .eq('customer_id', user.id)
        .maybeSingle();

      console.log('📊 [loadOrder] Query result:', {
        hasData: !!data,
        hasError: !!error,
        errorCode: error?.code,
        errorMessage: error?.message,
      });

      if (error) {
        console.error('❌ [loadOrder] Error fetching order:', {
          error,
          code: error.code,
          message: error.message,
        });
        
        // محاولة استخدام Edge Function كبديل عند وجود خطأ (خاصة أخطاء RLS)
        if (retryCount === 0 && (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST202')) {
          console.log('🔍 [loadOrder] Trying Edge Function to bypass RLS after error...');
          try {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-customer', {
              body: {
                orderId: orderId,
                customerId: user.id,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.order) {
              console.log('✅ [loadOrder] Order loaded via Edge Function');
              setOrder(edgeData.order);
              setLoading(false);
              return;
            } else {
              console.error('❌ [loadOrder] Edge Function failed:', edgeError || edgeData?.error);
            }
          } catch (edgeErr) {
            console.error('❌ [loadOrder] Edge Function exception:', edgeErr);
          }
        }

        // إعادة المحاولة إذا لم نتجاوز الحد الأقصى
        if (retryCount < MAX_RETRIES && (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST202')) {
          console.log(`🔄 [loadOrder] Retrying in ${RETRY_DELAY}ms...`);
          setTimeout(() => {
            loadOrder(retryCount + 1);
          }, RETRY_DELAY);
          return;
        }

        throw error;
      }

      if (!data) {
        // محاولة استخدام Edge Function إذا لم نجد البيانات
        if (retryCount === 0) {
          console.log('🔍 [loadOrder] No data found, trying Edge Function...');
          try {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-customer', {
              body: {
                orderId: orderId,
                customerId: user.id,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.order) {
              console.log('✅ [loadOrder] Order loaded via Edge Function');
              setOrder(edgeData.order);
              setLoading(false);
              return;
            } else {
              console.error('❌ [loadOrder] Edge Function failed:', edgeError || edgeData?.error);
            }
          } catch (edgeErr) {
            console.error('❌ [loadOrder] Edge Function exception:', edgeErr);
          }
        }

        // إعادة المحاولة إذا لم نتجاوز الحد الأقصى
        if (retryCount < MAX_RETRIES) {
          console.log(`🔄 [loadOrder] Retrying in ${RETRY_DELAY}ms...`);
          setTimeout(() => {
            loadOrder(retryCount + 1);
          }, RETRY_DELAY);
          return;
        }

        showSimpleAlert('خطأ', 'الطلب غير موجود أو لا يمكنك تتبعه', 'error');
        setLoading(false);
        router.back();
        return;
      }

      // جلب بيانات السائق إذا كان موجوداً
      if (data.driver_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', data.driver_id)
          .maybeSingle();
        
        setOrder({
          ...data,
          driver: profile || null,
        });
      } else {
        setOrder(data);
      }
      
      console.log('✅ [loadOrder] Order loaded successfully');
      setLoading(false);
    } catch (error: any) {
      console.error('❌ [loadOrder] Error loading order:', error);
      
      // محاولة أخيرة باستخدام Edge Function
      if (retryCount === 0) {
        console.log('🔍 [loadOrder] Final attempt with Edge Function...');
        try {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-customer', {
            body: {
              orderId: orderId,
              customerId: user.id,
            },
          });

          if (!edgeError && edgeData?.success && edgeData?.order) {
            console.log('✅ [loadOrder] Order loaded via Edge Function on final attempt');
            setOrder(edgeData.order);
            setLoading(false);
            return;
          }
        } catch (edgeErr) {
          console.error('❌ [loadOrder] Edge Function exception on final attempt:', edgeErr);
        }
      }

      showSimpleAlert('خطأ', error.message || 'فشل تحميل بيانات الطلب', 'error');
      setLoading(false);
    }
  };

  const loadOrderItems = async (retryCount = 0) => {
    if (!orderId) {
      console.warn('⚠️ [loadOrderItems] No orderId provided');
      return;
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    try {
      console.log(`🔍 [loadOrderItems] Loading order items for order (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, orderId);
      
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('item_index', { ascending: true });

      if (error) {
        console.error('❌ [loadOrderItems] Error:', {
          error,
          code: error.code,
          message: error.message,
        });
        
        // إعادة المحاولة في حالة أخطاء معينة
        if (retryCount < MAX_RETRIES && (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST202')) {
          console.log(`🔄 [loadOrderItems] Retrying in ${RETRY_DELAY}ms...`);
          setTimeout(() => {
            loadOrderItems(retryCount + 1);
          }, RETRY_DELAY);
          return;
        }
        
        throw error;
      }

      console.log('✅ [loadOrderItems] Loaded items:', {
        count: data?.length || 0,
        items: data?.map(item => ({
          id: item.id,
          address: item.address,
          hasCoordinates: !!(item.latitude && item.longitude),
          isPickedUp: item.is_picked_up,
        })),
      });

      // إذا لم تكن هناك orderItems، نحاول استخدام Edge Function
      if (!data || data.length === 0) {
        console.log('⚠️ [loadOrderItems] No order_items found, trying Edge Function...');
        if (user?.id && user?.role) {
          try {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-items', {
              body: {
                orderId: orderId,
                userId: user.id,
                userRole: user.role,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.orderItems) {
              console.log('✅ [loadOrderItems] Loaded items via Edge Function:', edgeData.orderItems.length);
              setOrderItems(edgeData.orderItems);
              // تحديث الخريطة بعد تحميل orderItems
              setTimeout(() => {
                updateMap().catch((error) => {
                  console.error('❌ [loadOrderItems] Error updating map:', error);
                });
              }, 100);
              return;
            } else {
              console.error('❌ [loadOrderItems] Edge Function failed:', edgeError || edgeData?.error);
            }
          } catch (edgeErr) {
            console.error('❌ [loadOrderItems] Edge Function exception:', edgeErr);
          }
        }
      }

      // إذا لم تكن هناك orderItems وكان الطلب يحتوي على items، نحاول إنشاء orderItems
      if ((!data || data.length === 0) && order?.items && Array.isArray(order.items) && order.items.length > 0) {
        console.log('⚠️ [loadOrderItems] No order_items found, but order has items. Creating order_items...');
        // محاولة إنشاء order_items من items
        try {
          const itemsToCreate = order.items.map((item: any, index: number) => ({
            order_id: orderId,
            item_index: index,
            address: item.address || item.description || item.pickup_address || '',
            description: item.description || null,
            latitude: item.latitude || item.pickup_latitude || null,
            longitude: item.longitude || item.pickup_longitude || null,
            is_picked_up: false,
          }));

          const { data: insertedData, error: insertError } = await supabase
            .from('order_items')
            .insert(itemsToCreate)
            .select();

          if (insertError) {
            console.error('❌ [loadOrderItems] Error creating order_items:', insertError);
          } else {
            console.log('✅ [loadOrderItems] Created order_items:', insertedData?.length || 0);
            setOrderItems(insertedData || []);
            updateMap().catch((error) => {
              console.error('❌ [loadOrderItems] Error updating map:', error);
            });
            return;
          }
        } catch (createError) {
          console.error('❌ [loadOrderItems] Exception creating order_items:', createError);
        }
      }

      setOrderItems(data || []);
      
      // تحديث الخريطة بعد تحميل orderItems
      if (data && data.length > 0) {
        setTimeout(() => {
          updateMap().catch((error) => {
            console.error('❌ [loadOrderItems] Error updating map:', error);
          });
        }, 100);
      } else {
        console.warn('⚠️ [loadOrderItems] No order items found for order:', orderId);
      }
    } catch (error) {
      console.error('❌ [loadOrderItems] Exception:', error);
      
      // إعادة المحاولة في حالة الخطأ
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 [loadOrderItems] Retrying after exception in ${RETRY_DELAY}ms...`);
        setTimeout(() => {
          loadOrderItems(retryCount + 1);
        }, RETRY_DELAY);
        return;
      }
      
      // حتى في حالة الخطأ، نضع array فارغ لتجنب مشاكل في UI
      setOrderItems([]);
    }
  };

  const loadDriverLocation = async () => {
    if (!order?.driver_id || !orderId) return;

    try {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('latitude, longitude')
        .eq('driver_id', order.driver_id)
        .eq('order_id', orderId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.latitude && data.longitude) {
        setDriverLocation({ lat: data.latitude, lon: data.longitude });
      }
    } catch (error) {
      console.error('Error loading driver location:', error);
    }
  };

  const startDriverLocationTracking = () => {
    if (!order?.driver_id || !orderId) return null;

    // جلب الموقع الأول
    loadDriverLocation();

    // تحديث الموقع كل 5 ثوانٍ
    const interval = setInterval(() => {
      loadDriverLocation();
    }, 5000);
    
    return () => clearInterval(interval);
  };

  const updateMap = async () => {
    // إذا لم يكن هناك orderItems ولا driverLocation، لا نعرض الخريطة
    if (orderItems.length === 0 && !driverLocation) {
      console.warn('⚠️ [updateMap] No order items and no driver location available');
      return;
    }
    
    // إذا لم يكن هناك orderItems، نعرض فقط موقع السائق
    if (orderItems.length === 0 && driverLocation) {
      console.log('⚠️ [updateMap] No order items, showing only driver location');
    }

    // جمع جميع النقاط (موقع السائق + نقاط الاستلام)
    const points: Array<{ lat: number; lon: number; label: string; color: string }> = [];
    
    // موقع السائق (إذا كان موجوداً)
    if (driverLocation) {
      points.push({
        lat: driverLocation.lat,
        lon: driverLocation.lon,
        label: order.driver?.full_name || 'السائق',
        color: 'blue',
      });
    }

    // نقاط الاستلام - استخدام for...of loop للتعامل مع async operations
    for (let index = 0; index < orderItems.length; index++) {
      const item = orderItems[index];
      let lat: number | null | undefined = item.latitude;
      let lon: number | null | undefined = item.longitude;
      
      // التحقق من صحة الإحداثيات (يجب أن تكون أرقام صحيحة)
      const hasValidCoordinates = lat != null && lon != null && 
                                   typeof lat === 'number' && typeof lon === 'number' &&
                                   !isNaN(lat) && !isNaN(lon) &&
                                   lat !== 0 && lon !== 0;
      
      // إذا لم تكن هناك إحداثيات صحيحة في orderItems، نحاول الحصول عليها من order.items
      if (!hasValidCoordinates && order?.items && Array.isArray(order.items) && order.items[index]) {
        const orderItem = order.items[index];
        const possibleLat = orderItem.latitude || orderItem.pickup_latitude || orderItem.lat;
        const possibleLon = orderItem.longitude || orderItem.pickup_longitude || orderItem.lon;
        
        // التحقق من صحة الإحداثيات من order.items
        if (possibleLat != null && possibleLon != null && 
            typeof possibleLat === 'number' && typeof possibleLon === 'number' &&
            !isNaN(possibleLat) && !isNaN(possibleLon) &&
            possibleLat !== 0 && possibleLon !== 0) {
          lat = possibleLat;
          lon = possibleLon;
          console.log(`✅ [updateMap] Using coordinates from order.items for item ${index + 1}:`, {
            lat,
            lon,
          });
        } else {
          console.log(`🔍 [updateMap] No valid coordinates in order.items for item ${index + 1}:`, {
            orderItem: orderItem,
          });
        }
      }
      
      // إذا لم تكن هناك إحداثيات صحيحة بعد، نحاول الحصول عليها من العنوان باستخدام geocoding
      const stillNeedsGeocoding = (lat == null || lon == null || 
                                   typeof lat !== 'number' || typeof lon !== 'number' ||
                                   isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) && 
                                   item.address && item.address.trim() !== '';
      
      if (stillNeedsGeocoding) {
        console.log(`🌍 [updateMap] Attempting geocoding for item ${index + 1} with address:`, item.address);
        try {
          // إضافة timeout للـ geocoding (5 ثوانٍ)
          const geocodePromise = geocodeAddress(item.address);
          const timeoutPromise = new Promise<null>((resolve) => 
            setTimeout(() => resolve(null), 5000)
          );
          
          const geocoded = await Promise.race([geocodePromise, timeoutPromise]);
          
          if (geocoded && geocoded.lat != null && geocoded.lon != null) {
            lat = geocoded.lat;
            lon = geocoded.lon;
            console.log(`✅ [updateMap] Geocoded coordinates for item ${index + 1}:`, { lat, lon });
            
            // تحديث order_item في قاعدة البيانات بالإحداثيات الجديدة
            if (item.id) {
              supabase
                .from('order_items')
                .update({ latitude: lat, longitude: lon })
                .eq('id', item.id)
                .then(({ error, data }) => {
                  if (error) {
                    console.error(`❌ [updateMap] Error updating coordinates for item ${index + 1}:`, error);
                  } else {
                    console.log(`✅ [updateMap] Updated coordinates in database for item ${index + 1}`);
                    // تحديث state بعد تحديث قاعدة البيانات
                    setOrderItems(prevItems => 
                      prevItems.map(prevItem => 
                        prevItem.id === item.id 
                          ? { ...prevItem, latitude: lat, longitude: lon }
                          : prevItem
                      )
                    );
                  }
                });
            }
          } else {
            console.warn(`⚠️ [updateMap] Geocoding failed or timed out for item ${index + 1} with address:`, item.address);
          }
        } catch (geocodeError) {
          console.error(`❌ [updateMap] Geocoding error for item ${index + 1}:`, geocodeError);
        }
      }
      
      // التحقق النهائي من صحة الإحداثيات قبل إضافتها للخريطة
      const finalHasValidCoordinates = lat != null && lon != null && 
                                       typeof lat === 'number' && typeof lon === 'number' &&
                                       !isNaN(lat) && !isNaN(lon) &&
                                       lat !== 0 && lon !== 0;
      
      if (finalHasValidCoordinates) {
        points.push({
          lat: lat as number,
          lon: lon as number,
          label: item.is_picked_up ? `تم الاستلام ${index + 1}` : `نقطة ${index + 1}`,
          color: item.is_picked_up ? 'green' : 'red',
        });
        console.log(`✅ [updateMap] Added point ${index + 1} to map:`, { lat, lon, label: item.address });
      } else {
        console.warn(`⚠️ [updateMap] Order item ${index + 1} missing valid coordinates after all attempts:`, {
          id: item.id,
          address: item.address,
          finalLat: lat,
          finalLon: lon,
          hasOrderItems: !!(order?.items && order.items[index]),
          orderItemsLength: order?.items?.length || 0,
        });
      }
    }
    
    // إذا لم يكن هناك نقاط غير موقع السائق، نستخدم موقع السائق فقط
    if (points.length === 1) {
      console.log('ℹ️ [updateMap] Only driver location available');
    }

    // إذا لم يكن هناك نقاط، لا نعرض الخريطة
    if (points.length === 0) {
      console.warn('⚠️ [updateMap] No points to display on map');
      return;
    }

    // حساب المركز
    const centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const centerLon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;

    // إنشاء HTML للخريطة
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${centerLat}, ${centerLon}],
      zoom: 13
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    // إضافة النقاط
    ${points.map((point, index) => `
      var marker${index} = L.marker([${point.lat}, ${point.lon}]).addTo(map);
      marker${index}.bindPopup('${point.label}');
      ${point.color === 'blue' ? `marker${index}.setIcon(L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
      }));` : ''}
      ${point.color === 'green' ? `marker${index}.setIcon(L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
      }));` : ''}
      ${point.color === 'red' ? `marker${index}.setIcon(L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
      }));` : ''}
    `).join('')}
    
    // رسم خطوط بين النقاط
    var routePoints = [${points.map(p => `[${p.lat}, ${p.lon}]`).join(', ')}];
    var polyline = L.polyline(routePoints, { color: '#007AFF', weight: 3 }).addTo(map);
    map.fitBounds(polyline.getBounds());
  </script>
</body>
</html>
    `;

    setMapHtml(html);
  };

  const toggleBottomSheet = () => {
    const toValue = isBottomSheetExpanded ? BOTTOM_SHEET_MAX_HEIGHT : BOTTOM_SHEET_MIN_HEIGHT;
    setIsBottomSheetExpanded(!isBottomSheetExpanded);
    
    Animated.spring(bottomSheetY, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  };

  // إعادة تحميل موقع السائق عند تغيير order
  useEffect(() => {
    if (order?.driver_id) {
      const cleanup = startDriverLocationTracking();
      return cleanup || undefined;
    }
  }, [order?.driver_id, orderId]);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جارٍ تحميل بيانات الطلب...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>متابعة الطلب</Text>
      </View>

      {/* معلومات السائق */}
      {order.driver_id && order.driver && (
        <View style={styles.driverInfo}>
          <Ionicons name="person" size={20} color="#007AFF" />
          <Text style={styles.driverName}>{order.driver.full_name || 'السائق'}</Text>
          {order.driver.phone && (
            <Text style={styles.driverPhone}>{order.driver.phone}</Text>
          )}
        </View>
      )}

      {/* الخريطة */}
      <View style={styles.mapContainer}>
        {mapHtml ? (
          // @ts-ignore - srcdoc is valid HTML attribute
          <iframe
            srcdoc={mapHtml}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            title="Map"
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.mapPlaceholderText}>
              {order.driver_id ? 'جارٍ تحميل الخريطة...' : 'في انتظار قبول السائق للطلب'}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: bottomSheetY,
          },
        ]}
      >
        <TouchableOpacity
          onPress={toggleBottomSheet}
          style={styles.bottomSheetHandle}
        >
          <View style={styles.handleBar} />
          <Text style={styles.bottomSheetTitle}>
            {orderItems.length > 0 ? `الطلبات (${orderItems.length})` : 'الطلبات'}
          </Text>
        </TouchableOpacity>

        <ScrollView style={styles.bottomSheetContent} showsVerticalScrollIndicator={false}>
          {orderItems.length === 0 ? (
            <View style={styles.emptyItemsContainer}>
              <Ionicons name="cube-outline" size={48} color="#999" />
              <Text style={styles.emptyItemsText}>لا توجد طلبات في هذا الطلب</Text>
            </View>
          ) : (
            orderItems.map((item, index) => (
              <View key={item.id} style={styles.orderItemCard}>
                <View style={styles.orderItemHeader}>
                  <View style={styles.orderItemNumber}>
                    <Text style={styles.orderItemNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.orderItemInfo}>
                    <Text style={styles.orderItemAddress}>{item.address}</Text>
                    {item.description && (
                      <Text style={styles.orderItemDescription}>{item.description}</Text>
                    )}
                  </View>
                  {item.is_picked_up ? (
                    <View style={[styles.statusBadge, { backgroundColor: '#34C75920' }]}>
                      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                      <Text style={[styles.statusText, { color: '#34C759' }]}>تم الاستلام</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: '#FF950020' }]}>
                      <Ionicons name="time" size={20} color="#FF9500" />
                      <Text style={[styles.statusText, { color: '#FF9500' }]}>قيد الانتظار</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </Animated.View>
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
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  driverName: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  driverPhone: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  mapPlaceholderText: {
    marginTop: 12,
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    textAlign: 'center',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
    }),
  },
  bottomSheetHandle: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  bottomSheetTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  bottomSheetContent: {
    flex: 1,
    padding: 16,
  },
  orderItemCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    }),
  },
  orderItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderItemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderItemNumberText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: 'bold',
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemAddress: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  orderItemDescription: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
  },
  emptyItemsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyItemsText: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#999',
    marginTop: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
});


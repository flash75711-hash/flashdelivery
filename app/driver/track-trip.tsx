import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, geocodeAddress } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { showSimpleAlert } from '@/lib/alert';
import { getCurrentLocation } from '@/lib/webUtils';
import { createNotification } from '@/lib/notifications';
// WebView is not supported on web, we'll use iframe instead

// TypeScript declaration for window on web
declare const window: {
  open: (url: string, target?: string) => void;
} | undefined;

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
  is_prepaid?: boolean;
  prepaid_amount?: number;
  customer?: {
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
  item_fee?: number | null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.7;
const BOTTOM_SHEET_MIN_HEIGHT = 100;

export default function TrackTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const orderId = params.orderId as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [mapHtml, setMapHtml] = useState<string>('');
  
  // State for fee input modal
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemFee, setItemFee] = useState<string>('');
  const [isPrepaid, setIsPrepaid] = useState<boolean>(false);
  const [prepaidAmount, setPrepaidAmount] = useState<string>('');
  
  // Bottom Sheet Animation
  const bottomSheetY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  
  useEffect(() => {
    console.log('🔄 [TrackTripScreen] Component mounted:', {
      orderId,
      userId: user?.id,
      params: params,
    });
    
    if (orderId && user?.id) {
      // التحقق من وجود الطلب في active orders أولاً
      verifyOrderExists().then((exists) => {
        if (exists) {
          loadOrder();
          loadOrderItems();
          startLocationTracking();
        } else {
          console.warn('⚠️ [TrackTripScreen] Order not found in active orders, will retry...');
          // إعادة المحاولة بعد تأخير
          setTimeout(() => {
            loadOrder();
            loadOrderItems();
            startLocationTracking();
          }, 1000);
        }
      });
      
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
      
      return () => {
        subscription.unsubscribe();
        itemsSubscription.unsubscribe();
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
      console.log('🔄 [TrackTripScreen] Order loaded, loading order items...', {
        orderId: order.id,
        orderStatus: order.status,
        driverId: order.driver_id,
        currentUserId: user?.id,
      });
      // تأخير صغير للتأكد من أن order تم تحديثه في state
      setTimeout(() => {
        loadOrderItems();
      }, 300);
    }
  }, [order?.id, orderId]);

  // التحقق من وجود الطلب في active orders
  const verifyOrderExists = async (): Promise<boolean> => {
    if (!orderId || !user?.id) return false;
    
    try {
      console.log('🔍 [verifyOrderExists] Checking if order exists in active orders...');
      const { data, error } = await supabase
        .from('orders')
        .select('id, driver_id, status')
        .eq('id', orderId)
        .in('status', ['accepted', 'pickedUp', 'inTransit', 'pending'])
        .maybeSingle();
      
      if (error) {
        console.error('❌ [verifyOrderExists] Error:', error);
        return false;
      }
      
      if (data) {
        console.log('✅ [verifyOrderExists] Order exists:', {
          id: data.id,
          driver_id: data.driver_id,
          status: data.status,
          isDriverOwner: data.driver_id === user.id,
        });
        // التحقق من أن السائق هو صاحب الطلب أو أن الطلب pending
        return data.driver_id === user.id || (data.status === 'pending' && !data.driver_id);
      }
      
      console.warn('⚠️ [verifyOrderExists] Order not found');
      return false;
    } catch (error) {
      console.error('❌ [verifyOrderExists] Exception:', error);
      return false;
    }
  };

  const loadOrder = async (retryCount = 0) => {
    if (!orderId) {
      console.error('❌ [loadOrder] No orderId provided');
      showSimpleAlert('خطأ', 'معرف الطلب غير موجود', 'error');
      setLoading(false);
      return;
    }

    const MAX_RETRIES = 5; // زيادة عدد المحاولات
    const RETRY_DELAY = 1500; // زيادة التأخير إلى 1.5 ثانية

    try {
      console.log(`🔍 [loadOrder] Loading order (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, {
        orderId,
        userId: user?.id,
      });
      
      // استخدام select محدد بدلاً من * لتجنب مشاكل RLS
      // إضافة driver_id في الـ select للتأكد من أنه متاح
      // إضافة filter للـ driver_id للتأكد من أن السائق يمكنه قراءة الطلب
      const query = supabase
        .from('orders')
        .select('id, customer_id, driver_id, status, order_type, items, pickup_address, delivery_address, total_fee, created_at, expires_at, created_by_role, package_description, is_prepaid, prepaid_amount')
        .eq('id', orderId);
      
      // إضافة filter للـ driver_id إذا كان موجوداً
      // هذا يساعد في تجنب مشاكل RLS
      const { data, error } = await query.maybeSingle();
      
      console.log('📊 [loadOrder] Query result:', {
        hasData: !!data,
        hasError: !!error,
        errorCode: error?.code,
        errorMessage: error?.message,
        dataDriverId: data?.driver_id,
        currentUserId: user?.id,
      });

      if (error) {
        console.error('❌ [loadOrder] Error fetching order:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        
        // محاولة استخدام Edge Function كبديل عند وجود خطأ (خاصة أخطاء RLS)
        if (retryCount === 0 && user?.id && (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST202')) {
          console.log('🔍 [loadOrder] Trying Edge Function to bypass RLS after error...');
          try {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-driver', {
              body: {
                orderId: orderId,
                driverId: user.id,
              },
            });

            if (edgeError) {
              console.error('❌ [loadOrder] Edge Function error:', edgeError);
            } else if (edgeData?.success && edgeData?.order) {
              console.log('✅ [loadOrder] Order loaded via Edge Function after error:', {
                id: edgeData.order.id,
                status: edgeData.order.status,
                driver_id: edgeData.order.driver_id,
              });
              
              // التحقق من أن السائق هو صاحب الطلب
              const isDriverOwner = edgeData.order.driver_id === user.id;
              const isPendingWithoutDriver = edgeData.order.status === 'pending' && !edgeData.order.driver_id;
              const isPendingWithDriver = edgeData.order.status === 'pending' && edgeData.order.driver_id === user.id;
              
              if (!isDriverOwner && !isPendingWithoutDriver && !isPendingWithDriver) {
                console.error('❌ [loadOrder] Driver mismatch (from Edge Function):', {
                  orderDriverId: edgeData.order.driver_id,
                  currentUserId: user.id,
                  status: edgeData.order.status,
                });
                showSimpleAlert('خطأ', 'لا يمكنك تتبع هذا الطلب', 'error');
                setLoading(false);
                router.back();
                return;
              }

              // استخدام البيانات من Edge Function
              setOrder(edgeData.order);
              setLoading(false);
              return;
            }
          } catch (edgeErr) {
            console.error('❌ [loadOrder] Edge Function exception:', edgeErr);
          }
        }
        
        // إعادة المحاولة في حالة أخطاء معينة
        if (retryCount < MAX_RETRIES && (error.code === 'PGRST116' || error.code === 'PGRST301' || error.code === 'PGRST202')) {
          console.log(`⏳ [loadOrder] Retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return loadOrder(retryCount + 1);
        }
        
        throw error;
      }

      if (!data) {
        console.warn('⚠️ [loadOrder] Order not found via direct query:', {
          orderId,
          userId: user?.id,
          retryCount,
        });
        
        // محاولة استخدام Edge Function كبديل (تجاوز RLS)
        // هذا يساعد في حالة مشاكل RLS أو replication lag
        if (retryCount === 0 && user?.id) {
          console.log('🔍 [loadOrder] Trying Edge Function to bypass RLS...');
          try {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-by-id-for-driver', {
              body: {
                orderId: orderId,
                driverId: user.id,
              },
            });

            if (edgeError) {
              console.error('❌ [loadOrder] Edge Function error:', edgeError);
            } else if (edgeData?.success && edgeData?.order) {
              console.log('✅ [loadOrder] Order loaded via Edge Function:', {
                id: edgeData.order.id,
                status: edgeData.order.status,
                driver_id: edgeData.order.driver_id,
              });
              
              // التحقق من أن السائق هو صاحب الطلب
              const isDriverOwner = edgeData.order.driver_id === user.id;
              const isPendingWithoutDriver = edgeData.order.status === 'pending' && !edgeData.order.driver_id;
              const isPendingWithDriver = edgeData.order.status === 'pending' && edgeData.order.driver_id === user.id;
              
              if (!isDriverOwner && !isPendingWithoutDriver && !isPendingWithDriver) {
                console.error('❌ [loadOrder] Driver mismatch (from Edge Function):', {
                  orderDriverId: edgeData.order.driver_id,
                  currentUserId: user.id,
                  status: edgeData.order.status,
                });
                showSimpleAlert('خطأ', 'لا يمكنك تتبع هذا الطلب', 'error');
                setLoading(false);
                router.back();
                return;
              }

              // استخدام البيانات من Edge Function
              setOrder(edgeData.order);
              setLoading(false);
              return;
            }
          } catch (edgeErr) {
            console.error('❌ [loadOrder] Edge Function exception:', edgeErr);
          }
        }
        
        // محاولة استخدام query بديل للتحقق من وجود الطلب
        if (retryCount === 0) {
          console.log('🔍 [loadOrder] Trying alternative query to check order existence...');
          try {
            // محاولة جلب الطلب باستخدام query أبسط
            const { data: checkData, error: checkError } = await supabase
              .from('orders')
              .select('id, driver_id, status')
              .eq('id', orderId)
              .maybeSingle();
            
            if (checkError) {
              console.error('❌ [loadOrder] Alternative query error:', checkError);
            } else if (checkData) {
              console.log('✅ [loadOrder] Order exists but RLS may be blocking full query:', checkData);
              // إذا كان الطلب موجوداً لكن RLS يمنع قراءة جميع الأعمدة، نعيد المحاولة
              if (checkData.driver_id === user?.id || checkData.status === 'pending') {
                console.log('⏳ [loadOrder] Order exists, retrying full query...');
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return loadOrder(retryCount + 1);
              }
            }
          } catch (altError) {
            console.error('❌ [loadOrder] Alternative query failed:', altError);
          }
        }
        
        // إعادة المحاولة إذا لم يتم العثور على الطلب
        if (retryCount < MAX_RETRIES) {
          console.log(`⏳ [loadOrder] Order not found, retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return loadOrder(retryCount + 1);
        }
        
        // إذا فشلت جميع المحاولات
        console.error('❌ [loadOrder] Order not found after all retries:', orderId);
        showSimpleAlert('خطأ', 'الطلب غير موجود أو لا يمكنك تتبعه. يرجى المحاولة مرة أخرى.', 'error');
        setLoading(false);
        router.back();
        return;
      }

      console.log('✅ [loadOrder] Order loaded:', {
        id: data.id,
        status: data.status,
        driver_id: data.driver_id,
        customer_id: data.customer_id,
      });

      // التحقق من أن السائق هو صاحب الطلب
      // نسمح بالطلبات التي:
      // 1. driver_id = user.id (السائق هو صاحب الطلب)
      // 2. status = 'pending' و driver_id = null (طلب جديد لم يتم قبوله بعد)
      // 3. status = 'pending' و driver_id = user.id (طلب تم قبوله للتو)
      const isDriverOwner = data.driver_id === user?.id;
      const isPendingWithoutDriver = data.status === 'pending' && !data.driver_id;
      const isPendingWithDriver = data.status === 'pending' && data.driver_id === user?.id;
      
      if (!isDriverOwner && !isPendingWithoutDriver && !isPendingWithDriver) {
        console.error('❌ [loadOrder] Driver mismatch:', {
          orderDriverId: data.driver_id,
          currentUserId: user?.id,
          status: data.status,
        });
        showSimpleAlert('خطأ', 'لا يمكنك تتبع هذا الطلب', 'error');
        setLoading(false);
        router.back();
        return;
      }

      // جلب بيانات العميل
      if (data.customer_id) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', data.customer_id)
          .maybeSingle();
        
        if (profileError) {
          console.error('⚠️ [loadOrder] Error fetching customer profile:', profileError);
        }
        
        setOrder({
          ...data,
          customer: profile || null,
        });
      } else {
        setOrder(data);
      }
      
      // إيقاف التحميل بعد نجاح التحميل
      setLoading(false);
    } catch (error: any) {
      console.error('❌ [loadOrder] Error loading order:', {
        error,
        message: error?.message,
        details: error?.details,
        code: error?.code,
        retryCount,
      });
      
      // إعادة المحاولة في حالة أخطاء معينة
      if (retryCount < MAX_RETRIES) {
        console.log(`⏳ [loadOrder] Retrying after error in ${RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return loadOrder(retryCount + 1);
      }
      
      // إذا فشلت جميع المحاولات
      const errorMessage = error?.message || error?.details || 'فشل تحميل بيانات الطلب';
      showSimpleAlert('خطأ', errorMessage, 'error');
      setLoading(false);
      // العودة للصفحة السابقة في حالة الخطأ
      setTimeout(() => {
        router.back();
      }, 2000);
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
                updateMap();
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
            if (driverLocation) {
              updateMap();
            }
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
          updateMap();
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

  const startLocationTracking = async () => {
    try {
      const location = await getCurrentLocation({ enableHighAccuracy: true });
      setDriverLocation({ lat: location.latitude, lon: location.longitude });
      
      // تحديث الموقع كل 5 ثوانٍ
      const interval = setInterval(async () => {
        try {
          const loc = await getCurrentLocation({ enableHighAccuracy: true });
          setDriverLocation({ lat: loc.latitude, lon: loc.longitude });
          
          // تحديث الموقع في قاعدة البيانات
          if (user?.id) {
            await supabase.functions.invoke('update-driver-location', {
              body: {
                driverId: user.id,
                latitude: loc.latitude,
                longitude: loc.longitude,
                orderId: orderId,
              },
            });
          }
        } catch (error) {
          console.error('Error updating location:', error);
        }
      }, 5000);
      
      return () => clearInterval(interval);
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
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
    
    // موقع السائق
    if (driverLocation) {
      points.push({
        lat: driverLocation.lat,
        lon: driverLocation.lon,
        label: 'موقعك',
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

  const handleMarkAsPickedUp = (itemId: string) => {
    if (!order) {
      showSimpleAlert('خطأ', 'الطلب غير موجود', 'error');
      return;
    }

    // فتح modal لإدخال المبلغ
    setSelectedItemId(itemId);
    const item = orderItems.find(i => i.id === itemId);
    if (item?.item_fee) {
      setItemFee(item.item_fee.toString());
    } else {
      setItemFee('');
    }
    setIsPrepaid(order.is_prepaid || false);
    setPrepaidAmount(order.prepaid_amount ? order.prepaid_amount.toString() : '');
    setShowFeeModal(true);
  };

  const handleConfirmPickup = async () => {
    if (!order || !selectedItemId) {
      showSimpleAlert('خطأ', 'الطلب غير موجود', 'error');
      return;
    }

    // التحقق من إدخال المبلغ
    const fee = parseFloat(itemFee);
    if (isNaN(fee) || fee < 0) {
      showSimpleAlert('خطأ', 'يرجى إدخال مبلغ صحيح للعنصر', 'error');
      return;
    }

    // التحقق من المبلغ المدفوع مسبقاً إذا كان مفعلاً
    let prepaidAmt: number | null = null;
    if (isPrepaid) {
      const pAmount = parseFloat(prepaidAmount);
      if (isNaN(pAmount) || pAmount < 0) {
        showSimpleAlert('خطأ', 'يرجى إدخال مبلغ مدفوع مسبقاً صحيح', 'error');
        return;
      }
      prepaidAmt = pAmount;
    }

    try {
      // إغلاق modal
      setShowFeeModal(false);
      
      // تحديث حالة الدفع المسبق في الطلب (إذا تم تغييرها)
      if (order.is_prepaid !== isPrepaid || (isPrepaid && prepaidAmt !== order.prepaid_amount)) {
        const { error: updateOrderError } = await supabase.functions.invoke('update-order', {
          body: {
            orderId: order.id,
            isPrepaid: isPrepaid,
            prepaidAmount: prepaidAmt,
          },
        });
        if (updateOrderError) {
          console.error('[handleConfirmPickup] Error updating order prepaid status:', updateOrderError);
        }
      }
      
      // تحديث حالة العنصر (استخدام Edge Function لتجاوز RLS)
      console.log('[handleConfirmPickup] Updating order item via Edge Function...', {
        itemId: selectedItemId,
        orderId: order.id,
        driverId: user?.id,
        item_fee: fee,
      });

      const { data: updateItemData, error: itemError } = await supabase.functions.invoke('update-order-item', {
        body: {
          itemId: selectedItemId,
          orderId: order.id,
          driverId: user?.id || '',
          is_picked_up: true,
          picked_up_at: new Date().toISOString(),
          item_fee: fee,
        },
      });

      if (itemError) {
        console.error('[handleMarkAsPickedUp] Error updating item via Edge Function:', itemError);
        throw itemError;
      }

      if (!updateItemData || !updateItemData.success) {
        console.error('[handleMarkAsPickedUp] Edge Function returned error:', updateItemData?.error);
        throw new Error(updateItemData?.error || 'فشل تحديث العنصر');
      }

      console.log('[handleMarkAsPickedUp] Item updated successfully:', updateItemData.item);

      // انتظار قصير للتأكد من تحديث قاعدة البيانات
      await new Promise(resolve => setTimeout(resolve, 200));

      // إعادة تحميل العناصر بعد التحديث (استخدام Edge Function لتجاوز RLS)
      let allItems: any[] | null = null;
      let itemsError: any = null;

      // استخدام Edge Function دائماً لضمان الحصول على أحدث البيانات
      console.log('[handleMarkAsPickedUp] Loading items via Edge Function...');
      if (user?.id && user?.role) {
        try {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-items', {
            body: {
              orderId: order.id,
              userId: user.id,
              userRole: user.role,
            },
          });

          if (edgeError) {
            console.error('[handleMarkAsPickedUp] Error from Edge Function:', edgeError);
            itemsError = edgeError;
          } else if (edgeData?.success && edgeData?.orderItems) {
            allItems = edgeData.orderItems.map((item: any) => ({
              id: item.id,
              is_picked_up: item.is_picked_up,
              item_fee: item.item_fee,
            }));
            itemsError = null;
        console.log('[handleMarkAsPickedUp] Loaded items via Edge Function:', {
          count: allItems.length,
          items: allItems.map(i => ({ id: i.id, is_picked_up: i.is_picked_up })),
        });
        
        // Log detailed item status
        allItems.forEach((item, index) => {
          console.log(`[handleMarkAsPickedUp] Item ${index + 1}:`, {
            id: item.id,
            is_picked_up: item.is_picked_up,
          });
        });
          } else {
            console.error('[handleMarkAsPickedUp] Edge Function returned error:', edgeData?.error);
            itemsError = new Error(edgeData?.error || 'فشل جلب العناصر');
          }
        } catch (edgeErr: any) {
          console.error('[handleMarkAsPickedUp] Exception calling Edge Function:', edgeErr);
          itemsError = edgeErr;
        }
      } else {
        itemsError = new Error('User ID or role not found');
      }

      if (itemsError) {
        console.error('[handleMarkAsPickedUp] Error loading items:', itemsError);
      } else if (allItems && allItems.length > 0) {
        // التحقق من عدد العناصر المستلمة
        const pickedUpCount = allItems.filter(item => item.is_picked_up).length;
        const totalItems = allItems.length;
        const firstPickedUp = pickedUpCount === 1; // أول عنصر يتم استلامه
        const allPickedUp = pickedUpCount === totalItems;

        // تحديث حالة الطلب إلى 'pickedUp' عند استلام أول عنصر
        // نحدث الحالة إذا:
        // 1. تم استلام أول عنصر (firstPickedUp) وكان الطلب في حالة 'accepted' أو 'pending'
        // 2. أو تم استلام عناصر لكن الحالة لم تتحدث بعد
        const condition1 = firstPickedUp && (order.status === 'accepted' || order.status === 'pending');
        const condition2 = pickedUpCount > 0 && order.status !== 'pickedUp' && order.status !== 'inTransit' && order.status !== 'completed' && order.status !== 'cancelled';
        const shouldUpdateStatus = condition1 || condition2;

        console.log('[handleMarkAsPickedUp] Items status:', {
          pickedUpCount,
          totalItems,
          firstPickedUp,
          allPickedUp,
          currentOrderStatus: order.status,
          items: allItems.map(i => ({ id: i.id, is_picked_up: i.is_picked_up })),
        });
        
        console.log('[handleMarkAsPickedUp] Status update conditions:', {
          condition1,
          condition2,
          shouldUpdateStatus,
          firstPickedUp,
          pickedUpCount,
          currentStatus: order.status,
        });

        if (shouldUpdateStatus) {
          console.log('[handleMarkAsPickedUp] Updating order status to pickedUp...', {
            firstPickedUp,
            pickedUpCount,
            currentStatus: order.status,
          });
          
          const { data: updateData, error: updateError } = await supabase.functions.invoke('update-order', {
            body: {
              orderId: order.id,
              status: 'pickedUp',
            },
          });

          if (updateError) {
            console.error('[handleMarkAsPickedUp] Error updating order status:', updateError);
            throw updateError;
          }

          if (!updateData || !updateData.success) {
            console.error('[handleMarkAsPickedUp] Edge Function returned error:', updateData?.error);
            throw new Error(updateData?.error || 'فشل تحديث حالة الطلب');
          }

          console.log('[handleMarkAsPickedUp] Order status updated to pickedUp:', updateData.order);

          // تحديث حالة الطلب محلياً
          setOrder(prev => prev ? { ...prev, status: 'pickedUp' } : null);

          // إرسال إشعار للعميل (فقط عند استلام أول عنصر)
          if (firstPickedUp && order.customer_id) {
            console.log('[handleMarkAsPickedUp] Sending notification to customer...', {
              customerId: order.customer_id,
              orderId: order.id,
              driverId: user?.id,
            });
            
            try {
              const notificationResult = await createNotification({
                user_id: order.customer_id,
                title: 'تم استلام الطلب',
                message: 'تم استلام طلبك من قبل السائق وهو في الطريق إليك.',
                type: 'info',
                order_id: order.id,
              });
              
              if (notificationResult.success) {
                console.log('[handleMarkAsPickedUp] ✅ Notification sent successfully');
                
                // التحقق من أن الإشعار تم إنشاؤه في قاعدة البيانات (باستخدام Edge Function)
                setTimeout(async () => {
                  try {
                    const { data: checkData, error: checkError } = await supabase.functions.invoke('get-notifications', {
                      body: { 
                        user_id: order.customer_id, 
                        limit: 10 
                      },
                    });

                    if (!checkError && checkData?.notifications) {
                      const notification = checkData.notifications.find(
                        (n: any) => n.order_id === order.id && n.title === 'تم استلام الطلب'
                      );
                      
                      if (notification) {
                        console.log('[handleMarkAsPickedUp] ✅ Verified notification in database:', {
                          id: notification.id,
                          title: notification.title,
                          is_read: notification.is_read,
                        });
                      } else {
                        console.warn('[handleMarkAsPickedUp] ⚠️ Notification not found in recent notifications (may be delayed)');
                      }
                    } else {
                      console.warn('[handleMarkAsPickedUp] ⚠️ Could not verify notification (check skipped)');
                    }
                  } catch (checkErr) {
                    console.warn('[handleMarkAsPickedUp] ⚠️ Error verifying notification:', checkErr);
                  }
                }, 1500);
              } else {
                console.error('[handleMarkAsPickedUp] ❌ Failed to send notification:', {
                  error: notificationResult.error,
                  errorMessage: notificationResult.error?.message,
                  customerId: order.customer_id,
                  orderId: order.id,
                });
              }
            } catch (notifError: any) {
              console.error('[handleMarkAsPickedUp] ❌ Exception while sending notification:', {
                error: notifError,
                errorMessage: notifError?.message,
                customerId: order.customer_id,
                orderId: order.id,
              });
            }
          }
        }
      }

      // إعادة تحميل العناصر والطلب بعد التحديث
      await loadOrderItems();
      await loadOrder(); // إعادة تحميل الطلب لتحديث الحالة

      showSimpleAlert('نجح', 'تم تحديث حالة الاستلام والمبلغ', 'success');
    } catch (error: any) {
      console.error('[handleConfirmPickup] Error:', error);
      showSimpleAlert('خطأ', error.message || 'فشل تحديث الحالة', 'error');
    } finally {
      // تنظيف الحالة
      setItemFee('');
      setPrepaidAmount('');
      setIsPrepaid(false);
      setSelectedItemId(null);
    }
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

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>جارٍ تحميل بيانات الرحلة...</Text>
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
        <Text style={styles.title}>متابعة الرحلة</Text>
      </View>

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
            <Text style={styles.mapPlaceholderText}>جارٍ تحميل الخريطة...</Text>
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
              <Text style={styles.emptyItemsText}>لا توجد طلبات في هذه الرحلة</Text>
            </View>
          ) : (
            orderItems.map((item, index) => (
              <View key={item.id} style={styles.orderItemCard}>
                <View style={styles.orderItemHeader}>
                  <View style={styles.orderItemNumber}>
                    <Text style={styles.orderItemNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.orderItemInfo}>
                    <View style={styles.orderItemTopRow}>
                      <View style={styles.orderItemAddressContainer}>
                        <Ionicons name="location" size={16} color="#007AFF" style={styles.addressIcon} />
                        <Text style={styles.orderItemAddress}>{item.address}</Text>
                      </View>
                      <View style={styles.orderItemRightSection}>
                        {item.item_fee !== null && item.item_fee !== undefined ? (
                          <View style={styles.itemFeeBadge}>
                            <Ionicons name="cash" size={14} color="#34C759" />
                            <Text style={styles.itemFeeText}>
                              {item.item_fee.toFixed(2)} ج.م
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.itemFeeBadge, { backgroundColor: '#FF950015' }]}>
                            <Ionicons name="cash-outline" size={14} color="#FF9500" />
                            <Text style={[styles.itemFeeText, { color: '#FF9500' }]}>
                              لم يُحدد
                            </Text>
                          </View>
                        )}
                        {item.is_picked_up ? (
                          <View style={[styles.statusBadge, { backgroundColor: '#34C75920' }]}>
                            <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                            <Text style={[styles.statusText, { color: '#34C759' }]}>
                              {index === orderItems.length - 1 ? 'تم التسليم' : 'تم الاستلام'}
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.pickupButton}
                            onPress={() => handleMarkAsPickedUp(item.id)}
                          >
                            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                            <Text style={styles.pickupButtonText}>
                              {index === orderItems.length - 1 ? 'تم التسليم' : 'تم الاستلام'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {item.description && (
                      <Text style={styles.orderItemDescription}>{item.description}</Text>
                    )}
                    <View style={styles.orderItemDetails}>
                      {order?.customer?.phone && (
                        <TouchableOpacity
                          style={styles.detailRow}
                          onPress={() => {
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              window.open(`tel:${order.customer.phone}`, '_self');
                            } else {
                              // For native, you might want to use Linking
                              // Linking.openURL(`tel:${order.customer.phone}`);
                            }
                          }}
                        >
                          <Ionicons name="call" size={16} color="#007AFF" />
                          <Text style={[styles.detailText, styles.phoneText]}>
                            {order.customer.phone}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
          
          {/* قسم المجموع الكلي */}
          {order && orderItems.length > 0 && (
            <View style={styles.totalSummaryCard}>
              <View style={styles.totalSummaryHeader}>
                <Ionicons name="receipt" size={20} color="#007AFF" />
                <Text style={styles.totalSummaryTitle}>ملخص المبلغ</Text>
              </View>
              <View style={styles.totalSummaryContent}>
                {(() => {
                  const totalItemsFee = orderItems
                    .filter(item => item.item_fee !== null && item.item_fee !== undefined)
                    .reduce((sum, item) => sum + (item.item_fee || 0), 0);
                  const itemsWithFee = orderItems.filter(item => item.item_fee !== null && item.item_fee !== undefined).length;
                  
                  return (
                    <>
                      <View style={styles.totalSummaryRow}>
                        <Text style={styles.totalSummaryLabel}>مبلغ الطلبات ({itemsWithFee}/{orderItems.length}):</Text>
                        <Text style={styles.totalSummaryValue}>
                          {totalItemsFee.toFixed(2)} جنيه
                        </Text>
                      </View>
                      {order.is_prepaid && order.prepaid_amount && (
                        <View style={styles.totalSummaryRow}>
                          <Text style={styles.totalSummaryLabel}>مدفوع مسبقاً:</Text>
                          <Text style={[styles.totalSummaryValue, { color: '#34C759' }]}>
                            -{order.prepaid_amount.toFixed(2)} جنيه
                          </Text>
                        </View>
                      )}
                      {/* يمكن إضافة مبلغ الرحلة هنا لاحقاً */}
                      <View style={styles.totalSummaryDivider} />
                      <View style={styles.totalSummaryRow}>
                        <Text style={styles.totalSummaryTotalLabel}>المجموع الكلي:</Text>
                        <Text style={styles.totalSummaryTotalValue}>
                          {Math.max(0, totalItemsFee - (order.prepaid_amount || 0)).toFixed(2)} جنيه
                        </Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Modal لإدخال المبلغ */}
      <Modal
        visible={showFeeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFeeModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إدخال المبلغ</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowFeeModal(false);
                  setItemFee('');
                  setPrepaidAmount('');
                  setIsPrepaid(false);
                  setSelectedItemId(null);
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {selectedItemId && (
                <View style={styles.modalItemInfo}>
                  <Text style={styles.modalItemLabel}>عنوان التوصيل:</Text>
                  <Text style={styles.modalItemAddress}>
                    {orderItems.find(i => i.id === selectedItemId)?.address || ''}
                  </Text>
                </View>
              )}

              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>المبلغ (جنيه):</Text>
                <TextInput
                  style={styles.modalInput}
                  value={itemFee}
                  onChangeText={setItemFee}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  autoFocus={true}
                />
              </View>

              <TouchableOpacity
                style={styles.modalCheckbox}
                onPress={() => setIsPrepaid(!isPrepaid)}
              >
                <Ionicons
                  name={isPrepaid ? 'checkbox' : 'checkbox-outline'}
                  size={24}
                  color={isPrepaid ? '#34C759' : '#666'}
                />
                <Text style={styles.modalCheckboxLabel}>
                  العميل دفع المبلغ مسبقاً للمحل/المزود
                </Text>
              </TouchableOpacity>

              {isPrepaid && (
                <>
                  <View style={styles.modalInputContainer}>
                    <Text style={styles.modalInputLabel}>المبلغ المدفوع مسبقاً (جنيه):</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={prepaidAmount}
                      onChangeText={setPrepaidAmount}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.modalPrepaidNote}>
                    <Ionicons name="information-circle" size={16} color="#007AFF" />
                    <Text style={styles.modalPrepaidNoteText}>
                      سيتم خصم المبلغ المدفوع مسبقاً من المجموع الكلي
                    </Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowFeeModal(false);
                  setItemFee('');
                  setPrepaidAmount('');
                  setIsPrepaid(false);
                  setSelectedItemId(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmPickup}
              >
                <Text style={styles.modalButtonConfirmText}>تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  orderItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  orderItemAddressContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  orderItemRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemFeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C75915',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemFeeText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#34C759',
  },
  addressIcon: {
    marginTop: 2,
  },
  orderItemAddress: {
    flex: 1,
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 20,
  },
  orderItemDescription: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  orderItemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: responsive.getResponsiveFontSize(13),
    color: '#1a1a1a',
    fontWeight: '500',
  },
  phoneText: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  totalSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  totalSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  totalSummaryTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  totalSummaryContent: {
    gap: 8,
  },
  totalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalSummaryLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
  },
  totalSummaryValue: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalSummaryDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 4,
  },
  totalSummaryTotalLabel: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  totalSummaryTotalValue: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#34C759',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalBody: {
    gap: 16,
  },
  modalItemInfo: {
    marginBottom: 8,
  },
  modalItemLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
    marginBottom: 4,
  },
  modalItemAddress: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#1a1a1a',
    fontWeight: '500',
  },
  modalInputContainer: {
    marginBottom: 8,
  },
  modalInputLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: responsive.getResponsiveFontSize(16),
    backgroundColor: '#f9f9f9',
  },
  modalCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modalCheckboxLabel: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#1a1a1a',
    flex: 1,
  },
  modalPrepaidNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  modalPrepaidNoteText: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#007AFF',
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonCancelText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#666',
  },
  modalButtonConfirm: {
    backgroundColor: '#34C759',
  },
  modalButtonConfirmText: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#fff',
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
  pickupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pickupButtonText: {
    color: '#fff',
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


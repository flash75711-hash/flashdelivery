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
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, geocodeAddress } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { showSimpleAlert, showToast } from '@/lib/alert';
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
  
  // State for inline item editing (per item)
  const [itemStates, setItemStates] = useState<Record<string, { fee: string; isPrepaid: boolean; showInput: boolean }>>({});
  
  // State for payment collection modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paidAmount, setPaidAmount] = useState<string>('');
  
  // Bottom Sheet Animation
  const bottomSheetY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  
  useEffect(() => {
    console.log('🔄 [TrackTripScreen] Component mounted/updated:', {
      orderId,
      userId: user?.id,
      hasUser: !!user,
      params: params,
    });
    
    // إذا لم يكن هناك orderId، لا نفعل شيء
    if (!orderId) {
      console.warn('⚠️ [TrackTripScreen] No orderId provided');
      setLoading(false);
      return;
    }
    
    // إذا لم يكن هناك user بعد، ننتظر قليلاً ثم نحاول مرة أخرى
    if (!user?.id) {
      console.log('⏳ [TrackTripScreen] Waiting for user to load...');
      // إعادة المحاولة بعد 500ms
      const timeoutId = setTimeout(() => {
        if (user?.id && orderId) {
          console.log('✅ [TrackTripScreen] User loaded, retrying...');
          // سيتم إعادة تشغيل useEffect تلقائياً عند تغيير user?.id
        } else {
          console.warn('⚠️ [TrackTripScreen] User still not loaded after timeout');
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    
    // الآن لدينا orderId و user.id، يمكننا تحميل البيانات
    let subscription: any = null;
    let itemsSubscription: any = null;
    
    const loadData = async () => {
      try {
        setLoading(true);
      // التحقق من وجود الطلب في active orders أولاً
        const exists = await verifyOrderExists();
        if (exists) {
          await Promise.all([
            loadOrder(),
            loadOrderItems(),
          ]);
          startLocationTracking();
        } else {
          console.warn('⚠️ [TrackTripScreen] Order not found in active orders, will retry...');
          // إعادة المحاولة بعد تأخير
          setTimeout(async () => {
            await Promise.all([
              loadOrder(),
              loadOrderItems(),
            ]);
            startLocationTracking();
          }, 1000);
        }
      } catch (error) {
        console.error('❌ [TrackTripScreen] Error loading data:', error);
        setLoading(false);
      }
    };
    
    loadData();
      
      // الاشتراك في تحديثات الطلب
    subscription = supabase
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
    itemsSubscription = supabase
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
      if (subscription) {
        subscription.unsubscribe();
      }
      if (itemsSubscription) {
        itemsSubscription.unsubscribe();
    }
    };
  }, [orderId, user?.id]);

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

  // تحديث itemStates عند تحميل orderItems
  useEffect(() => {
    if (orderItems.length > 0 && order) {
      const newStates: Record<string, { fee: string; isPrepaid: boolean; showInput: boolean }> = {};
      orderItems.forEach(item => {
        if (!itemStates[item.id]) {
          newStates[item.id] = {
            fee: item.item_fee?.toString() || '',
            isPrepaid: order.is_prepaid || false,
            showInput: false,
          };
        }
      });
      if (Object.keys(newStates).length > 0) {
        setItemStates(prev => ({ ...prev, ...newStates }));
      }
    }
  }, [orderItems, order?.is_prepaid]);

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
          customer: profile || undefined,
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
                          ? { ...prevItem, latitude: lat ?? undefined, longitude: lon ?? undefined }
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

  const handleArrived = async (itemId: string) => {
    if (!order) {
      showToast('الطلب غير موجود', 'error', 2000);
      return;
    }

    try {
      // إرسال إشعار للعميل بأن السائق وصل
      if (order.customer_id) {
        await createNotification({
          user_id: order.customer_id,
          title: 'وصل السائق',
          message: 'وصل السائق إلى عنوان التوصيل.',
          type: 'info',
          order_id: order.id,
        });
      }
      
      showToast('تم إشعار العميل بالوصول', 'success', 2000);
    } catch (error: any) {
      console.error('[handleArrived] Error:', error);
      showToast('فشل إرسال الإشعار', 'error', 2000);
    }
  };

  const handleCollectPayment = async () => {
    if (!order) {
      showSimpleAlert('خطأ', 'الطلب غير موجود', 'error');
      return;
    }

    const paid = parseFloat(paidAmount);
    if (isNaN(paid) || paid < 0) {
      showSimpleAlert('خطأ', 'يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    try {
      // حساب المبلغ المطلوب
      const pickupItems = orderItems.slice(0, -1);
      const totalItemsFee = pickupItems.reduce((sum, item) => {
        const itemState = itemStates[item.id];
        if (itemState?.fee && !isNaN(parseFloat(itemState.fee))) {
          return sum + parseFloat(itemState.fee);
        }
        if (item.item_fee !== null && item.item_fee !== undefined) {
          return sum + (item.item_fee || 0);
        }
        return sum;
      }, 0);
      const totalDue = Math.max(0, order.total_fee + totalItemsFee - (order.prepaid_amount || 0));
      const change = paid - totalDue;

      console.log('[handleCollectPayment] Payment calculation:', {
        paid,
        totalDue,
        change,
        orderTotalFee: order.total_fee,
        totalItemsFee,
        prepaidAmount: order.prepaid_amount || 0,
        customerId: order.customer_id,
      });

      // إغلاق modal
      setShowPaymentModal(false);

      // تحديث حالة الطلب إلى completed
      const { data: updateData, error: updateError } = await supabase.functions.invoke('update-order', {
        body: {
          orderId: order.id,
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      });

      if (updateError) {
        console.error('[handleCollectPayment] Error updating order status:', updateError);
        throw updateError;
      }

      if (!updateData || !updateData.success) {
        console.error('[handleCollectPayment] Edge Function returned error:', updateData?.error);
        throw new Error(updateData?.error || 'فشل تحديث حالة الطلب');
      }

      // إضافة المبلغ لمحفظة السائق (بعد خصم العمولة)
      let driverWalletData: any = null;
      if (user?.id && order.driver_id === user.id) {
        try {
          console.log(`[handleCollectPayment] Adding ${totalDue.toFixed(2)} to driver wallet:`, {
            driverId: user.id,
            amount: totalDue,
            orderId: order.id,
          });
          
          // إضافة المبلغ لمحفظة السائق باستخدام Edge Function
          const { data, error: driverWalletError } = await supabase.functions.invoke('add-to-driver-wallet', {
            body: {
              driverId: user.id,
              amount: totalDue,
              orderId: order.id,
              description: `تحصيل من طلب #${order.id.substring(0, 8)}`,
            },
          });

          driverWalletData = data;

          if (driverWalletError) {
            console.error('[handleCollectPayment] Error from Edge Function (add-to-driver-wallet):', driverWalletError);
            // لا نوقف العملية إذا فشلت إضافة محفظة السائق
          } else if (driverWalletData?.success) {
            console.log('[handleCollectPayment] ✅ Amount added to driver wallet:', {
              driverAmount: driverWalletData.driverAmount,
              commission: driverWalletData.commission,
              commissionRate: driverWalletData.commissionRate,
            });

            // إرسال إشعار للسائق بإضافة المبلغ للمحفظة
            try {
              await createNotification({
                user_id: user.id,
                title: 'تم إضافة المبلغ للمحفظة',
                message: `تم إضافة ${totalDue.toFixed(2)} جنيه لمحفظتك. الرصيد الحالي: ${driverWalletData.driverAmount?.toFixed(2) || '0.00'} جنيه${driverWalletData.commission ? ` (تم خصم ${driverWalletData.commission.toFixed(2)} جنيه عمولة)` : ''}`,
                type: 'success',
                order_id: order.id,
              });
            } catch (notifError) {
              console.error('[handleCollectPayment] Error sending notification to driver:', notifError);
            }
          }
        } catch (driverWalletError: any) {
          console.error('[handleCollectPayment] Error adding to driver wallet:', driverWalletError);
          // لا نوقف العملية إذا فشلت إضافة محفظة السائق
        }
      }

      // إذا كان هناك باقي، إضافته إلى محفظة العميل
      console.log('[handleCollectPayment] Checking if change should be added to customer wallet:', {
        change,
        hasChange: change > 0,
        hasCustomerId: !!order.customer_id,
        customerId: order.customer_id,
        willAddToWallet: change > 0 && order.customer_id,
      });
      
      if (change > 0 && order.customer_id) {
        console.log('[handleCollectPayment] ✅ Conditions met, proceeding to add to customer wallet');
        try {
          console.log(`[handleCollectPayment] Adding ${change.toFixed(2)} to customer wallet:`, {
            customerId: order.customer_id,
            amount: change,
            orderId: order.id,
          });
          
          // إضافة الباقي إلى محفظة العميل باستخدام Edge Function
          const { data: walletData, error: walletError } = await supabase.functions.invoke('add-to-customer-wallet', {
            body: {
              customerId: order.customer_id,
              amount: change,
              orderId: order.id,
              description: `باقي من طلب #${order.id.substring(0, 8)}`,
            },
          });

          if (walletError) {
            console.error('[handleCollectPayment] Error from Edge Function (add-to-customer-wallet):', walletError);
            // محاولة قراءة error message من response
            try {
              const errorText = await walletError.context?.response?.text?.() || walletError.message;
              console.error('[handleCollectPayment] Error response:', errorText);
            } catch (e) {
              console.error('[handleCollectPayment] Could not read error response:', e);
            }
            throw walletError;
          }

          if (!walletData || !walletData.success) {
            console.error('[handleCollectPayment] Edge Function returned error:', {
              error: walletData?.error,
              details: walletData?.details,
              hint: walletData?.hint,
              code: walletData?.code,
            });
            throw new Error(walletData?.error || 'فشل إضافة المبلغ للمحفظة');
          }

          console.log('[handleCollectPayment] ✅ Amount added to customer wallet:', walletData.walletEntry);
          
          // إرسال إشعار للعميل بالباقي
          await createNotification({
            user_id: order.customer_id,
            title: 'تم التحصيل',
            message: `تم تحصيل المبلغ. تم إضافة ${change.toFixed(2)} جنيه إلى محفظتك كباقي.`,
            type: 'success',
            order_id: order.id,
          });
        } catch (walletError: any) {
          console.error('[handleCollectPayment] Error adding to wallet:', walletError);
          // نرسل إشعار للعميل حتى لو فشلت إضافة المحفظة
          if (order.customer_id) {
            await createNotification({
              user_id: order.customer_id,
              title: 'تم التحصيل',
              message: `تم تحصيل المبلغ. الباقي: ${change.toFixed(2)} جنيه (سيتم إضافته للمحفظة قريباً).`,
              type: 'success',
              order_id: order.id,
            });
          }
        }
      } else {
        console.log('[handleCollectPayment] ⚠️ Skipping customer wallet addition:', {
          reason: !(change > 0) ? 'change <= 0' : !order.customer_id ? 'no customer_id' : 'unknown',
          change,
          customerId: order.customer_id,
        });
        
        if (order.customer_id) {
          // إرسال إشعار عادي للعميل
          await createNotification({
            user_id: order.customer_id,
            title: 'تم التحصيل',
            message: 'تم تحصيل المبلغ بنجاح.',
            type: 'success',
            order_id: order.id,
          });
        }
      }

      // تحديث حالة الطلب محلياً (optimistic update)
      setOrder(prev => prev ? { ...prev, status: 'completed' } : null);

      // بناء رسالة التأكيد
      let successMessage = 'تم التحصيل بنجاح';
      if (totalDue > 0) {
        const driverWalletInfo = driverWalletData?.success 
          ? ` تم إضافة ${totalDue.toFixed(2)} جنيه لمحفظتك${driverWalletData.commission ? ` (بعد خصم ${driverWalletData.commission.toFixed(2)} جنيه عمولة)` : ''}`
          : '';
        const customerWalletInfo = change > 0 
          ? ` تم إضافة ${change.toFixed(2)} جنيه إلى محفظة العميل كباقي`
          : '';
        successMessage = `تم التحصيل بنجاح${driverWalletInfo}${customerWalletInfo}`;
      }

      // إظهار Toast فوراً
      showToast(successMessage, 'success', 2000);
      setPaidAmount('');

      // إعادة تحميل الطلب في الخلفية (بدون انتظار)
      loadOrder().catch(err => console.error('Error reloading order:', err));
    } catch (error: any) {
      console.error('[handleCollectPayment] Error:', error);
      showToast(error.message || 'فشل التحصيل', 'error', 2000);
    }
  };

  // دالة لعرض عنصر واحد
  const renderOrderItem = (item: OrderItem, index: number) => {
    const isDeliveryAddress = index === orderItems.length - 1;
    const itemState = itemStates[item.id] || { 
      fee: item.item_fee?.toString() || '', 
      isPrepaid: order?.is_prepaid || false, 
      showInput: false 
    };
    
    return (
      <View key={item.id} style={[styles.compactOrderItemCard, item.is_picked_up && !isDeliveryAddress ? styles.pickedUpItemCard : null]}>
        {/* العنوان في سطر مستقل */}
        <View style={styles.compactAddressRow}>
          <View style={styles.itemNumberBadge}>
            <Text style={styles.itemNumberText}>{index + 1}</Text>
          </View>
          <Ionicons name="location" size={14} color={isDeliveryAddress ? "#FF9500" : item.is_picked_up ? "#34C759" : "#007AFF"} />
          <View style={styles.itemInfoContainer}>
            {/* اسم/وصف العنصر */}
            {item.description && !isDeliveryAddress && (
              <Text style={[styles.itemDescriptionText, item.is_picked_up && styles.pickedUpDescriptionText]}>
                {item.description}
              </Text>
            )}
            {/* العنوان */}
            <Text style={[styles.compactAddressText, item.is_picked_up && !isDeliveryAddress && styles.pickedUpAddressText]}>
              {item.address}
            </Text>
          </View>
          {isDeliveryAddress && (
            <View style={styles.deliveryBadge}>
              <Text style={styles.deliveryBadgeText}>عنوان التوصيل</Text>
            </View>
          )}
          {item.is_picked_up && !isDeliveryAddress && (
            <View style={styles.pickedUpBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#34C759" />
            </View>
          )}
        </View>
        
        {/* السطر الثاني: إما Toggle + Input + Button للاستلام، أو زرارين للوصول والتسليم */}
        {isDeliveryAddress ? (
          <View style={styles.deliveryActionsRow}>
            {/* زر الاتصال بالعميل */}
            {order?.customer?.phone && (
              <TouchableOpacity
                style={styles.callButton}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined' && order?.customer?.phone) {
                    window.open(`tel:${order.customer.phone}`, '_self');
                  } else if (order?.customer?.phone) {
                    // For native, you might want to use Linking
                    // Linking.openURL(`tel:${order.customer.phone}`);
                  }
                }}
              >
                <Ionicons name="call" size={16} color="#fff" />
                <Text style={styles.callButtonText}>اتصال</Text>
              </TouchableOpacity>
            )}
            
            {item.is_picked_up ? (
              <View style={styles.compactStatusBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.compactStatusText}>تم الوصول</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.arrivedButton}
                onPress={() => handleArrived(item.id)}
              >
                <Ionicons name="location" size={16} color="#fff" />
                <Text style={styles.arrivedButtonText}>تم الوصول</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.compactActionsRow}>
            <View style={styles.compactToggleContainer}>
              <Switch
                value={itemState.isPrepaid}
                onValueChange={(value) => {
                  setItemStates(prev => ({
                    ...prev,
                    [item.id]: { ...itemState, isPrepaid: value, showInput: value }
                  }));
                }}
                trackColor={{ false: '#767577', true: '#34C759' }}
                thumbColor={itemState.isPrepaid ? '#f4f3f4' : '#f4f3f4'}
                disabled={item.is_picked_up}
              />
              <Text style={styles.compactToggleLabel}>دفع للمحل؟</Text>
            </View>
            
            {itemState.showInput && !item.is_picked_up && (
              <TextInput
                style={styles.compactFeeInput}
                value={itemState.fee}
                onChangeText={(text) => {
                  setItemStates(prev => ({
                    ...prev,
                    [item.id]: { ...itemState, fee: text }
                  }));
                }}
                placeholder="المبلغ"
                keyboardType="decimal-pad"
                placeholderTextColor="#999"
              />
            )}
            
            {item.is_picked_up ? (
              <View style={styles.compactStatusBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.compactStatusText}>تم الاستلام</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.compactPickupButton}
                onPress={() => {
                  // استخدام المبلغ المدخل مباشرة (أو 0 إذا لم يتم إدخال مبلغ)
                  const fee = itemState.fee && !isNaN(parseFloat(itemState.fee)) 
                    ? itemState.fee 
                    : '0';
                  handleConfirmPickupWithState(item.id, fee, itemState.isPrepaid);
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.compactPickupButtonText}>تم الاستلام</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // تم إزالة handleMarkAsPickedUp - لم نعد نحتاج Modal

  const handleConfirmPickupWithState = async (itemId: string, fee: string, isPrepaidLocal: boolean) => {
    if (!order) {
      showSimpleAlert('خطأ', 'الطلب غير موجود', 'error');
      return;
    }

    const feeNum = parseFloat(fee);
    if (isNaN(feeNum) || feeNum < 0) {
      showSimpleAlert('خطأ', 'يرجى إدخال مبلغ صحيح للعنصر', 'error');
      return;
    }

    try {
      // تحديث حالة الدفع المسبق في الطلب (إذا تم تغييرها)
      if (order.is_prepaid !== isPrepaidLocal) {
        try {
          const { data: updateData, error: updateOrderError } = await supabase.functions.invoke('update-order', {
            body: {
              orderId: order.id,
              is_prepaid: isPrepaidLocal,
              prepaid_amount: isPrepaidLocal ? feeNum : null,
            },
          });
          if (updateOrderError) {
            console.error('[handleConfirmPickupWithState] Error updating order prepaid status:', updateOrderError);
            // لا نرمي الخطأ هنا - نستمر في تحديث العنصر حتى لو فشل تحديث حالة الدفع المسبق
          } else if (updateData?.success) {
            console.log('[handleConfirmPickupWithState] Order prepaid status updated successfully');
          }
        } catch (prepaidError: any) {
          console.error('[handleConfirmPickupWithState] Exception updating prepaid status:', prepaidError);
          // لا نرمي الخطأ هنا - نستمر في تحديث العنصر
        }
      }
      
      // تحديث حالة العنصر
      console.log('[handleConfirmPickupWithState] Updating order item via Edge Function...', {
        itemId,
        orderId: order.id,
        driverId: user?.id,
        item_fee: feeNum,
      });

      const { data: updateItemData, error: itemError } = await supabase.functions.invoke('update-order-item', {
        body: {
          itemId,
          orderId: order.id,
          driverId: user?.id || '',
          is_picked_up: true,
          picked_up_at: new Date().toISOString(),
          item_fee: feeNum,
        },
      });

      if (itemError) {
        console.error('[handleConfirmPickupWithState] Error updating item:', itemError);
        throw itemError;
      }

      if (!updateItemData || !updateItemData.success) {
        console.error('[handleConfirmPickupWithState] Edge Function returned error:', updateItemData?.error);
        throw new Error(updateItemData?.error || 'فشل تحديث العنصر');
      }

      console.log('[handleConfirmPickupWithState] Item updated successfully:', updateItemData.item);

      // تحديث فوري للحالة محلياً (optimistic update)
      setOrderItems(prevItems => 
        prevItems.map(prevItem => 
          prevItem.id === itemId 
            ? { ...prevItem, is_picked_up: true, item_fee: feeNum, picked_up_at: new Date().toISOString() }
            : prevItem
        )
      );

      // إظهار Toast سريع
      showToast('تم الاستلام بنجاح', 'success', 1500);

      // إعادة تحميل العناصر في الخلفية (بدون انتظار)
      let allItems: any[] | null = null;
      if (user?.id && user?.role) {
        try {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-order-items', {
            body: {
              orderId: order.id,
              userId: user.id,
              userRole: user.role,
            },
          });

          if (!edgeError && edgeData?.success && edgeData?.orderItems) {
            allItems = edgeData.orderItems.map((item: any) => ({
              id: item.id,
              is_picked_up: item.is_picked_up,
              item_fee: item.item_fee,
            }));
          }
        } catch (edgeErr) {
          console.error('[handleConfirmPickupWithState] Exception calling Edge Function:', edgeErr);
        }
      }

      if (allItems && allItems.length > 0) {
        const pickedUpCount = allItems.filter(item => item.is_picked_up).length;
        const totalItems = allItems.length;
        const firstPickedUp = pickedUpCount === 1;
        const condition1 = firstPickedUp && (order.status === 'accepted' || order.status === 'pending');
        const condition2 = pickedUpCount > 0 && order.status !== 'pickedUp' && order.status !== 'inTransit' && order.status !== 'completed' && order.status !== 'cancelled';
        const shouldUpdateStatus = condition1 || condition2;

        if (shouldUpdateStatus) {
          const { data: updateData, error: updateError } = await supabase.functions.invoke('update-order', {
            body: {
              orderId: order.id,
              status: 'pickedUp',
            },
          });

          if (!updateError && updateData?.success) {
            setOrder(prev => prev ? { ...prev, status: 'pickedUp' } : null);

            // إرسال إشعار للعميل
            if (firstPickedUp && order.customer_id) {
              try {
                await createNotification({
                  user_id: order.customer_id,
                  title: 'تم استلام الطلب',
                  message: 'تم استلام طلبك من قبل السائق وهو في الطريق إليك.',
                  type: 'info',
                  order_id: order.id,
                });
              } catch (notifError) {
                console.error('[handleConfirmPickupWithState] Error sending notification:', notifError);
              }
            }
          }
        }
      }

      // إعادة تحميل العناصر والطلب في الخلفية (بدون انتظار)
      loadOrderItems().catch(err => console.error('Error reloading items:', err));
      loadOrder().catch(err => console.error('Error reloading order:', err));
    } catch (error: any) {
      console.error('[handleConfirmPickupWithState] Error:', error);
      showSimpleAlert('خطأ', error.message || 'فشل تحديث الحالة', 'error');
    }
  };

  // تم إزالة handleConfirmPickup - لم نعد نحتاج Modal

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
          <iframe
            srcDoc={mapHtml}
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
          <View style={styles.bottomSheetHeader}>
          <Text style={styles.bottomSheetTitle}>
            {orderItems.length > 0 ? `الطلبات (${orderItems.length})` : 'الطلبات'}
          </Text>
            {orderItems.length > 0 && (
              <View style={styles.itemsCounterContainer}>
                <View style={styles.itemsCounterBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                  <Text style={styles.itemsCounterText}>
                    {orderItems.filter(item => item.is_picked_up && item.item_index !== orderItems.length - 1).length} مستلم
                  </Text>
                </View>
                <View style={[styles.itemsCounterBadge, { backgroundColor: '#FF950020' }]}>
                  <Ionicons name="time-outline" size={14} color="#FF9500" />
                  <Text style={[styles.itemsCounterText, { color: '#FF9500' }]}>
                    {orderItems.filter(item => !item.is_picked_up && item.item_index !== orderItems.length - 1).length} متبقي
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <ScrollView style={styles.bottomSheetContent} showsVerticalScrollIndicator={false}>
          {orderItems.length === 0 ? (
            <View style={styles.emptyItemsContainer}>
              <Ionicons name="cube-outline" size={48} color="#999" />
              <Text style={styles.emptyItemsText}>لا توجد طلبات في هذه الرحلة</Text>
            </View>
          ) : (
            <>
              {/* عرض العناصر غير المستلمة أولاً */}
              {orderItems.filter(item => !item.is_picked_up && item.item_index !== orderItems.length - 1).length > 0 && (
                <View style={styles.itemsSection}>
                  <View style={styles.itemsSectionHeader}>
                    <Ionicons name="time-outline" size={18} color="#FF9500" />
                    <Text style={styles.itemsSectionTitle}>
                      العناصر المتبقية ({orderItems.filter(item => !item.is_picked_up && item.item_index !== orderItems.length - 1).length})
                    </Text>
                  </View>
                  {orderItems
                    .filter(item => !item.is_picked_up && item.item_index !== orderItems.length - 1)
                    .map((item, index) => {
                      const originalIndex = orderItems.findIndex(oi => oi.id === item.id);
                      return renderOrderItem(item, originalIndex);
                    })}
                </View>
              )}

              {/* عرض العناصر المستلمة */}
              {orderItems.filter(item => item.is_picked_up && item.item_index !== orderItems.length - 1).length > 0 && (
                <View style={styles.itemsSection}>
                  <View style={styles.itemsSectionHeader}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={styles.itemsSectionTitle}>
                      العناصر المستلمة ({orderItems.filter(item => item.is_picked_up && item.item_index !== orderItems.length - 1).length})
                    </Text>
                  </View>
                  {orderItems
                    .filter(item => item.is_picked_up && item.item_index !== orderItems.length - 1)
                    .map((item, index) => {
                      const originalIndex = orderItems.findIndex(oi => oi.id === item.id);
                      return renderOrderItem(item, originalIndex);
                    })}
                    </View>
              )}

              {/* عرض عنوان التوصيل (آخر عنصر) */}
              {orderItems.length > 0 && orderItems[orderItems.length - 1] && (() => {
                const deliveryItem = orderItems[orderItems.length - 1];
                const originalIndex = orderItems.length - 1;
                return (
                  <View style={styles.itemsSection}>
                    <View style={styles.itemsSectionHeader}>
                      <Ionicons name="location" size={18} color="#FF9500" />
                      <Text style={styles.itemsSectionTitle}>عنوان التوصيل</Text>
                    </View>
                    {renderOrderItem(deliveryItem, originalIndex)}
                  </View>
                );
              })()}
            </>
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
                  // المبالغ التي دفعها السائق (استثناء آخر عنصر لأنه عنوان التوصيل)
                  const pickupItems = orderItems.slice(0, -1);
                  
                  // حساب المبالغ من orderItems (المحفوظة) + itemStates (المدخلة حديثاً)
                  const totalItemsFee = pickupItems.reduce((sum, item) => {
                    // أولاً: استخدام المبلغ من itemStates إذا كان موجوداً وصحيحاً
                    const itemState = itemStates[item.id];
                    if (itemState?.fee && !isNaN(parseFloat(itemState.fee))) {
                      return sum + parseFloat(itemState.fee);
                    }
                    // ثانياً: استخدام المبلغ من orderItems إذا كان موجوداً
                    if (item.item_fee !== null && item.item_fee !== undefined) {
                      return sum + (item.item_fee || 0);
                    }
                    return sum;
                  }, 0);
                  
                  // عدد العناصر التي لها مبلغ (من orderItems أو itemStates)
                  const itemsWithFee = pickupItems.filter(item => {
                    const itemState = itemStates[item.id];
                    const hasStateFee = itemState?.fee && !isNaN(parseFloat(itemState.fee));
                    const hasItemFee = item.item_fee !== null && item.item_fee !== undefined;
                    return hasStateFee || hasItemFee;
                  }).length;
                  
                  return (
                    <>
                      {/* سعر الرحلة */}
                      <View style={styles.totalSummaryRow}>
                        <View style={styles.totalSummaryLabelContainer}>
                          <Ionicons name="car" size={16} color="#007AFF" />
                          <Text style={[styles.totalSummaryLabel, { color: '#007AFF' }]}>سعر الرحلة:</Text>
                        </View>
                        <Text style={[styles.totalSummaryValue, { color: '#007AFF', fontWeight: 'bold' }]}>
                          {order.total_fee.toFixed(2)} جنيه
                        </Text>
                      </View>
                      
                      {/* المبالغ التي دفعها السائق */}
                      <View style={styles.totalSummaryRow}>
                        <View style={styles.totalSummaryLabelContainer}>
                          <Ionicons name="cash" size={16} color="#FF9500" />
                          <Text style={[styles.totalSummaryLabel, { color: '#FF9500' }]}>
                            المبالغ المدفوعة ({itemsWithFee}/{pickupItems.length}):
                          </Text>
                        </View>
                        <Text style={[styles.totalSummaryValue, { color: '#FF9500', fontWeight: 'bold' }]}>
                          {totalItemsFee.toFixed(2)} جنيه
                        </Text>
                      </View>
                      
                      {order.is_prepaid && order.prepaid_amount && (
                        <View style={styles.totalSummaryRow}>
                          <View style={styles.totalSummaryLabelContainer}>
                            <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                            <Text style={[styles.totalSummaryLabel, { color: '#34C759' }]}>مدفوع مسبقاً:</Text>
                          </View>
                          <Text style={[styles.totalSummaryValue, { color: '#34C759', fontWeight: 'bold' }]}>
                            -{order.prepaid_amount.toFixed(2)} جنيه
                          </Text>
                        </View>
                      )}
                      
                      <View style={styles.totalSummaryDivider} />
                      <View style={styles.totalSummaryRow}>
                        <Text style={styles.totalSummaryTotalLabel}>المجموع الكلي المستحق:</Text>
                        <Text style={styles.totalSummaryTotalValue}>
                          {Math.max(0, order.total_fee + totalItemsFee - (order.prepaid_amount || 0)).toFixed(2)} جنيه
                        </Text>
                      </View>
                      
                      {/* زر تم التحصيل */}
                      {order.status !== 'completed' && (
                    <TouchableOpacity
                          style={styles.collectPaymentButton}
                          onPress={() => {
                            const totalDue = Math.max(0, order.total_fee + totalItemsFee - (order.prepaid_amount || 0));
                            setPaidAmount(totalDue.toFixed(2));
                            setShowPaymentModal(true);
                          }}
                    >
                          <Ionicons name="cash" size={18} color="#fff" />
                          <Text style={styles.collectPaymentButtonText}>تم التحصيل</Text>
                    </TouchableOpacity>
                  )}
                    </>
                  );
                })()}
                </View>
              </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Modal للتحصيل */}
      <Modal
        visible={showPaymentModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تحصيل المبلغ</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowPaymentModal(false);
                  setPaidAmount('');
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {(() => {
                const pickupItems = orderItems.slice(0, -1);
                const totalItemsFee = pickupItems.reduce((sum, item) => {
                  const itemState = itemStates[item.id];
                  if (itemState?.fee && !isNaN(parseFloat(itemState.fee))) {
                    return sum + parseFloat(itemState.fee);
                  }
                  if (item.item_fee !== null && item.item_fee !== undefined) {
                    return sum + (item.item_fee || 0);
                  }
                  return sum;
                }, 0);
                const totalDue = Math.max(0, (order?.total_fee || 0) + totalItemsFee - (order?.prepaid_amount || 0));
                const paid = parseFloat(paidAmount) || 0;
                const change = paid - totalDue;
                
                return (
                  <>
                    <View style={styles.modalInputContainer}>
                      <Text style={styles.modalInputLabel}>المبلغ المطلوب:</Text>
                      <Text style={[styles.modalInput, { backgroundColor: '#f0f0f0', color: '#1a1a1a' }]}>
                        {totalDue.toFixed(2)} جنيه
                      </Text>
                    </View>

                    <View style={styles.modalInputContainer}>
                      <Text style={styles.modalInputLabel}>المبلغ المدفوع:</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={paidAmount}
                        onChangeText={setPaidAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        autoFocus={true}
                      />
                    </View>

                    {paid > 0 && (
                      <>
                        {change > 0 ? (
                          <View style={[styles.modalPrepaidNote, { backgroundColor: '#E8F5E9' }]}>
                            <Ionicons name="wallet" size={16} color="#34C759" />
                            <Text style={[styles.modalPrepaidNoteText, { color: '#34C759' }]}>
                              الباقي ({change.toFixed(2)} جنيه) سيتم إضافته إلى محفظة العميل
                            </Text>
                          </View>
                        ) : change < 0 ? (
                          <View style={[styles.modalPrepaidNote, { backgroundColor: '#FFEBEE' }]}>
                            <Ionicons name="alert-circle" size={16} color="#FF3B30" />
                            <Text style={[styles.modalPrepaidNoteText, { color: '#FF3B30' }]}>
                              المبلغ المدفوع أقل من المطلوب بمقدار {Math.abs(change).toFixed(2)} جنيه
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.modalPrepaidNote, { backgroundColor: '#E3F2FD' }]}>
                            <Ionicons name="checkmark-circle" size={16} color="#007AFF" />
                            <Text style={[styles.modalPrepaidNoteText, { color: '#007AFF' }]}>
                              المبلغ المدفوع يساوي المبلغ المطلوب تماماً
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowPaymentModal(false);
                  setPaidAmount('');
                }}
              >
                <Text style={styles.modalButtonCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleCollectPayment}
              >
                <Text style={styles.modalButtonConfirmText}>تأكيد التحصيل</Text>
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
    padding: 12,
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
  // Compact Order Item Card Styles
  compactOrderItemCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    }),
  },
  compactAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  itemInfoContainer: {
    flex: 1,
    marginLeft: 4,
  },
  itemDescriptionText: {
    fontSize: responsive.getResponsiveFontSize(15),
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  pickedUpDescriptionText: {
    color: '#34C759',
    textDecorationLine: 'line-through',
  },
  compactAddressText: {
    fontSize: responsive.getResponsiveFontSize(13),
    fontWeight: '500',
    color: '#666',
    lineHeight: 18,
  },
  compactActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  compactToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactToggleLabel: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  compactFeeInput: {
    flex: 1,
    minWidth: 80,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: responsive.getResponsiveFontSize(12),
    backgroundColor: '#fff',
    color: '#1a1a1a',
  },
  compactPickupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  compactPickupButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(11),
    fontWeight: '600',
  },
  compactStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C75920',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  compactStatusText: {
    fontSize: responsive.getResponsiveFontSize(11),
    fontWeight: '600',
    color: '#34C759',
  },
  // Delivery Address Styles
  deliveryBadge: {
    backgroundColor: '#FF950020',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  deliveryBadgeText: {
    fontSize: responsive.getResponsiveFontSize(10),
    fontWeight: '600',
    color: '#FF9500',
  },
  deliveryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  arrivedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  arrivedButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(11),
    fontWeight: '600',
  },
  deliveredButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deliveredButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(11),
    fontWeight: '600',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  callButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(11),
    fontWeight: '600',
  },
  collectPaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#34C759',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    ...createShadowStyle({
      shadowColor: '#34C759',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    }),
  },
  collectPaymentButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: 'bold',
  },
  totalSummaryLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  itemsCounterContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  itemsCounterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C75920',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  itemsCounterText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#34C759',
  },
  itemsSection: {
    marginBottom: 16,
  },
  itemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  itemsSectionTitle: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pickedUpItemCard: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  pickedUpAddressText: {
    color: '#34C759',
    textDecorationLine: 'line-through',
  },
  pickedUpBadge: {
    marginLeft: 'auto',
  },
  itemNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumberText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
    color: '#fff',
  },
});


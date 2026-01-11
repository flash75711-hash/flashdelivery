import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import responsive, { createShadowStyle } from '@/utils/responsive';
import { showSimpleAlert } from '@/lib/alert';
import OrderSearchCountdown from '@/components/OrderSearchCountdown';

interface Order {
  id: string;
  customer_id: string;
  driver_id?: string | null;
  status: string;
  order_type?: string;
  items?: any;
  package_description?: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  expires_at?: string | null;
  created_by_role?: 'customer' | 'driver' | 'admin';
  customer?: {
    full_name?: string;
    phone?: string;
  };
}

export default function DriverTripsScreen() {
  const { user } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();
  const isLoadingOrdersRef = useRef(false);
  const locallyAcceptedOrdersRef = useRef<Order[]>([]); // حفظ الطلبات المقبولة محلياً
  
  const tabBarBottomPadding = Platform.OS === 'web' ? responsive.getTabBarBottomPadding() : 0;
  const styles = getStyles(tabBarBottomPadding);
  
  useEffect(() => {
    if (user) {
      console.log('🔄 [trips] useEffect triggered:', {
        userId: user.id,
        userRole: user.role,
      });
      
      // تنظيف الـ state المحلي عند تحميل الصفحة
      // هذا يضمن أن الـ state متزامن مع قاعدة البيانات
      setActiveOrders([]);
      setAvailableOrders([]);
      locallyAcceptedOrdersRef.current = []; // تنظيف الطلبات المقبولة محلياً
      
      loadOrders();
      
      // الاشتراك في تحديثات الطلبات
      const subscription = supabase
        .channel(`driver_orders_${user.id}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
          },
          (payload) => {
            console.log('🔄 [trips] Realtime event received:', {
              event: payload.eventType,
              order_id: payload.new?.id || payload.old?.id,
              status: payload.new?.status,
              driver_id: payload.new?.driver_id,
            });
            loadOrders();
          }
        )
        .subscribe((status) => {
          console.log('🔄 [trips] Subscription status:', status);
        });
      
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const loadOrders = async () => {
    if (!user) return;
    
    // منع الاستدعاءات المتكررة
    if (isLoadingOrdersRef.current) {
      console.log('📊 [loadOrders] Already loading, skipping...');
      return;
    }
    
    try {
      isLoadingOrdersRef.current = true;
      setLoading(true);
      
      // جلب الطلبات النشطة (مقبولة من هذا السائق) - استخدام نفس النهج الذي يستخدمه useMyOrders
      console.log('🔍 [loadOrders] جلب الطلبات النشطة للسائق:', {
        userId: user.id,
        userRole: user.role,
      });
      
      // التحقق من session و auth.uid()
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      console.log('🔐 [loadOrders] Auth check:', {
        userId: user.id,
        authUserId: authUser?.id,
        sessionUserId: currentSession?.user?.id,
        sessionExists: !!currentSession,
        authUserExists: !!authUser,
        match: user.id === authUser?.id && user.id === currentSession?.user?.id,
      });
      
      // تعريف المتغيرات
      let allDriverOrders: any[] | null = null;
      let activeError: any = null;
      
      // إذا لم يكن هناك session، نحاول استخدام Edge Function لتجاوز RLS
      if (!currentSession || !authUser) {
        console.warn('⚠️ [loadOrders] No active session, using Edge Function to bypass RLS...');
        
        try {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-driver-orders', {
            body: {
              driverId: user.id,
            },
          });

          if (!edgeError && edgeData?.success && edgeData?.orders) {
            console.log('✅ [loadOrders] Orders loaded via Edge Function:', edgeData.orders.length);
            allDriverOrders = edgeData.orders;
            activeError = null;
          } else {
            console.error('❌ [loadOrders] Edge Function failed:', edgeError);
            // نستمر مع الاستعلام العادي
          }
        } catch (edgeErr) {
          console.error('❌ [loadOrders] Edge Function exception:', edgeErr);
          // نستمر مع الاستعلام العادي
        }
      }
      
      // إذا لم نستخدم Edge Function، نستخدم الاستعلام العادي
      if (!allDriverOrders) {
        // استخدام استعلام بسيط مثل useMyOrders (بدون filter على status)
        // ثم تصفية محلياً للطلبات النشطة فقط
        console.log('🔍 [loadOrders] Executing query for driver:', user.id);
        
        const { data: driverOrders, error: queryError } = await supabase
          .from('orders')
          .select('id, status, order_type, items, pickup_address, delivery_address, total_fee, created_at, expires_at, customer_id, driver_id, created_by_role, search_status')
          .eq('driver_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        
        allDriverOrders = driverOrders;
        activeError = queryError;
      }

      console.log('📊 [loadOrders] Query result:', {
        hasData: !!allDriverOrders,
        dataLength: allDriverOrders?.length || 0,
        hasError: !!activeError,
        errorCode: activeError?.code,
        errorMessage: activeError?.message,
        errorDetails: activeError?.details,
        errorHint: activeError?.hint,
        firstOrder: allDriverOrders?.[0] ? {
          id: allDriverOrders[0].id,
          status: allDriverOrders[0].status,
          driver_id: allDriverOrders[0].driver_id,
        } : null,
      });

      // تصفية محلياً للطلبات النشطة فقط
      let activeData = (allDriverOrders || []).filter(order => 
        ['accepted', 'pickedUp', 'inTransit'].includes(order.status)
      );

      console.log('🔍 [loadOrders] After filtering for active status:', {
        totalOrders: allDriverOrders?.length || 0,
        activeOrders: activeData.length,
        allStatuses: allDriverOrders?.map(o => o.status) || [],
      });

      // إذا لم يتم جلب أي طلبات، قد تكون المشكلة في RLS
      // في هذه الحالة، سنحاول استخدام استعلام بدون filter على driver_id
      // ثم تصفية محلياً (مثل ما يحدث في useMyOrders للعميل)
      if ((!allDriverOrders || allDriverOrders.length === 0) && !activeError) {
        console.warn('⚠️ [loadOrders] No orders found, trying alternative query without driver_id filter...');
        
        try {
          // محاولة جلب جميع الطلبات النشطة ثم تصفية محلياً
          const { data: allActiveOrders, error: altError } = await supabase
            .from('orders')
            .select('id, status, order_type, items, pickup_address, delivery_address, total_fee, created_at, expires_at, customer_id, driver_id, created_by_role, search_status')
            .in('status', ['accepted', 'pickedUp', 'inTransit'])
            .order('created_at', { ascending: false })
            .limit(50);
          
          if (!altError && allActiveOrders) {
            // تصفية محلياً للطلبات التي driver_id = user.id
            const filtered = allActiveOrders.filter(o => o.driver_id === user.id);
            console.log('✅ [loadOrders] Alternative query found orders:', {
              total: allActiveOrders.length,
              filtered: filtered.length,
            });
            allDriverOrders = filtered;
            activeData = filtered;
          } else {
            console.error('❌ [loadOrders] Alternative query also failed:', altError);
          }
        } catch (altErr) {
          console.error('❌ [loadOrders] Alternative query exception:', altErr);
        }
      }

      if (activeError) {
        console.error('❌ [loadOrders] خطأ في جلب الطلبات النشطة:', {
          error: activeError,
          code: activeError.code,
          message: activeError.message,
          details: activeError.details,
          hint: activeError.hint,
        });
        // لا نرمي الخطأ، بل نستمر مع قائمة فارغة
        activeData = [];
      }
      
      console.log('📦 [loadOrders] الطلبات النشطة من قاعدة البيانات:', {
        count: activeData?.length || 0,
        orders: activeData?.map(o => ({ 
          id: o.id, 
          status: o.status, 
          driver_id: o.driver_id,
          customer_id: o.customer_id,
        })) || [],
      });

      // جلب الطلبات المتاحة (pending وليس لها driver_id أو driver_id = null)
      // واستبعاد الطلبات المنتهية الصلاحية أو الملغاة
      const now = new Date().toISOString();
      const { data: availableData, error: availableError } = await supabase
        .from('orders')
        .select('id, status, order_type, items, pickup_address, delivery_address, total_fee, created_at, expires_at, customer_id, driver_id, created_by_role, search_status, search_started_at, search_expanded_at')
        .eq('status', 'pending')
        .is('driver_id', null)
        .order('created_at', { ascending: false })
        .limit(50); // تحديد عدد الطلبات

      // تصفية الطلبات المنتهية الصلاحية أو الملغاة أو المقبولة
      const filteredAvailable = (availableData || []).filter((order: any) => {
        // استبعاد الطلبات الملغاة
        if (order.status === 'cancelled') {
          console.log('🛑 طلب ملغي:', order.id);
          return false;
        }
        
        // استبعاد الطلبات المقبولة (لأنها لم تعد متاحة)
        if (order.status === 'accepted' && order.driver_id) {
          console.log('✅ طلب مقبول من سائق آخر:', order.id);
          return false;
        }
        
        // استبعاد الطلبات التي انتهى البحث عنها (search_status = 'stopped')
        if (order.search_status === 'stopped') {
          console.log('🛑 طلب متوقف البحث:', order.id);
          return false;
        }
        
        // استبعاد الطلبات المنتهية الصلاحية
        if (order.expires_at) {
          const expiresAt = new Date(order.expires_at).getTime();
          const nowTime = new Date().getTime();
          if (expiresAt < nowTime) {
            // تحديث حالة الطلب إلى cancelled تلقائياً
            supabase
              .from('orders')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
              })
              .eq('id', order.id)
              .then(() => {
                console.log('تم تحديث الطلب المنتهي الصلاحية:', order.id);
              });
            return false;
          }
        }
        
        return true;
      });

      if (availableError) throw availableError;

      // جلب بيانات العملاء بشكل متوازي (parallel) لتحسين الأداء
      const customerIds = [
        ...(activeData || []).map(o => o.customer_id),
        ...filteredAvailable.map(o => o.customer_id),
      ].filter((id): id is string => id != null);
      
      const customerProfilesMap = new Map<string, { full_name?: string; phone?: string }>();
      
      // جلب بيانات العملاء فقط إذا كان هناك عملاء
      if (customerIds.length > 0) {
        const uniqueCustomerIds = [...new Set(customerIds)];
        // استخدام Promise.all لجلب البيانات بشكل متوازي
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', uniqueCustomerIds)
          .limit(100); // تحديد عدد العملاء
        
        if (profiles) {
          profiles.forEach((profile: any) => {
            customerProfilesMap.set(profile.id, {
              full_name: profile.full_name,
              phone: profile.phone,
            });
          });
        }
      }

      // إضافة بيانات العملاء للطلبات
      const activeWithCustomers = (activeData || []).map(order => ({
        ...order,
        customer: order.customer_id ? (customerProfilesMap.get(order.customer_id) || null) : null,
      }));

      const availableWithCustomers = filteredAvailable.map(order => ({
        ...order,
        customer: order.customer_id ? (customerProfilesMap.get(order.customer_id) || null) : null,
      }));

      // دمج الطلبات من قاعدة البيانات مع الطلبات المقبولة محلياً
      // هذا يضمن أن الطلبات المقبولة تظهر فوراً حتى لو كان هناك تأخير في قاعدة البيانات
      const currentActiveOrderIds = new Set(activeWithCustomers.map(o => o.id));
      
      // استخدام الطلبات المقبولة محلياً من useRef
      const locallyAcceptedOrders = locallyAcceptedOrdersRef.current.filter(o => 
        o.status === 'accepted' && 
        o.driver_id === user.id && 
        !currentActiveOrderIds.has(o.id)
      );
      
      // دمج الطلبات: قاعدة البيانات أولاً، ثم الطلبات المقبولة محلياً
      const mergedActiveOrders = [...activeWithCustomers, ...locallyAcceptedOrders];
      
      // إزالة الطلبات المقبولة من availableOrders إذا كانت موجودة
      const mergedAvailableOrders = availableWithCustomers.filter(o => 
        !locallyAcceptedOrders.some(lao => lao.id === o.id)
      );
      
      // تنظيف الطلبات المقبولة محلياً إذا كانت موجودة في قاعدة البيانات
      locallyAcceptedOrdersRef.current = locallyAcceptedOrdersRef.current.filter(o => 
        !currentActiveOrderIds.has(o.id)
      );

      // تحديث الـ state
      console.log('🔄 [loadOrders] Updating state:', {
        mergedActiveCount: mergedActiveOrders.length,
        mergedAvailableCount: mergedAvailableOrders.length,
        activeDataCount: activeData?.length || 0,
        activeWithCustomersCount: activeWithCustomers.length,
        locallyAcceptedCount: locallyAcceptedOrders.length,
      });
      
      setActiveOrders(mergedActiveOrders);
      setAvailableOrders(mergedAvailableOrders);
      
      // التحقق من أن الـ state تم تحديثه
      setTimeout(() => {
        console.log('✅ [loadOrders] State updated:', {
          activeOrdersCount: mergedActiveOrders.length,
          availableOrdersCount: mergedAvailableOrders.length,
          activeOrdersIds: mergedActiveOrders.map(o => o.id),
        });
      }, 100);
      
      console.log('📊 [loadOrders] Orders loaded:', {
        active: activeWithCustomers.length,
        available: availableWithCustomers.length,
        mergedActive: mergedActiveOrders.length,
        mergedAvailable: mergedAvailableOrders.length,
        activeIds: activeWithCustomers.map(o => o.id),
        availableIds: availableWithCustomers.map(o => o.id),
        activeOrdersDetails: activeWithCustomers.map(o => ({
          id: o.id,
          status: o.status,
          driver_id: o.driver_id,
          customer_id: o.customer_id,
        })),
      });
    } catch (error) {
      console.error('Error loading orders:', error);
      showSimpleAlert('خطأ', 'فشل تحميل الطلبات', 'error');
    } finally {
      setLoading(false);
      isLoadingOrdersRef.current = false;
    }
  };

  const handleAcceptOrder = async (order: Order) => {
    console.log('🔄 [handleAcceptOrder] بدء قبول الطلب:', {
      orderId: order.id,
      userId: user?.id,
      orderStatus: order.status,
    });

    if (!user?.id) {
      console.error('❌ [handleAcceptOrder] لا يوجد مستخدم');
      showSimpleAlert('خطأ', 'يجب تسجيل الدخول أولاً', 'error');
      return;
    }

    try {
      setLoading(true);
      
      // التحقق من أن الطلب لا يزال متاحاً (pending و driver_id = null)
      console.log('🔍 [handleAcceptOrder] التحقق من الطلب...');
      const { data: checkData, error: checkError } = await supabase
        .from('orders')
        .select('id, status, driver_id')
        .eq('id', order.id)
        .maybeSingle();

      if (checkError) {
        console.error('❌ [handleAcceptOrder] خطأ في التحقق من الطلب:', checkError);
        throw checkError;
      }

      if (!checkData) {
        console.error('❌ [handleAcceptOrder] الطلب غير موجود');
        throw new Error('الطلب غير موجود');
      }

      console.log('✅ [handleAcceptOrder] بيانات الطلب:', checkData);

      // التحقق من أن الطلب لا يزال متاحاً
      if (checkData.status !== 'pending' || checkData.driver_id !== null) {
        console.warn('⚠️ [handleAcceptOrder] الطلب لم يعد متاحاً:', {
          status: checkData.status,
          driver_id: checkData.driver_id,
        });
        showSimpleAlert('تنبيه', 'هذا الطلب لم يعد متاحاً', 'warning');
        // إعادة تحميل الطلبات لإزالة الطلب من القائمة
        await loadOrders();
        return;
      }

      // تحديث الطلب في قاعدة البيانات باستخدام Edge Function (لتجاوز RLS)
      console.log('💾 [handleAcceptOrder] تحديث الطلب في قاعدة البيانات...');
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-order', {
        body: {
          orderId: order.id,
          status: 'accepted',
          driverId: user.id,
        },
      });

      if (edgeFunctionError) {
        console.error('❌ [handleAcceptOrder] خطأ في تحديث الطلب:', edgeFunctionError);
        throw edgeFunctionError;
      }

      if (!edgeFunctionData || !edgeFunctionData.success) {
        console.error('❌ [handleAcceptOrder] Edge Function returned error:', edgeFunctionData?.error);
        throw new Error(edgeFunctionData?.error || 'فشل تحديث الطلب');
      }

      console.log('✅ [handleAcceptOrder] تم تحديث الطلب بنجاح:', edgeFunctionData.order);

      // تحديث الـ state المحلي فوراً لإظهار الطلب في "الرحلات النشطة"
      // هذا يضمن أن الطلب يظهر فوراً حتى لو كان هناك تأخير في قاعدة البيانات
      const acceptedOrder: Order = {
        ...order,
        status: 'accepted',
        driver_id: user.id,
      };
      
      // حفظ الطلب المقبول محلياً
      locallyAcceptedOrdersRef.current = [
        ...locallyAcceptedOrdersRef.current.filter(o => o.id !== order.id),
        acceptedOrder,
      ];
      
      // إزالة الطلب من availableOrders وإضافته إلى activeOrders
      setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
      setActiveOrders(prev => {
        // التحقق من أن الطلب غير موجود بالفعل في activeOrders
        if (prev.some(o => o.id === order.id)) {
          return prev;
        }
        // إضافة الطلب في البداية (أعلى القائمة)
        return [acceptedOrder, ...prev];
      });
      
      console.log('✅ [handleAcceptOrder] تم تحديث الـ state المحلي فوراً');

      // إرسال إشعار للعميل
      if (order.customer_id) {
        try {
          console.log('📧 [handleAcceptOrder] إرسال إشعار للعميل...', {
            customer_id: order.customer_id,
            order_id: order.id,
          });
          
          const { data: notifData, error: notifError } = await supabase.rpc('insert_notification_for_customer_by_driver', {
            p_user_id: order.customer_id,
            p_title: 'تم قبول طلبك',
            p_message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
            p_type: 'success',
            p_order_id: order.id,
          });
          
          if (notifError) {
            console.error('⚠️ [handleAcceptOrder] خطأ في إرسال الإشعار:', {
              error: notifError,
              message: notifError.message,
              code: notifError.code,
              details: notifError.details,
            });
            
            // محاولة استخدام createNotification كـ fallback
            console.log('🔄 [handleAcceptOrder] محاولة استخدام createNotification كـ fallback...');
            const { createNotification } = await import('@/lib/notifications');
            const fallbackResult = await createNotification({
              user_id: order.customer_id,
              title: 'تم قبول طلبك',
              message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
              type: 'success',
              order_id: order.id,
            });
            
            if (fallbackResult.success) {
              console.log('✅ [handleAcceptOrder] تم إرسال الإشعار باستخدام createNotification');
          } else {
              console.error('❌ [handleAcceptOrder] فشل إرسال الإشعار حتى مع createNotification:', fallbackResult.error);
            }
          } else {
            console.log('✅ [handleAcceptOrder] تم إرسال إشعار للعميل بنجاح:', {
              notification_id: notifData,
              customer_id: order.customer_id,
              order_id: order.id,
            });
            // ملاحظة: لا نتحقق من الإشعار لأن RLS يمنع السائق من قراءة إشعارات العميل
            // الإشعار موجود في قاعدة البيانات ويمكن للعميل قراءته
          }
        } catch (notifError) {
          console.error('⚠️ [handleAcceptOrder] خطأ في إرسال الإشعار (catch):', notifError);
          // لا نوقف العملية إذا فشل الإشعار
        }
      } else {
        console.warn('⚠️ [handleAcceptOrder] لا يوجد customer_id للطلب:', order.id);
      }

      // إعادة تحميل الطلبات بعد تأخير للتأكد من تحديث قاعدة البيانات
      // هذا يضمن أن التحديثات قد تم تطبيقها قبل إعادة التحميل
      // خاصة في حالة replication lag
      console.log('🔄 [handleAcceptOrder] إعادة تحميل الطلبات بعد تأخير...');
      setTimeout(async () => {
        await loadOrders();
      }, 1500); // تأخير 1500ms للتأكد من تحديث قاعدة البيانات
      
      console.log('✅ [handleAcceptOrder] تم قبول الطلب بنجاح');
    } catch (error: any) {
      console.error('❌ [handleAcceptOrder] خطأ في قبول الطلب:', error);
      const errorMessage = error?.message || error?.details || 'فشل قبول الطلب';
      showSimpleAlert('خطأ', errorMessage, 'error');
      // إعادة تحميل الطلبات في حالة الخطأ
      try {
        await loadOrders();
      } catch (reloadError) {
        console.error('❌ [handleAcceptOrder] خطأ في إعادة تحميل الطلبات:', reloadError);
      }
    } finally {
      setLoading(false);
      console.log('🏁 [handleAcceptOrder] انتهى قبول الطلب');
    }
  };

  const handleCancelOrder = async (order: Order) => {
    try {
      setLoading(true);
      
      // التحقق من أن المستخدم هو من أنشأ الطلب
      // السائق يمكنه إلغاء الطلب إذا كان created_by_role = 'driver' و customer_id = user.id
      // العميل يمكنه إلغاء الطلب إذا كان customer_id = user.id
      // الأدمن يمكنه إلغاء أي طلب
      const canCancel = 
        (order.created_by_role === 'driver' && order.customer_id === user?.id) ||
        (order.customer_id === user?.id) ||
        (user?.role === 'admin');

      if (!canCancel) {
        showSimpleAlert('خطأ', 'ليس لديك صلاحية لإلغاء هذا الطلب', 'error');
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_by: user?.id,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (error) throw error;

      showSimpleAlert('نجح', 'تم إلغاء الطلب', 'success');
      loadOrders();
    } catch (error: any) {
      showSimpleAlert('خطأ', error.message || 'فشل إلغاء الطلب', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTrackTrip = async (order: Order) => {
    console.log('🔄 [handleTrackTrip] Navigating to track-trip:', {
      orderId: order.id,
      status: order.status,
      driver_id: order.driver_id,
    });
    
    if (!order.id) {
      console.error('❌ [handleTrackTrip] Order ID is missing');
      showSimpleAlert('خطأ', 'معرف الطلب غير موجود', 'error');
      return;
    }
    
    // إضافة تأخير أطول للتأكد من التزام قاعدة البيانات
    // هذا يساعد في تجنب مشاكل التوقيت عند الانتقال مباشرة بعد قبول الطلب
    // خاصة في حالة replication lag
    console.log('⏳ [handleTrackTrip] Waiting for database commit...');
    await new Promise(resolve => setTimeout(resolve, 800));
    
    router.push({
      pathname: '/driver/track-trip',
      params: { orderId: order.id },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>الرحلات</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* الطلبات النشطة */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            الرحلات النشطة {activeOrders.length > 0 && `(${activeOrders.length})`}
          </Text>
          {(() => {
            console.log('🎨 [trips] Rendering active orders:', {
              count: activeOrders.length,
              ids: activeOrders.map(o => o.id),
            });
            return null;
          })()}
          {activeOrders.length > 0 ? (
            activeOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderType}>
                      {order.order_type === 'package' ? 'توصيل طرد' : 'طلب شراء'}
                    </Text>
                    <Text style={styles.orderDate}>
                      {new Date(order.created_at).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: '#007AFF20' }]}>
                    <Text style={[styles.statusText, { color: '#007AFF' }]}>
                      {order.status === 'accepted' ? 'مقبول' : 
                       order.status === 'pickedUp' ? 'تم الاستلام' : 
                       order.status === 'inTransit' ? 'قيد التوصيل' : order.status}
                    </Text>
                  </View>
                </View>

                {order.items && Array.isArray(order.items) && order.items.length > 2 ? (
                  <View style={styles.multiPointContainer}>
                    <Text style={styles.multiPointTitle}>
                      مسار متعدد النقاط ({order.items.length} نقاط)
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.addressRow}>
                      <Ionicons name="location" size={16} color="#34C759" />
                      <Text style={styles.address}>من: {order.pickup_address}</Text>
                    </View>
                    <View style={styles.addressRow}>
                      <Ionicons name="location" size={16} color="#FF3B30" />
                      <Text style={styles.address}>إلى: {order.delivery_address}</Text>
                    </View>
                  </>
                )}

                <View style={styles.footer}>
                  <Text style={styles.fee}>الأجرة: {order.total_fee} ج.م</Text>
                  <TouchableOpacity
                    style={styles.trackButton}
                    onPress={() => handleTrackTrip(order)}
                  >
                    <Ionicons name="navigate" size={20} color="#fff" />
                    <Text style={styles.trackButtonText}>متابعة الرحلة</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>لا توجد رحلات نشطة</Text>
            </View>
          )}
        </View>

        {/* الطلبات المتاحة */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الطلبات المتاحة</Text>
          {loading && availableOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : availableOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={64} color="#999" />
              <Text style={styles.emptyText}>لا توجد طلبات متاحة</Text>
            </View>
          ) : (
            availableOrders.map((order) => {
              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderType}>
                        {order.order_type === 'package' ? 'توصيل طرد' : 'طلب شراء'}
                      </Text>
                      <Text style={styles.orderDate}>
                        {new Date(order.created_at).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: '#FF950020' }]}>
                      <Text style={[styles.statusText, { color: '#FF9500' }]}>
                        قيد الانتظار
                      </Text>
                    </View>
                  </View>

                  {/* شريط العداد التنازلي للبحث عن السائقين */}
                  {order.status === 'pending' && (
                    <OrderSearchCountdown 
                      orderId={order.id} 
                      onRestartSearch={undefined}
                    />
                  )}

                  {order.items && Array.isArray(order.items) && order.items.length > 2 ? (
                    <View style={styles.multiPointContainer}>
                      <Text style={styles.multiPointTitle}>
                        مسار متعدد النقاط ({order.items.length} نقاط)
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.addressRow}>
                        <Ionicons name="location" size={16} color="#34C759" />
                        <Text style={styles.address}>من: {order.pickup_address}</Text>
                      </View>
                      <View style={styles.addressRow}>
                        <Ionicons name="location" size={16} color="#FF3B30" />
                        <Text style={styles.address}>إلى: {order.delivery_address}</Text>
                      </View>
                    </>
                  )}

                  <View style={styles.footer}>
                    <Text style={styles.fee}>الأجرة: {order.total_fee} ج.م</Text>
                    <View style={styles.footerButtons}>
                      {/* زر إلغاء - يظهر فقط إذا كان السائق هو من أنشأ الطلب أو إذا كان العميل */}
                      {((order.created_by_role === 'driver' && order.customer_id === user?.id) || 
                        (order.customer_id === user?.id && order.created_by_role !== 'driver')) && (
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => handleCancelOrder(order)}
                          disabled={loading}
                        >
                          <Ionicons name="close-circle" size={18} color="#FF3B30" />
                          <Text style={styles.cancelButtonText}>إلغاء</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={() => {
                          console.log('👆 [trips] تم الضغط على قبول الطلب:', order.id);
                          handleAcceptOrder(order);
                        }}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.acceptButtonText}>قبول الطلب</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (tabBarBottomPadding: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: tabBarBottomPadding,
  },
  header: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 255, 255, 0.95)' : '#fff',
    padding: responsive.getResponsiveHeaderPadding(),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }),
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  title: {
    fontSize: responsive.getResponsiveFontSize(28),
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'right',
  },
  content: {
    padding: responsive.getResponsivePadding(),
    paddingBottom: responsive.getResponsivePadding() + 20,
    ...(responsive.isLargeScreen() && {
      maxWidth: responsive.getMaxContentWidth(),
      alignSelf: 'center',
      width: '100%',
    }),
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: responsive.getResponsiveFontSize(20),
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'right',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...createShadowStyle({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderType: {
    fontSize: responsive.getResponsiveFontSize(16),
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: responsive.getResponsiveFontSize(12),
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: responsive.getResponsiveFontSize(12),
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  address: {
    fontSize: responsive.getResponsiveFontSize(14),
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  multiPointContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  multiPointTitle: {
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'right',
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  fee: {
    fontSize: responsive.getResponsiveFontSize(18),
    fontWeight: 'bold',
    color: '#34C759',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#34C759',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  acceptButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#999',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF3B3020',
    borderWidth: 1,
    borderColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
  },
  trackButtonText: {
    color: '#fff',
    fontSize: responsive.getResponsiveFontSize(14),
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: responsive.getResponsiveFontSize(18),
    color: '#999',
    marginTop: 16,
  },
});


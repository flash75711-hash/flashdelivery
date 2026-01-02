import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Order {
  id: string;
  status: string;
  order_type: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  items?: any;
  negotiated_price?: number;
  negotiation_status?: string;
  driver_proposed_price?: number;
  customer_proposed_price?: number;
  customer_id?: string;
  driver_id?: string | null;
  search_status?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  deadline?: string | null;
}

export function useMyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    if (!user) return;

    try {
      // التحقق من session و auth.uid()
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      console.log('🔐 [useMyOrders] Auth check:', {
        userId: user.id,
        userRole: user.role,
        authUserId: authUser?.id,
        sessionUserId: currentSession?.user?.id,
        sessionExists: !!currentSession,
        authUserExists: !!authUser,
      });

      let ordersData: any[] | null = null;
      let queryError: any = null;

      // إذا لم يكن هناك session، نحاول استخدام Edge Function لتجاوز RLS
      if (!currentSession || !authUser) {
        console.warn('⚠️ [useMyOrders] No active session, using Edge Function to bypass RLS...');
        
        try {
          if (user.role === 'customer') {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-customer-orders', {
              body: {
                customerId: user.id,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.orders) {
              console.log('✅ [useMyOrders] Orders loaded via Edge Function for customer:', edgeData.orders.length);
              ordersData = edgeData.orders;
              queryError = null;
            } else {
              console.error('❌ [useMyOrders] Edge Function failed for customer:', edgeError);
            }
          } else if (user.role === 'driver') {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-driver-orders', {
              body: {
                driverId: user.id,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.orders) {
              console.log('✅ [useMyOrders] Orders loaded via Edge Function for driver:', edgeData.orders.length);
              ordersData = edgeData.orders;
              queryError = null;
            } else {
              console.error('❌ [useMyOrders] Edge Function failed for driver:', edgeError);
            }
          }
        } catch (edgeErr) {
          console.error('❌ [useMyOrders] Edge Function exception:', edgeErr);
          // نستمر مع الاستعلام العادي
        }
      }
      
      // إذا لم نستخدم Edge Function، نستخدم الاستعلام العادي
      if (!ordersData) {
        let query = supabase.from('orders').select('*');

        // جلب الطلبات حسب الدور
        if (user.role === 'customer') {
          query = query.eq('customer_id', user.id);
        } else if (user.role === 'driver') {
          // السائق يرى الطلبات المقبولة منه
          query = query.eq('driver_id', user.id);
        } else if (user.role === 'admin') {
          // المدير يرى جميع الطلبات
          query = query.order('created_at', { ascending: false });
        } else {
          // أدوار أخرى: لا توجد طلبات
          setOrders([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        ordersData = data;
        queryError = error;
      }

      if (queryError) throw queryError;

      // إزالة التكرارات
      const uniqueOrders = Array.from(
        new Map((ordersData || []).map(order => [order.id, order])).values()
      );
      
      console.log('📦 [useMyOrders] Orders loaded:', {
        role: user.role,
        total: uniqueOrders.length,
        statuses: uniqueOrders.map(o => o.status),
      });
      
      setOrders(uniqueOrders || []);
    } catch (error) {
      console.error('❌ [useMyOrders] Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    loadOrders();

    // Realtime subscription للتحديثات الفورية
    // نستخدم channel name فريد لكل مستخدم ووقت
    const channelName = `my_orders_${user.id}_${Date.now()}`;
    console.log('🔄 [useMyOrders] Setting up Realtime subscription:', {
      channelName,
      userId: user.id,
      userRole: user.role,
    });
    
    let subscriptionStatus = 'PENDING';
    let lastUpdateTime = Date.now();
    let subscription: any = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    const setupSubscription = () => {
      // إلغاء الاشتراك السابق إن وجد
      if (subscription) {
        subscription.unsubscribe();
      }
      
      subscription = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'orders',
            ...(user.role === 'customer' && { filter: `customer_id=eq.${user.id}` }),
            ...(user.role === 'driver' && { filter: `driver_id=eq.${user.id}` }),
            // المدير يتابع جميع الطلبات (لا filter)
          },
          (payload) => {
            console.log('🔄 [useMyOrders] Realtime event received:', {
              event: payload.eventType,
              order_id: payload.new?.id || payload.old?.id,
              status: payload.new?.status,
              driver_id: payload.new?.driver_id,
              old_status: payload.old?.status,
            });
            
            lastUpdateTime = Date.now();
            
            // تحديث فوري للـ state إذا كان التحديث متعلقاً بحالة الطلب
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedOrder = payload.new as Order;
              console.log('🔄 [useMyOrders] Realtime UPDATE received:', {
                order_id: updatedOrder.id,
                old_status: payload.old?.status,
                new_status: updatedOrder.status,
                driver_id: updatedOrder.driver_id,
                customer_id: updatedOrder.customer_id,
              });
              
              // تحديث فوري للـ state
              setOrders(prev => {
                const index = prev.findIndex(o => o.id === updatedOrder.id);
                if (index >= 0) {
                  // تحديث الطلب الموجود - دمج جميع الحقول المحدثة
                  const newOrders = [...prev];
                  newOrders[index] = { 
                    ...newOrders[index], 
                    ...updatedOrder,
                    // الحفاظ على الحقول التي قد لا تكون في payload.new
                    items: updatedOrder.items || newOrders[index].items,
                    pickup_address: updatedOrder.pickup_address || newOrders[index].pickup_address,
                    delivery_address: updatedOrder.delivery_address || newOrders[index].delivery_address,
                  };
                  console.log('✅ [useMyOrders] Order updated in state immediately:', {
                    id: newOrders[index].id,
                    status: newOrders[index].status,
                    driver_id: newOrders[index].driver_id,
                  });
                  return newOrders;
                } else if (user.role === 'customer' && updatedOrder.customer_id === user.id) {
                  // إضافة طلب جديد للعميل
                  console.log('✅ [useMyOrders] New order added for customer:', updatedOrder);
                  return [updatedOrder, ...prev];
                } else if (user.role === 'driver' && updatedOrder.driver_id === user.id) {
                  // إضافة طلب جديد للسائق
                  console.log('✅ [useMyOrders] New order added for driver:', updatedOrder);
                  return [updatedOrder, ...prev];
                }
                console.warn('⚠️ [useMyOrders] Order not found in state and not matching user role:', {
                  order_id: updatedOrder.id,
                  user_role: user.role,
                  customer_id: updatedOrder.customer_id,
                  driver_id: updatedOrder.driver_id,
                });
                return prev;
              });
              
              // إعادة تحميل الطلبات بعد تأخير للتأكد من التحديث الكامل
              // نستخدم setTimeout لضمان أن التحديث في قاعدة البيانات قد اكتمل
              setTimeout(() => {
                console.log('🔄 [useMyOrders] Reloading orders after update to ensure consistency...');
                loadOrders();
              }, 1000);
            } else if (payload.eventType === 'INSERT' && payload.new) {
              // إضافة طلب جديد
              const newOrder = payload.new as Order;
              console.log('🔄 [useMyOrders] Realtime INSERT received:', {
                order_id: newOrder.id,
                status: newOrder.status,
                customer_id: newOrder.customer_id,
                driver_id: newOrder.driver_id,
              });
              
              setOrders(prev => {
                // التحقق من أن الطلب غير موجود بالفعل
                if (prev.find(o => o.id === newOrder.id)) {
                  console.log('⚠️ [useMyOrders] Order already exists, skipping insert');
                  return prev;
                }
                
                if (user.role === 'customer' && newOrder.customer_id === user.id) {
                  console.log('✅ [useMyOrders] New order added for customer:', newOrder);
                  return [newOrder, ...prev];
                } else if (user.role === 'driver' && newOrder.driver_id === user.id) {
                  console.log('✅ [useMyOrders] New order added for driver:', newOrder);
                  return [newOrder, ...prev];
                }
                return prev;
              });
              
              // إعادة تحميل بعد تأخير
              setTimeout(() => {
                loadOrders();
              }, 1000);
            } else if (payload.eventType === 'DELETE' && payload.old) {
              // حذف الطلب من الـ state
              console.log('🔄 [useMyOrders] Realtime DELETE received:', {
                order_id: payload.old.id,
              });
              setOrders(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )
        .subscribe((status) => {
          subscriptionStatus = status;
          console.log('🔄 [useMyOrders] Subscription status:', {
            status,
            channelName,
            userId: user.id,
            userRole: user.role,
          });
          
          if (status === 'SUBSCRIBED') {
            console.log('✅ [useMyOrders] Successfully subscribed to orders updates');
            lastUpdateTime = Date.now();
            retryCount = 0; // إعادة تعيين عداد المحاولات عند النجاح
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ [useMyOrders] Channel error, attempting to resubscribe...');
            retryCount++;
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => {
                console.log('🔄 [useMyOrders] Retrying subscription after error...');
                setupSubscription();
              }, 2000);
            } else {
              console.warn('⚠️ [useMyOrders] Max retries reached, relying on polling');
            }
          } else if (status === 'TIMED_OUT') {
            console.warn('⚠️ [useMyOrders] Subscription timed out, retrying...');
            retryCount++;
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => {
                setupSubscription();
              }, 2000);
            }
          } else if (status === 'CLOSED') {
            console.warn('⚠️ [useMyOrders] Subscription closed');
            // لا نعيد المحاولة تلقائياً عند الإغلاق العادي (مثل unmount)
            // سنعتمد على polling للتحديثات
          }
        });
    };
    
    // إعداد الاشتراك
    setupSubscription();

    // Polling كل 5 ثوانٍ كـ fallback للتأكد من التحديثات
    // حتى لو كان الاشتراك يعمل، نستخدم polling كـ backup
    const pollingInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;
      // إذا مر أكثر من 5 ثوانٍ، نعيد تحميل البيانات للتأكد من التحديثات
      if (timeSinceLastUpdate > 5000) {
        console.log('🔄 [useMyOrders] Polling: reloading orders to ensure consistency...');
        loadOrders();
        // تحديث الوقت بعد بدء التحميل (سواء نجح أم فشل)
        lastUpdateTime = Date.now();
      }
    }, 5000);

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      clearInterval(pollingInterval);
    };
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  return {
    orders,
    loading,
    refreshing,
    onRefresh,
    reload: loadOrders,
  };
}


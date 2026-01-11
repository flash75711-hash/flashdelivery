import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface OrderItem {
  id: string;
  order_id: string;
  item_index: number;
  address: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  is_picked_up?: boolean;
  picked_up_at?: string;
  item_fee?: number;
}

export interface Order {
  id: string;
  status: string;
  order_type: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  created_at: string;
  items?: any;
  order_items?: OrderItem[]; // العناصر من جدول order_items
  negotiated_price?: number;
  negotiation_status?: string;
  driver_proposed_price?: number;
  customer_proposed_price?: number;
  customer_id?: string;
  driver_id?: string | null;
  search_status?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  deadline?: string | null; // للحفاظ على التوافق مع الكود القديم
  driver_response_deadline?: string | null; // الحقل الفعلي في قاعدة البيانات
}

export function useMyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // التحقق من session و auth.uid()
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      

      let ordersData: any[] | null = null;
      let queryError: any = null;

      // إذا لم يكن هناك session، نحاول استخدام Edge Function لتجاوز RLS
      if (!currentSession || !authUser) {
        try {
          if (user.role === 'customer') {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-customer-orders', {
              body: {
                customerId: user.id,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.orders) {
              ordersData = edgeData.orders;
              queryError = null;
            }
          } else if (user.role === 'driver') {
            const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-driver-orders', {
              body: {
                driverId: user.id,
              },
            });

            if (!edgeError && edgeData?.success && edgeData?.orders) {
              ordersData = edgeData.orders;
              queryError = null;
            }
          }
        } catch (edgeErr) {
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
            lastUpdateTime = Date.now();
            
            // تحديث فوري للـ state إذا كان التحديث متعلقاً بحالة الطلب
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updatedOrder = payload.new as Order;
              
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
                  return newOrders;
                } else if (user.role === 'customer' && updatedOrder.customer_id === user.id) {
                  // إضافة طلب جديد للعميل
                  return [updatedOrder, ...prev];
                } else if (user.role === 'driver' && updatedOrder.driver_id === user.id) {
                  // إضافة طلب جديد للسائق
                  return [updatedOrder, ...prev];
                }
                return prev;
              });
              
              // إعادة تحميل الطلبات بعد تأخير للتأكد من التحديث الكامل (مع debounce لتجنب cascade)
              // نستخدم ref لتتبع آخر وقت تحميل
              const lastReloadTime = Date.now();
              if (lastReloadTime - (window as any).__lastOrdersReload || 0 > 2000) {
                (window as any).__lastOrdersReload = lastReloadTime;
                setTimeout(() => {
                  loadOrders();
                }, 2000); // زيادة التأخير لتقليل cascade
              }
            } else if (payload.eventType === 'INSERT' && payload.new) {
              // إضافة طلب جديد
              const newOrder = payload.new as Order;
              
              setOrders(prev => {
                // التحقق من أن الطلب غير موجود بالفعل
                if (prev.find(o => o.id === newOrder.id)) {
                  return prev;
                }
                
                if (user.role === 'customer' && newOrder.customer_id === user.id) {
                  return [newOrder, ...prev];
                } else if (user.role === 'driver' && newOrder.driver_id === user.id) {
                  return [newOrder, ...prev];
                }
                return prev;
              });
              
              // إعادة تحميل بعد تأخير (مع debounce لتجنب cascade)
              const lastReloadTime = Date.now();
              if (lastReloadTime - (window as any).__lastOrdersReload || 0 > 2000) {
                (window as any).__lastOrdersReload = lastReloadTime;
                setTimeout(() => {
                  loadOrders();
                }, 2000); // زيادة التأخير لتقليل cascade
              }
            } else if (payload.eventType === 'DELETE' && payload.old) {
              // حذف الطلب من الـ state
              setOrders(prev => prev.filter(o => o.id !== payload.old.id));
            }
          }
        )
        .subscribe((status) => {
          subscriptionStatus = status;
          
          if (status === 'SUBSCRIBED') {
            lastUpdateTime = Date.now();
            retryCount = 0;
          } else if (status === 'CHANNEL_ERROR') {
            retryCount++;
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => {
                setupSubscription();
              }, 2000);
            }
          } else if (status === 'TIMED_OUT') {
            retryCount++;
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => {
                setupSubscription();
              }, 2000);
            }
          }
        });
    };
    
    // إعداد الاشتراك
    setupSubscription();

    // Polling كل 30 ثانية كـ fallback للتأكد من التحديثات (تقليل من 5 ثوان)
    // حتى لو كان الاشتراك يعمل، نستخدم polling كـ backup
    const pollingInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;
      // إذا مر أكثر من 30 ثانية، نعيد تحميل البيانات للتأكد من التحديثات
      if (timeSinceLastUpdate > 30000) {
        loadOrders();
        lastUpdateTime = Date.now();
      }
    }, 30000); // تقليل من 5 ثوان إلى 30 ثانية

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


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
}

export function useMyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    if (!user) return;

    try {
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

      if (error) throw error;

      // إزالة التكرارات
      const uniqueOrders = Array.from(
        new Map(data?.map(order => [order.id, order])).values()
      );
      
      setOrders(uniqueOrders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();

    // Realtime subscription
    const subscription = supabase
      .channel(`my_orders_${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          ...(user?.role === 'customer' && { filter: `customer_id=eq.${user.id}` }),
          ...(user?.role === 'driver' && { filter: `driver_id=eq.${user.id}` }),
          // المدير يتابع جميع الطلبات (لا filter)
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
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


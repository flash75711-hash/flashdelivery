import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface OrderNotification {
  id: string;
  order_id: string;
  title: string;
  message: string;
  total_fee: number;
  order_type?: string;
  pickup_address?: string;
  delivery_address?: string;
  created_at: string;
}

export function useFloatingOrderNotifications() {
  const { user } = useAuth();
  const [currentNotification, setCurrentNotification] = useState<OrderNotification | null>(null);
  const [visible, setVisible] = useState(false);

  const loadOrderDetails = useCallback(async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_type, pickup_address, delivery_address, total_fee, status')
        .eq('id', orderId)
        .single();

      if (error) throw error;
      // فقط إذا كان الطلب في حالة pending
      if (data && data.status === 'pending') {
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error loading order details:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'driver') return;

    // جلب الإشعارات غير المقروءة المرتبطة بطلبات
    const loadUnreadOrderNotifications = async () => {
      try {
        const { data: notifications, error } = await supabase
          .from('notifications')
          .select('id, order_id, title, message, created_at')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .not('order_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error loading notifications:', error);
          return;
        }

        if (notifications && notifications.length > 0) {
          const notification = notifications[0];
          
          // جلب تفاصيل الطلب
          const orderDetails = await loadOrderDetails(notification.order_id);
          
          if (orderDetails) {
            setCurrentNotification({
              id: notification.id,
              order_id: notification.order_id,
              title: notification.title,
              message: notification.message,
              total_fee: parseFloat(orderDetails.total_fee?.toString() || '0'),
              order_type: orderDetails.order_type,
              pickup_address: orderDetails.pickup_address,
              delivery_address: orderDetails.delivery_address,
              created_at: notification.created_at,
            });
            setVisible(true);
          }
        }
      } catch (error) {
        console.error('Error in loadUnreadOrderNotifications:', error);
      }
    };

    // تحميل الإشعارات عند التحميل الأول
    loadUnreadOrderNotifications();

    // الاشتراك في Realtime للإشعارات الجديدة
    const notificationsChannel = supabase
      .channel(`driver_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newNotification = payload.new as any;
          
          // فقط للإشعارات المرتبطة بطلبات
          if (newNotification.order_id) {
            // جلب تفاصيل الطلب
            const orderDetails = await loadOrderDetails(newNotification.order_id);
            
            if (orderDetails) {
              setCurrentNotification({
                id: newNotification.id,
                order_id: newNotification.order_id,
                title: newNotification.title,
                message: newNotification.message,
                total_fee: parseFloat(orderDetails.total_fee?.toString() || '0'),
                order_type: orderDetails.order_type,
                pickup_address: orderDetails.pickup_address,
                delivery_address: orderDetails.delivery_address,
                created_at: newNotification.created_at,
              });
              setVisible(true);
            }
          }
        }
      )
      .subscribe();

    return () => {
      notificationsChannel.unsubscribe();
    };
  }, [user, loadOrderDetails]);

  const dismiss = useCallback(() => {
    setVisible(false);
    // بعد 500ms، نمسح الإشعار بالكامل
    setTimeout(() => {
      setCurrentNotification(null);
    }, 500);
  }, []);

  const handleAccept = useCallback(() => {
    // سيتم التعامل مع القبول في المكون
    console.log('Order accepted:', currentNotification?.order_id);
  }, [currentNotification]);

  const handleReject = useCallback(() => {
    // سيتم التعامل مع الرفض في المكون
    console.log('Order rejected:', currentNotification?.order_id);
  }, [currentNotification]);

  return {
    notification: currentNotification,
    visible,
    dismiss,
    handleAccept,
    handleReject,
  };
}

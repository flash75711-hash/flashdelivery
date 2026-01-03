import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FloatingNotificationData } from '@/components/FloatingNotification';

/**
 * Hook للاستماع إلى تغييرات الطلبات وعرض إشعارات داخلية
 * يعمل على الويب فقط - بدون Push Notifications
 */
export function useOrderNotifications() {
  const { user } = useAuth();
  const [currentNotification, setCurrentNotification] = useState<FloatingNotificationData | null>(null);
  const [visible, setVisible] = useState(false);
  const notificationQueue = useRef<FloatingNotificationData[]>([]);
  const isShowing = useRef(false);
  const shownOrderIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<any>(null);

  const showNextNotification = useCallback(() => {
    if (isShowing.current || notificationQueue.current.length === 0) {
      return;
    }

    const nextNotification = notificationQueue.current.shift();
    if (nextNotification) {
      isShowing.current = true;
      setCurrentNotification(nextNotification);
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    isShowing.current = false;
    
    setTimeout(() => {
      setCurrentNotification(null);
      showNextNotification();
    }, 300);
  }, [showNextNotification]);

  const addNotification = useCallback((notification: FloatingNotificationData) => {
    // تجنب عرض نفس الإشعار مرتين
    const notificationId = notification.order_id || notification.id;
    if (shownOrderIds.current.has(notificationId)) {
      return;
    }
    
    shownOrderIds.current.add(notificationId);
    
    // إذا كان هناك إشعار معروض حالياً، نضيف الجديد إلى الطابور
    if (isShowing.current) {
      notificationQueue.current.push(notification);
    } else {
      // إذا لم يكن هناك إشعار معروض، نعرضه مباشرة
      setCurrentNotification(notification);
      setVisible(true);
      isShowing.current = true;
    }
  }, []);

  useEffect(() => {
    // يعمل على الويب فقط
    if (Platform.OS !== 'web' || !user) {
      return;
    }

    // إنشاء channel للاستماع إلى تغييرات الطلبات
    const ordersChannel = supabase
      .channel(`order_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        async (payload) => {
          const newOrder = payload.new as any;

          // للعملاء: عرض إشعار عند إنشاء طلب جديد خاص بهم
          if (user.role === 'customer' && newOrder.customer_id === user.id) {
            const notification: FloatingNotificationData = {
              id: `order_created_${newOrder.id}`,
              title: 'تم إنشاء الطلب بنجاح',
              message: `تم إنشاء طلبك بنجاح. سيتم البحث عن سائق قريب.`,
              type: 'success',
              order_id: newOrder.id,
              created_at: newOrder.created_at,
            };
            addNotification(notification);
          }

          // للسائقين: عرض إشعار عند إنشاء أي طلب جديد (pending)
          if (user.role === 'driver' && newOrder.status === 'pending') {
            const notification: FloatingNotificationData = {
              id: `new_order_${newOrder.id}`,
              title: 'طلب جديد متاح',
              message: `طلب جديد بقيمة ${newOrder.total_fee} ج.م`,
              type: 'info',
              order_id: newOrder.id,
              created_at: newOrder.created_at,
            };
            addNotification(notification);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        async (payload) => {
          const updatedOrder = payload.new as any;
          const oldOrder = payload.old as any;

          // تخطي إذا لم يتغير الحالة
          if (updatedOrder.status === oldOrder.status) {
            return;
          }

          // للعملاء: عرض إشعار عند تغيير حالة طلبهم
          if (user.role === 'customer' && updatedOrder.customer_id === user.id) {
            const statusMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning' }> = {
              'accepted': {
                title: 'تم قبول طلبك',
                message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
                type: 'success',
              },
              'pickedUp': {
                title: 'تم استلام الطلب',
                message: 'تم استلام طلبك من قبل السائق وهو في الطريق إليك.',
                type: 'info',
              },
              'inTransit': {
                title: 'الطلب قيد التوصيل',
                message: 'طلبك في الطريق إليك الآن.',
                type: 'info',
              },
              'completed': {
                title: 'تم إكمال الطلب',
                message: 'تم إكمال طلبك بنجاح. شكراً لاستخدامك Flash Delivery!',
                type: 'success',
              },
              'cancelled': {
                title: 'تم إلغاء الطلب',
                message: 'تم إلغاء طلبك.',
                type: 'warning',
              },
            };

            const statusInfo = statusMessages[updatedOrder.status];
            if (statusInfo) {
              const notification: FloatingNotificationData = {
                id: `order_status_${updatedOrder.id}_${updatedOrder.status}`,
                title: statusInfo.title,
                message: statusInfo.message,
                type: statusInfo.type,
                order_id: updatedOrder.id,
                created_at: updatedOrder.updated_at || new Date().toISOString(),
              };
              addNotification(notification);
            }
          }

          // للسائقين: عرض إشعار عند تحديث طلباتهم المقبولة
          if (user.role === 'driver' && updatedOrder.driver_id === user.id) {
            if (updatedOrder.status === 'completed') {
              const notification: FloatingNotificationData = {
                id: `order_completed_${updatedOrder.id}`,
                title: 'تم إكمال الطلب',
                message: `تم إضافة ${updatedOrder.total_fee} ج.م إلى محفظتك.`,
                type: 'success',
                order_id: updatedOrder.id,
                created_at: updatedOrder.completed_at || new Date().toISOString(),
              };
              addNotification(notification);
            }
          }
        }
      )
      .subscribe();

    channelRef.current = ordersChannel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [user, addNotification]);

  return {
    notification: currentNotification,
    visible,
    dismiss,
  };
}


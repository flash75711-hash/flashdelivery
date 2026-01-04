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

    // للعملاء: لا نستخدم useOrderNotifications لأن الإشعارات تأتي من قاعدة البيانات
    // عبر useFloatingNotifications الذي يستمع لجدول notifications
    if (user.role === 'customer') {
      return;
    }

    // تنظيف shownOrderIds عند إعادة التحميل لتجنب إعادة عرض الإشعارات القديمة
    shownOrderIds.current.clear();

    // إنشاء channel للاستماع إلى تغييرات الطلبات (للسائقين فقط)
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
      // تنظيف shownOrderIds عند إلغاء الاشتراك
      shownOrderIds.current.clear();
    };
  }, [user, addNotification]);

  return {
    notification: currentNotification,
    visible,
    dismiss,
  };
}


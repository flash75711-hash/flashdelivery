import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FloatingNotificationData } from '@/components/FloatingNotification';

export function useFloatingNotifications() {
  const { user } = useAuth();
  const [currentNotification, setCurrentNotification] = useState<FloatingNotificationData | null>(null);
  const [visible, setVisible] = useState(false);
  const notificationQueue = useRef<FloatingNotificationData[]>([]);
  const isShowing = useRef(false);
  const shownNotificationIds = useRef<Set<string>>(new Set());

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
    
    // بعد 300ms، نمسح الإشعار ونعرض التالي
    setTimeout(() => {
      setCurrentNotification(null);
      showNextNotification();
    }, 300);
  }, [showNextNotification]);

  const addNotification = useCallback((notification: FloatingNotificationData) => {
    // تجنب عرض نفس الإشعار مرتين
    if (shownNotificationIds.current.has(notification.id)) {
      return;
    }
    
    shownNotificationIds.current.add(notification.id);
    
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
    if (!user) return;

    // الاشتراك في Realtime للإشعارات الجديدة
    const notificationsChannel = supabase
      .channel(`floating_notifications_${user.id}`)
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
          
          // تخطي الإشعارات المقروءة
          if (newNotification.is_read) {
            return;
          }

          // إضافة الإشعار إلى الطابور (بما في ذلك إشعارات الطلبات)
          addNotification({
            id: newNotification.id,
            title: newNotification.title,
            message: newNotification.message,
            type: newNotification.type || 'info',
            order_id: newNotification.order_id,
            created_at: newNotification.created_at,
          });
        }
      )
      .subscribe();

    // جلب الإشعارات غير المقروءة عند التحميل الأول
    const loadUnreadNotifications = async () => {
      try {
        const { data: notifications, error } = await supabase
          .from('notifications')
          .select('id, title, message, type, order_id, created_at')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) {
          console.error('Error loading notifications:', error);
          return;
        }

        if (notifications && notifications.length > 0) {
          // عرض جميع الإشعارات (بما في ذلك إشعارات الطلبات)
          // عرض أول إشعار
          const firstNotification = notifications[0];
          addNotification({
            id: firstNotification.id,
            title: firstNotification.title,
            message: firstNotification.message,
            type: firstNotification.type || 'info',
            order_id: firstNotification.order_id,
            created_at: firstNotification.created_at,
          });

          // إضافة الباقي إلى الطابور
          notifications.slice(1).forEach(notification => {
            notificationQueue.current.push({
              id: notification.id,
              title: notification.title,
              message: notification.message,
              type: notification.type || 'info',
              order_id: notification.order_id,
              created_at: notification.created_at,
            });
          });
        }
      } catch (error) {
        console.error('Error in loadUnreadNotifications:', error);
      }
    };

    loadUnreadNotifications();

    // Fallback: التحقق من الإشعارات الجديدة كل 3 ثواني (في حالة فشل Realtime)
    const pollInterval = setInterval(async () => {
      try {
        const { data: newNotifications, error } = await supabase
          .from('notifications')
          .select('id, title, message, type, order_id, created_at, is_read')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error polling notifications:', error);
          return;
        }

        if (newNotifications && newNotifications.length > 0) {
          const latestNotification = newNotifications[0];
          
          // التحقق من أن الإشعار لم يتم عرضه من قبل
          if (!shownNotificationIds.current.has(latestNotification.id)) {
            addNotification({
              id: latestNotification.id,
              title: latestNotification.title,
              message: latestNotification.message,
              type: latestNotification.type || 'info',
              order_id: latestNotification.order_id,
              created_at: latestNotification.created_at,
            });
          }
        }
      } catch (error) {
        console.error('Error polling notifications:', error);
      }
    }, 3000); // كل 3 ثواني

    return () => {
      notificationsChannel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [user, addNotification]);

  return {
    notification: currentNotification,
    visible,
    dismiss,
  };
}


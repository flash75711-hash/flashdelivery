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
      console.log('🔔 [useFloatingNotifications] Notification already shown, skipping:', notification.id);
      return;
    }

    console.log('🔔 [useFloatingNotifications] addNotification called:', {
      notification,
      isShowing: isShowing.current,
      queueLength: notificationQueue.current.length,
    });
    
    // إذا كان هناك إشعار معروض حالياً، نضيف الجديد إلى الطابور
    if (isShowing.current) {
      console.log('🔔 [useFloatingNotifications] Adding to queue (notification already showing)');
      notificationQueue.current.push(notification);
      shownNotificationIds.current.add(notification.id);
    } else {
      // إذا لم يكن هناك إشعار معروض، نعرضه مباشرة
      console.log('🔔 [useFloatingNotifications] Showing notification immediately');
      setCurrentNotification(notification);
      setVisible(true);
      isShowing.current = true;
      shownNotificationIds.current.add(notification.id);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    console.log('🔔 [useFloatingNotifications] Setting up Realtime subscription for user:', user.id, 'role:', user.role);

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
          console.log('🔔 [useFloatingNotifications] Realtime event received:', payload);
          const newNotification = payload.new as any;
          
          console.log('🔔 [useFloatingNotifications] New notification:', {
            id: newNotification.id,
            title: newNotification.title,
            is_read: newNotification.is_read,
            order_id: newNotification.order_id,
            user_role: user.role,
          });
          
          // تخطي الإشعارات المقروءة
          if (newNotification.is_read) {
            console.log('🔔 [useFloatingNotifications] Skipping read notification');
            return;
          }

          // تخطي إشعارات الطلبات للسائقين (يتم التعامل معها في FloatingOrderNotification)
          if (user.role === 'driver' && newNotification.order_id) {
            console.log('🔔 [useFloatingNotifications] Skipping order notification for driver');
            return;
          }

          console.log('🔔 [useFloatingNotifications] Adding notification to queue');
          // إضافة الإشعار إلى الطابور
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
      .subscribe((status) => {
        console.log('🔔 [useFloatingNotifications] Subscription status:', status);
      });

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
          // تخطي إشعارات الطلبات للسائقين
          const filteredNotifications = user.role === 'driver'
            ? notifications.filter(n => !n.order_id)
            : notifications;

          if (filteredNotifications.length > 0) {
            // عرض أول إشعار
            const firstNotification = filteredNotifications[0];
            addNotification({
              id: firstNotification.id,
              title: firstNotification.title,
              message: firstNotification.message,
              type: firstNotification.type || 'info',
              order_id: firstNotification.order_id,
              created_at: firstNotification.created_at,
            });

            // إضافة الباقي إلى الطابور
            filteredNotifications.slice(1).forEach(notification => {
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
          console.error('🔔 [useFloatingNotifications] Polling error:', error);
          return;
        }

        if (newNotifications && newNotifications.length > 0) {
          const latestNotification = newNotifications[0];
          
          // التحقق من أن الإشعار لم يتم عرضه من قبل
          if (!shownNotificationIds.current.has(latestNotification.id)) {
            // تخطي إشعارات الطلبات للسائقين
            if (user.role === 'driver' && latestNotification.order_id) {
              return;
            }

            console.log('🔔 [useFloatingNotifications] Found new notification via polling:', latestNotification);
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
        console.error('🔔 [useFloatingNotifications] Polling error:', error);
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


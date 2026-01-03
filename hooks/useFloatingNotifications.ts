import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FloatingNotificationData } from '@/components/FloatingNotification';

export function useFloatingNotifications() {
  const { session, user, loading } = useAuth();
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
    // تجنب عرض نفس الإشعار مرتين (atomic check-and-add)
    const sizeBefore = shownNotificationIds.current.size;
    shownNotificationIds.current.add(notification.id);
    const wasAdded = shownNotificationIds.current.size > sizeBefore;
    
    if (!wasAdded) {
      return;
    }
    
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
    // انتظار حتى يتم تحميل الـ session
    if (loading) {
      return;
    }

    let notificationsChannel: ReturnType<typeof supabase.channel> | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 5;

    // التحقق من session أو user للحصول على userId
    const initializeNotifications = async () => {
      // محاولة استخدام session من AuthContext أولاً، وإذا لم يكن متاحاً، نجرب getSession
      let currentSession = session;
      let userId: string | null = null;

      // إذا كان user متاحاً من AuthContext (مثل تسجيل الدخول بـ PIN)، استخدمه
      if (user?.id) {
        userId = user.id;
      } else if (currentSession?.user?.id) {
        userId = currentSession.user.id;
      } else {
        // محاولة جلب session من Supabase
        const { data: { session: fetchedSession } } = await supabase.auth.getSession();
        if (fetchedSession?.user?.id) {
          userId = fetchedSession.user.id;
          currentSession = fetchedSession;
        }
      }
      
      if (!userId) {
        if (retryCount < maxRetries && isMounted) {
          retryCount++;
          // إعادة المحاولة بعد ثانية واحدة
          setTimeout(() => {
            if (isMounted) {
              initializeNotifications();
            }
          }, 1000);
        }
        return;
      }

      if (!isMounted) {
        return;
      }

      retryCount = 0; // إعادة تعيين عداد المحاولات عند النجاح

      const channelName = `floating_notifications_${userId}`;

    // الاشتراك في Realtime للإشعارات الجديدة
      notificationsChannel = supabase
        .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
            filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
            if (!isMounted) return;
            
          const newNotification = payload.new as any;
          
          // تخطي الإشعارات المقروءة
          if (newNotification.is_read) {
            return;
          }

            // التحقق من أن الإشعار للمستخدم الحالي
            if (newNotification.user_id !== userId) {
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
        .subscribe((status, err) => {
          if (!isMounted) return;
          
          if (status === 'CHANNEL_ERROR') {
            console.error('[useFloatingNotifications] خطأ في الاشتراك في Realtime', {
              error: err,
              userId,
              channel: channelName,
            });
          }
      });

    // جلب الإشعارات غير المقروءة عند التحميل الأول
    const loadUnreadNotifications = async () => {
        if (!isMounted || !userId) return;
        
        try {
          // محاولة جلب الإشعارات مباشرة أولاً
          let notifications: any[] | null = null;
          let error: any = null;

          const { data, error: queryError } = await supabase
          .from('notifications')
          .select('id, title, message, type, order_id, created_at')
            .eq('user_id', userId)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(5);

          notifications = data;
          error = queryError;

          // إذا فشل الـ query (مثل RLS issue)، استخدم Edge Function
          if (error || (notifications && notifications.length === 0 && !session)) {
            try {
              const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-notifications', {
                body: { user_id: userId, limit: 5 },
              });

              if (edgeError) {
                console.error('[useFloatingNotifications] Error from Edge Function:', edgeError);
              } else if (edgeData?.notifications) {
                // تصفية الإشعارات المقروءة من Edge Function
                notifications = edgeData.notifications.filter((n: any) => !n.is_read);
                error = null;
              }
            } catch (edgeErr) {
              console.error('[useFloatingNotifications] Error calling Edge Function:', edgeErr);
            }
          }

        if (error) {
            console.error('❌ [useFloatingNotifications] Error loading notifications:', {
              error,
              errorCode: error.code,
              errorMessage: error.message,
              errorDetails: error.details,
              userId,
            });
          return;
        }

          if (!isMounted) return;

        if (notifications && notifications.length > 0) {
            // تصفية الإشعارات المقروءة والإشعارات المعروضة مسبقاً
            const unreadNotifications = notifications.filter(
              n => !n.is_read && !shownNotificationIds.current.has(n.id)
            );
            
            if (unreadNotifications.length === 0) {
              return;
            }
            
            // عرض جميع الإشعارات غير المقروءة (بما في ذلك إشعارات الطلبات)
            // عرض أول إشعار
            const firstNotification = unreadNotifications[0];
            addNotification({
              id: firstNotification.id,
              title: firstNotification.title,
              message: firstNotification.message,
              type: firstNotification.type || 'info',
              order_id: firstNotification.order_id,
              created_at: firstNotification.created_at,
            });

            // إضافة الباقي إلى الطابور
            unreadNotifications.slice(1).forEach(notification => {
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
          console.error('[useFloatingNotifications] Error in loadUnreadNotifications:', {
            error,
            userId,
          });
      }
    };

    loadUnreadNotifications();

    // Fallback: التحقق من الإشعارات الجديدة كل 3 ثواني (في حالة فشل Realtime)
          pollInterval = setInterval(async () => {
            if (!isMounted || !userId) return;
            
      try {
              let newNotifications: any[] | null = null;
              let error: any = null;

              // محاولة جلب الإشعارات مباشرة أولاً
              const { data, error: queryError } = await supabase
          .from('notifications')
          .select('id, title, message, type, order_id, created_at, is_read')
                .eq('user_id', userId)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(1);

              newNotifications = data;
              error = queryError;

              // إذا فشل الـ query (مثل RLS issue) أو لا يوجد session، استخدم Edge Function
              if (error || !session) {
                try {
                  const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-notifications', {
                    body: { user_id: userId, limit: 1 },
                  });

                  if (edgeError) {
                    console.error('[useFloatingNotifications] Error from Edge Function (polling):', edgeError);
                  } else if (edgeData?.notifications) {
                    newNotifications = edgeData.notifications;
                    error = null;
                  } else {
                    newNotifications = [];
                    error = null;
                  }
                } catch (edgeErr) {
                  console.error('[useFloatingNotifications] Error calling Edge Function (polling):', edgeErr);
                }
              }

        if (error) {
                console.error('[useFloatingNotifications] Error polling notifications:', {
                  error,
                  errorCode: error.code,
                  errorMessage: error.message,
                  userId,
                });
          return;
        }

          if (!isMounted) return;

        if (newNotifications && newNotifications.length > 0) {
          const latestNotification = newNotifications[0];
          
          // تخطي الإشعارات المقروءة
          if (latestNotification.is_read) {
            return;
          }
          
          // التحقق من أن الإشعار لم يُعرض مسبقاً
          if (shownNotificationIds.current.has(latestNotification.id)) {
            return;
          }
          
            addNotification({
              id: latestNotification.id,
              title: latestNotification.title,
              message: latestNotification.message,
              type: latestNotification.type || 'info',
              order_id: latestNotification.order_id,
              created_at: latestNotification.created_at,
            });
          }
      } catch (error) {
          console.error('[useFloatingNotifications] Error polling notifications:', {
            error,
          });
      }
    }, 3000); // كل 3 ثواني
    };

    initializeNotifications();

    return () => {
      isMounted = false;
      if (notificationsChannel) {
      notificationsChannel.unsubscribe();
      }
      if (pollInterval) {
      clearInterval(pollInterval);
      }
    };
  }, [session?.user?.id, user?.id, loading]); // إزالة addNotification لتجنب إعادة الاشتراك غير الضرورية

  return {
    notification: currentNotification,
    visible,
    dismiss,
  };
}


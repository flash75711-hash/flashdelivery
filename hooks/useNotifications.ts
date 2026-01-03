import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  is_read: boolean;
  created_at: string;
}

export function useNotifications(limit: number = 50) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const loadNotifications = async (loadLimit?: number, append: boolean = false) => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    const currentLimit = loadLimit || limit;
    
    try {
      // التحقق من وجود session أولاً
      const { data: { session } } = await supabase.auth.getSession();
      
      let data: any[] | null = null;
      let error: any = null;
      
      // إذا كان هناك session، استخدم query مباشر
      if (session) {
        const result = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(currentLimit);
        
        data = result.data;
        error = result.error;
      } else {
        // إذا لم يكن هناك session، استخدم Edge Function لتجاوز RLS
        console.log('[useNotifications] No session found, using Edge Function to bypass RLS');
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-notifications', {
          body: { user_id: user.id, limit: currentLimit },
        });
        
        if (edgeError) {
          console.error('[useNotifications] Error from Edge Function:', edgeError);
          error = edgeError;
        } else if (edgeData?.notifications) {
          data = edgeData.notifications;
          error = null;
        }
      }
      
      if (error) {
        console.error('[useNotifications] Error loading notifications:', error);
        return;
      }
      
      // ترتيب الإشعارات يدوياً: غير المقروءة أولاً
      const sortedData = (data || []).sort((a, b) => {
        // غير المقروءة أولاً
        if (a.is_read !== b.is_read) {
          return a.is_read ? 1 : -1;
        }
        // ثم حسب التاريخ (الأحدث أولاً)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      console.log('[useNotifications] Loaded notifications:', {
        count: sortedData.length,
        unread: sortedData.filter(n => !n.is_read).length,
        userId: user.id,
        notifications: sortedData.map(n => ({ id: n.id, title: n.title, is_read: n.is_read })),
      });

      // التحقق من وجود المزيد من الإشعارات
      let count: number | null = null;
      const { data: { session: countSession } } = await supabase.auth.getSession();
      
      if (countSession) {
        const { count: queryCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        count = queryCount;
      } else {
        // إذا لم يكن هناك session، استخدم Edge Function
        const { data: edgeData } = await supabase.functions.invoke('get-notifications', {
          body: { user_id: user.id, limit: 1000 }, // حد كبير للحصول على العدد الكلي
        });
        count = edgeData?.notifications?.length || 0;
      }
      
      const allNotifications = sortedData || [];
      
      setHasMore((count || 0) > allNotifications.length);
      
      if (append) {
        // إضافة الإشعارات الجديدة إلى القائمة الموجودة
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newNotifications = allNotifications.filter(n => !existingIds.has(n.id));
          // ترتيب القائمة المدمجة
          const merged = [...prev, ...newNotifications].sort((a, b) => {
            if (a.is_read !== b.is_read) {
              return a.is_read ? 1 : -1;
            }
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          return merged;
        });
        // تحديث unreadCount من جميع الإشعارات المحملة
        const { data: { session: unreadSession } } = await supabase.auth.getSession();
        if (unreadSession) {
          const { data: allUnreadData } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_read', false);
          setUnreadCount(allUnreadData?.length || 0);
        } else {
          // استخدام Edge Function إذا لم يكن هناك session
          const { data: edgeData } = await supabase.functions.invoke('get-notifications', {
            body: { user_id: user.id, limit: 1000 },
          });
          const unreadCount = edgeData?.notifications?.filter((n: any) => !n.is_read).length || 0;
          setUnreadCount(unreadCount);
        }
      } else {
        const unread = allNotifications.filter(n => !n.is_read).length;
        setNotifications(allNotifications);
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    if (!user) return;
    
    try {
      // التحقق من وجود session أولاً
      const { data: { session } } = await supabase.auth.getSession();
      
      let error: any = null;
      
      // إذا كان هناك session، استخدم update مباشر
      if (session) {
        const result = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId);
        
        error = result.error;
      } else {
        // إذا لم يكن هناك session، استخدم Edge Function
        console.log('[useNotifications] No session found, using Edge Function to mark notification as read');
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('mark-notification-read', {
          body: { notification_id: notificationId, user_id: user.id },
        });
        
        if (edgeError) {
          console.error('[useNotifications] Error from Edge Function:', edgeError);
          error = edgeError;
        } else if (!edgeData?.success) {
          error = new Error(edgeData?.error || 'فشل تحديث حالة الإشعار');
        } else {
          console.log('[useNotifications] Notification marked as read via Edge Function:', edgeData.notification);
        }
      }
      
      if (error) {
        console.error('[useNotifications] Error marking notification as read:', error);
        return;
      }
      
      // تحديث الحالة المحلية
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('[useNotifications] Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    try {
      // التحقق من وجود session أولاً
      const { data: { session } } = await supabase.auth.getSession();
      
      let error: any = null;
      
      // إذا كان هناك session، استخدم update مباشر
      if (session) {
        const result = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .eq('is_read', false);
        
        error = result.error;
      } else {
        // إذا لم يكن هناك session، نستخدم Edge Function لكل إشعار غير مقروء
        console.log('[useNotifications] No session found, using Edge Function to mark all notifications as read');
        const unreadNotifications = notifications.filter(n => !n.is_read);
        
        // تحديث كل إشعار غير مقروء
        const updatePromises = unreadNotifications.map(notification =>
          supabase.functions.invoke('mark-notification-read', {
            body: { notification_id: notification.id, user_id: user.id },
          })
        );
        
        const results = await Promise.all(updatePromises);
        const failedUpdates = results.filter(r => r.error || !r.data?.success);
        
        if (failedUpdates.length > 0) {
          error = new Error(`فشل تحديث ${failedUpdates.length} إشعار`);
          console.error('[useNotifications] Some notifications failed to update:', failedUpdates);
        } else {
          console.log('[useNotifications] All notifications marked as read via Edge Function');
        }
      }
      
      if (error) {
        console.error('[useNotifications] Error marking all notifications as read:', error);
        return;
      }
      
      // تحديث الحالة المحلية
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('[useNotifications] Error marking all notifications as read:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();
      
      // الاشتراك في Realtime للإشعارات
      const channelName = `notifications_${user.id}`;
      const notificationsChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadNotifications();
          }
        )
        .subscribe();
      
      return () => {
        notificationsChannel.unsubscribe();
      };
    }
  }, [user]);

  const loadMore = async () => {
    if (!hasMore || loading || !user) return;
    
    setLoading(true);
    const currentLimit = notifications.length + 20;
    await loadNotifications(currentLimit, true); // append = true لإضافة الإشعارات الجديدة
  };

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    loadNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
  };
}
import { supabase } from './supabase';

export interface CreateNotificationParams {
  user_id: string;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  order_id?: string;
}

/**
 * إرسال Push Notification للمستخدم
 * يستخدم Edge Function لإرسال Push Notifications عبر FCM
 */
async function sendPushNotification(userId: string, title: string, message: string, data?: any) {
  try {
    console.log('[sendPushNotification] Starting push notification for user:', userId);
    
    // التحقق من وجود session
    const { data: { session } } = await supabase.auth.getSession();
    
    // إذا لم يكن هناك session، استخدم Edge Function create-notification
    // لأنها ترسل Push Notification تلقائياً
    if (!session) {
      console.log('[sendPushNotification] No session, using create-notification Edge Function');
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-notification', {
          body: {
            user_id: userId,
            title: title,
            message: message,
            type: 'info',
            order_id: data?.order_id || null,
          },
        });

        if (edgeError) {
          console.error('[sendPushNotification] Error from create-notification Edge Function:', edgeError);
          return;
        }

        if (edgeData?.success) {
          console.log('[sendPushNotification] ✅ Push notification sent via create-notification Edge Function');
        } else {
          console.warn('[sendPushNotification] ⚠️ create-notification returned success=false:', edgeData);
        }
        return;
      } catch (edgeErr) {
        console.error('[sendPushNotification] Exception calling create-notification Edge Function:', edgeErr);
        return;
      }
    }

    // إذا كان هناك session، استخدم send-push-notification Edge Function مباشرة
    console.log('[sendPushNotification] Session found, using send-push-notification Edge Function');
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: userId,
        title: title,
        message: message,
        data: data || {},
      },
    });

    if (edgeError) {
      console.error('[sendPushNotification] ❌ Error sending push notification:', edgeError);
      return;
    }

    if (edgeData?.sent && edgeData.sent > 0) {
      console.log(`[sendPushNotification] ✅ Push notification sent successfully to ${edgeData.sent} device(s)`);
    } else {
      console.warn('[sendPushNotification] ⚠️ No devices found or push notification not sent:', edgeData);
    }
  } catch (error) {
    console.error('[sendPushNotification] ❌ Exception sending push notification:', error);
  }
}

/**
 * إنشاء إشعار واحد وإرسال Push Notification
 * يستخدم الدالة insert_notification_for_driver للسائقين لتجاوز RLS
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    // الحصول على المستخدم الحالي
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    
    // إذا لم يكن هناك session، استخدم Edge Function
    if (!session) {
      console.log('[createNotification] No session found, using Edge Function to create notification');
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-notification', {
          body: {
            user_id: params.user_id,
            title: params.title,
            message: params.message,
            type: params.type || 'info',
            order_id: params.order_id || null,
          },
        });

        if (edgeError) {
          console.error('[createNotification] Error from Edge Function:', edgeError);
          return { success: false, error: edgeError };
        }

        if (!edgeData?.success) {
          console.error('[createNotification] Edge Function returned error:', edgeData?.error);
          return { success: false, error: new Error(edgeData?.error || 'فشل إنشاء الإشعار') };
        }

        console.log('[createNotification] Notification created successfully via Edge Function:', edgeData.notification);
        return { success: true };
      } catch (edgeErr: any) {
        console.error('[createNotification] Exception calling Edge Function:', edgeErr);
        return { success: false, error: edgeErr };
      }
    }
    
    if (!authUser) {
      console.error('[createNotification] No authenticated user');
      return { success: false, error: new Error('No authenticated user') };
    }

    // التحقق من دور المستخدم الحالي والمستلم
    const { data: currentUser, error: currentUserError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (currentUserError) {
      // Silently handle error - continue with default behavior
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', params.user_id)
      .maybeSingle();

    if (targetUserError) {
      // Silently handle error - continue with default behavior
    }

    const isCustomer = currentUser?.role === 'customer';
    const isDriver = currentUser?.role === 'driver';
    const targetIsDriver = targetUser?.role === 'driver';
    const targetIsCustomer = targetUser?.role === 'customer';

    // إذا كان المستخدم عميلاً والمستلم سائق، استخدم الدالة RPC
    if (isCustomer && targetIsDriver) {
      const { error } = await supabase.rpc('insert_notification_for_driver', {
        p_user_id: params.user_id,
        p_title: params.title,
        p_message: params.message,
        p_type: params.type || 'info',
        p_order_id: params.order_id || null,
      });

      if (error) {
        console.error('[createNotification] Error creating notification:', error);
        return { success: false, error };
      }
    } 
    // إذا كان المستخدم سائقاً والمستلم عميل، استخدم الدالة RPC
    else if (isDriver && targetIsCustomer) {
      console.log('[createNotification] Driver sending notification to customer via RPC:', {
        driverId: authUser.id,
        customerId: params.user_id,
        title: params.title,
        orderId: params.order_id,
      });
      
      const { data: rpcData, error } = await supabase.rpc('insert_notification_for_customer_by_driver', {
        p_user_id: params.user_id,
        p_title: params.title,
        p_message: params.message,
        p_type: params.type || 'info',
        p_order_id: params.order_id || null,
      });

      if (error) {
        console.error('[createNotification] Error creating notification via RPC:', {
          error,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          driverId: authUser.id,
          customerId: params.user_id,
        });
        return { success: false, error };
      }
      
      console.log('[createNotification] Notification created successfully via RPC:', rpcData);
    }
    // إذا كان المستخدم سائقاً ولكن لم نتمكن من التحقق من دور المستلم، جرب RPC function
    else if (isDriver && !targetUser) {
      // Fallback: إذا كان المستخدم سائقاً ولم نتمكن من التحقق من دور المستلم، استخدم RPC function
      console.log('[createNotification] Driver sending notification (target role unknown) via RPC:', {
        driverId: authUser.id,
        targetUserId: params.user_id,
        title: params.title,
        orderId: params.order_id,
      });
      
      const { data: rpcData, error } = await supabase.rpc('insert_notification_for_customer_by_driver', {
        p_user_id: params.user_id,
        p_title: params.title,
        p_message: params.message,
        p_type: params.type || 'info',
        p_order_id: params.order_id || null,
      });

      if (error) {
        console.error('[createNotification] Error creating notification via RPC (fallback):', {
          error,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          driverId: authUser.id,
          targetUserId: params.user_id,
        });
        return { success: false, error };
      }
      
      console.log('[createNotification] Notification created successfully via RPC (fallback):', rpcData);
    }
    // للمستخدمين الآخرين (مثل المديرين)، استخدم INSERT العادي
    else {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: params.user_id,
          title: params.title,
          message: params.message,
          type: params.type || 'info',
          order_id: params.order_id || null,
        });
      
      if (error) {
        console.error('[createNotification] Error creating notification:', error);
        return { success: false, error };
      }
    }
    
    // إرسال Push Notification
    await sendPushNotification(
      params.user_id,
      params.title,
      params.message,
      params.order_id ? { order_id: params.order_id } : undefined
    );
    
    return { success: true };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error };
  }
}

/**
 * إنشاء إشعارات متعددة
 * يستخدم الدالة insert_notification_for_driver للسائقين لتجاوز RLS
 */
export async function createNotifications(notifications: CreateNotificationParams[]) {
  try {
    // التحقق من أن المستخدم الحالي عميل (للسائقين فقط)
    const { data: currentUser } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
      .maybeSingle();

    const isCustomer = currentUser?.role === 'customer';
    const isDriver = currentUser?.role === 'driver';

    // إذا كان المستخدم عميلاً أو سائقاً، استخدم الدالة RPC المناسبة
    if (isCustomer || isDriver) {
      let successCount = 0;
      let errorCount = 0;

      for (const notification of notifications) {
        // التحقق من دور المستلم
        const { data: targetUser } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', notification.user_id)
          .maybeSingle();

        const targetIsDriver = targetUser?.role === 'driver';
        const targetIsCustomer = targetUser?.role === 'customer';

        // إذا كان المستخدم عميلاً والمستلم سائق
        if (isCustomer && targetIsDriver) {
          try {
            const { error } = await supabase.rpc('insert_notification_for_driver', {
              p_user_id: notification.user_id,
              p_title: notification.title,
              p_message: notification.message,
              p_type: notification.type || 'info',
              p_order_id: notification.order_id || null,
            });

            if (error) {
              console.error(`[createNotifications] Error creating notification for driver ${notification.user_id}:`, error);
              errorCount++;
            } else {
              successCount++;
              // إرسال Push Notification
              await sendPushNotification(
                notification.user_id,
                notification.title,
                notification.message,
                notification.order_id ? { order_id: notification.order_id } : undefined
              );
            }
          } catch (err) {
            console.error(`[createNotifications] Error creating notification for driver ${notification.user_id}:`, err);
            errorCount++;
          }
        }
        // إذا كان المستخدم سائقاً والمستلم عميل
        else if (isDriver && targetIsCustomer) {
          try {
            const { error } = await supabase.rpc('insert_notification_for_customer_by_driver', {
              p_user_id: notification.user_id,
              p_title: notification.title,
              p_message: notification.message,
              p_type: notification.type || 'info',
              p_order_id: notification.order_id || null,
            });

            if (error) {
              console.error(`[createNotifications] Error creating notification for customer ${notification.user_id}:`, error);
              errorCount++;
            } else {
              successCount++;
              // إرسال Push Notification
              await sendPushNotification(
                notification.user_id,
                notification.title,
                notification.message,
                notification.order_id ? { order_id: notification.order_id } : undefined
              );
            }
          } catch (err) {
            console.error(`[createNotifications] Error creating notification for customer ${notification.user_id}:`, err);
            errorCount++;
          }
        } else {
          // للمستخدمين الآخرين، استخدم INSERT العادي (للمديرين فقط)
          try {
            const { error } = await supabase
              .from('notifications')
              .insert({
                user_id: notification.user_id,
                title: notification.title,
                message: notification.message,
                type: notification.type || 'info',
                order_id: notification.order_id || null,
              });

            if (error) {
              console.error(`[createNotifications] Error creating notification for ${notification.user_id}:`, error);
              errorCount++;
            } else {
              successCount++;
              // إرسال Push Notification
              await sendPushNotification(
                notification.user_id,
                notification.title,
                notification.message,
                notification.order_id ? { order_id: notification.order_id } : undefined
              );
            }
          } catch (err) {
            console.error(`[createNotifications] Error creating notification for ${notification.user_id}:`, err);
            errorCount++;
          }
        }
      }

      if (errorCount > 0) {
        return { success: false, error: new Error(`Failed to create ${errorCount} notifications`) };
      }
      return { success: true };
    } else {
      // للمديرين، استخدم INSERT العادي
      const { error } = await supabase
        .from('notifications')
        .insert(notifications.map(n => ({
          user_id: n.user_id,
          title: n.title,
          message: n.message,
          type: n.type || 'info',
          order_id: n.order_id || null,
        })));
      
      if (error) {
        console.error('[createNotifications] Error creating notifications:', error);
        return { success: false, error };
      }
      
      // إرسال Push Notifications لجميع الإشعارات
      for (const notification of notifications) {
        await sendPushNotification(
          notification.user_id,
          notification.title,
          notification.message,
          notification.order_id ? { order_id: notification.order_id } : undefined
        );
      }
      
      return { success: true };
    }
  } catch (error) {
    console.error('[createNotifications] Error creating notifications:', error);
    return { success: false, error };
  }
}

/**
 * إرسال إشعار لجميع المديرين
 */
export async function notifyAllAdmins(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') {
  try {
    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');
    
    if (adminsError || !admins || admins.length === 0) {
      return { success: false, error: adminsError };
    }
    
    const notifications = admins.map(admin => ({
      user_id: admin.id,
      title,
      message,
      type,
    }));
    
    return await createNotifications(notifications);
  } catch (error) {
    console.error('[notifyAllAdmins] Error notifying all admins:', error);
    return { success: false, error };
  }
}

/**
 * إرسال إشعار لجميع السائقين النشطين
 */
export async function notifyAllActiveDrivers(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') {
  try {
    const { data: drivers, error: driversError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'driver')
      .eq('status', 'active')
      .eq('approval_status', 'approved');
    
    if (driversError || !drivers || drivers.length === 0) {
      return { success: false, error: driversError };
    }
    
    const notifications = drivers.map(driver => ({
      user_id: driver.id,
      title,
      message,
      type,
    }));
    
    return await createNotifications(notifications);
  } catch (error) {
    console.error('[notifyAllActiveDrivers] Error notifying all active drivers:', error);
    return { success: false, error };
  }
}

/**
 * إرسال إشعار لجميع السائقين (بما فيهم غير النشطين)
 */
export async function notifyAllDrivers(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') {
  try {
    const { data: drivers, error: driversError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'driver');
    
    if (driversError || !drivers || drivers.length === 0) {
      return { success: false, error: driversError };
    }
    
    const notifications = drivers.map(driver => ({
      user_id: driver.id,
      title,
      message,
      type,
    }));
    
    return await createNotifications(notifications);
  } catch (error) {
    console.error('[notifyAllDrivers] Error notifying all drivers:', error);
    return { success: false, error };
  }
}

/**
 * إرسال إشعار لجميع العملاء
 */
export async function notifyAllCustomers(title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') {
  try {
    const { data: customers, error: customersError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'customer');
    
    if (customersError || !customers || customers.length === 0) {
      return { success: false, error: customersError };
    }
    
    const notifications = customers.map(customer => ({
      user_id: customer.id,
      title,
      message,
      type,
    }));
    
    return await createNotifications(notifications);
  } catch (error) {
    console.error('[notifyAllCustomers] Error notifying all customers:', error);
    return { success: false, error };
  }
}


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
 */
async function sendPushNotification(userId: string, title: string, message: string, data?: any) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('No session, skipping push notification');
      return;
    }

    const response = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: userId,
        title: title,
        message: message,
        data: data || {},
      },
    });

    if (response.error) {
      console.error('Error sending push notification:', response.error);
    } else {
      console.log('✅ Push notification sent:', response.data);
    }
  } catch (error) {
    console.error('Error in sendPushNotification:', error);
  }
}

/**
 * إنشاء إشعار واحد وإرسال Push Notification
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
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
      console.error('Error creating notification:', error);
      return { success: false, error };
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
      .single();

    const isCustomer = currentUser?.role === 'customer';

    // إذا كان المستخدم عميلاً، استخدم الدالة للسائقين
    if (isCustomer) {
      let successCount = 0;
      let errorCount = 0;

      for (const notification of notifications) {
        // التحقق من أن المستلم سائق
        const { data: targetUser } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', notification.user_id)
          .single();

        if (targetUser?.role === 'driver') {
          // استخدام الدالة للسائقين
          try {
            const { error } = await supabase.rpc('insert_notification_for_driver', {
              p_user_id: notification.user_id,
              p_title: notification.title,
              p_message: notification.message,
              p_type: notification.type || 'info',
              p_order_id: notification.order_id || null,
            });

            if (error) {
              console.error(`Error creating notification for driver ${notification.user_id}:`, error);
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
            console.error(`Error creating notification for driver ${notification.user_id}:`, err);
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
              console.error(`Error creating notification for ${notification.user_id}:`, error);
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
            console.error(`Error creating notification for ${notification.user_id}:`, err);
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
        console.error('Error creating notifications:', error);
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
    console.error('Error creating notifications:', error);
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
    console.error('Error notifying all admins:', error);
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
    console.error('Error notifying all active drivers:', error);
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
    console.error('Error notifying all drivers:', error);
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
    console.error('Error notifying all customers:', error);
    return { success: false, error };
  }
}





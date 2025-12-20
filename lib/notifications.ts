import { supabase } from './supabase';

export interface CreateNotificationParams {
  user_id: string;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}

/**
 * إنشاء إشعار واحد
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
      });
    
    if (error) {
      console.error('Error creating notification:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error };
  }
}

/**
 * إنشاء إشعارات متعددة
 */
export async function createNotifications(notifications: CreateNotificationParams[]) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert(notifications.map(n => ({
        user_id: n.user_id,
        title: n.title,
        message: n.message,
        type: n.type || 'info',
      })));
    
    if (error) {
      console.error('Error creating notifications:', error);
      return { success: false, error };
    }
    
    return { success: true };
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





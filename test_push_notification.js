/**
 * اختبار Push Notifications للسائقين
 * 
 * Usage:
 * node test_push_notification.js
 * 
 * أو في React Native/Expo:
 * import { testPushNotification } from './test_push_notification';
 * testPushNotification('DRIVER_ID_HERE');
 */

import { createNotification } from './lib/notifications';

/**
 * اختبار إرسال Push Notification لسائق
 * @param {string} driverId - ID السائق
 * @param {string} orderId - ID الطلب (اختياري)
 */
export async function testPushNotification(driverId, orderId = null) {
  console.log('🧪 بدء اختبار Push Notification...');
  console.log('📱 Driver ID:', driverId);
  console.log('📦 Order ID:', orderId || 'N/A');

  try {
    const result = await createNotification({
      user_id: driverId,
      title: 'اختبار Push Notification',
      message: 'هذا اختبار لـ Push Notification. إذا وصلت هذه الرسالة، فالنظام يعمل بشكل صحيح!',
      type: 'info',
      order_id: orderId,
    });

    if (result.success) {
      console.log('✅ تم إرسال الإشعار بنجاح!');
      console.log('📊 النتيجة:', result);
      return { success: true, result };
    } else {
      console.error('❌ فشل إرسال الإشعار');
      console.error('📊 الخطأ:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error);
    return { success: false, error };
  }
}

/**
 * اختبار إرسال Push Notifications لعدة سائقين
 * @param {string[]} driverIds - قائمة IDs السائقين
 * @param {string} orderId - ID الطلب (اختياري)
 */
export async function testPushNotificationsForMultipleDrivers(driverIds, orderId = null) {
  console.log('🧪 بدء اختبار Push Notifications لعدة سائقين...');
  console.log('👥 عدد السائقين:', driverIds.length);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const driverId of driverIds) {
    console.log(`\n📱 اختبار السائق: ${driverId}`);
    const result = await testPushNotification(driverId, orderId);
    results.push({ driverId, ...result });
    
    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }

    // انتظر ثانية واحدة بين كل إشعار
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n📊 ملخص النتائج:');
  console.log(`✅ نجح: ${successCount}`);
  console.log(`❌ فشل: ${failureCount}`);
  console.log(`📊 إجمالي: ${driverIds.length}`);

  return {
    total: driverIds.length,
    success: successCount,
    failure: failureCount,
    results,
  };
}

/**
 * اختبار Push Notification من خلال Edge Function مباشرة
 * @param {string} driverId - ID السائق
 * @param {string} supabaseUrl - رابط Supabase
 * @param {string} serviceRoleKey - Service Role Key
 */
export async function testPushNotificationDirect(driverId, supabaseUrl, serviceRoleKey) {
  console.log('🧪 اختبار Push Notification مباشرة من Edge Function...');
  console.log('📱 Driver ID:', driverId);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'X-Internal-Call': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: driverId,
        title: 'اختبار Push Notification مباشر',
        message: 'هذا اختبار مباشر من Edge Function',
        data: { order_id: 'test-order-id' },
      }),
    });

    const result = await response.json();
    
    if (response.ok && result.sent && result.sent > 0) {
      console.log('✅ تم إرسال Push Notification بنجاح!');
      console.log('📊 النتيجة:', result);
      return { success: true, result };
    } else {
      console.error('❌ فشل إرسال Push Notification');
      console.error('📊 النتيجة:', result);
      return { success: false, result };
    }
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error);
    return { success: false, error };
  }
}

// إذا تم استدعاء الملف مباشرة (Node.js)
if (typeof require !== 'undefined' && require.main === module) {
  console.log('📝 لاستخدام هذا الملف:');
  console.log('1. في React Native/Expo:');
  console.log('   import { testPushNotification } from "./test_push_notification";');
  console.log('   testPushNotification("DRIVER_ID_HERE");');
  console.log('\n2. أو استخدم Edge Function مباشرة:');
  console.log('   testPushNotificationDirect("DRIVER_ID", "SUPABASE_URL", "SERVICE_ROLE_KEY");');
}

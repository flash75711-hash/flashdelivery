/**
 * ملف اختبار بسيط لاختبار الإشعارات
 * يمكن استخدامه من console المتصفح بعد تسجيل الدخول
 */

// اختبار إنشاء إشعار للعميل الحالي
async function testCustomerNotification() {
  const { createNotification } = await import('./lib/notifications.ts');
  const { supabase } = await import('./lib/supabase.ts');
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ يجب تسجيل الدخول أولاً');
    return;
  }
  
  const result = await createNotification({
    user_id: user.id,
    title: 'إشعار اختبار',
    message: 'هذا إشعار اختبار للتحقق من ظهور الإشعارات',
    type: 'info',
  });
  
  if (result.success) {
    console.log('✅ تم إنشاء الإشعار بنجاح');
    console.log('📱 تحقق من ظهور الإشعار في FloatingNotification و NotificationCard');
  } else {
    console.error('❌ فشل إنشاء الإشعار:', result.error);
  }
}

// اختبار إنشاء إشعار لسائق معين
async function testDriverNotification(driverId) {
  const { createNotification } = await import('./lib/notifications.ts');
  const { supabase } = await import('./lib/supabase.ts');
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ يجب تسجيل الدخول أولاً');
    return;
  }
  
  if (!driverId) {
    console.error('❌ يجب توفير driverId');
    return;
  }
  
  const result = await createNotification({
    user_id: driverId,
    title: 'طلب جديد متاح',
    message: 'يوجد طلب جديد بقيمة 50 ج.م',
    type: 'info',
  });
  
  if (result.success) {
    console.log('✅ تم إنشاء الإشعار للسائق بنجاح');
    console.log('📱 تحقق من ظهور الإشعار في FloatingNotification و NotificationCard');
  } else {
    console.error('❌ فشل إنشاء الإشعار:', result.error);
  }
}

// اختبار إنشاء إشعار مرتبط بطلب
async function testOrderNotification(userId, orderId) {
  const { createNotification } = await import('./lib/notifications.ts');
  
  const result = await createNotification({
    user_id: userId,
    title: 'تم قبول طلبك',
    message: 'تم قبول طلبك وسيتم البدء في التوصيل قريباً.',
    type: 'success',
    order_id: orderId,
  });
  
  if (result.success) {
    console.log('✅ تم إنشاء إشعار الطلب بنجاح');
  } else {
    console.error('❌ فشل إنشاء إشعار الطلب:', result.error);
  }
}

// تصدير الدوال للاستخدام في console
if (typeof window !== 'undefined') {
  window.testNotifications = {
    testCustomerNotification,
    testDriverNotification,
    testOrderNotification,
  };
  console.log('✅ تم تحميل دوال الاختبار');
  console.log('📝 الاستخدام:');
  console.log('  - testNotifications.testCustomerNotification() - اختبار إشعار للعميل الحالي');
  console.log('  - testNotifications.testDriverNotification("driver-id") - اختبار إشعار لسائق');
  console.log('  - testNotifications.testOrderNotification("user-id", "order-id") - اختبار إشعار مرتبط بطلب');
}

export { testCustomerNotification, testDriverNotification, testOrderNotification };


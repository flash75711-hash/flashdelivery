/**
 * 🧪 اختبار سريع لإرسال Push Notification
 * 
 * الاستخدام:
 * node test_push_notification_now.js
 */

// استبدل هذه القيم بقيمك الفعلية
const SUPABASE_URL = 'https://tnwrmybyvimlsamnputn.supabase.co';
const SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // احصل عليها من Supabase Dashboard → Settings → API

// Driver ID من الاستعلام السابق
const DRIVER_ID = '6426591d-b457-49e0-9674-4cb769969d19'; // تاتات

async function testPushNotification() {
  console.log('🧪 بدء اختبار Push Notification...');
  console.log('📱 Driver ID:', DRIVER_ID);
  console.log('🔗 Supabase URL:', SUPABASE_URL);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'X-Internal-Call': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: DRIVER_ID,
        title: 'اختبار Push Notification',
        message: 'هذا اختبار لإرسال Push Notification. إذا وصلت هذه الرسالة، فالنظام يعمل بشكل صحيح!',
        data: { 
          order_id: 'test-order-' + Date.now(),
          test: 'true'
        },
      }),
    });

    const result = await response.json();
    
    console.log('\n📊 النتيجة:');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.sent && result.sent > 0) {
      console.log('\n✅ تم إرسال Push Notification بنجاح!');
      console.log('📱 يجب أن يتلقى السائق الإشعار على جهازه');
      return { success: true, result };
    } else {
      console.log('\n❌ فشل إرسال Push Notification');
      if (result.error) {
        console.log('❌ الخطأ:', result.error);
      }
      if (result.message) {
        console.log('📝 الرسالة:', result.message);
      }
      return { success: false, result };
    }
  } catch (error) {
    console.error('\n❌ خطأ في الاختبار:', error);
    return { success: false, error: error.message };
  }
}

// تشغيل الاختبار
if (require.main === module) {
  testPushNotification()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ الاختبار نجح!');
        process.exit(0);
      } else {
        console.log('\n❌ الاختبار فشل!');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n❌ خطأ غير متوقع:', error);
      process.exit(1);
    });
}

module.exports = { testPushNotification };

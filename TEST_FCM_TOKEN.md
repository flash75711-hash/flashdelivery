# 🧪 اختبار FCM Token - دليل شامل

## المشكلة الحالية
- لا تظهر لوجات من Edge Function `update-fcm-token`
- الدوال `window.testFCMTokenUpdate()` و `window.testAndroidBridge()` متاحة في الكونسول

## خطوات الاختبار

### 1. التحقق من إعدادات Supabase

افتح Console المتصفح (F12) ونفذ:

```javascript
// التحقق من Supabase URL
console.log('Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL || 'NOT SET');

// التحقق من Supabase Client
console.log('Supabase client:', window.__SUPABASE_CLIENT__ || 'Not exposed');
```

### 2. اختبار Edge Function مباشرة

#### أ) من Console المتصفح:

```javascript
// اختبار مع token فريد
window.testFCMTokenUpdate("test-token-" + Date.now())
```

**ما يجب أن تراه:**
- لوجات تبدأ بـ `🧪 [testFCMTokenUpdate]`
- لوجات تبدأ بـ `📱 [updateFCMToken]`
- لوجات تظهر URL الخاص بـ Edge Function
- لوجات تظهر استجابة من Edge Function

#### ب) من Network Tab:

1. افتح **DevTools** (F12)
2. اذهب إلى **Network** tab
3. نفذ `window.testFCMTokenUpdate("test")`
4. ابحث عن طلب إلى `update-fcm-token`
5. تحقق من:
   - **Status Code**: يجب أن يكون `200` أو `400` أو `500` (ليس `404`)
   - **Request URL**: يجب أن يحتوي على `/functions/v1/update-fcm-token`
   - **Request Payload**: يجب أن يحتوي على `user_id` و `fcm_token`
   - **Response**: يجب أن يحتوي على `success` أو `error`

### 3. التحقق من Edge Function Deployment

#### من Supabase Dashboard:

1. اذهب إلى: https://supabase.com/dashboard
2. اختر مشروعك
3. اذهب إلى **Edge Functions**
4. تحقق من وجود `update-fcm-token` في القائمة
5. إذا لم يكن موجوداً، انشره باستخدام:
   ```bash
   supabase functions deploy update-fcm-token
   ```

### 4. عرض لوجات Edge Function

#### من Supabase Dashboard:

1. اذهب إلى **Edge Functions** → **update-fcm-token**
2. اضغط على **Logs**
3. ستجد جميع اللوجات هناك

#### من Terminal (إذا كنت تستخدم Supabase CLI):

```bash
supabase functions logs update-fcm-token
```

### 5. اختبار مباشر باستخدام fetch

إذا لم يعمل `supabase.functions.invoke`، جرب مباشرة:

```javascript
// في Console المتصفح
async function testEdgeFunctionDirectly() {
  const supabaseUrl = 'https://tnwrmybyvimlsamnputn.supabase.co';
  const userId = 'YOUR_USER_ID'; // استبدل بـ user ID الحالي
  const testToken = 'test-token-' + Date.now();
  
  console.log('🧪 Testing Edge Function directly...');
  console.log('URL:', `${supabaseUrl}/functions/v1/update-fcm-token`);
  console.log('Payload:', { user_id: userId, fcm_token: testToken });
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/update-fcm-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`,
      },
      body: JSON.stringify({
        user_id: userId,
        fcm_token: testToken,
      }),
    });
    
    const data = await response.json();
    console.log('✅ Response:', data);
    console.log('✅ Status:', response.status);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// استدعاء الدالة
testEdgeFunctionDirectly();
```

### 6. التحقق من حفظ Token في قاعدة البيانات

#### من Supabase Dashboard:

1. اذهب إلى **Table Editor**
2. اختر جدول `profiles`
3. ابحث عن المستخدم الحالي (استخدم `id` من console)
4. تحقق من عمود `fcm_token`

#### من SQL Editor:

```sql
SELECT id, fcm_token, updated_at 
FROM profiles 
WHERE id = 'YOUR_USER_ID';
```

### 7. استكشاف الأخطاء

#### إذا لم تظهر لوجات Edge Function:

**السبب المحتمل 1: Edge Function غير منشور**
- **الحل**: انشر Edge Function من Terminal:
  ```bash
  supabase functions deploy update-fcm-token
  ```

**السبب المحتمل 2: الطلب لا يصل إلى Supabase**
- **الحل**: 
  1. افتح Network tab في DevTools
  2. نفذ `window.testFCMTokenUpdate("test")`
  3. تحقق من وجود طلب إلى `update-fcm-token`
  4. إذا لم يكن موجوداً، هناك مشكلة في الكود

**السبب المحتمل 3: خطأ في CORS**
- **الحل**: تحقق من CORS headers في Edge Function (يجب أن تكون موجودة)

**السبب المحتمل 4: خطأ في Authentication**
- **الحل**: تحقق من أن Edge Function يستخدم Service Role Key (يجب أن يكون موجوداً في Environment Variables)

#### إذا ظهر خطأ في console:

**خطأ: "Function not found"**
- **الحل**: Edge Function غير منشور - انشره من Terminal

**خطأ: "Network error"**
- **الحل**: تحقق من اتصال الإنترنت و Supabase URL

**خطأ: "Unauthorized"**
- **الحل**: تحقق من Service Role Key في Edge Function Environment Variables

### 8. نصائح إضافية

- استخدم tokens فريدة لكل اختبار (استخدم `Date.now()` أو `Math.random()`)
- تحقق من Network tab في DevTools لرؤية طلبات HTTP
- استخدم Supabase Dashboard لمراقبة اللوجات في الوقت الفعلي
- تأكد من أن المستخدم مسجل دخول قبل الاختبار

## الدعم

إذا استمرت المشاكل:
1. افتح Network tab في DevTools
2. نفذ `window.testFCMTokenUpdate("test")`
3. ابحث عن طلب إلى `update-fcm-token`
4. تحقق من Status Code و Response
5. شارك هذه المعلومات للدعم

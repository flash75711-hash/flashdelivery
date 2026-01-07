# تعليمات اختبار FCM Token

## المشكلة الحالية
- الدوال `window.testFCMTokenUpdate()` و `window.testAndroidBridge()` تظهر في الكونسول بشكل متكرر
- لا تظهر أي لوجات من Edge Function `update-fcm-token`

## الحل

### 1. إصلاح التكرار غير المحدود ✅
تم إصلاح المشكلة! الآن:
- `setInterval` يتوقف فوراً بعد 30 ثانية
- الرسائل التحذيرية تظهر مرة واحدة فقط
- لا يوجد تكرار غير محدود

**إذا رأيت تكراراً:**
- أعد تحميل الصفحة مرة واحدة فقط (F5 أو Ctrl+R)
- تأكد من أنك تستخدم أحدث نسخة من الكود

### 2. اختبار FCM Token يدوياً

#### أ) اختبار Edge Function عبر Supabase Client:
```javascript
// في console المتصفح
window.testFCMTokenUpdate("test-token-" + Date.now())
```

**ما يجب أن تراه:**
- لوجات في console المتصفح تبدأ بـ `🧪 [testFCMTokenUpdate]`
- لوجات تبدأ بـ `📱 [updateFCMToken]`
- لوجات تظهر URL الخاص بـ Edge Function
- لوجات من Edge Function في Supabase Dashboard

**إذا لم تظهر لوجات Edge Function:**
- جرب `window.testEdgeFunctionDirectly()` (انظر أدناه)
- افتح Network tab في DevTools وتحقق من الطلبات

#### ب) اختبار AndroidBridge (فقط في Android WebView):
```javascript
// في console المتصفح
window.testAndroidBridge()
```

**ملاحظة:** هذا يعمل فقط في Android WebView حيث `AndroidBridge` متاح.

#### ج) اختبار مباشر باستخدام fetch (للتشخيص):
```javascript
// في console المتصفح
window.testEdgeFunctionDirectly("test-token-" + Date.now())
```

**هذه الدالة تستخدم `fetch` مباشرة، مما يساعد في تشخيص المشاكل:**
- تظهر URL الكامل للـ Edge Function
- تظهر الاستجابة الكاملة من Supabase
- تساعد في معرفة إذا كانت المشكلة في Supabase client أو Edge Function نفسه

### 3. عرض لوجات Edge Function

#### من Supabase Dashboard:
1. اذهب إلى: https://supabase.com/dashboard
2. اختر مشروعك
3. اذهب إلى **Edge Functions** → **update-fcm-token**
4. اضغط على **Logs**
5. ستجد جميع اللوجات هناك

#### من Terminal (إذا كنت تستخدم Supabase CLI):
```bash
supabase functions logs update-fcm-token
```

### 4. التحقق من حفظ Token في قاعدة البيانات

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

### 5. خطوات الاختبار الكاملة

1. **تأكد من تسجيل الدخول:**
   ```javascript
   // في console
   console.log('User ID:', window.__USER_ID__); // إذا كان متاحاً
   ```

2. **اختبر Edge Function:**
   ```javascript
   window.testFCMTokenUpdate("test-token-" + Date.now())
   ```

3. **تحقق من اللوجات:**
   - في console المتصفح: ابحث عن `📱 [updateFCMToken]`
   - في Supabase Dashboard: اذهب إلى Edge Functions → Logs

4. **تحقق من قاعدة البيانات:**
   - في Supabase Dashboard: Table Editor → profiles → ابحث عن `fcm_token`

### 6. استكشاف الأخطاء

#### إذا لم تظهر لوجات Edge Function:
- تأكد من أن Edge Function منشور (deployed)
- تحقق من أن الطلب يصل إلى Supabase (افتح Network tab في DevTools)
- تحقق من CORS headers في Edge Function

#### إذا ظهر خطأ في console:
- اقرأ رسالة الخطأ بعناية
- تحقق من أن المستخدم مسجل دخول (`user?.id` موجود)
- تحقق من أن Supabase URL و Keys صحيحة

#### إذا كان Token لا يُحفظ في قاعدة البيانات:
- تحقق من RLS policies في جدول `profiles`
- تحقق من أن Edge Function يستخدم Service Role Key
- تحقق من لوجات Edge Function للأخطاء

### 7. نصائح إضافية

- استخدم tokens فريدة لكل اختبار (استخدم `Date.now()` أو `Math.random()`)
- تحقق من Network tab في DevTools لرؤية طلبات HTTP
- استخدم Supabase Dashboard لمراقبة اللوجات في الوقت الفعلي

## الدعم

إذا استمرت المشاكل:
1. افتح Network tab في DevTools
2. نفذ `window.testFCMTokenUpdate("test")`
3. ابحث عن طلب إلى `update-fcm-token`
4. تحقق من Status Code و Response
5. شارك هذه المعلومات للدعم

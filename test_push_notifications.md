# 🧪 اختبار Push Notifications للسائقين

## 📋 خطوات الاختبار

### 1️⃣ **التحقق من FCM Tokens**

#### أ. في Supabase SQL Editor:
```sql
-- نفذ هذا الاستعلام للتحقق من FCM tokens
SELECT 
  id,
  email,
  role,
  status,
  approval_status,
  CASE 
    WHEN fcm_token IS NULL THEN '❌ لا يوجد FCM token'
    WHEN fcm_token = '' THEN '❌ FCM token فارغ'
    ELSE '✅ FCM token موجود'
  END AS fcm_token_status,
  LENGTH(fcm_token) AS token_length
FROM profiles
WHERE role = 'driver'
  AND status = 'active'
  AND approval_status = 'approved'
ORDER BY updated_at DESC;
```

#### ب. النتيجة المتوقعة:
- يجب أن يكون لدى السائقين النشطين FCM tokens
- طول FCM token عادة يكون أكثر من 100 حرف

---

### 2️⃣ **التحقق من Edge Function Secrets**

#### أ. في Supabase Dashboard:
1. اذهب إلى **Edge Functions** → **Secrets**
2. تحقق من وجود `FCM_SERVICE_ACCOUNT_JSON`
3. تأكد من أن القيمة صحيحة (JSON صالح)

#### ب. التحقق من Service Account:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  ...
}
```

---

### 3️⃣ **اختبار Edge Function مباشرة**

#### أ. استخدام curl:
```bash
# استبدل القيم التالية:
# - YOUR_PROJECT_URL: رابط مشروع Supabase
# - YOUR_SERVICE_ROLE_KEY: Service Role Key
# - DRIVER_ID: ID السائق المراد اختباره

curl -X POST https://YOUR_PROJECT_URL.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "X-Internal-Call: true" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "DRIVER_ID",
    "title": "اختبار Push Notification",
    "message": "هذا اختبار لـ Push Notification",
    "data": {
      "order_id": "test-order-id"
    }
  }'
```

#### ب. النتيجة المتوقعة:
```json
{
  "message": "Push notification sent successfully",
  "sent": 1,
  "total": 1,
  "message_id": "projects/.../messages/..."
}
```

---

### 4️⃣ **اختبار من خلال التطبيق**

#### أ. إنشاء طلب جديد:
1. سجل دخول كعميل
2. أنشئ طلب جديد
3. ابدأ البحث عن سائق

#### ب. التحقق من Logs:
1. افتح **Supabase Dashboard** → **Edge Functions** → **Logs**
2. ابحث عن `send-push-notification`
3. تحقق من وجود:
   - `✅ Push notification sent to driver ...`
   - أو أخطاء إن وجدت

#### ج. التحقق من الإشعارات:
1. سجل دخول كسائق
2. تحقق من:
   - In-App Notifications (في التطبيق)
   - Push Notifications (إشعارات النظام)

---

### 5️⃣ **اختبار من خلال Console**

#### أ. في React Native/Expo:
```typescript
import { createNotification } from '@/lib/notifications';

// اختبار إرسال إشعار لسائق
const testNotification = async () => {
  const result = await createNotification({
    user_id: 'DRIVER_ID_HERE', // استبدل بـ ID سائق حقيقي
    title: 'اختبار Push Notification',
    message: 'هذا اختبار لـ Push Notification من Console',
    type: 'info',
    order_id: 'test-order-id',
  });
  
  console.log('Notification result:', result);
};

// استدعاء الدالة
testNotification();
```

#### ب. في Browser Console:
```javascript
// إذا كنت تستخدم Web
import { createNotification } from '@/lib/notifications';

createNotification({
  user_id: 'DRIVER_ID_HERE',
  title: 'اختبار Push Notification',
  message: 'هذا اختبار',
  type: 'info',
  order_id: 'test-order-id',
}).then(result => {
  console.log('Notification result:', result);
});
```

---

### 6️⃣ **فحص Logs في Supabase**

#### أ. Edge Function Logs:
1. اذهب إلى **Supabase Dashboard** → **Edge Functions** → **Logs**
2. اختر `send-push-notification`
3. ابحث عن:
   - `✅ Push notification sent successfully`
   - `Error sending push notification`
   - `No FCM token found for user`

#### ب. Database Logs:
```sql
-- فحص آخر الإشعارات المرسلة
SELECT 
  n.id,
  n.user_id,
  p.email AS driver_email,
  n.title,
  n.message,
  n.order_id,
  n.created_at
FROM notifications n
INNER JOIN profiles p ON p.id = n.user_id
WHERE p.role = 'driver'
ORDER BY n.created_at DESC
LIMIT 10;
```

---

## 🔍 المشاكل الشائعة وحلولها

### ❌ **المشكلة 1: "No FCM token found for user"**

**السبب:**
- السائق لم يحفظ FCM token بعد
- FCM token غير موجود في `profiles.fcm_token`

**الحل:**
1. تأكد من أن السائق سجل دخول على التطبيق
2. تحقق من أن Edge Function `update-fcm-token` تعمل
3. تحقق من FCM token في قاعدة البيانات:
   ```sql
   SELECT id, email, fcm_token 
   FROM profiles 
   WHERE id = 'DRIVER_ID';
   ```

---

### ❌ **المشكلة 2: "FCM Service Account not configured"**

**السبب:**
- `FCM_SERVICE_ACCOUNT_JSON` غير مضبوط في Edge Function secrets

**الحل:**
1. اذهب إلى **Supabase Dashboard** → **Edge Functions** → **Secrets**
2. أضف `FCM_SERVICE_ACCOUNT_JSON` مع قيمة Service Account JSON
3. تأكد من أن JSON صالح

---

### ❌ **المشكلة 3: "Failed to get access token"**

**السبب:**
- Service Account JSON غير صحيح
- Private key غير صحيح

**الحل:**
1. تحقق من Service Account JSON في Firebase Console
2. تأكد من نسخ Private Key كاملاً (مع `\n`)
3. أعد إضافة Secret في Supabase

---

### ❌ **المشكلة 4: Push Notifications لا تصل للجهاز**

**السبب:**
- FCM token قديم أو غير صحيح
- التطبيق غير مسموح له بإرسال إشعارات
- الجهاز غير متصل بالإنترنت

**الحل:**
1. تأكد من أن التطبيق لديه صلاحيات الإشعارات
2. تحديث FCM token:
   - سجل خروج ثم دخول مرة أخرى
   - أو استدعي `update-fcm-token` يدوياً
3. تحقق من اتصال الجهاز بالإنترنت

---

## ✅ قائمة التحقق النهائية

- [ ] FCM tokens موجودة للسائقين النشطين
- [ ] `FCM_SERVICE_ACCOUNT_JSON` مضبوط في Edge Function secrets
- [ ] Edge Function `send-push-notification` تعمل بدون أخطاء
- [ ] Edge Function `create-notification` ترسل Push Notifications
- [ ] `createNotification` في `lib/notifications.ts` تستدعي `sendPushNotification`
- [ ] `useOrderSearch` تستدعي `notifyDrivers` التي تستدعي `createNotification`
- [ ] Edge Function `start-order-search` ترسل Push Notifications مباشرة
- [ ] Logs في Supabase تظهر `✅ Push notification sent successfully`
- [ ] السائقون يتلقون Push Notifications على أجهزتهم

---

## 📊 نتائج الاختبار

### بعد الاختبار، سجل:

1. **عدد السائقين الذين لديهم FCM tokens:**
   ```
   عدد السائقين: ___
   لديهم FCM tokens: ___
   بدون FCM tokens: ___
   ```

2. **نتيجة اختبار Edge Function:**
   ```
   ✅ نجح / ❌ فشل
   رسالة الخطأ (إن وجدت): ___
   ```

3. **نتيجة اختبار من التطبيق:**
   ```
   In-App Notifications: ✅ / ❌
   Push Notifications: ✅ / ❌
   ```

4. **Logs في Supabase:**
   ```
   عدد المحاولات: ___
   عدد النجاحات: ___
   عدد الفشل: ___
   ```

---

**آخر تحديث:** 2025-01-XX

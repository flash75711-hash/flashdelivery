# اختبار Push Notifications في نطاق 5 كيلو

## الخطوات

### 1. التحقق من FCM Tokens
```sql
-- التحقق من وجود FCM Tokens للسائقين
SELECT 
  id,
  email,
  role,
  status,
  fcm_token IS NOT NULL AS has_fcm_token,
  fcm_token
FROM profiles
WHERE role = 'driver' AND status = 'active'
LIMIT 10;
```

### 2. التحقق من موقع السائقين
```sql
-- التحقق من موقع السائقين النشطين
SELECT 
  p.id,
  p.email,
  dl.latitude,
  dl.longitude,
  dl.updated_at
FROM profiles p
LEFT JOIN driver_locations dl ON p.id = dl.driver_id
WHERE p.role = 'driver' AND p.status = 'active'
ORDER BY dl.updated_at DESC
LIMIT 10;
```

### 3. اختبار Edge Function `start-order-search`

#### أ. إنشاء طلب تجريبي
1. افتح التطبيق كعميل
2. أنشئ طلب جديد
3. تأكد من تحديد موقع صحيح

#### ب. مراقبة Logs
1. اذهب إلى **Supabase Dashboard** → **Edge Functions** → **Logs**
2. ابحث عن `[start-order-search]`
3. تحقق من:
   - `[start-order-search] ========== Function called ==========`
   - `[start-order-search] Found X drivers in initial radius (5 km)`
   - `[start-order-search] Sending push notification to driver ...`
   - `✅ [start-order-search] Push notification sent to driver ...`

### 4. اختبار مباشر عبر Edge Function

#### استخدام curl:
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/start-order-search' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id": "ORDER_ID_HERE",
    "search_point": {
      "lat": 24.7136,
      "lon": 46.6753
    }
  }'
```

### 5. التحقق من الإشعارات المرسلة

```sql
-- التحقق من الإشعارات المرسلة للسائقين
SELECT 
  n.id,
  n.user_id,
  n.title,
  n.title,
  n.message,
  n.order_id,
  n.created_at,
  p.email AS driver_email
FROM notifications n
JOIN profiles p ON n.user_id = p.id
WHERE n.order_id = 'ORDER_ID_HERE'
  AND p.role = 'driver'
ORDER BY n.created_at DESC;
```

### 6. التحقق من Logs في Supabase

#### في Supabase Dashboard:
1. **Edge Functions** → **start-order-search** → **Logs**
2. ابحث عن:
   - `[start-order-search] Found X drivers in initial radius (5 km)`
   - `✅ [start-order-search] Push notification sent to driver ...`
   - أو `⚠️ [start-order-search] Push notification not sent ...`

#### في Edge Function `send-push-notification`:
1. **Edge Functions** → **send-push-notification** → **Logs**
2. ابحث عن:
   - `✅ Push notification sent successfully to X device(s)`
   - أو `⚠️ No devices found or push notification not sent`

### 7. اختبار على الجهاز

1. تأكد من أن السائق لديه FCM Token صحيح
2. تأكد من أن السائق في نطاق 5 كيلو من موقع الطلب
3. أنشئ طلب جديد
4. راقب الجهاز - يجب أن يصل Push Notification

## المشاكل المحتملة والحلول

### المشكلة 1: لا يوجد FCM Tokens
**الحل:**
- تأكد من أن السائق قام بتسجيل الدخول
- تحقق من Edge Function `update-fcm-token`

### المشكلة 2: Edge Function لا تُستدعى
**الحل:**
- تحقق من Logs في `create-order`
- تأكد من وجود `searchPoint` عند إنشاء الطلب

### المشكلة 3: Push Notifications لا تُرسل
**الحل:**
- تحقق من `FCM_SERVICE_ACCOUNT_JSON` في Environment Variables
- تحقق من Logs في `send-push-notification`
- تأكد من صحة FCM Token

### المشكلة 4: السائقون لا يظهرون في النطاق
**الحل:**
- تحقق من `driver_locations` table
- تأكد من تحديث موقع السائق
- تحقق من RPC function `find_drivers_in_radius`

## سجلات مهمة للبحث عنها

### في `start-order-search`:
- `[start-order-search] ========== Function called ==========`
- `[start-order-search] Found X drivers in initial radius (5 km)`
- `[start-order-search] Sending push notification to driver ...`
- `✅ [start-order-search] Push notification sent to driver ...`
- `⚠️ [start-order-search] Push notification not sent to driver ...`

### في `send-push-notification`:
- `✅ Push notification sent successfully to X device(s)`
- `⚠️ No devices found or push notification not sent`
- `❌ Error sending push notification`

### في `create-order`:
- `[create-order] Starting search for order ...`
- `✅ [create-order] Started automatic search for order ...`
- `❌ [create-order] Error starting order search`

## ملاحظات

1. **النطاق الأولي**: 5 كيلو لمدة 30 ثانية
2. **النطاق الموسع**: 10 كيلو لمدة 30 ثانية
3. **Push Notifications**: تُرسل لكل سائق في النطاق
4. **In-App Notifications**: تُرسل أيضاً لكل سائق

## التحقق النهائي

بعد الاختبار، تأكد من:
- ✅ Edge Function `start-order-search` تُستدعى
- ✅ السائقون في النطاق 5 كيلو يتم العثور عليهم
- ✅ Push Notifications تُرسل لكل سائق
- ✅ الإشعارات تظهر في قاعدة البيانات
- ✅ Push Notifications تصل إلى أجهزة السائقين

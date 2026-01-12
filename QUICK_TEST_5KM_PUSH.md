# اختبار سريع: Push Notifications في نطاق 5 كيلو

## الخطوات السريعة

### 1. التحقق من FCM Tokens (30 ثانية)
```sql
SELECT 
  id,
  email,
  fcm_token IS NOT NULL AS has_token
FROM profiles
WHERE role = 'driver' AND status = 'active'
LIMIT 5;
```

### 2. التحقق من موقع السائقين (30 ثانية)
```sql
SELECT 
  p.id,
  p.email,
  dl.latitude,
  dl.longitude
FROM profiles p
JOIN driver_locations dl ON p.id = dl.driver_id
WHERE p.role = 'driver' AND p.status = 'active'
LIMIT 5;
```

### 3. إنشاء طلب تجريبي (2 دقيقة)
1. افتح التطبيق كعميل
2. أنشئ طلب جديد
3. تأكد من تحديد موقع صحيح

### 4. فحص Logs (1 دقيقة)
1. Supabase Dashboard → **Edge Functions** → **start-order-search** → **Logs**
2. ابحث عن:
   - `[start-order-search] Found X drivers in initial radius (5 km)`
   - `✅ [start-order-search] Push notification sent to driver ...`

### 5. التحقق من الإشعارات (30 ثانية)
```sql
SELECT 
  n.id,
  n.user_id,
  n.title,
  n.message,
  n.created_at,
  p.email AS driver_email
FROM notifications n
JOIN profiles p ON n.user_id = p.id
WHERE p.role = 'driver'
ORDER BY n.created_at DESC
LIMIT 10;
```

## النتائج المتوقعة

### ✅ نجح الاختبار إذا:
- Edge Function `start-order-search` تُستدعى
- يوجد سائقون في النطاق 5 كيلو
- Push Notifications تُرسل (يظهر في Logs)
- الإشعارات تظهر في قاعدة البيانات
- Push Notifications تصل إلى أجهزة السائقين

### ❌ فشل الاختبار إذا:
- Edge Function لا تُستدعى
- لا يوجد سائقون في النطاق
- Push Notifications لا تُرسل
- لا توجد FCM Tokens

## الملفات المساعدة

- `TEST_PUSH_NOTIFICATIONS_5KM.md` - دليل اختبار شامل
- `test_start_order_search.js` - اختبار مباشر للـ Edge Function
- `verify_drivers_in_5km.sql` - SQL queries للتحقق
- `check_push_notifications_logs.md` - كيفية فحص Logs

## ملاحظات مهمة

1. **تأكد من وجود FCM Tokens** قبل الاختبار
2. **تأكد من تحديث موقع السائقين** في `driver_locations`
3. **راقب Logs** أثناء الاختبار
4. **اختبر على جهاز حقيقي** للتأكد من وصول Push Notifications

## الدعم

إذا واجهت مشاكل:
1. راجع `TEST_PUSH_NOTIFICATIONS_5KM.md` للدليل الشامل
2. راجع `check_push_notifications_logs.md` لفحص Logs
3. تحقق من Environment Variables في Supabase
